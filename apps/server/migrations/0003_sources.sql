CREATE TABLE sources (
    source_id TEXT PRIMARY KEY NOT NULL,
    info_hash TEXT NOT NULL UNIQUE,
    magnet TEXT,
    torrent_file BLOB NOT NULL,
    state INTEGER NOT NULL CHECK (state IN (1, 3)),
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE source_bindings (
    source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    media_type INTEGER NOT NULL CHECK (media_type IN (1, 2)),
    tmdb_id INTEGER NOT NULL CHECK (tmdb_id BETWEEN 1 AND 4294967295),
    season_number INTEGER,
    episode_number INTEGER,
    CHECK ((season_number IS NULL) = (episode_number IS NULL)),
    UNIQUE (source_id, media_type, tmdb_id, season_number, episode_number)
) STRICT;

CREATE UNIQUE INDEX source_bindings_identity
ON source_bindings (
    source_id,
    media_type,
    tmdb_id,
    coalesce(season_number, -1),
    coalesce(episode_number, -1)
);

CREATE TABLE source_files (
    source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    file_index INTEGER NOT NULL CHECK (file_index >= 0),
    name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    likely_media INTEGER NOT NULL CHECK (likely_media IN (0, 1)),
    PRIMARY KEY (source_id, file_index)
) STRICT, WITHOUT ROWID;
