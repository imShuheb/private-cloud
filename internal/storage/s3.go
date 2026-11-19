package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3Types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type S3Store struct {
	bucket string
	client *s3.Client
	ps     *s3.PresignClient
}

type S3Config struct {
	Bucket       string
	Region       string
	Endpoint     string
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
}

func NewS3Store(ctx context.Context, cfg S3Config) (*S3Store, error) {
	cfgOpts := []func(*config.LoadOptions) error{config.WithRegion(cfg.Region)}
	if cfg.AccessKey != "" && cfg.SecretKey != "" {
		cfgOpts = append(cfgOpts, config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")))
	}

	awsCfg, err := config.LoadDefaultConfig(ctx, cfgOpts...)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = cfg.UsePathStyle
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
	})

	return &S3Store{bucket: cfg.Bucket, client: client, ps: s3.NewPresignClient(client)}, nil
}

func (s *S3Store) ListObjects(ctx context.Context, prefix, continuationToken string, limit int32) (ListResult, error) {
	input := &s3.ListObjectsV2Input{
		Bucket:  aws.String(s.bucket),
		Prefix:  aws.String(prefix),
		MaxKeys: aws.Int32(limit),
	}
	if strings.TrimSpace(continuationToken) != "" {
		input.ContinuationToken = aws.String(continuationToken)
	}

	out, err := s.client.ListObjectsV2(ctx, input)
	if err != nil {
		return ListResult{}, err
	}

	items := make([]ObjectInfo, 0, len(out.Contents))
	for _, obj := range out.Contents {
		key := aws.ToString(obj.Key)
		if hideThumbs(prefix) && IsThumbKey(key) {
			continue
		}
		items = append(items, ObjectInfo{
			Key:          key,
			Name:         objectNameFromKey(prefix, key),
			Size:         aws.ToInt64(obj.Size),
			LastModified: aws.ToTime(obj.LastModified),
			ETag:         aws.ToString(obj.ETag),
		})
	}

	return ListResult{
		Items:                 items,
		IsTruncated:           aws.ToBool(out.IsTruncated),
		NextContinuationToken: aws.ToString(out.NextContinuationToken),
	}, nil
}

func (s *S3Store) Ping(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	return err
}

func (s *S3Store) Walk(ctx context.Context, prefix string, fn func(ObjectInfo) error) error {
	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket:  aws.String(s.bucket),
		Prefix:  aws.String(prefix),
		MaxKeys: aws.Int32(1000),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return err
		}
		for _, obj := range page.Contents {
			key := aws.ToString(obj.Key)
			if hideThumbs(prefix) && IsThumbKey(key) {
				continue
			}
			err := fn(ObjectInfo{
				Key:          key,
				Name:         objectNameFromKey("", key),
				Size:         aws.ToInt64(obj.Size),
				LastModified: aws.ToTime(obj.LastModified),
				ETag:         aws.ToString(obj.ETag),
			})
			if errors.Is(err, ErrStopWalk) {
				return nil
			}
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *S3Store) GetStats(ctx context.Context) (DriveStats, error) {
	var stats DriveStats
	err := s.Walk(ctx, "", func(obj ObjectInfo) error {
		if strings.HasSuffix(obj.Key, "/") {
			stats.TotalFolders++
		} else {
			stats.TotalFiles++
			stats.TotalSize += obj.Size
		}
		return nil
	})
	return stats, err
}

