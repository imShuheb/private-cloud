package postgres

import (
	"context"
	"errors"
	"private-storage/internal/repository"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ConnectionRepo struct {
	pool *pgxpool.Pool
}

func NewConnectionRepo(pool *pgxpool.Pool) *ConnectionRepo {
	return &ConnectionRepo{pool: pool}
}

func (r *ConnectionRepo) Create(ctx context.Context, conn *repository.Connection) error {
	query := `
		INSERT INTO connections (name, bucket, region, endpoint, access_key, secret_key, use_path_style)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	err := r.pool.QueryRow(ctx, query,
		conn.Name, conn.Bucket, conn.Region, conn.Endpoint,
		conn.AccessKey, conn.SecretKey, conn.UsePathStyle,
	).Scan(&conn.ID, &conn.CreatedAt, &conn.UpdatedAt)
	return err
}

func (r *ConnectionRepo) GetByID(ctx context.Context, id string) (*repository.Connection, error) {
	conn := &repository.Connection{}
	query := `
		SELECT id, name, bucket, region, endpoint, access_key, secret_key, use_path_style, is_active, created_at, updated_at
		FROM connections WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&conn.ID, &conn.Name, &conn.Bucket, &conn.Region, &conn.Endpoint,
		&conn.AccessKey, &conn.SecretKey, &conn.UsePathStyle, &conn.IsActive,
		&conn.CreatedAt, &conn.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, errors.New("connection not found")
	}
	return conn, err
}

func (r *ConnectionRepo) List(ctx context.Context) ([]repository.Connection, error) {
	query := `
		SELECT id, name, bucket, region, endpoint, access_key, secret_key, use_path_style, is_active, created_at, updated_at
		FROM connections ORDER BY name ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conns := []repository.Connection{}
	for rows.Next() {
		var c repository.Connection
		if err := rows.Scan(
			&c.ID, &c.Name, &c.Bucket, &c.Region, &c.Endpoint,
			&c.AccessKey, &c.SecretKey, &c.UsePathStyle, &c.IsActive,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		conns = append(conns, c)
	}
	return conns, nil
}

func (r *ConnectionRepo) Update(ctx context.Context, conn *repository.Connection) error {
	query := `
		UPDATE connections
		SET name = $2, bucket = $3, region = $4, endpoint = $5, access_key = $6, secret_key = $7, use_path_style = $8, updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query,
		conn.ID, conn.Name, conn.Bucket, conn.Region, conn.Endpoint,
		conn.AccessKey, conn.SecretKey, conn.UsePathStyle,
	)
	return err
}

func (r *ConnectionRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM connections WHERE id = $1", id)
	return err
}

func (r *ConnectionRepo) SetActive(ctx context.Context, id string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Deactivate all
	if _, err := tx.Exec(ctx, "UPDATE connections SET is_active = FALSE"); err != nil {
		return err
	}

	// Activate one
	if _, err := tx.Exec(ctx, "UPDATE connections SET is_active = TRUE WHERE id = $1", id); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *ConnectionRepo) GetActive(ctx context.Context) (*repository.Connection, error) {
	conn := &repository.Connection{}
	query := `
		SELECT id, name, bucket, region, endpoint, access_key, secret_key, use_path_style, is_active, created_at, updated_at
		FROM connections WHERE is_active = TRUE
	`
	err := r.pool.QueryRow(ctx, query).Scan(
		&conn.ID, &conn.Name, &conn.Bucket, &conn.Region, &conn.Endpoint,
		&conn.AccessKey, &conn.SecretKey, &conn.UsePathStyle, &conn.IsActive,
		&conn.CreatedAt, &conn.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		// Try to return the first one if none is active
		query = `
			SELECT id, name, bucket, region, endpoint, access_key, secret_key, use_path_style, is_active, created_at, updated_at
			FROM connections ORDER BY created_at ASC LIMIT 1
		`
		err = r.pool.QueryRow(ctx, query).Scan(
			&conn.ID, &conn.Name, &conn.Bucket, &conn.Region, &conn.Endpoint,
			&conn.AccessKey, &conn.SecretKey, &conn.UsePathStyle, &conn.IsActive,
			&conn.CreatedAt, &conn.UpdatedAt,
		)
		if err == pgx.ErrNoRows {
			return nil, nil
		}
	}
	return conn, err
}
