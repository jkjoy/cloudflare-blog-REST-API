-- Invalidate existing JWTs when a user's credentials or role changes.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
