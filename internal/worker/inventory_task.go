package worker

import (
	"compress/gzip"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log"
	"private-storage/internal/repository"
	"private-storage/internal/storage"
	"strconv"
	"strings"
)

type InventoryScanTask struct {
	analyticsRepo repository.AnalyticsRepository
	connRepo      repository.ConnectionRepository
	initStorage   func(ctx context.Context, conn *repository.Connection) (storage.Store, error)
}

func NewInventoryScanTask(
	analyticsRepo repository.AnalyticsRepository,
	connRepo repository.ConnectionRepository,
	initStorage func(ctx context.Context, conn *repository.Connection) (storage.Store, error),
) *InventoryScanTask {
	return &InventoryScanTask{
		analyticsRepo: analyticsRepo,
		connRepo:      connRepo,
		initStorage:   initStorage,
	}
}

func (t *InventoryScanTask) Run(ctx context.Context, job *repository.Job) (interface{}, error) {
	payload, ok := job.Payload.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid payload type: %T", job.Payload)
	}

	connID, _ := payload["connectionId"].(string)
	manifestKey, _ := payload["manifestKey"].(string)

	if connID == "" {
		return nil, errors.New("connectionId is required")
	}

	conn, err := t.connRepo.GetByID(ctx, connID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	store, err := t.initStorage(ctx, conn)
	if err != nil {
		return nil, fmt.Errorf("failed to init storage: %w", err)
	}

	if manifestKey == "" {
		return nil, errors.New("manifestKey (path to inventory CSV) is required")
	}

	log.Printf("[Worker] Starting smart inventory scan for %s using manifest %s", conn.Name, manifestKey)

	reader, err := store.GetRawObject(ctx, manifestKey)
	if err != nil {
		return nil, fmt.Errorf("failed to open inventory file: %w", err)
	}
	defer reader.Close()

	var csvReader *csv.Reader
	if isGzip(manifestKey) {
		gzr, err := gzip.NewReader(reader)
		if err != nil {
			return nil, fmt.Errorf("gzip error: %w", err)
		}
		defer gzr.Close()
		csvReader = csv.NewReader(gzr)
	} else {
		csvReader = csv.NewReader(reader)
	}

	// Smart Column Detection
	sizeCol := -1
	classCol := -1
	
	classStats := make(map[string]*repository.StorageStat)
	count := 0
	
	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("[Worker] CSV error at line %d: %v", count, err)
			continue
		}

		// Detect columns on the first valid row
		if sizeCol == -1 || classCol == -1 {
			for i, val := range record {
				valLower := strings.ToLower(val)
				// Detection heuristics
				if sizeCol == -1 && (valLower == "size" || isNumeric(val)) {
					sizeCol = i
				}
				if classCol == -1 && (valLower == "storage_class" || isStorageClass(val)) {
					classCol = i
				}
			}
			
			// Fallback if detection failed on first row
			if sizeCol == -1 { sizeCol = 5 } // Standard S3 Inventory index
			if classCol == -1 { classCol = 8 } // Standard S3 Inventory index
			
			log.Printf("[Worker] Detected columns - Size: %d, Class: %d", sizeCol, classCol)
		}

		// Safety check for indices
		if sizeCol >= len(record) || classCol >= len(record) {
			continue 
		}

		size, _ := strconv.ParseInt(record[sizeCol], 10, 64)
		storageClass := strings.ToUpper(record[classCol])

		if storageClass == "" || isNumeric(storageClass) {
			storageClass = "STANDARD"
		}

		s, ok := classStats[storageClass]
		if !ok {
			s = &repository.StorageStat{
				ConnectionID: conn.ID,
				StorageClass: storageClass,
			}
			classStats[storageClass] = s
		}
		s.TotalSize += size
		s.TotalObjects++
		count++

		if count%500000 == 0 {
			log.Printf("[Worker] Scanning high-volume bucket... processed %d objects", count)
		}
	}

	finalStats := make([]repository.StorageStat, 0, len(classStats))
	for _, s := range classStats {
		finalStats = append(finalStats, *s)
	}

	if err := t.analyticsRepo.SaveStorageStats(ctx, finalStats); err != nil {
		return nil, fmt.Errorf("failed to save stats: %w", err)
	}

	return map[string]any{
		"objectsProcessed": count,
		"classesFound":     len(finalStats),
		"status":           "success",
	}, nil
}

func isNumeric(s string) bool {
	_, err := strconv.ParseInt(s, 10, 64)
	return err == nil && s != ""
}

func isStorageClass(s string) bool {
	classes := []string{"STANDARD", "GLACIER", "INTELLIGENT_TIERING", "DEEP_ARCHIVE", "REDUCED_REDUNDANCY", "OUTPOSTS"}
	s = strings.ToUpper(s)
	for _, c := range classes {
		if strings.Contains(s, c) {
			return true
		}
	}
	return false
}

func isGzip(filename string) bool {
	return strings.HasSuffix(filename, ".gz")
}
