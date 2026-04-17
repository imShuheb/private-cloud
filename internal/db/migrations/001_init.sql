-- Initial Schema Migration

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Connections table
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bucket TEXT NOT NULL,
    region TEXT NOT NULL,
    endpoint TEXT,
    access_key TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    use_path_style BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    payload JSONB,
    result JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Object Usage (Time-series data for analysis)
CREATE TABLE IF NOT EXISTS object_usage (
    time TIMESTAMPTZ NOT NULL,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    total_size BIGINT NOT NULL,
    total_objects INTEGER NOT NULL,
    egress_bytes BIGINT DEFAULT 0
);

-- Convert object_usage into a hypertable
SELECT create_hypertable('object_usage', 'time', if_not_exists => TRUE);

-- Initial Admin User (admin / admin@123)
-- Hash generated using bcrypt for 'admin@123'
INSERT INTO users (username, password_hash)
VALUES ('admin', '$2a$10$g0V6QE.L/JiZ4bpHSHYD/uffa98yzvn.LSEX230A8xqE5Z/lLlhrq') 
ON CONFLICT (username) DO NOTHING;
