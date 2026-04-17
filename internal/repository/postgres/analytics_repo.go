package postgres

import (
	"context"
	"private-storage/internal/repository"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AnalyticsRepo struct {
	pool *pgxpool.Pool
}

func NewAnalyticsRepo(pool *pgxpool.Pool) *AnalyticsRepo {
	return &AnalyticsRepo{pool: pool}
}

func (r *AnalyticsRepo) SaveStorageStats(ctx context.Context, stats []repository.StorageStat) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, s := range stats {
		query := `
			INSERT INTO storage_stats (connection_id, storage_class, total_size, total_objects, recorded_at)
			VALUES ($1, $2, $3, $4, NOW())
		`
		if _, err := tx.Exec(ctx, query, s.ConnectionID, s.StorageClass, s.TotalSize, s.TotalObjects); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *AnalyticsRepo) GetLatestStorageStats(ctx context.Context, connectionID string) ([]repository.StorageStat, error) {
	query := `
		SELECT WITH latest_record AS (
			SELECT MAX(recorded_at) as max_time FROM storage_stats WHERE connection_id = $1
		)
		SELECT storage_class, total_size, total_objects, recorded_at
		FROM storage_stats, latest_record
		WHERE connection_id = $1 AND recorded_at = latest_record.max_time
	`
    // Note: The above SQL logic might be better handled as selecting the most recent snapshot.
    // Simplifying for now to just get the most recent set.
    
    query = `
        SELECT storage_class, total_size, total_objects, recorded_at
        FROM storage_stats
        WHERE connection_id = $1 AND recorded_at = (
            SELECT MAX(recorded_at) FROM storage_stats WHERE connection_id = $1
        )
    `

	rows, err := r.pool.Query(ctx, query, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []repository.StorageStat
	for rows.Next() {
		var s repository.StorageStat
		s.ConnectionID = connectionID
		if err := rows.Scan(&s.StorageClass, &s.TotalSize, &s.TotalObjects, &s.RecordedAt); err != nil {
			return nil, err
		}
		stats = append(stats, s)
	}

	return stats, nil
}

func (r *AnalyticsRepo) GetPricingConfig(ctx context.Context, connectionID string) ([]repository.PricingConfig, error) {
	query := `
		SELECT storage_class, price_per_gb
		FROM pricing_config
		WHERE connection_id = $1
	`
	rows, err := r.pool.Query(ctx, query, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var configs []repository.PricingConfig
	for rows.Next() {
		var c repository.PricingConfig
		c.ConnectionID = connectionID
		if err := rows.Scan(&c.StorageClass, &c.PricePerGB); err != nil {
			return nil, err
		}
		configs = append(configs, c)
	}
	return configs, nil
}

func (r *AnalyticsRepo) UpdatePricingConfig(ctx context.Context, config repository.PricingConfig) error {
	query := `
		INSERT INTO pricing_config (connection_id, storage_class, price_per_gb)
		VALUES ($1, $2, $3)
		ON CONFLICT (connection_id, storage_class)
		DO UPDATE SET price_per_gb = EXCLUDED.price_per_gb
	`
	_, err := r.pool.Exec(ctx, query, config.ConnectionID, config.StorageClass, config.PricePerGB)
	return err
}
