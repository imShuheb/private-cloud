-- Migration 003: Analytics & Pricing

-- Table to store storage distribution by class
CREATE TABLE IF NOT EXISTS storage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    storage_class TEXT NOT NULL,
    total_size BIGINT NOT NULL DEFAULT 0,
    total_objects INTEGER NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries on connection and time
CREATE INDEX IF NOT EXISTS idx_storage_stats_conn_time ON storage_stats(connection_id, recorded_at);

-- Table for custom pricing configuration
CREATE TABLE IF NOT EXISTS pricing_config (
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    storage_class TEXT NOT NULL,
    price_per_gb NUMERIC(10, 5) NOT NULL DEFAULT 0.00000,
    PRIMARY KEY (connection_id, storage_class)
);

-- Add some default pricing for AWS S3 standard if not exists
-- Users can override this in the UI
INSERT INTO pricing_config (connection_id, storage_class, price_per_gb)
SELECT id, 'STANDARD', 0.02300 FROM connections
ON CONFLICT DO NOTHING;

INSERT INTO pricing_config (connection_id, storage_class, price_per_gb)
SELECT id, 'GLACIER', 0.00400 FROM connections
ON CONFLICT DO NOTHING;
