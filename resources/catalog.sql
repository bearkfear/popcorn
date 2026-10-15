PRAGMA user_version = 2;

CREATE TABLE catalog_metadata (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version = 2),
    catalog_version TEXT NOT NULL CHECK (length(catalog_version) > 0)
) STRICT;

INSERT INTO catalog_metadata (singleton, schema_version, catalog_version)
VALUES (1, 2, 'foundation-2');

-- The installed snapshot is intentionally empty. Content ingestion is not part
-- of I1; synthetic records belong only to isolated integration-test snapshots.
CREATE TABLE catalog_contents (
    media_type INTEGER NOT NULL CHECK (media_type IN (1, 2)),
    tmdb_id INTEGER NOT NULL CHECK (tmdb_id BETWEEN 1 AND 4294967295),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    overview TEXT NOT NULL,
    release_year INTEGER NOT NULL CHECK (release_year BETWEEN 0 AND 9999),
    PRIMARY KEY (media_type, tmdb_id)
) STRICT, WITHOUT ROWID;
