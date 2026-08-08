-- Migration: Store media URLs as domain-independent paths

UPDATE media
SET url = '/media/' || ltrim(r2_key, '/')
WHERE url != '/media/' || ltrim(r2_key, '/');
