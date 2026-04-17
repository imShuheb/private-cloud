package postgres

import (
	"context"
	"errors"
	"private-storage/internal/repository"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) GetByUsername(ctx context.Context, username string) (*repository.User, error) {
	user := &repository.User{}
	query := `
		SELECT id, username, password_hash, created_at, updated_at
		FROM users WHERE username = $1
	`
	err := r.pool.QueryRow(ctx, query, username).Scan(
		&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, errors.New("user not found")
	}
	return user, err
}

func (r *UserRepo) UpdatePassword(ctx context.Context, id string, newHash string) error {
	query := `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, newHash)
	return err
}
