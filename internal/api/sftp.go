package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/binary"
	"errors"
	"io"
	"log"
	"net"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"private-storage/internal/appconfig"
	"private-storage/internal/storage"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type sftpController struct {
	mu     sync.Mutex
	server *Server
	ln     net.Listener
	config sftpRuntimeConfig
}

type sftpRuntimeConfig struct {
	enabled bool
	addr    string
}

func newSFTPController(server *Server) *sftpController {
	return &sftpController{server: server}
}

func (s *Server) applySFTPFromConfig() error {
	s.mu.RLock()
	runtime := s.cfg.GetRuntimeSettings()
	s.mu.RUnlock()

	if s.sftpCtl == nil {
		return nil
	}

	return s.sftpCtl.apply(sftpRuntimeConfig{
		enabled: runtime.SFTPEnabled,
		addr:    runtime.SFTPAddr,
	})
}

func (c *sftpController) apply(cfg sftpRuntimeConfig) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.stopLocked(); err != nil {
		return err
	}

	if !cfg.enabled {
		log.Println("SFTP disabled")
		c.config = cfg
		return nil
	}
	if strings.TrimSpace(cfg.addr) == "" {
		cfg.addr = "0.0.0.0:2022"
	}

	signer, err := generateHostSigner()
	if err != nil {
		return err
	}

	sshConfig := &ssh.ServerConfig{
		PasswordCallback: func(meta ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			username := strings.TrimSpace(meta.User())
			if username == "" {
				return nil, errors.New("unauthorized")
			}

			c.server.mu.RLock()
			user, ok, err := c.server.cfg.VerifyUserPassword(username, string(pass))
			c.server.mu.RUnlock()
			if err != nil || !ok || user == nil {
				return nil, errors.New("unauthorized")
			}

			if !user.Permissions.CanReadFiles {
				return nil, errors.New("unauthorized")
			}

			if !user.Permissions.CanUseSFTP {
				return nil, errors.New("unauthorized")
			}

			ext := map[string]string{
				"username":               user.Username,
				"role":                   user.Role,
				"can_read_files":         boolToExt(user.Permissions.CanReadFiles),
				"can_write_files":        boolToExt(user.Permissions.CanWriteFiles),
				"can_manage_connections": boolToExt(user.Permissions.CanManageConnections),
				"can_manage_settings":    boolToExt(user.Permissions.CanManageSettings),
				"can_use_sftp":           boolToExt(user.Permissions.CanUseSFTP),
			}
			return &ssh.Permissions{Extensions: ext}, nil
		},
	}
	sshConfig.AddHostKey(signer)

	ln, err := net.Listen("tcp", cfg.addr)
	if err != nil {
		return err
	}

	c.ln = ln
	c.config = cfg
	log.Printf("SFTP server started on %s (auth uses app users)", cfg.addr)

	go func(localLn net.Listener, localSSH *ssh.ServerConfig) {
		for {
			conn, err := localLn.Accept()
			if err != nil {
				if isClosedListenerError(err) {
					return
				}
				log.Printf("SFTP accept error: %v", err)
				continue
			}
			go c.handleConn(conn, localSSH)
		}
	}(ln, sshConfig)

	return nil
}

func boolToExt(v bool) string {
	if v {
		return "1"
	}
	return "0"
}

func extToBool(v string) bool {
	return strings.TrimSpace(v) == "1"
}

func (c *sftpController) handleConn(conn net.Conn, sshConfig *ssh.ServerConfig) {
	defer conn.Close()

	serverConn, chans, reqs, err := ssh.NewServerConn(conn, sshConfig)
	if err != nil {
		return
	}
	defer serverConn.Close()
	go ssh.DiscardRequests(reqs)

	bridge := &sftpBridge{server: c.server}
	if serverConn.Permissions != nil {
		ext := serverConn.Permissions.Extensions
		bridge.user = appconfig.User{
			Username: strings.TrimSpace(ext["username"]),
			Role:     strings.TrimSpace(ext["role"]),
			Permissions: appconfig.UserPermissions{
				CanReadFiles:         extToBool(ext["can_read_files"]),
				CanWriteFiles:        extToBool(ext["can_write_files"]),
				CanManageConnections: extToBool(ext["can_manage_connections"]),
				CanManageSettings:    extToBool(ext["can_manage_settings"]),
				CanUseSFTP:           extToBool(ext["can_use_sftp"]),
			},
		}
	}

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}

		go bridge.handleSessionChannel(channel, requests)
	}
}

func (c *sftpController) stopLocked() error {
	if c.ln == nil {
		return nil
	}
	err := c.ln.Close()
	c.ln = nil
	if err != nil && !isClosedListenerError(err) {
		return err
	}
	return nil
}

func isClosedListenerError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, net.ErrClosed) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "closed network connection")
}

func generateHostSigner() (ssh.Signer, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	return ssh.NewSignerFromKey(key)
}

