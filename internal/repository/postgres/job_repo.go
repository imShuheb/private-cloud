package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"private-storage/internal/repository"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type JobRepo struct {
	pool *pgxpool.Pool
}

func NewJobRepo(pool *pgxpool.Pool) *JobRepo {
	return &JobRepo{pool: pool}
}

func (r *JobRepo) Create(ctx context.Context, job *repository.Job) error {
	query := `
		INSERT INTO jobs (name, status, payload)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	payloadJSON, _ := json.Marshal(job.Payload)
	err := r.pool.QueryRow(ctx, query, job.Name, job.Status, payloadJSON).Scan(&job.ID, &job.CreatedAt)
	return err
}

func (r *JobRepo) Update(ctx context.Context, job *repository.Job) error {
	query := `
		UPDATE jobs
		SET status = $2, result = $3, error = $4, started_at = $5, completed_at = $6
		WHERE id = $1
	`
	resultJSON, _ := json.Marshal(job.Result)
	_, err := r.pool.Exec(ctx, query,
		job.ID, job.Status, resultJSON, job.Error,
		job.StartedAt, job.CompletedAt,
	)
	return err
}

func (r *JobRepo) GetByID(ctx context.Context, id string) (*repository.Job, error) {
	job := &repository.Job{}
	var payloadJSON, resultJSON []byte
	query := `
		SELECT id, name, status, payload, result, error, started_at, completed_at, created_at
		FROM jobs WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&job.ID, &job.Name, &job.Status, &payloadJSON, &resultJSON,
		&job.Error, &job.StartedAt, &job.CompletedAt, &job.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, errors.New("job not found")
	}
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal(payloadJSON, &job.Payload)
	_ = json.Unmarshal(resultJSON, &job.Result)
	return job, nil
}

func (r *JobRepo) List(ctx context.Context, limit int) ([]repository.Job, error) {
	query := `
		SELECT id, name, status, payload, result, error, started_at, completed_at, created_at
		FROM jobs ORDER BY created_at DESC LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	jobs := []repository.Job{}
	for rows.Next() {
		var j repository.Job
		var payloadJSON, resultJSON []byte
		if err := rows.Scan(
			&j.ID, &j.Name, &j.Status, &payloadJSON, &resultJSON,
			&j.Error, &j.StartedAt, &j.CompletedAt, &j.CreatedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(payloadJSON, &j.Payload)
		_ = json.Unmarshal(resultJSON, &j.Result)
		jobs = append(jobs, j)
	}
	return jobs, nil
}