func (s *S3Store) ListBrowser(ctx context.Context, prefix, continuationToken string, limit int32) (BrowserListResult, error) {
	normalizedPrefix := normalizePrefix(prefix)
	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(s.bucket),
		Prefix:    aws.String(normalizedPrefix),
		Delimiter: aws.String("/"),
		MaxKeys:   aws.Int32(limit),
	}
	if strings.TrimSpace(continuationToken) != "" {
		input.ContinuationToken = aws.String(continuationToken)
	}

	out, err := s.client.ListObjectsV2(ctx, input)
	if err != nil {
		return BrowserListResult{}, err
	}

	folders := make([]FolderInfo, 0, len(out.CommonPrefixes))
	for _, cp := range out.CommonPrefixes {
		folderPrefix := aws.ToString(cp.Prefix)
		if folderPrefix == "" || (folderPrefix == ThumbPrefix && hideThumbs(normalizedPrefix)) {
			continue
		}
		folders = append(folders, FolderInfo{
			Name:   folderName(normalizedPrefix, folderPrefix),
			Prefix: folderPrefix,
		})
	}

	files := make([]ObjectInfo, 0, len(out.Contents))
	markerFound := false
	for _, obj := range out.Contents {
		key := aws.ToString(obj.Key)
		if key == normalizedPrefix {
			// The folder's own marker object: the folder exists even if it's empty
			markerFound = true
			continue
		}
		if key == "" || strings.HasSuffix(key, "/") {
			continue
		}
		files = append(files, ObjectInfo{
			Key:          key,
			Name:         objectNameFromKey(normalizedPrefix, key),
			Size:         aws.ToInt64(obj.Size),
			LastModified: aws.ToTime(obj.LastModified),
			ETag:         aws.ToString(obj.ETag),
		})
	}

	if normalizedPrefix != "" && !markerFound && len(folders) == 0 && len(files) == 0 && strings.TrimSpace(continuationToken) == "" {
		return BrowserListResult{}, ErrNotFound
	}

	return BrowserListResult{
		CurrentPrefix:         normalizedPrefix,
		ParentPrefix:          parentPrefix(normalizedPrefix),
		Folders:               folders,
		Files:                 files,
		IsTruncated:           aws.ToBool(out.IsTruncated),
		NextContinuationToken: aws.ToString(out.NextContinuationToken),
	}, nil
}

// UploadObject stores body under key. Files larger than singlePutLimit (or of unknown
// size) are sent as a multipart upload, since a single PUT is capped at 5 GiB.
// An empty or generic content type is replaced with one guessed from the file extension.
func (s *S3Store) UploadObject(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	contentType = ContentTypeFor(key, contentType)
	if size < 0 || size > singlePutLimit {
		return s.uploadMultipart(ctx, key, contentType, body, size)
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	})
	return err
}

// Variables so tests can exercise multipart uploads with small files.
var (
	// singlePutLimit is the largest file sent in one PUT; bigger files go in parts.
	singlePutLimit int64 = 100 << 20
	minPartSize    int64 = 16 << 20
)

const (
	unknownPart = 64 << 20
	maxParts    = 10000
	// partConcurrency bounds parallel part uploads, and with it memory (one buffer each).
	partConcurrency = 4
	// maxCopySize is the largest object a single CopyObject call may copy.
	maxCopySize  = 5 << 30
	copyPartSize = 512 << 20
)

// partSizeFor picks a part size that keeps the upload under maxParts parts.
func partSizeFor(size int64) int64 {
	if size < 0 {
		return unknownPart
	}
	ps := minPartSize
	for size/ps >= maxParts {
		ps *= 2
	}
	return ps
}

func (s *S3Store) uploadMultipart(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	created, err := s.client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return err
	}
	uploadID := created.UploadId

	partsCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var (
		mu       sync.Mutex
		parts    []s3Types.CompletedPart
		firstErr error
		wg       sync.WaitGroup
	)
	setErr := func(err error) {
		mu.Lock()
		if firstErr == nil {
			firstErr = err
			cancel()
		}
		mu.Unlock()
	}
	failed := func() bool {
		mu.Lock()
		defer mu.Unlock()
		return firstErr != nil
	}

	partSize := partSizeFor(size)
	sem := make(chan struct{}, partConcurrency)
	for partNum := int32(1); !failed(); partNum++ {
		if partNum > maxParts {
			setErr(fmt.Errorf("file is larger than %d parts of %d bytes", maxParts, partSize))
			break
		}
		sem <- struct{}{}
		buf := make([]byte, partSize)
		n, readErr := io.ReadFull(body, buf)
		last := errors.Is(readErr, io.EOF) || errors.Is(readErr, io.ErrUnexpectedEOF)
		if readErr != nil && !last {
			<-sem
			setErr(fmt.Errorf("reading upload: %w", readErr))
			break
		}
		if n == 0 && partNum > 1 {
			<-sem
			break
		}

		wg.Add(1)
		go func(num int32, data []byte) {
			defer func() { <-sem; wg.Done() }()
			out, err := s.client.UploadPart(partsCtx, &s3.UploadPartInput{
				Bucket:        aws.String(s.bucket),
				Key:           aws.String(key),
				UploadId:      uploadID,
				PartNumber:    aws.Int32(num),
				Body:          bytes.NewReader(data),
				ContentLength: aws.Int64(int64(len(data))),
			})
			if err != nil {
				setErr(fmt.Errorf("uploading part %d: %w", num, err))
				return
			}
			mu.Lock()
			parts = append(parts, s3Types.CompletedPart{ETag: out.ETag, PartNumber: aws.Int32(num)})
			mu.Unlock()
		}(partNum, buf[:n])

		if last {
			break
		}
	}
	wg.Wait()

	if firstErr == nil {
		sort.Slice(parts, func(i, j int) bool { return aws.ToInt32(parts[i].PartNumber) < aws.ToInt32(parts[j].PartNumber) })
		_, firstErr = s.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
			Bucket:          aws.String(s.bucket),
			Key:             aws.String(key),
			UploadId:        uploadID,
			MultipartUpload: &s3Types.CompletedMultipartUpload{Parts: parts},
		})
	}
	if firstErr != nil {
		s.abortMultipart(ctx, key, uploadID)
		return firstErr
	}
	return nil
}