type sftpBridge struct {
	server *Server
	user   appconfig.User
}

func (b *sftpBridge) handleSessionChannel(channel ssh.Channel, requests <-chan *ssh.Request) {
	defer channel.Close()

	for req := range requests {
		if req.Type != "subsystem" || parseSubsystem(req.Payload) != "sftp" {
			_ = req.Reply(false, nil)
			continue
		}

		_ = req.Reply(true, nil)
		handlers := sftp.Handlers{
			FileGet:  b,
			FilePut:  b,
			FileCmd:  b,
			FileList: b,
		}
		srv := sftp.NewRequestServer(channel, handlers)
		if err := srv.Serve(); err != nil && !errors.Is(err, io.EOF) {
			log.Printf("SFTP serve error: %v", err)
		}
		_ = srv.Close()
		return
	}
}

func parseSubsystem(payload []byte) string {
	if len(payload) < 4 {
		return ""
	}
	n := binary.BigEndian.Uint32(payload[:4])
	if int(n)+4 > len(payload) {
		return ""
	}
	return string(payload[4 : 4+n])
}

func (b *sftpBridge) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	if !b.user.Permissions.CanReadFiles {
		return nil, os.ErrPermission
	}

	store, err := b.currentStore()
	if err != nil {
		return nil, err
	}

	key := keyFromPath(r.Filepath)
	if key == "" {
		return nil, os.ErrNotExist
	}

	info, err := store.HeadObject(r.Context(), key)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, os.ErrNotExist
		}
		return nil, err
	}
	// Read in ranged chunks instead of loading the whole object into memory
	return &rangeReaderAt{ctx: r.Context(), store: store, key: key, size: info.Size}, nil
}

const sftpReadChunk = 4 << 20

// rangeReaderAt serves ReadAt calls from ranged GETs, keeping one chunk buffered
// because SFTP clients read sequentially in small blocks.
type rangeReaderAt struct {
	ctx    context.Context
	store  storage.Store
	key    string
	size   int64
	mu     sync.Mutex
	buf    []byte
	bufOff int64
}

func (r *rangeReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= r.size {
		return 0, io.EOF
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	n := 0
	for n < len(p) && off < r.size {
		if off < r.bufOff || off >= r.bufOff+int64(len(r.buf)) {
			length := min(int64(sftpReadChunk), r.size-off)
			data, err := r.store.ReadRange(r.ctx, r.key, off, length)
			if err != nil {
				return n, err
			}
			if len(data) == 0 {
				return n, io.EOF
			}
			r.buf, r.bufOff = data, off
		}
		copied := copy(p[n:], r.buf[off-r.bufOff:])
		n += copied
		off += int64(copied)
	}
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func (b *sftpBridge) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	if !b.user.Permissions.CanWriteFiles {
		return nil, os.ErrPermission
	}

	store, err := b.currentStore()
	if err != nil {
		return nil, err
	}

	key := keyFromPath(r.Filepath)
	if key == "" {
		return nil, errors.New("invalid file path")
	}

	tmpFile, err := os.CreateTemp("", "private-storage-sftp-*")
	if err != nil {
		return nil, err
	}

	return &uploadWriterAt{
		ctx:   r.Context(),
		store: store,
		key:   key,
		file:  tmpFile,
	}, nil
}

func (b *sftpBridge) Filecmd(r *sftp.Request) error {
	if !b.user.Permissions.CanWriteFiles {
		return os.ErrPermission
	}

	store, err := b.currentStore()
	if err != nil {
		return err
	}

	switch r.Method {
	case "Setstat":
		return nil
	case "Mkdir":
		key := dirKeyFromPath(r.Filepath)
		return store.UploadObject(r.Context(), key, "application/x-directory", bytes.NewReader(nil), 0)
	case "Rmdir":
		key := dirKeyFromPath(r.Filepath)
		return store.DeleteObject(r.Context(), key)
	case "Remove":
		key := keyFromPath(r.Filepath)
		if strings.HasSuffix(strings.TrimSpace(r.Filepath), "/") {
			key = dirKeyFromPath(r.Filepath)
		}
		if key == "" {
			return os.ErrPermission
		}
		return store.DeleteObject(r.Context(), key)
	case "Rename":
		return errors.New("rename is not supported")
	default:
		return errors.New("unsupported command")
	}
}

func (b *sftpBridge) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	if !b.user.Permissions.CanReadFiles {
		return nil, os.ErrPermission
	}

	store, err := b.currentStore()
	if err != nil {
		return nil, err
	}

	switch r.Method {
	case "List":
		prefix := dirKeyFromPath(r.Filepath)
		items, err := listPath(r.Context(), store, prefix)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				return listerAt{}, nil
			}
			return nil, err
		}
		return items, nil
	case "Stat":
		info, err := statPath(r.Context(), store, r.Filepath)
		if err != nil {
			return nil, err
		}
		return listerAt{info}, nil
	default:
		return nil, errors.New("unsupported list operation")
	}
}

