-- Durable, cross-PoP login throttling state.
CREATE TABLE IF NOT EXISTS auth_login_attempts (
    attempt_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_window
ON auth_login_attempts(window_started_at);