// abortMultipart discards an unfinished upload so its parts are not billed as storage.
// It runs even when ctx was cancelled, e.g. because the client disconnected.
func (s *S3Store) abortMultipart(ctx context.Context, key string, uploadID *string) {
	actx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	if _, err := s.client.AbortMultipartUpload(actx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(s.bucket),
		Key:      aws.String(key),
		UploadId: uploadID,
	}); err != nil {
		log.Printf("[storage] aborting multipart upload of %s failed: %v", key, err)
	}
}

// CopyObject copies src to dst inside the bucket, in parts for objects over 5 GiB.
func (s *S3Store) CopyObject(ctx context.Context, src, dst string) error {
	head, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(src)})
	if err != nil {
		if isNotFound(err) {
			return ErrNotFound
		}
		return err
	}
	source := copySource(s.bucket, src)
	size := aws.ToInt64(head.ContentLength)
	if size <= maxCopySize {
		_, err := s.client.CopyObject(ctx, &s3.CopyObjectInput{
			Bucket:     aws.String(s.bucket),
			Key:        aws.String(dst),
			CopySource: aws.String(source),
		})
		return err
	}

	created, err := s.client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(dst),
		ContentType: head.ContentType,
	})
	if err != nil {
		return err
	}
	var parts []s3Types.CompletedPart
	for off, num := int64(0), int32(1); off < size; off, num = off+copyPartSize, num+1 {
		end := min(off+copyPartSize, size) - 1
		out, err := s.client.UploadPartCopy(ctx, &s3.UploadPartCopyInput{
			Bucket:          aws.String(s.bucket),
			Key:             aws.String(dst),
			UploadId:        created.UploadId,
			PartNumber:      aws.Int32(num),
			CopySource:      aws.String(source),
			CopySourceRange: aws.String(fmt.Sprintf("bytes=%d-%d", off, end)),
		})
		if err != nil {
			s.abortMultipart(ctx, dst, created.UploadId)
			return fmt.Errorf("copying part %d: %w", num, err)
		}
		etag := (*string)(nil)
		if out.CopyPartResult != nil {
			etag = out.CopyPartResult.ETag
		}
		parts = append(parts, s3Types.CompletedPart{ETag: etag, PartNumber: aws.Int32(num)})
	}
	if _, err := s.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:          aws.String(s.bucket),
		Key:             aws.String(dst),
		UploadId:        created.UploadId,
		MultipartUpload: &s3Types.CompletedMultipartUpload{Parts: parts},
	}); err != nil {
		s.abortMultipart(ctx, dst, created.UploadId)
		return err
	}
	return nil
}

// copySource builds the URL-encoded "bucket/key" value CopyObject expects.
func copySource(bucket, key string) string {
	segments := strings.Split(key, "/")
	for i, seg := range segments {
		segments[i] = url.PathEscape(seg)
	}
	return url.PathEscape(bucket) + "/" + strings.Join(segments, "/")
}

