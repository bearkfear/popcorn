PRAGMA user_version = 1;

CREATE TABLE catalog_metadata (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    catalog_version TEXT NOT NULL CHECK (length(catalog_version) > 0)
) STRICT;

INSERT INTO catalog_metadata (singleton, schema_version, catalog_version)
VALUES (1, 1, 'foundation-1');