func (b *sftpBridge) currentStore() (storage.Store, error) {
	b.server.mu.RLock()
	defer b.server.mu.RUnlock()
	if b.server.store == nil {
		return nil, errors.New("active storage is not configured")
	}
	return b.server.store, nil
}

func listPath(ctx context.Context, store storage.Store, prefix string) (listerAt, error) {
	result, err := store.ListBrowser(ctx, prefix, "", 1000)
	if err != nil {
		return nil, err
	}

	items := make([]os.FileInfo, 0, len(result.Folders)+len(result.Files))
	for _, folder := range result.Folders {
		items = append(items, virtualFileInfo{name: folder.Name, size: 0, modTime: time.Now(), isDir: true})
	}
	for _, file := range result.Files {
		items = append(items, virtualFileInfo{name: file.Name, size: file.Size, modTime: file.LastModified, isDir: false})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir() != items[j].IsDir() {
			return items[i].IsDir()
		}
		return strings.ToLower(items[i].Name()) < strings.ToLower(items[j].Name())
	})
	return listerAt(items), nil
}

func statPath(ctx context.Context, store storage.Store, p string) (os.FileInfo, error) {
	key := keyFromPath(p)
	if key == "" {
		return virtualFileInfo{name: "/", isDir: true, modTime: time.Now()}, nil
	}

	parent := parentPrefix(key)
	res, err := store.ListBrowser(ctx, parent, "", 1000)
	if err == nil {
		base := path.Base(key)
		for _, folder := range res.Folders {
			if folder.Name == base {
				return virtualFileInfo{name: base, isDir: true, modTime: time.Now()}, nil
			}
		}
		for _, file := range res.Files {
			if file.Name == base {
				return virtualFileInfo{name: base, size: file.Size, modTime: file.LastModified, isDir: false}, nil
			}
		}
	}

	if _, err := store.ListBrowser(ctx, ensureDirSuffix(key), "", 1); err == nil {
		return virtualFileInfo{name: path.Base(key), isDir: true, modTime: time.Now()}, nil
	}

	return nil, os.ErrNotExist
}

type uploadWriterAt struct {
	mu     sync.Mutex
	ctx    context.Context
	store  storage.Store
	key    string
	file   *os.File
	closed bool
}

func (w *uploadWriterAt) WriteAt(p []byte, off int64) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return 0, os.ErrClosed
	}
	return w.file.WriteAt(p, off)
}

func (w *uploadWriterAt) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	w.closed = true

	if _, err := w.file.Seek(0, io.SeekStart); err != nil {
		_ = w.file.Close()
		_ = os.Remove(w.file.Name())
		return err
	}

	info, err := w.file.Stat()
	if err != nil {
		_ = w.file.Close()
		_ = os.Remove(w.file.Name())
		return err
	}

	contentType := "application/octet-stream"
	if err := w.store.UploadObject(w.ctx, w.key, contentType, w.file, info.Size()); err != nil {
		_ = w.file.Close()
		_ = os.Remove(w.file.Name())
		return err
	}

	if err := w.file.Close(); err != nil {
		_ = os.Remove(w.file.Name())
		return err
	}
	return os.Remove(w.file.Name())
}

type listerAt []os.FileInfo

func (f listerAt) ListAt(ls []os.FileInfo, offset int64) (int, error) {
	if offset >= int64(len(f)) {
		return 0, io.EOF
	}
	n := copy(ls, f[offset:])
	if n < len(ls) {
		return n, io.EOF
	}
	return n, nil
}

type virtualFileInfo struct {
	name    string
	size    int64
	modTime time.Time
	isDir   bool
}

func (v virtualFileInfo) Name() string { return v.name }
func (v virtualFileInfo) Size() int64  { return v.size }
func (v virtualFileInfo) Mode() os.FileMode {
	if v.isDir {
		return os.ModeDir | 0755
	}
	return 0644
}
func (v virtualFileInfo) ModTime() time.Time { return v.modTime }
func (v virtualFileInfo) IsDir() bool        { return v.isDir }
func (v virtualFileInfo) Sys() any           { return nil }

func keyFromPath(p string) string {
	cleaned := strings.TrimSpace(strings.ReplaceAll(path.Clean("/"+p), "\\", "/"))
	cleaned = strings.TrimPrefix(cleaned, "/")
	if cleaned == "." {
		return ""
	}
	return cleaned
}

func dirKeyFromPath(p string) string {
	key := keyFromPath(p)
	return ensureDirSuffix(key)
}

func ensureDirSuffix(key string) string {
	if key == "" {
		return ""
	}
	if strings.HasSuffix(key, "/") {
		return key
	}
	return key + "/"
}

func parentPrefix(key string) string {
	idx := strings.LastIndex(strings.TrimSuffix(key, "/"), "/")
	if idx < 0 {
		return ""
	}
	return key[:idx+1]
}