func (s *S3Store) PresignUpload(ctx context.Context, key, contentType string, expires time.Duration) (PresignedRequest, error) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if expires <= 0 {
		expires = 15 * time.Minute
	}

	out, err := s.ps.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}, func(o *s3.PresignOptions) {
		o.Expires = expires
	})
	if err != nil {
		return PresignedRequest{}, err
	}

	headers := mapFromSignedHeader(out.SignedHeader)
	headers["Content-Type"] = contentType

	return PresignedRequest{
		URL:       out.URL,
		Method:    out.Method,
		Headers:   headers,
		ExpiresAt: time.Now().Add(expires),
	}, nil
}

func (s *S3Store) DownloadObject(ctx context.Context, key string) (DownloadObject, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return DownloadObject{}, ErrNotFound
		}
		return DownloadObject{}, err
	}

	return DownloadObject{
		Body:          out.Body,
		ContentType:   aws.ToString(out.ContentType),
		ContentLength: aws.ToInt64(out.ContentLength),
	}, nil
}

func (s *S3Store) ReadRange(ctx context.Context, key string, offset, length int64) ([]byte, error) {
	if length <= 0 {
		return nil, nil
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Range:  aws.String(fmt.Sprintf("bytes=%d-%d", offset, offset+length-1)),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, ErrNotFound
		}
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "InvalidRange" {
			return nil, io.EOF
		}
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (s *S3Store) HeadObject(ctx context.Context, key string) (ObjectInfo, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return ObjectInfo{}, ErrNotFound
		}
		return ObjectInfo{}, err
	}
	return ObjectInfo{
		Key:          key,
		Name:         objectNameFromKey("", key),
		Size:         aws.ToInt64(out.ContentLength),
		LastModified: aws.ToTime(out.LastModified),
		ETag:         aws.ToString(out.ETag),
	}, nil
}

func (s *S3Store) PresignDownload(ctx context.Context, key string, expires time.Duration, attachmentName string) (PresignedRequest, error) {
	if expires <= 0 {
		expires = 15 * time.Minute
	}

	input := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}
	if attachmentName != "" {
		input.ResponseContentDisposition = aws.String(mime.FormatMediaType("attachment", map[string]string{"filename": attachmentName}))
	}

	out, err := s.ps.PresignGetObject(ctx, input, func(o *s3.PresignOptions) {
		o.Expires = expires
	})
	if err != nil {
		return PresignedRequest{}, err
	}

	return PresignedRequest{
		URL:       out.URL,
		Method:    out.Method,
		Headers:   mapFromSignedHeader(out.SignedHeader),
		ExpiresAt: time.Now().Add(expires),
	}, nil
}

// DeleteObject deletes key (recursively for folders) and the matching thumbnails.
// PresignThumbnail signs a GET for key whose URL stays the same within each hour, so
// browsers can cache thumbnails across page loads. The URL is valid for at least an hour.
func (s *S3Store) PresignThumbnail(ctx context.Context, key string) (string, error) {
	out, err := s.ps.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = 2 * time.Hour
		o.Presigner = hourlyPresigner{o.Presigner}
	})
	if err != nil {
		return "", err
	}
	return out.URL, nil
}

// hourlyPresigner rounds the signing time down to the hour, making URLs repeatable.
type hourlyPresigner struct{ inner s3.HTTPPresignerV4 }

func (p hourlyPresigner) PresignHTTP(ctx context.Context, creds aws.Credentials, r *http.Request, payloadHash, service, region string, signingTime time.Time, optFns ...func(*v4.SignerOptions)) (string, http.Header, error) {
	return p.inner.PresignHTTP(ctx, creds, r, payloadHash, service, region, signingTime.UTC().Truncate(time.Hour), optFns...)
}

func (s *S3Store) DeleteObject(ctx context.Context, key string) error {
	if err := s.deleteOne(ctx, key); err != nil {
		return err
	}
	if !IsThumbKey(key) {
		thumb := ThumbKey(key)
		if strings.HasSuffix(key, "/") {
			thumb = ThumbPrefix + key
		}
		// Best effort: a leftover thumbnail only costs a few kilobytes
		if err := s.deleteOne(ctx, thumb); err != nil {
			log.Printf("[storage] deleting thumbnail %s failed: %v", thumb, err)
		}
	}
	return nil
}

