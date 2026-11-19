package api

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"private-storage/internal/appconfig"
	"private-storage/internal/storage"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

const (
	sftpHostKeyFile      = "sftp_host_ed25519_key"
	sftpHandshakeTimeout = 30 * time.Second
	sftpMaxConns         = 32
	sftpMaxConnsPerIP    = 8
	sftpMaxAuthTries     = 3
)

type sftpController struct {
	mu     sync.Mutex
	server *Server
	ln     net.Listener
	config sftpRuntimeConfig
	signer ssh.Signer
	// slots caps concurrent connections, including ones still in the handshake
	slots chan struct{}
	// perIP counts open connections per client address
	ipMu  sync.Mutex
	perIP map[string]int
}

// acquireIP reserves a connection for ip, or reports false if it already has too many.
func (c *sftpController) acquireIP(ip string) bool {
	c.ipMu.Lock()
	defer c.ipMu.Unlock()
	if c.perIP[ip] >= sftpMaxConnsPerIP {
		return false
	}
	c.perIP[ip]++
	return true
}

func (c *sftpController) releaseIP(ip string) {
	c.ipMu.Lock()
	defer c.ipMu.Unlock()
	if c.perIP[ip] <= 1 {
		delete(c.perIP, ip)
		return
	}
	c.perIP[ip]--
}

type sftpRuntimeConfig struct {
	enabled bool
	addr    string
}

func newSFTPController(server *Server) *sftpController {
	return &sftpController{server: server, slots: make(chan struct{}, sftpMaxConns), perIP: map[string]int{}}
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

	if c.signer == nil {
		signer, err := loadOrCreateHostSigner(appconfig.Dir())
		if err != nil {
			return err
		}
		c.signer = signer
	}

	sshConfig := &ssh.ServerConfig{
		MaxAuthTries:     sftpMaxAuthTries,
		PasswordCallback: c.checkPassword,
	}
	sshConfig.AddHostKey(c.signer)

	ln, err := net.Listen("tcp", cfg.addr)
	if err != nil {
		return err
	}

	c.ln = ln
	c.config = cfg
	log.Printf("SFTP server started on %s (auth uses app users), host key %s", cfg.addr, ssh.FingerprintSHA256(c.signer.PublicKey()))

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
			ip := remoteHost(conn.RemoteAddr())
			if !c.acquireIP(ip) {
				_ = conn.Close()
				continue
			}
			select {
			case c.slots <- struct{}{}:
				go func() {
					defer func() { <-c.slots; c.releaseIP(ip) }()
					c.handleConn(conn, localSSH)
				}()
			default:
				// At capacity: refuse rather than queue, so floods cannot pile up goroutines
				c.releaseIP(ip)
				_ = conn.Close()
			}
		}
	}(ln, sshConfig)

	return nil
}

var errSFTPUnauthorized = errors.New("unauthorized")

// checkPassword authenticates SFTP logins against app users, sharing the web login's
// failed-attempt limits so the SFTP port cannot be used to guess passwords.
func (c *sftpController) checkPassword(meta ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
	username := strings.TrimSpace(meta.User())
	if username == "" {
		return nil, errSFTPUnauthorized
	}
	ip := remoteHost(meta.RemoteAddr())
	if c.server.logins.retryAfter(ip, username) > 0 {
		return nil, errSFTPUnauthorized
	}

	c.server.mu.RLock()
	user, ok, err := c.server.cfg.VerifyUserPassword(username, string(pass))
	c.server.mu.RUnlock()
	if err != nil {
		log.Printf("SFTP login check failed: %v", err)
		return nil, errSFTPUnauthorized
	}
	if !ok || user == nil {
		c.server.logins.fail(ip, username)
		log.Printf("SFTP login failed for %q from %s", username, ip)
		return nil, errSFTPUnauthorized
	}
	c.server.logins.succeed(ip, username)

	if !user.Permissions.CanReadFiles || !user.Permissions.CanUseSFTP {
		return nil, errSFTPUnauthorized
	}
	return &ssh.Permissions{Extensions: map[string]string{"user_id": strconv.FormatInt(user.ID, 10)}}, nil
}

func remoteHost(addr net.Addr) string {
	if addr == nil {
		return ""
	}
	host, _, err := net.SplitHostPort(addr.String())
	if err != nil {
		return addr.String()
	}
	return host
}

