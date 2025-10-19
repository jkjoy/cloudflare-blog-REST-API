-- WordPress-like Blog System Database Schema
-- 注意：不包含默认用户，需要通过 API 创建

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'subscriber' CHECK(role IN ('administrator', 'editor', 'author', 'contributor', 'subscriber')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    avatar_url TEXT,
    bio TEXT
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    excerpt TEXT,
    slug TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK(status IN ('publish', 'draft', 'pending', 'private', 'trash')),
    post_type TEXT DEFAULT 'post' CHECK(post_type IN ('post', 'page')),
    author_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT 0,
    featured_image TEXT,
    comment_status TEXT DEFAULT 'open' CHECK(comment_status IN ('open', 'closed')),
    comment_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Categories table (Taxonomy)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    parent_id INTEGER DEFAULT 0,
    count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Post-Category relationship (many-to-many)
CREATE TABLE IF NOT EXISTS post_categories (
    post_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, category_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Post-Tag relationship (many-to-many)
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT 0,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    author_url TEXT,
    author_ip TEXT,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('approved', 'pending', 'spam', 'trash')),
    user_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Media table (R2 storage references)
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    r2_key TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT,
    caption TEXT,
    description TEXT,
    width INTEGER,
    height INTEGER,
    author_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings/Options table
CREATE TABLE IF NOT EXISTS options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_name TEXT UNIQUE NOT NULL,
    option_value TEXT,
    autoload TEXT DEFAULT 'yes' CHECK(autoload IN ('yes', 'no'))
);

-- Link Categories table
CREATE TABLE IF NOT EXISTS link_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Links table (Blogroll/友情链接)
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    avatar TEXT,
    category_id INTEGER DEFAULT 1,
    target TEXT DEFAULT '_blank' CHECK(target IN ('_blank', '_self')),
    visible TEXT DEFAULT 'yes' CHECK(visible IN ('yes', 'no')),
    rating INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES link_categories(id) ON DELETE SET DEFAULT
);

-- Meta tables for extensibility
CREATE TABLE IF NOT EXISTS post_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    meta_key TEXT NOT NULL,
    meta_value TEXT,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    meta_key TEXT NOT NULL,
    meta_value TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_media_author ON media(author_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media(mime_type);
CREATE INDEX IF NOT EXISTS idx_post_meta_key ON post_meta(post_id, meta_key);
CREATE INDEX IF NOT EXISTS idx_user_meta_key ON user_meta(user_id, meta_key);
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category_id);
CREATE INDEX IF NOT EXISTS idx_links_visible ON links(visible);
CREATE INDEX IF NOT EXISTS idx_links_sort ON links(sort_order);

-- Insert default options
INSERT OR IGNORE INTO options (option_name, option_value, autoload) VALUES
('site_title', 'My Blog', 'yes'),
('site_description', 'Just another WordPress-like blog', 'yes'),
('posts_per_page', '10', 'yes'),
('default_comment_status', 'open', 'yes'),
('date_format', 'Y-m-d', 'yes'),
('time_format', 'H:i:s', 'yes'),
('timezone', 'UTC', 'yes');

-- Insert default category
INSERT OR IGNORE INTO categories (name, slug, description)
VALUES ('Uncategorized', 'uncategorized', 'Default category');

-- Insert default link category
INSERT OR IGNORE INTO link_categories (name, slug, description)
VALUES ('Friends', 'friends', 'Friendly links');