func (s *S3Store) deleteOne(ctx context.Context, key string) error {
	if strings.HasSuffix(key, "/") {
		var continuationToken *string
		totalDeleted := 0
		for {
			out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
				Bucket:            aws.String(s.bucket),
				Prefix:            aws.String(key),
				ContinuationToken: continuationToken,
			})
			if err != nil {
				return fmt.Errorf("list objects for recursion failed: %w", err)
			}

			if len(out.Contents) > 0 {
				batch := make([]s3Types.ObjectIdentifier, 0, len(out.Contents))
				for _, obj := range out.Contents {
					batch = append(batch, s3Types.ObjectIdentifier{Key: obj.Key})
				}

				delOut, err := s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
					Bucket: aws.String(s.bucket),
					Delete: &s3Types.Delete{Objects: batch, Quiet: aws.Bool(false)},
				})
				if err != nil {
					return fmt.Errorf("batch delete failed: %w", err)
				}

				if len(delOut.Errors) > 0 {
					return fmt.Errorf("failed to delete some objects in folder: %s", aws.ToString(delOut.Errors[0].Message))
				}
				totalDeleted += len(out.Contents)
			}

			if !aws.ToBool(out.IsTruncated) {
				break
			}
			continuationToken = out.NextContinuationToken
		}
		log.Printf("[storage] recursively deleted %d objects under %s", totalDeleted, key)
		return nil
	}

	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

// DeleteObjects deletes files in batches of 1000, together with their thumbnails.
func (s *S3Store) DeleteObjects(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}
	for _, k := range keys[:len(keys):len(keys)] {
		if MayHaveThumbnail(k) {
			keys = append(keys, ThumbKey(k))
		}
	}

	for i := 0; i < len(keys); i += 1000 {
		end := i + 1000
		if end > len(keys) {
			end = len(keys)
		}

		batch := make([]s3Types.ObjectIdentifier, 0, end-i)
		for _, key := range keys[i:end] {
			batch = append(batch, s3Types.ObjectIdentifier{Key: aws.String(key)})
		}

		delOut, err := s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(s.bucket),
			Delete: &s3Types.Delete{Objects: batch, Quiet: aws.Bool(false)},
		})
		if err != nil {
			return err
		}
		if len(delOut.Errors) > 0 {
			return fmt.Errorf("bulk delete partial failure: %s", aws.ToString(delOut.Errors[0].Message))
		}
	}
	return nil
}

func (s *S3Store) Bucket() string {
	return s.bucket
}

func mapFromSignedHeader(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for key, values := range h {
		// Browsers refuse to set Host themselves; it's always sent anyway
		if len(values) == 0 || strings.EqualFold(key, "Host") {
			continue
		}
		out[key] = values[0]
	}
	return out
}

func normalizePrefix(prefix string) string {
	trimmed := strings.TrimLeft(strings.TrimSpace(prefix), "/")
	if trimmed == "" {
		return ""
	}
	if strings.HasSuffix(trimmed, "/") {
		return trimmed
	}
	return trimmed + "/"
}

func parentPrefix(prefix string) string {
	if prefix == "" {
		return ""
	}
	trimmed := strings.TrimSuffix(prefix, "/")
	idx := strings.LastIndex(trimmed, "/")
	if idx < 0 {
		return ""
	}
	return trimmed[:idx+1]
}

func folderName(currentPrefix, folderPrefix string) string {
	name := strings.TrimPrefix(folderPrefix, currentPrefix)
	return strings.TrimSuffix(name, "/")
}

func objectNameFromKey(currentPrefix, key string) string {
	name := strings.TrimPrefix(key, currentPrefix)
	if name == "" {
		parts := strings.Split(key, "/")
		return parts[len(parts)-1]
	}
	return name
}

func isNotFound(err error) bool {
	var noSuchKey *s3Types.NoSuchKey
	if errors.As(err, &noSuchKey) {
		return true
	}
	var notFound *s3Types.NotFound
	if errors.As(err, &notFound) {
		return true
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NoSuchKey", "NotFound", "404":
			return true
		}
	}
	return false
}