func (c *sftpController) handleConn(conn net.Conn, sshConfig *ssh.ServerConfig) {
	defer conn.Close()

	// Unauthenticated clients get a bounded time to finish the handshake and log in
	_ = conn.SetDeadline(time.Now().Add(sftpHandshakeTimeout))
	serverConn, chans, reqs, err := ssh.NewServerConn(conn, sshConfig)
	if err != nil {
		return
	}
	defer serverConn.Close()
	_ = conn.SetDeadline(time.Time{})
	go ssh.DiscardRequests(reqs)

	userID, err := strconv.ParseInt(serverConn.Permissions.Extensions["user_id"], 10, 64)
	if err != nil {
		return
	}
	bridge := &sftpBridge{server: c.server, userID: userID}

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

// loadOrCreateHostSigner keeps the SFTP host key in the config directory, so clients see the
// same server identity after restarts instead of a "host key changed" warning every time.
func loadOrCreateHostSigner(dir string) (ssh.Signer, error) {
	keyPath := filepath.Join(dir, sftpHostKeyFile)
	data, err := os.ReadFile(keyPath)
	if err == nil {
		signer, err := ssh.ParsePrivateKey(data)
		if err != nil {
			return nil, fmt.Errorf("reading SFTP host key %s: %w", keyPath, err)
		}
		return signer, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	block, err := ssh.MarshalPrivateKey(priv, "private-cloud sftp host key")
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, err
	}
	if _, err := f.Write(pem.EncodeToMemory(block)); err != nil {
		_ = f.Close()
		_ = os.Remove(keyPath)
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}
	log.Printf("Created SFTP host key %s", keyPath)
	return ssh.NewSignerFromKey(priv)
}

type sftpBridge struct {
	server *Server
	userID int64
}

// authorize re-reads the user for every operation, so disabling a user or removing a
// permission also applies to SFTP sessions that are already connected.
func (b *sftpBridge) authorize(write bool) error {
	b.server.mu.RLock()
	user, err := b.server.cfg.GetUserByID(b.userID)
	b.server.mu.RUnlock()
	if err != nil || user == nil || !user.IsActive {
		return os.ErrPermission
	}
	p := effectivePerms(user.Permissions)
	if !p.CanUseSFTP || !p.CanReadFiles || (write && !p.CanWriteFiles) {
		return os.ErrPermission
	}
	return nil
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
	if err := b.authorize(false); err != nil {
		return nil, err
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
	if err := b.authorize(true); err != nil {
		return nil, err
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
	if err := b.authorize(true); err != nil {
		return err
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
	case "Rename", "PosixRename":
		return renameObject(r.Context(), store, r.Filepath, r.Target)
	default:
		return errors.New("unsupported command")
	}
}

func (b *sftpBridge) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	if err := b.authorize(false); err != nil {
		return nil, err
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

// renameObject moves a file by copying it and deleting the original; object storage has no
// rename. Many phone sync apps upload to a temporary name and rename it when complete.
// Like POSIX rename, an existing target is replaced. Folders cannot be renamed.
func renameObject(ctx context.Context, store storage.Store, from, to string) error {
	src, dst := keyFromPath(from), keyFromPath(to)
	if src == "" || dst == "" {
		return os.ErrPermission
	}
	if src == dst {
		return nil
	}
	if err := store.CopyObject(ctx, src, dst); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			if _, dirErr := store.ListBrowser(ctx, ensureDirSuffix(src), "", 1); dirErr == nil {
				return errors.New("renaming folders is not supported")
			}
			return os.ErrNotExist
		}
		return err
	}
	// Move the thumbnail too; deleting src below removes the old one
	if storage.MayHaveThumbnail(src) && storage.MayHaveThumbnail(dst) {
		if err := store.CopyObject(ctx, storage.ThumbKey(src), storage.ThumbKey(dst)); err != nil && !errors.Is(err, storage.ErrNotFound) {
			log.Printf("SFTP rename: copying thumbnail of %s failed: %v", src, err)
		}
	}
	return store.DeleteObject(ctx, src)
}

// maxListEntries bounds memory for a single directory listing.
const maxListEntries = 200000

// listPath returns every entry in a folder, following pagination, so sync apps see all
// files in large folders (a phone camera folder easily holds tens of thousands).
func listPath(ctx context.Context, store storage.Store, prefix string) (listerAt, error) {
	items := make([]os.FileInfo, 0)
	token := ""
	for {
		result, err := store.ListBrowser(ctx, prefix, token, 1000)
		if err != nil {
			return nil, err
		}
		for _, folder := range result.Folders {
			items = append(items, virtualFileInfo{name: folder.Name, size: 0, modTime: time.Now(), isDir: true})
		}
		for _, file := range result.Files {
			items = append(items, virtualFileInfo{name: file.Name, size: file.Size, modTime: file.LastModified, isDir: false})
		}
		if !result.IsTruncated || result.NextContinuationToken == "" || len(items) >= maxListEntries {
			break
		}
		token = result.NextContinuationToken
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

	// A HEAD finds the file directly, however many siblings it has
	info, err := store.HeadObject(ctx, key)
	if err == nil {
		return virtualFileInfo{name: path.Base(key), size: info.Size, modTime: info.LastModified, isDir: false}, nil
	}
	if !errors.Is(err, storage.ErrNotFound) {
		return nil, err
	}

	if _, err := store.ListBrowser(ctx, ensureDirSuffix(key), "", 1); err == nil {
		return virtualFileInfo{name: path.Base(key), isDir: true, modTime: time.Now()}, nil
	} else if !errors.Is(err, storage.ErrNotFound) {
		return nil, err
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

	// The storage layer picks the content type from the file extension
	if err := w.store.UploadObject(w.ctx, w.key, "", w.file, info.Size()); err != nil {
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
