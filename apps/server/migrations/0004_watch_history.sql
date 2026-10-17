CREATE TABLE watch_history (
    content_key TEXT PRIMARY KEY NOT NULL,
    entry_json TEXT NOT NULL,
    updated_at REAL NOT NULL
);
