-- Add a selectable public-site theme while preserving the existing appearance.
INSERT OR IGNORE INTO site_settings (setting_key, setting_value)
VALUES ('site_theme', 'classic');
