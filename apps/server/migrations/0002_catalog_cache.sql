CREATE TABLE catalog_cache (
    cache_key TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL CHECK (json_valid(payload)),
    expires_at INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
);
