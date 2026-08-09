-- Add menu visibility and priority controls for public pages.
ALTER TABLE posts ADD COLUMN menu_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN menu_priority INTEGER NOT NULL DEFAULT 0;
