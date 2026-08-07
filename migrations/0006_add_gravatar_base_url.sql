-- Migration: Add configurable Gravatar mirror base URL

INSERT OR IGNORE INTO site_settings (setting_key, setting_value)
VALUES ('gravatar_base_url', 'https://cn.cravatar.com/avatar');
