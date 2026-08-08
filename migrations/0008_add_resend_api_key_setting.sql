-- Migration: Store the Resend API key in protected site settings

INSERT OR IGNORE INTO site_settings (setting_key, setting_value)
VALUES ('resend_api_key', '');
