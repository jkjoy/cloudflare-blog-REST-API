import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import posts from './routes/posts';
import categories from './routes/categories';
import tags from './routes/tags';
import media from './routes/media';
import users from './routes/users';
import links from './routes/links';
import linkCategories from './routes/link-categories';
import comments from './routes/comments';
import pages from './routes/pages';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-WP-Total', 'X-WP-TotalPages', 'Link'],
  maxAge: 600,
  credentials: true,
}));

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: c.env.SITE_NAME || 'CFBlog',
    description: 'WordPress-like headless CMS powered by Cloudflare Workers',
    url: c.env.SITE_URL,
    namespaces: ['wp/v2'],
    routes: {
      '/wp-json/': {
        methods: ['GET']
      },
      '/wp-json/wp/v2': {
        methods: ['GET']
      },
      '/wp-json/wp/v2/posts': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/posts/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/categories': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/categories/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/tags': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/tags/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/media': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/media/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/users': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/users/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      }
    }
  });
});

// WordPress REST API namespace info
app.get('/wp-json', (c) => {
  return c.json({
    name: c.env.SITE_NAME || 'CFBlog',
    description: 'WordPress-like headless CMS',
    url: c.env.SITE_URL,
    home: c.env.SITE_URL,
    gmt_offset: 0,
    timezone_string: 'UTC',
    namespaces: ['wp/v2'],
    authentication: {
      oauth1: false,
      oauth2: false,
      jwt: true
    },
    routes: {
      '/wp-json/': {
        namespace: '',
        methods: ['GET'],
        endpoints: [
          {
            methods: ['GET'],
            args: {
              context: {
                default: 'view',
                required: false
              }
            }
          }
        ],
        _links: {
          self: `${c.env.SITE_URL}/wp-json/`
        }
      }
    }
  });
});

// WordPress REST API v2 info
app.get('/wp-json/wp/v2', (c) => {
  return c.json({
    namespace: 'wp/v2',
    routes: {
      '/wp/v2': {
        namespace: 'wp/v2',
        methods: ['GET']
      },
      '/wp/v2/posts': {
        namespace: 'wp/v2',
        methods: ['GET', 'POST']
      },
      '/wp/v2/categories': {
        namespace: 'wp/v2',
        methods: ['GET', 'POST']
      },
      '/wp/v2/tags': {
        namespace: 'wp/v2',
        methods: ['GET', 'POST']
      },
      '/wp/v2/media': {
        namespace: 'wp/v2',
        methods: ['GET', 'POST']
      },
      '/wp/v2/users': {
        namespace: 'wp/v2',
        methods: ['GET', 'POST']
      }
    }
  });
});

// Mount routes
app.route('/wp-json/wp/v2/posts', posts);
app.route('/wp-json/wp/v2/pages', pages);
app.route('/wp-json/wp/v2/categories', categories);
app.route('/wp-json/wp/v2/tags', tags);
app.route('/wp-json/wp/v2/media', media);
app.route('/wp-json/wp/v2/users', users);
app.route('/wp-json/wp/v2/links', links);
app.route('/wp-json/wp/v2/link-categories', linkCategories);
app.route('/wp-json/wp/v2/comments', comments);

// Serve media files from R2
app.get('/media/*', async (c) => {
  try {
    // Extract the R2 key from the URL path
    // URL format: /media/uploads/2025/10/filename.jpg
    const path = c.req.path.replace('/media/', '');

    // Get the file from R2
    const object = await c.env.MEDIA.get(path);

    if (!object) {
      return c.text('File not found', 404);
    }

    // Get the content type from R2 metadata
    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';

    // Return the file with appropriate headers
    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Error serving media file:', error);
    return c.text('Internal server error', 500);
  }
});

// Admin dashboard route (will serve HTML)
app.get('/wp-admin', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.env.SITE_NAME || 'CFBlog'} - Dashboard</title>
  <!-- EasyMDE Markdown Editor -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css">
  <script src="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
      background: #f0f0f1;
      color: #2c3338;
    }
    #app {
      display: flex;
      min-height: 100vh;
    }
    .sidebar {
      width: 160px;
      background: #1e1e1e;
      color: #fff;
      padding: 0;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar-header {
      padding: 20px;
      background: #2271b1;
      text-align: center;
      font-size: 20px;
      font-weight: 600;
    }
    .sidebar-menu {
      list-style: none;
      padding: 10px 0;
    }
    .sidebar-menu li {
      padding: 0;
    }
    .sidebar-menu a {
      display: block;
      padding: 10px 20px;
      color: #fff;
      text-decoration: none;
      transition: background 0.2s;
    }
    .sidebar-menu a:hover,
    .sidebar-menu a.active {
      background: #2271b1;
    }
    .main-content {
      flex: 1;
      margin-left: 160px;
      padding: 0;
    }
    .top-bar {
      background: #fff;
      padding: 15px 30px;
      border-bottom: 1px solid #dcdcde;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .top-bar h1 {
      font-size: 23px;
      font-weight: 400;
      color: #1e1e1e;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .content-area {
      padding: 30px;
    }
    .welcome-panel {
      background: #fff;
      border: 1px solid #c3c4c7;
      padding: 30px;
      margin-bottom: 30px;
      border-radius: 4px;
    }
    .welcome-panel h2 {
      font-size: 21px;
      font-weight: 400;
      margin-bottom: 15px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }
    .stat-card {
      background: #fff;
      border: 1px solid #c3c4c7;
      padding: 20px;
      border-radius: 4px;
      text-align: center;
    }
    .stat-card h3 {
      font-size: 14px;
      color: #646970;
      font-weight: 400;
      margin-bottom: 10px;
    }
    .stat-card .number {
      font-size: 32px;
      font-weight: 300;
      color: #1e1e1e;
    }
    .button {
      display: inline-block;
      padding: 8px 16px;
      background: #2271b1;
      color: #fff;
      text-decoration: none;
      border-radius: 3px;
      border: none;
      cursor: pointer;
      font-size: 13px;
    }
    .button:hover {
      background: #135e96;
    }
    .button-secondary {
      background: #f0f0f1;
      color: #2c3338;
      border: 1px solid #2271b1;
    }
    .button-secondary:hover {
      background: #fff;
    }
    .login-form {
      max-width: 400px;
      margin: 100px auto;
      background: #fff;
      padding: 40px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.13);
    }
    .login-form h1 {
      text-align: center;
      margin-bottom: 30px;
      font-size: 28px;
      font-weight: 600;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    .form-group input {
      width: 100%;
      padding: 10px;
      border: 1px solid #8c8f94;
      border-radius: 3px;
      font-size: 14px;
    }
    .form-group input:focus {
      outline: none;
      border-color: #2271b1;
      box-shadow: 0 0 0 1px #2271b1;
    }
    .error-message {
      background: #f0f0f1;
      border-left: 4px solid #d63638;
      padding: 12px;
      margin-bottom: 20px;
    }
    .hidden {
      display: none !important;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .table-container {
      background: #fff;
      border: 1px solid #c3c4c7;
      border-radius: 4px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    table th {
      background: #f6f7f7;
      text-align: left;
      padding: 12px;
      font-weight: 500;
      border-bottom: 1px solid #c3c4c7;
    }
    table td {
      padding: 12px;
      border-bottom: 1px solid #f0f0f1;
    }
    table tr:hover {
      background: #f6f7f7;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .action-link {
      color: #2271b1;
      text-decoration: none;
      font-size: 13px;
    }
    .action-link:hover {
      text-decoration: underline;
    }
    .action-link.delete {
      color: #d63638;
    }
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: #fff;
      padding: 30px;
      border-radius: 4px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .modal-header h2 {
      font-size: 21px;
      font-weight: 400;
    }
    .close-button {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #646970;
    }
    textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #8c8f94;
      border-radius: 3px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      min-height: 200px;
    }
    textarea:focus {
      outline: none;
      border-color: #2271b1;
      box-shadow: 0 0 0 1px #2271b1;
    }
    select {
      width: 100%;
      padding: 10px;
      border: 1px solid #8c8f94;
      border-radius: 3px;
      font-size: 14px;
      background: #fff;
    }
    select:focus {
      outline: none;
      border-color: #2271b1;
      box-shadow: 0 0 0 1px #2271b1;
    }
    .checkbox-group {
      border: 1px solid #8c8f94;
      border-radius: 3px;
      padding: 10px;
      max-height: 150px;
      overflow-y: auto;
    }
    .checkbox-group label {
      display: block;
      padding: 5px 0;
      font-weight: 400;
    }
    .checkbox-group input[type="checkbox"] {
      width: auto;
      margin-right: 8px;
    }
    /* EasyMDE Markdown Editor Customization */
    .EasyMDEContainer {
      margin-bottom: 15px;
    }
    .EasyMDEContainer .CodeMirror {
      border: 1px solid #8c8f94;
      border-radius: 3px;
      min-height: 300px;
      font-size: 14px;
    }
    .EasyMDEContainer .CodeMirror-focused {
      border-color: #2271b1;
      box-shadow: 0 0 0 1px #2271b1;
    }
    .EasyMDEContainer .editor-toolbar {
      border: 1px solid #8c8f94;
      border-bottom: none;
      border-radius: 3px 3px 0 0;
      background: #f9f9f9;
    }
    .EasyMDEContainer .editor-toolbar button {
      color: #2c3338 !important;
    }
    .EasyMDEContainer .editor-toolbar button:hover {
      background: #e0e0e0;
      border-color: #999;
    }
    .EasyMDEContainer .editor-toolbar.fullscreen {
      z-index: 10000;
    }
    .EasyMDEContainer .CodeMirror-fullscreen {
      z-index: 10000;
    }
    .success-message {
      background: #e7f5e7;
      border-left: 4px solid #00a32a;
      padding: 12px;
      margin-bottom: 20px;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #646970;
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <script>
    const API_BASE = '/wp-json/wp/v2';
    let currentUser = null;
    let authToken = localStorage.getItem('auth_token');

    // Router
    const routes = {
      '/': showDashboard,
      '/posts': showPosts,
      '/pages': showPages,
      '/categories': showCategories,
      '/tags': showTags,
      '/media': showMedia,
      '/users': showUsers,
      '/links': showLinks,
      '/comments': showComments,
    };

    function navigate(path) {
      const route = routes[path] || routes['/'];
      route();

      // Update active menu item
      document.querySelectorAll('.sidebar-menu a').forEach(a => {
        a.classList.remove('active');
        if (a.getAttribute('data-route') === path) {
          a.classList.add('active');
        }
      });
    }

    // Auth check
    async function checkAuth() {
      if (!authToken) {
        showLogin();
        return false;
      }

      try {
        const response = await fetch(API_BASE + '/users/me', {
          headers: {
            'Authorization': 'Bearer ' + authToken
          }
        });

        if (response.ok) {
          currentUser = await response.json();
          return true;
        } else {
          localStorage.removeItem('auth_token');
          authToken = null;
          showLogin();
          return false;
        }
      } catch (error) {
        showLogin();
        return false;
      }
    }

    // Login/Register
    async function showLogin() {
      // Check if any users exist (single-user mode)
      let hasUsers = false;
      try {
        const response = await fetch(API_BASE + '/users?per_page=1');
        const users = await response.json();
        hasUsers = users.length > 0;
      } catch (error) {
        console.error('Failed to check users:', error);
      }

      document.getElementById('app').innerHTML = \`
        <div class="login-form">
          <h1>${c.env.SITE_NAME || 'CFBlog'}</h1>
          <div id="form-error" class="error-message hidden"></div>

          <!-- Login Form -->
          <form id="login-form">
            <div class="form-group">
              <label for="login-username">Username or Email</label>
              <input type="text" id="login-username" name="username" required>
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" name="password" required>
            </div>
            <button type="submit" class="button" style="width: 100%;">Log In</button>
          </form>

          \${!hasUsers ? \`
            <div style="text-align: center; margin: 20px 0; color: #646970;">
              — or —
            </div>

            <!-- Register Form -->
            <form id="register-form">
              <div class="form-group">
                <label for="reg-username">Username</label>
                <input type="text" id="reg-username" name="username" required>
              </div>
              <div class="form-group">
                <label for="reg-email">Email</label>
                <input type="email" id="reg-email" name="email" required>
              </div>
              <div class="form-group">
                <label for="reg-password">Password</label>
                <input type="password" id="reg-password" name="password" required minlength="6">
              </div>
              <div class="form-group">
                <label for="reg-display-name">Display Name (optional)</label>
                <input type="text" id="reg-display-name" name="display_name">
              </div>
              <button type="submit" class="button button-secondary" style="width: 100%;">Create Account</button>
            </form>

            <div style="margin-top: 20px; padding: 15px; background: #e7f5fe; border-left: 4px solid #2271b1; font-size: 13px;">
              <strong>First time here?</strong><br>
              The first account will automatically become the administrator.
            </div>
          \` : ''}
        </div>
      \`;

      // Login handler
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
          const response = await fetch(API_BASE + '/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          if (response.ok) {
            const data = await response.json();
            authToken = data.token;
            localStorage.setItem('auth_token', authToken);
            currentUser = data.user;
            init();
          } else {
            const error = await response.json();
            document.getElementById('form-error').textContent = error.message;
            document.getElementById('form-error').classList.remove('hidden');
          }
        } catch (error) {
          document.getElementById('form-error').textContent = 'Login failed. Please try again.';
          document.getElementById('form-error').classList.remove('hidden');
        }
      });

      // Register handler (only if register form exists)
      const registerForm = document.getElementById('register-form');
      if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const username = document.getElementById('reg-username').value;
          const email = document.getElementById('reg-email').value;
          const password = document.getElementById('reg-password').value;
          const display_name = document.getElementById('reg-display-name').value;

          try {
            const response = await fetch(API_BASE + '/users/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, email, password, display_name })
            });

            if (response.ok) {
              const data = await response.json();
              authToken = data.token;
              localStorage.setItem('auth_token', authToken);
              currentUser = data.user;
              init();
            } else {
              const error = await response.json();
              document.getElementById('form-error').textContent = error.message;
              document.getElementById('form-error').classList.remove('hidden');
            }
          } catch (error) {
            document.getElementById('form-error').textContent = 'Registration failed. Please try again.';
            document.getElementById('form-error').classList.remove('hidden');
          }
        });
      }
    }

    // Dashboard
    async function showDashboard() {
      const app = document.getElementById('app');
      renderLayout('Dashboard');

      const content = document.querySelector('.content-area');
      content.innerHTML = \`
        <div class="welcome-panel">
          <h2>Welcome to ${c.env.SITE_NAME || 'CFBlog'}!</h2>
          <p>Your WordPress-like headless blog powered by Cloudflare Workers, D1, and R2.</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <h3>Posts</h3>
            <div class="number" id="posts-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Pages</h3>
            <div class="number" id="pages-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Comments</h3>
            <div class="number" id="comments-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Categories</h3>
            <div class="number" id="categories-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Tags</h3>
            <div class="number" id="tags-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Media</h3>
            <div class="number" id="media-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Links</h3>
            <div class="number" id="links-count">-</div>
          </div>
          <div class="stat-card">
            <h3>Users</h3>
            <div class="number" id="users-count">-</div>
          </div>
        </div>
      \`;

      // Load stats
      loadStats();
    }

    async function loadStats() {
      try {
        const [posts, pages, comments, categories, tags, media, links, users] = await Promise.all([
          fetch(API_BASE + '/posts?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/pages?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/comments?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/categories?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/tags?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/media?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/links?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch(API_BASE + '/users?per_page=1', { headers: { 'Authorization': 'Bearer ' + authToken } })
        ]);

        document.getElementById('posts-count').textContent = posts.headers.get('X-WP-Total') || '0';
        document.getElementById('pages-count').textContent = pages.headers.get('X-WP-Total') || '0';
        document.getElementById('comments-count').textContent = comments.headers.get('X-WP-Total') || '0';
        document.getElementById('categories-count').textContent = categories.headers.get('X-WP-Total') || '0';
        document.getElementById('tags-count').textContent = tags.headers.get('X-WP-Total') || '0';
        document.getElementById('media-count').textContent = media.headers.get('X-WP-Total') || '0';
        document.getElementById('links-count').textContent = links.headers.get('X-WP-Total') || '0';
        document.getElementById('users-count').textContent = users.headers.get('X-WP-Total') || '0';
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    }

    // Posts Management
    async function showPosts() {
      renderLayout('Posts');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>All Posts</h2>
          <button class="button" onclick="showCreatePostModal()">Add New Post</button>
        </div>
        <div id="posts-list"></div>
      \`;

      await loadPosts();
    }

    async function loadPosts() {
      try {
        const response = await fetch(API_BASE + '/posts?per_page=50', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const posts = await response.json();

        const container = document.getElementById('posts-list');
        if (posts.length === 0) {
          container.innerHTML = '<div class="empty-state">No posts yet. Create your first post!</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${posts.map(post => \`
                  <tr>
                    <td><strong>\${post.title.rendered}</strong></td>
                    <td>\${post.status}</td>
                    <td>\${new Date(post.date).toLocaleDateString()}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editPost(\${post.id}); return false;">Edit</a>
                      <a href="#" class="action-link delete" onclick="deletePost(\${post.id}); return false;">Delete</a>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load posts:', error);
      }
    }

    window.showCreatePostModal = async function() {
      const categories = await fetchCategories();
      const tags = await fetchTags();

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create New Post</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-post-form">
            <div class="form-group">
              <label>Title *</label>
              <input type="text" name="title" required>
            </div>
            <div class="form-group">
              <label>Slug (URL) <small style="color: #646970;">(留空自动生成)</small></label>
              <input type="text" name="slug" placeholder="auto-generated-from-title">
            </div>
            <div class="form-group">
              <label>Content</label>
              <div style="margin-bottom: 10px;">
                <button type="button" class="button button-secondary" onclick="openMediaLibrary('create')">Add Media</button>
              </div>
              <textarea id="post-content" name="content"></textarea>
            </div>
            <div class="form-group">
              <label>Excerpt</label>
              <textarea name="excerpt" style="min-height: 100px;"></textarea>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                <option value="draft">Draft</option>
                <option value="publish">Publish</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div class="form-group">
              <label>Categories</label>
              <div class="checkbox-group">
                \${categories.map(cat => \`
                  <label>
                    <input type="checkbox" name="categories" value="\${cat.id}">
                    \${cat.name}
                  </label>
                \`).join('')}
              </div>
            </div>
            <div class="form-group">
              <label>Tags</label>
              <div class="checkbox-group">
                \${tags.map(tag => \`
                  <label>
                    <input type="checkbox" name="tags" value="\${tag.id}">
                    \${tag.name}
                  </label>
                \`).join('')}
              </div>
            </div>
            <button type="submit" class="button" style="width: 100%;">Create Post</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      // Initialize EasyMDE for content editor
      const contentEditor = new EasyMDE({
        element: document.getElementById('post-content'),
        spellChecker: false,
        placeholder: '在此输入文章内容... 支持 Markdown 语法',
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link', 'image', '|',
          'preview', 'side-by-side', 'fullscreen', '|',
          'guide'
        ],
        status: ['lines', 'words', 'cursor'],
        minHeight: '300px',
        maxHeight: '600px'
      });

      // Custom media button handler
      window.currentEditor = contentEditor;

      document.getElementById('create-post-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const categories = Array.from(formData.getAll('categories')).map(Number);
        const tags = Array.from(formData.getAll('tags')).map(Number);

        try {
          const postData = {
            title: formData.get('title'),
            content: contentEditor.value(), // Get content from EasyMDE
            excerpt: formData.get('excerpt'),
            status: formData.get('status'),
            categories: categories.length > 0 ? categories : [1],
            tags: tags
          };

          // Only include slug if it's not empty
          const slug = formData.get('slug');
          if (slug && slug.trim()) {
            postData.slug = slug.trim();
          }

          const response = await fetch(API_BASE + '/posts', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
          });

          if (response.ok) {
            modal.remove();
            await loadPosts();
          }
        } catch (error) {
          console.error('Failed to create post:', error);
        }
      });
    };

    window.editPost = async function(id) {
      const post = await fetch(API_BASE + '/posts/' + id, {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.json());

      const categories = await fetchCategories();
      const tags = await fetchTags();

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Post</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-post-form">
            <div class="form-group">
              <label>Title *</label>
              <input type="text" name="title" value="\${post.title.rendered}" required>
            </div>
            <div class="form-group">
              <label>Slug (URL)</label>
              <input type="text" name="slug" value="\${post.slug}">
            </div>
            <div class="form-group">
              <label>Content</label>
              <div style="margin-bottom: 10px;">
                <button type="button" class="button button-secondary" onclick="openMediaLibrary('edit', \${post.id})">Add Media</button>
              </div>
              <textarea id="post-content-edit" name="content">\${post.content.rendered}</textarea>
            </div>
            <div class="form-group">
              <label>Excerpt</label>
              <textarea name="excerpt" style="min-height: 100px;">\${post.excerpt.rendered}</textarea>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                <option value="draft" \${post.status === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="publish" \${post.status === 'publish' ? 'selected' : ''}>Publish</option>
                <option value="private" \${post.status === 'private' ? 'selected' : ''}>Private</option>
              </select>
            </div>
            <div class="form-group">
              <label>Categories</label>
              <div class="checkbox-group">
                \${categories.map(cat => \`
                  <label>
                    <input type="checkbox" name="categories" value="\${cat.id}" \${post.categories.includes(cat.id) ? 'checked' : ''}>
                    \${cat.name}
                  </label>
                \`).join('')}
              </div>
            </div>
            <div class="form-group">
              <label>Tags</label>
              <div class="checkbox-group">
                \${tags.map(tag => \`
                  <label>
                    <input type="checkbox" name="tags" value="\${tag.id}" \${post.tags.includes(tag.id) ? 'checked' : ''}>
                    \${tag.name}
                  </label>
                \`).join('')}
              </div>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Post</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      // Initialize EasyMDE for edit content editor
      const editContentEditor = new EasyMDE({
        element: document.getElementById('post-content-edit'),
        spellChecker: false,
        placeholder: '在此输入文章内容... 支持 Markdown 语法',
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link', 'image', '|',
          'preview', 'side-by-side', 'fullscreen', '|',
          'guide'
        ],
        status: ['lines', 'words', 'cursor'],
        minHeight: '300px',
        maxHeight: '600px'
      });

      // Set initial content
      editContentEditor.value(post.content.rendered);

      // Custom media button handler
      window.currentEditor = editContentEditor;

      document.getElementById('edit-post-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const categories = Array.from(formData.getAll('categories')).map(Number);
        const tags = Array.from(formData.getAll('tags')).map(Number);

        try {
          const postData = {
            title: formData.get('title'),
            content: editContentEditor.value(), // Get content from EasyMDE
            excerpt: formData.get('excerpt'),
            status: formData.get('status'),
            categories: categories,
            tags: tags
          };

          // Include slug
          const slug = formData.get('slug');
          if (slug && slug.trim()) {
            postData.slug = slug.trim();
          }

          const response = await fetch(API_BASE + '/posts/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
          });

          if (response.ok) {
            modal.remove();
            await loadPosts();
          }
        } catch (error) {
          console.error('Failed to update post:', error);
        }
      });
    };

    window.deletePost = async function(id) {
      if (!confirm('Are you sure you want to delete this post?')) return;

      try {
        await fetch(API_BASE + '/posts/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadPosts();
      } catch (error) {
        console.error('Failed to delete post:', error);
      }
    };

    // Categories Management
    async function showCategories() {
      renderLayout('Categories');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>Categories</h2>
          <button class="button" onclick="showCreateCategoryModal()">Add New Category</button>
        </div>
        <div id="categories-list"></div>
      \`;

      await loadCategories();
    }

    async function loadCategories() {
      try {
        const response = await fetch(API_BASE + '/categories?per_page=100');
        const categories = await response.json();

        const container = document.getElementById('categories-list');
        if (categories.length === 0) {
          container.innerHTML = '<div class="empty-state">No categories yet.</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Count</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${categories.map(cat => \`
                  <tr>
                    <td><strong>\${cat.name}</strong></td>
                    <td>\${cat.slug}</td>
                    <td>\${cat.count}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editCategory(\${cat.id}); return false;">Edit</a>
                      \${cat.id !== 1 ? \`<a href="#" class="action-link delete" onclick="deleteCategory(\${cat.id}); return false;">Delete</a>\` : ''}
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    }

    async function fetchCategories() {
      const response = await fetch(API_BASE + '/categories?per_page=100');
      return await response.json();
    }

    async function fetchTags() {
      const response = await fetch(API_BASE + '/tags?per_page=100');
      return await response.json();
    }

    window.showCreateCategoryModal = function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create New Category</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-category-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" name="name" required>
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input type="text" name="slug">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 100px;"></textarea>
            </div>
            <button type="submit" class="button" style="width: 100%;">Create Category</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('create-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/categories', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              slug: formData.get('slug'),
              description: formData.get('description')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadCategories();
          }
        } catch (error) {
          console.error('Failed to create category:', error);
        }
      });
    };

    window.editCategory = async function(id) {
      const cat = await fetch(API_BASE + '/categories/' + id).then(r => r.json());

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Category</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-category-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" name="name" value="\${cat.name}" required>
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input type="text" name="slug" value="\${cat.slug}">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 100px;">\${cat.description}</textarea>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Category</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('edit-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/categories/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              slug: formData.get('slug'),
              description: formData.get('description')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadCategories();
          }
        } catch (error) {
          console.error('Failed to update category:', error);
        }
      });
    };

    window.deleteCategory = async function(id) {
      if (!confirm('Are you sure? Posts will be moved to Uncategorized.')) return;

      try {
        await fetch(API_BASE + '/categories/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadCategories();
      } catch (error) {
        console.error('Failed to delete category:', error);
      }
    };

    // Tags Management
    async function showTags() {
      renderLayout('Tags');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>Tags</h2>
          <button class="button" onclick="showCreateTagModal()">Add New Tag</button>
        </div>
        <div id="tags-list"></div>
      \`;

      await loadTagsList();
    }

    async function loadTagsList() {
      try {
        const response = await fetch(API_BASE + '/tags?per_page=100');
        const tags = await response.json();

        const container = document.getElementById('tags-list');
        if (tags.length === 0) {
          container.innerHTML = '<div class="empty-state">No tags yet.</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Count</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${tags.map(tag => \`
                  <tr>
                    <td><strong>\${tag.name}</strong></td>
                    <td>\${tag.slug}</td>
                    <td>\${tag.count}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editTag(\${tag.id}); return false;">Edit</a>
                      <a href="#" class="action-link delete" onclick="deleteTag(\${tag.id}); return false;">Delete</a>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    }

    window.showCreateTagModal = function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create New Tag</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-tag-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" name="name" required>
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input type="text" name="slug">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 100px;"></textarea>
            </div>
            <button type="submit" class="button" style="width: 100%;">Create Tag</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('create-tag-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/tags', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              slug: formData.get('slug'),
              description: formData.get('description')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadTagsList();
          }
        } catch (error) {
          console.error('Failed to create tag:', error);
        }
      });
    };

    window.editTag = async function(id) {
      const tag = await fetch(API_BASE + '/tags/' + id).then(r => r.json());

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Tag</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-tag-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" name="name" value="\${tag.name}" required>
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input type="text" name="slug" value="\${tag.slug}">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 100px;">\${tag.description}</textarea>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Tag</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('edit-tag-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/tags/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              slug: formData.get('slug'),
              description: formData.get('description')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadTagsList();
          }
        } catch (error) {
          console.error('Failed to update tag:', error);
        }
      });
    };

    window.deleteTag = async function(id) {
      if (!confirm('Are you sure you want to delete this tag?')) return;

      try {
        await fetch(API_BASE + '/tags/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadTagsList();
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    };

    // Media Management
    async function showMedia() {
      renderLayout('Media Library');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>Media Library</h2>
          <button class="button" onclick="showUploadMediaModal()">Upload New</button>
        </div>
        <div id="media-grid"></div>
      \`;

      await loadMediaGrid();
    }

    async function loadMediaGrid() {
      try {
        const response = await fetch(API_BASE + '/media?per_page=50', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const mediaItems = await response.json();

        const container = document.getElementById('media-grid');
        if (mediaItems.length === 0) {
          container.innerHTML = '<div class="empty-state">No media files yet. Upload your first file!</div>';
          return;
        }

        container.innerHTML = \`
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;">
            \${mediaItems.map(media => \`
              <div class="media-item" style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden; cursor: pointer;" onclick="showMediaDetails(\${media.id})">
                <div style="height: 150px; background: #f0f0f1; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  \${media.media_type === 'image'
                    ? \`<img src="\${media.source_url}" alt="\${media.alt_text}" style="max-width: 100%; max-height: 100%; object-fit: cover;">\`
                    : \`<div style="padding: 20px; text-align: center; color: #646970;">\${media.mime_type}</div>\`
                  }
                </div>
                <div style="padding: 10px;">
                  <div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\${media.title.rendered}</div>
                  <div style="font-size: 12px; color: #646970;">\${formatFileSize(media.media_details.filesize)}</div>
                </div>
              </div>
            \`).join('')}
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load media:', error);
      }
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    window.showUploadMediaModal = function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Upload Media</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="upload-media-form" enctype="multipart/form-data">
            <div class="form-group">
              <label>Select File *</label>
              <input type="file" id="media-file" name="file" accept="image/*,video/*,.pdf" required style="padding: 5px;">
            </div>
            <div id="file-preview" style="margin: 15px 0; display: none;">
              <img id="preview-image" style="max-width: 100%; max-height: 300px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="form-group">
              <label>Title</label>
              <input type="text" id="media-title" name="title" placeholder="Auto-filled from filename">
            </div>
            <div class="form-group">
              <label>Alt Text (for images)</label>
              <input type="text" name="alt_text">
            </div>
            <div class="form-group">
              <label>Caption</label>
              <textarea name="caption" style="min-height: 80px;"></textarea>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 80px;"></textarea>
            </div>
            <div id="upload-progress" class="hidden" style="margin: 15px 0;">
              <div style="background: #f0f0f1; border-radius: 4px; overflow: hidden;">
                <div id="progress-bar" style="background: #2271b1; height: 20px; width: 0%; transition: width 0.3s;"></div>
              </div>
              <div id="progress-text" style="text-align: center; margin-top: 5px; font-size: 13px; color: #646970;">Uploading...</div>
            </div>
            <button type="submit" class="button" style="width: 100%;">Upload File</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      // File preview
      document.getElementById('media-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          document.getElementById('media-title').value = file.name.replace(/\\.[^/.]+$/, '');

          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const preview = document.getElementById('file-preview');
              const img = document.getElementById('preview-image');
              img.src = e.target.result;
              preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
          }
        }
      });

      document.getElementById('upload-media-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const progressDiv = document.getElementById('upload-progress');
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        progressDiv.classList.remove('hidden');
        progressBar.style.width = '50%';

        try {
          const response = await fetch(API_BASE + '/media', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken
            },
            body: formData
          });

          progressBar.style.width = '100%';

          if (response.ok) {
            progressText.textContent = 'Upload complete!';
            setTimeout(() => {
              modal.remove();
              showMedia();
            }, 500);
          } else {
            const error = await response.json();
            alert('Upload failed: ' + error.message);
            progressDiv.classList.add('hidden');
          }
        } catch (error) {
          console.error('Failed to upload media:', error);
          alert('Upload failed. Please try again.');
          progressDiv.classList.add('hidden');
        }
      });
    };

    window.showMediaDetails = async function(id) {
      try {
        const response = await fetch(API_BASE + '/media/' + id, {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const media = await response.json();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = \`
          <div class="modal-content">
            <div class="modal-header">
              <h2>Media Details</h2>
              <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div>
                \${media.media_type === 'image'
                  ? \`<img src="\${media.source_url}" alt="\${media.alt_text}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px;">\`
                  : \`<div style="padding: 40px; background: #f0f0f1; text-align: center; border-radius: 4px;">\${media.mime_type}</div>\`
                }
              </div>
              <div>
                <div style="margin-bottom: 15px;">
                  <strong>URL:</strong><br>
                  <input type="text" readonly value="\${media.source_url}" style="width: 100%; padding: 5px; font-size: 12px;" onclick="this.select()">
                </div>
                <div style="margin-bottom: 10px;"><strong>Title:</strong> \${media.title.rendered}</div>
                <div style="margin-bottom: 10px;"><strong>File type:</strong> \${media.mime_type}</div>
                <div style="margin-bottom: 10px;"><strong>File size:</strong> \${formatFileSize(media.media_details.filesize)}</div>
                <div style="margin-bottom: 10px;"><strong>Uploaded:</strong> \${new Date(media.date).toLocaleDateString()}</div>
                \${media.media_details.width ? \`<div style="margin-bottom: 10px;"><strong>Dimensions:</strong> \${media.media_details.width} × \${media.media_details.height}</div>\` : ''}
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                  <button class="button button-secondary" onclick="copyMediaUrl('\${media.source_url}')" style="margin-right: 8px;">Copy URL</button>
                  <button class="button" style="background: #d63638;" onclick="deleteMedia(\${media.id})">Delete</button>
                </div>
              </div>
            </div>
          </div>
        \`;
        document.body.appendChild(modal);
      } catch (error) {
        console.error('Failed to load media details:', error);
      }
    };

    window.copyMediaUrl = function(url) {
      navigator.clipboard.writeText(url).then(() => {
        alert('URL copied to clipboard!');
      });
    };

    window.deleteMedia = async function(id) {
      if (!confirm('Are you sure you want to permanently delete this file?')) return;

      try {
        await fetch(API_BASE + '/media/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });

        document.querySelectorAll('.modal').forEach(m => m.remove());
        showMedia();
      } catch (error) {
        console.error('Failed to delete media:', error);
        alert('Failed to delete media.');
      }
    };

    window.openMediaLibrary = function(mode, postId) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content" style="max-width: 900px;">
          <div class="modal-header">
            <h2>Insert Media</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <div style="margin-bottom: 15px;">
            <button class="button" onclick="showUploadMediaModalInline()">Upload New File</button>
          </div>
          <div id="media-library-grid" style="max-height: 60vh; overflow-y: auto;"></div>
        </div>
      \`;
      document.body.appendChild(modal);

      loadMediaLibraryGrid(mode, postId);
    };

    async function loadMediaLibraryGrid(mode, postId) {
      try {
        const response = await fetch(API_BASE + '/media?per_page=50', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const mediaItems = await response.json();

        const container = document.getElementById('media-library-grid');
        if (mediaItems.length === 0) {
          container.innerHTML = '<div class="empty-state">No media files yet. Upload your first file!</div>';
          return;
        }

        container.innerHTML = \`
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
            \${mediaItems.map(media => \`
              <div class="media-item" style="border: 2px solid #ddd; border-radius: 4px; overflow: hidden; cursor: pointer; transition: border-color 0.2s;" onclick="insertMediaIntoPost('\${media.source_url}', '\${media.title.rendered}', '\${mode}')" onmouseover="this.style.borderColor='#2271b1'" onmouseout="this.style.borderColor='#ddd'">
                <div style="height: 120px; background: #f0f0f1; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  \${media.media_type === 'image'
                    ? \`<img src="\${media.source_url}" alt="\${media.alt_text}" style="max-width: 100%; max-height: 100%; object-fit: cover;">\`
                    : \`<div style="padding: 10px; text-align: center; font-size: 11px; color: #646970;">\${media.mime_type}</div>\`
                  }
                </div>
                <div style="padding: 8px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="\${media.title.rendered}">\${media.title.rendered}</div>
              </div>
            \`).join('')}
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load media library:', error);
      }
    }

    window.showUploadMediaModalInline = function() {
      showUploadMediaModal();
    };

    window.insertMediaIntoPost = function(url, title, mode) {
      // Try to use EasyMDE editor if available
      if (window.currentEditor) {
        const cm = window.currentEditor.codemirror;
        const doc = cm.getDoc();
        const cursor = doc.getCursor();

        // Insert Markdown image syntax
        const imageMarkup = '![' + title + '](' + url + ')';
        doc.replaceRange(imageMarkup, cursor);

        // Move cursor to end of inserted text
        cursor.ch += imageMarkup.length;
        doc.setCursor(cursor);

        // Focus the editor
        cm.focus();
      } else {
        // Fallback to textarea (for compatibility)
        const textareaId = mode === 'edit' ? 'post-content-edit' : 'post-content';
        const textarea = document.getElementById(textareaId);

        if (textarea) {
          const imageMarkup = '![' + title + '](' + url + ')\\n';
          const cursorPos = textarea.selectionStart;
          const textBefore = textarea.value.substring(0, cursorPos);
          const textAfter = textarea.value.substring(cursorPos);

          textarea.value = textBefore + imageMarkup + textAfter;
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = cursorPos + imageMarkup.length;
        }
      }

      // Only close the media library modal, not the post editor
      const mediaModals = document.querySelectorAll('.modal');
      mediaModals.forEach(modal => {
        const header = modal.querySelector('.modal-header h2');
        if (header && header.textContent === 'Insert Media') {
          modal.remove();
        }
      });
    };

    // Users Management
    async function showUsers() {
      renderLayout('Users');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>All Users</h2>
          \${currentUser.role === 'administrator' ? '<button class="button" onclick="showCreateUserModal()">Add New User</button>' : ''}
        </div>
        <div id="users-list"></div>
      \`;

      await loadUsersList();
    }

    async function loadUsersList() {
      try {
        const response = await fetch(API_BASE + '/users?per_page=100', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const users = await response.json();

        const container = document.getElementById('users-list');
        if (users.length === 0) {
          container.innerHTML = '<div class="empty-state">No users found.</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${users.map(user => \`
                  <tr>
                    <td><strong>\${user.slug}</strong></td>
                    <td>\${user.name}</td>
                    <td>\${user.email || 'N/A'}</td>
                    <td>\${user.roles ? user.roles[0] : 'N/A'}</td>
                    <td>\${new Date(user.registered_date).toLocaleDateString()}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editUser(\${user.id}); return false;">Edit</a>
                      \${currentUser.role === 'administrator' && user.id !== currentUser.id ? \`<a href="#" class="action-link delete" onclick="deleteUser(\${user.id}); return false;">Delete</a>\` : ''}
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    }

    window.showCreateUserModal = function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create New User</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-user-form">
            <div class="form-group">
              <label>Username *</label>
              <input type="text" name="username" required>
            </div>
            <div class="form-group">
              <label>Email *</label>
              <input type="email" name="email" required>
            </div>
            <div class="form-group">
              <label>Password *</label>
              <input type="password" name="password" required minlength="6">
            </div>
            <div class="form-group">
              <label>Display Name</label>
              <input type="text" name="display_name">
            </div>
            <div class="form-group">
              <label>Role</label>
              <select name="role">
                <option value="subscriber">Subscriber</option>
                <option value="contributor">Contributor</option>
                <option value="author">Author</option>
                <option value="editor">Editor</option>
                <option value="administrator">Administrator</option>
              </select>
            </div>
            <button type="submit" class="button" style="width: 100%;">Create User</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/users', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: formData.get('username'),
              email: formData.get('email'),
              password: formData.get('password'),
              display_name: formData.get('display_name'),
              role: formData.get('role')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadUsersList();
          } else {
            const error = await response.json();
            alert('Failed to create user: ' + error.message);
          }
        } catch (error) {
          console.error('Failed to create user:', error);
          alert('Failed to create user.');
        }
      });
    };

    window.editUser = async function(id) {
      const user = await fetch(API_BASE + '/users/' + id, {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.json());

      const isCurrentUser = user.id === currentUser.id;
      const canEditRole = currentUser.role === 'administrator' && !isCurrentUser;

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit User</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-user-form">
            <div class="form-group">
              <label>Username</label>
              <input type="text" value="\${user.slug}" disabled style="background: #f0f0f1;">
            </div>
            <div class="form-group">
              <label>Email *</label>
              <input type="email" name="email" value="\${user.email || ''}" required>
            </div>
            <div class="form-group">
              <label>Display Name</label>
              <input type="text" name="display_name" value="\${user.name}">
            </div>
            <div class="form-group">
              <label>Bio</label>
              <textarea name="bio" style="min-height: 100px;">\${user.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>New Password (leave blank to keep current)</label>
              <input type="password" name="password" minlength="6">
            </div>
            \${canEditRole ? \`
              <div class="form-group">
                <label>Role</label>
                <select name="role">
                  <option value="subscriber" \${user.roles && user.roles[0] === 'subscriber' ? 'selected' : ''}>Subscriber</option>
                  <option value="contributor" \${user.roles && user.roles[0] === 'contributor' ? 'selected' : ''}>Contributor</option>
                  <option value="author" \${user.roles && user.roles[0] === 'author' ? 'selected' : ''}>Author</option>
                  <option value="editor" \${user.roles && user.roles[0] === 'editor' ? 'selected' : ''}>Editor</option>
                  <option value="administrator" \${user.roles && user.roles[0] === 'administrator' ? 'selected' : ''}>Administrator</option>
                </select>
              </div>
            \` : ''}
            <button type="submit" class="button" style="width: 100%;">Update User</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const updateData = {
          email: formData.get('email'),
          display_name: formData.get('display_name'),
          bio: formData.get('bio')
        };

        if (formData.get('password')) {
          updateData.password = formData.get('password');
        }

        if (canEditRole) {
          updateData.role = formData.get('role');
        }

        try {
          const response = await fetch(API_BASE + '/users/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
          });

          if (response.ok) {
            modal.remove();
            await loadUsersList();

            // Update current user if editing self
            if (isCurrentUser) {
              const updatedUser = await response.json();
              currentUser = updatedUser;
            }
          } else {
            const error = await response.json();
            alert('Failed to update user: ' + error.message);
          }
        } catch (error) {
          console.error('Failed to update user:', error);
          alert('Failed to update user.');
        }
      });
    };

    window.deleteUser = async function(id) {
      if (!confirm('Are you sure you want to delete this user? Their posts will also be deleted.')) return;

      try {
        await fetch(API_BASE + '/users/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadUsersList();
      } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Failed to delete user.');
      }
    };

    // Links Management
    async function showLinks() {
      renderLayout('Links');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>Friendly Links</h2>
          <button class="button" onclick="showCreateLinkModal()">Add New Link</button>
          <button class="button button-secondary" onclick="showLinkCategories()" style="margin-left: 10px;">Manage Categories</button>
        </div>
        <div id="links-list"></div>
      \`;

      await loadLinksList();
    }

    async function loadLinksList() {
      try {
        const response = await fetch(API_BASE + '/links?per_page=100&visible=yes', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const links = await response.json();

        const container = document.getElementById('links-list');
        if (links.length === 0) {
          container.innerHTML = '<div class="empty-state">No links yet. Add your first friendly link!</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Sort</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${links.map(link => \`
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        \${link.avatar ? \`<img src="\${link.avatar}" alt="\${link.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">\` : ''}
                        <strong>\${link.name}</strong>
                      </div>
                    </td>
                    <td><a href="\${link.url}" target="_blank" style="color: #2271b1;">\${link.url}</a></td>
                    <td>\${link.category.name}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${link.description || '-'}</td>
                    <td>\${link.sort_order}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editLink(\${link.id}); return false;">Edit</a>
                      <a href="#" class="action-link delete" onclick="deleteLink(\${link.id}); return false;">Delete</a>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load links:', error);
      }
    }

    window.showCreateLinkModal = async function() {
      const categories = await fetchLinkCategories();

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Add New Link</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-link-form">
            <div class="form-group">
              <label>Site Name *</label>
              <input type="text" name="name" required>
            </div>
            <div class="form-group">
              <label>Site URL *</label>
              <input type="url" name="url" placeholder="https://example.com" required>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 80px;" placeholder="Brief description of the site"></textarea>
            </div>
            <div class="form-group">
              <label>Avatar URL</label>
              <input type="url" name="avatar" placeholder="https://example.com/avatar.jpg">
              <small style="color: #646970; display: block; margin-top: 5px;">Recommended: 100x100px</small>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select name="category_id">
                \${categories.map(cat => \`
                  <option value="\${cat.id}">\${cat.name}</option>
                \`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Target</label>
              <select name="target">
                <option value="_blank">New Window (_blank)</option>
                <option value="_self">Same Window (_self)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Sort Order</label>
              <input type="number" name="sort_order" value="0" min="0">
              <small style="color: #646970; display: block; margin-top: 5px;">Lower numbers appear first</small>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" name="visible" value="yes" checked style="width: auto; margin-right: 8px;">
                Visible
              </label>
            </div>
            <button type="submit" class="button" style="width: 100%;">Add Link</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('create-link-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/links', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              url: formData.get('url'),
              description: formData.get('description'),
              avatar: formData.get('avatar'),
              category_id: parseInt(formData.get('category_id')),
              target: formData.get('target'),
              visible: formData.get('visible') ? 'yes' : 'no',
              sort_order: parseInt(formData.get('sort_order') || '0')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadLinksList();
          } else {
            const error = await response.json();
            alert('Failed to create link: ' + error.message);
          }
        } catch (error) {
          console.error('Failed to create link:', error);
          alert('Failed to create link.');
        }
      });
    };

    window.editLink = async function(id) {
      const link = await fetch(API_BASE + '/links/' + id, {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.json());

      const categories = await fetchLinkCategories();

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Link</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-link-form">
            <div class="form-group">
              <label>Site Name *</label>
              <input type="text" name="name" value="\${link.name}" required>
            </div>
            <div class="form-group">
              <label>Site URL *</label>
              <input type="url" name="url" value="\${link.url}" required>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 80px;">\${link.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>Avatar URL</label>
              <input type="url" name="avatar" value="\${link.avatar || ''}">
              <small style="color: #646970; display: block; margin-top: 5px;">Recommended: 100x100px</small>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select name="category_id">
                \${categories.map(cat => \`
                  <option value="\${cat.id}" \${cat.id === link.category.id ? 'selected' : ''}>\${cat.name}</option>
                \`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Target</label>
              <select name="target">
                <option value="_blank" \${link.target === '_blank' ? 'selected' : ''}>New Window (_blank)</option>
                <option value="_self" \${link.target === '_self' ? 'selected' : ''}>Same Window (_self)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Sort Order</label>
              <input type="number" name="sort_order" value="\${link.sort_order}" min="0">
              <small style="color: #646970; display: block; margin-top: 5px;">Lower numbers appear first</small>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" name="visible" value="yes" \${link.visible === 'yes' ? 'checked' : ''} style="width: auto; margin-right: 8px;">
                Visible
              </label>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Link</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('edit-link-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/links/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              url: formData.get('url'),
              description: formData.get('description'),
              avatar: formData.get('avatar'),
              category_id: parseInt(formData.get('category_id')),
              target: formData.get('target'),
              visible: formData.get('visible') ? 'yes' : 'no',
              sort_order: parseInt(formData.get('sort_order') || '0')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadLinksList();
          } else {
            const error = await response.json();
            alert('Failed to update link: ' + error.message);
          }
        } catch (error) {
          console.error('Failed to update link:', error);
          alert('Failed to update link.');
        }
      });
    };

    window.deleteLink = async function(id) {
      if (!confirm('Are you sure you want to delete this link?')) return;

      try {
        await fetch(API_BASE + '/links/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadLinksList();
      } catch (error) {
        console.error('Failed to delete link:', error);
        alert('Failed to delete link.');
      }
    };

    async function fetchLinkCategories() {
      const response = await fetch(API_BASE + '/link-categories');
      return await response.json();
    }

    window.showLinkCategories = async function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content" style="max-width: 800px;">
          <div class="modal-header">
            <h2>Link Categories</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <div style="margin-bottom: 20px;">
            <button class="button" onclick="showCreateLinkCategoryModal()">Add Category</button>
          </div>
          <div id="link-categories-list"></div>
        </div>
      \`;
      document.body.appendChild(modal);

      await loadLinkCategoriesList();
    };

    async function loadLinkCategoriesList() {
      try {
        const response = await fetch(API_BASE + '/link-categories');
        const categories = await response.json();

        const container = document.getElementById('link-categories-list');
        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Count</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${categories.map(cat => \`
                  <tr>
                    <td><strong>\${cat.name}</strong></td>
                    <td>\${cat.slug}</td>
                    <td>\${cat.count}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editLinkCategory(\${cat.id}); return false;">Edit</a>
                      <a href="#" class="action-link delete" onclick="deleteLinkCategory(\${cat.id}); return false;">Delete</a>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load link categories:', error);
      }
    }

    window.showCreateLinkCategoryModal = function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Add Link Category</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-link-category-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" name="name" required>
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input type="text" name="slug" placeholder="auto-generated">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 80px;"></textarea>
            </div>
            <button type="submit" class="button" style="width: 100%;">Create Category</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('create-link-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/link-categories', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              slug: formData.get('slug'),
              description: formData.get('description')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadLinkCategoriesList();
          }
        } catch (error) {
          console.error('Failed to create link category:', error);
        }
      });
    };

    window.editLinkCategory = async function(id) {
      const cat = await fetch(API_BASE + '/link-categories/' + id).then(r => r.json());

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Link Category</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-link-category-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" name="name" value="\${cat.name}" required>
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input type="text" name="slug" value="\${cat.slug}">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" style="min-height: 80px;">\${cat.description || ''}</textarea>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Category</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('edit-link-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const response = await fetch(API_BASE + '/link-categories/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: formData.get('name'),
              slug: formData.get('slug'),
              description: formData.get('description')
            })
          });

          if (response.ok) {
            modal.remove();
            await loadLinkCategoriesList();
          }
        } catch (error) {
          console.error('Failed to update link category:', error);
        }
      });
    };

    window.deleteLinkCategory = async function(id) {
      if (!confirm('Are you sure? Links will be moved to the default category.')) return;

      try {
        await fetch(API_BASE + '/link-categories/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadLinkCategoriesList();
      } catch (error) {
        console.error('Failed to delete link category:', error);
      }
    };

    function renderLayout(title) {
      const app = document.getElementById('app');
      app.innerHTML = \`
        <div class="sidebar">
          <div class="sidebar-header">${c.env.SITE_NAME || 'CFBlog'}</div>
          <ul class="sidebar-menu">
            <li><a href="#" data-route="/" class="active">Dashboard</a></li>
            <li><a href="#" data-route="/posts">Posts</a></li>
            <li><a href="#" data-route="/pages">Pages</a></li>
            <li><a href="#" data-route="/categories">Categories</a></li>
            <li><a href="#" data-route="/tags">Tags</a></li>
            <li><a href="#" data-route="/media">Media</a></li>
            <li><a href="#" data-route="/links">Links</a></li>
            <li><a href="#" data-route="/comments">Comments</a></li>
            <li><a href="#" data-route="/users">Users</a></li>
          </ul>
        </div>
        <div class="main-content">
          <div class="top-bar">
            <h1>\${title}</h1>
            <div class="user-info">
              <span>\${currentUser.name}</span>
              <button class="button button-secondary" onclick="logout()">Logout</button>
            </div>
          </div>
          <div class="content-area"></div>
        </div>
      \`;

      // Add event listeners to menu
      document.querySelectorAll('.sidebar-menu a').forEach(a => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(a.getAttribute('data-route'));
        });
      });
    }

    // Comments Management
    async function showComments() {
      renderLayout('Comments');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>All Comments</h2>
          <div>
            <select id="comment-status-filter" style="padding: 8px; margin-right: 10px;">
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="pending" selected>Pending</option>
              <option value="spam">Spam</option>
              <option value="trash">Trash</option>
            </select>
          </div>
        </div>
        <div id="comments-list"></div>
      \`;

      document.getElementById('comment-status-filter').addEventListener('change', (e) => {
        loadCommentsList(e.target.value);
      });

      await loadCommentsList('pending');
    }

    async function loadCommentsList(status = 'all') {
      try {
        const response = await fetch(API_BASE + '/comments?per_page=50&status=' + status, {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const comments = await response.json();

        const container = document.getElementById('comments-list');
        if (comments.length === 0) {
          container.innerHTML = '<div class="empty-state">No comments found.</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Author</th>
                  <th>Comment</th>
                  <th>Post</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${comments.map(comment => \`
                  <tr>
                    <td>
                      <strong>\${comment.author_name}</strong><br>
                      <small style="color: #646970;">\${comment.author_email}</small>
                    </td>
                    <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
                      \${comment.content.rendered.substring(0, 100)}...
                    </td>
                    <td>\${comment.post_title || 'N/A'}</td>
                    <td>
                      <span style="padding: 3px 8px; background: \${
                        comment.status === 'approved' ? '#00a32a' :
                        comment.status === 'pending' ? '#dba617' :
                        comment.status === 'spam' ? '#d63638' : '#646970'
                      }; color: white; border-radius: 3px; font-size: 12px;">
                        \${comment.status}
                      </span>
                    </td>
                    <td>\${new Date(comment.date).toLocaleDateString()}</td>
                    <td class="actions">
                      \${comment.status !== 'approved' ? \`<a href="#" class="action-link" onclick="approveComment(\${comment.id}); return false;">Approve</a>\` : ''}
                      \${comment.status !== 'spam' ? \`<a href="#" class="action-link" onclick="markAsSpam(\${comment.id}); return false;">Spam</a>\` : ''}
                      <a href="#" class="action-link" onclick="editComment(\${comment.id}); return false;">Edit</a>
                      <a href="#" class="action-link delete" onclick="deleteComment(\${comment.id}); return false;">Delete</a>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load comments:', error);
      }
    }

    window.approveComment = async function(id) {
      try {
        await fetch(API_BASE + '/comments/' + id, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'approved' })
        });
        const statusFilter = document.getElementById('comment-status-filter').value;
        await loadCommentsList(statusFilter);
      } catch (error) {
        console.error('Failed to approve comment:', error);
      }
    };

    window.markAsSpam = async function(id) {
      try {
        await fetch(API_BASE + '/comments/' + id, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'spam' })
        });
        const statusFilter = document.getElementById('comment-status-filter').value;
        await loadCommentsList(statusFilter);
      } catch (error) {
        console.error('Failed to mark comment as spam:', error);
      }
    };

    window.editComment = async function(id) {
      const comment = await fetch(API_BASE + '/comments/' + id, {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.json());

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Comment</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-comment-form">
            <div class="form-group">
              <label>Author Name *</label>
              <input type="text" name="author_name" value="\${comment.author_name}" required>
            </div>
            <div class="form-group">
              <label>Author Email *</label>
              <input type="email" name="author_email" value="\${comment.author_email}" required>
            </div>
            <div class="form-group">
              <label>Author URL</label>
              <input type="url" name="author_url" value="\${comment.author_url || ''}">
            </div>
            <div class="form-group">
              <label>Comment *</label>
              <textarea name="content" required style="min-height: 150px;">\${comment.content.rendered}</textarea>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                <option value="approved" \${comment.status === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="pending" \${comment.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="spam" \${comment.status === 'spam' ? 'selected' : ''}>Spam</option>
                <option value="trash" \${comment.status === 'trash' ? 'selected' : ''}>Trash</option>
              </select>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Comment</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      document.getElementById('edit-comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          await fetch(API_BASE + '/comments/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              author_name: formData.get('author_name'),
              author_email: formData.get('author_email'),
              author_url: formData.get('author_url'),
              content: formData.get('content'),
              status: formData.get('status')
            })
          });
          modal.remove();
          const statusFilter = document.getElementById('comment-status-filter').value;
          await loadCommentsList(statusFilter);
        } catch (error) {
          console.error('Failed to update comment:', error);
        }
      });
    };

    window.deleteComment = async function(id) {
      if (!confirm('Are you sure you want to delete this comment permanently?')) return;

      try {
        await fetch(API_BASE + '/comments/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const statusFilter = document.getElementById('comment-status-filter').value;
        await loadCommentsList(statusFilter);
      } catch (error) {
        console.error('Failed to delete comment:', error);
      }
    };

    // Pages Management
    async function showPages() {
      renderLayout('Pages');
      const content = document.querySelector('.content-area');

      content.innerHTML = \`
        <div class="page-header">
          <h2>All Pages</h2>
          <button class="button" onclick="showCreatePageModal()">Add New Page</button>
        </div>
        <div id="pages-list"></div>
      \`;

      await loadPagesList();
    }

    async function loadPagesList() {
      try {
        const response = await fetch(API_BASE + '/pages?per_page=50&status=all', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const pages = await response.json();

        const container = document.getElementById('pages-list');
        if (pages.length === 0) {
          container.innerHTML = '<div class="empty-state">No pages yet. Create your first page!</div>';
          return;
        }

        container.innerHTML = \`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Comment Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${pages.map(page => \`
                  <tr>
                    <td><strong>\${page.title.rendered}</strong></td>
                    <td>\${page.status}</td>
                    <td>\${page.comment_status}</td>
                    <td>\${new Date(page.date).toLocaleDateString()}</td>
                    <td class="actions">
                      <a href="#" class="action-link" onclick="editPage(\${page.id}); return false;">Edit</a>
                      <a href="#" class="action-link delete" onclick="deletePage(\${page.id}); return false;">Delete</a>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } catch (error) {
        console.error('Failed to load pages:', error);
      }
    }

    window.showCreatePageModal = function() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create New Page</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="create-page-form">
            <div class="form-group">
              <label>Title *</label>
              <input type="text" name="title" required>
            </div>
            <div class="form-group">
              <label>Slug (URL) <small style="color: #646970;">(留空自动生成)</small></label>
              <input type="text" name="slug" placeholder="auto-generated-from-title">
            </div>
            <div class="form-group">
              <label>Content</label>
              <textarea id="page-content" name="content"></textarea>
            </div>
            <div class="form-group">
              <label>Excerpt</label>
              <textarea name="excerpt" style="min-height: 100px;"></textarea>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                <option value="draft">Draft</option>
                <option value="publish">Publish</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div class="form-group">
              <label>Comment Status</label>
              <select name="comment_status">
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <button type="submit" class="button" style="width: 100%;">Create Page</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      // Initialize EasyMDE
      const pageEditor = new EasyMDE({
        element: document.getElementById('page-content'),
        spellChecker: false,
        placeholder: '在此输入页面内容... 支持 Markdown 语法',
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link', 'image', '|',
          'preview', 'side-by-side', 'fullscreen', '|',
          'guide'
        ],
        status: ['lines', 'words', 'cursor'],
        minHeight: '300px',
        maxHeight: '600px'
      });

      document.getElementById('create-page-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const pageData = {
            title: formData.get('title'),
            content: pageEditor.value(),
            excerpt: formData.get('excerpt'),
            status: formData.get('status'),
            comment_status: formData.get('comment_status')
          };

          const slug = formData.get('slug');
          if (slug && slug.trim()) {
            pageData.slug = slug.trim();
          }

          const response = await fetch(API_BASE + '/pages', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(pageData)
          });

          if (response.ok) {
            modal.remove();
            await loadPagesList();
          }
        } catch (error) {
          console.error('Failed to create page:', error);
        }
      });
    };

    window.editPage = async function(id) {
      const page = await fetch(API_BASE + '/pages/' + id, {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.json());

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Page</h2>
            <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
          </div>
          <form id="edit-page-form">
            <div class="form-group">
              <label>Title *</label>
              <input type="text" name="title" value="\${page.title.rendered}" required>
            </div>
            <div class="form-group">
              <label>Slug (URL)</label>
              <input type="text" name="slug" value="\${page.slug}">
            </div>
            <div class="form-group">
              <label>Content</label>
              <textarea id="page-content-edit" name="content">\${page.content.rendered}</textarea>
            </div>
            <div class="form-group">
              <label>Excerpt</label>
              <textarea name="excerpt" style="min-height: 100px;">\${page.excerpt.rendered}</textarea>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                <option value="draft" \${page.status === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="publish" \${page.status === 'publish' ? 'selected' : ''}>Publish</option>
                <option value="private" \${page.status === 'private' ? 'selected' : ''}>Private</option>
              </select>
            </div>
            <div class="form-group">
              <label>Comment Status</label>
              <select name="comment_status">
                <option value="open" \${page.comment_status === 'open' ? 'selected' : ''}>Open</option>
                <option value="closed" \${page.comment_status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
            </div>
            <button type="submit" class="button" style="width: 100%;">Update Page</button>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);

      // Initialize EasyMDE
      const editPageEditor = new EasyMDE({
        element: document.getElementById('page-content-edit'),
        spellChecker: false,
        placeholder: '在此输入页面内容... 支持 Markdown 语法',
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link', 'image', '|',
          'preview', 'side-by-side', 'fullscreen', '|',
          'guide'
        ],
        status: ['lines', 'words', 'cursor'],
        minHeight: '300px',
        maxHeight: '600px'
      });

      editPageEditor.value(page.content.rendered);

      document.getElementById('edit-page-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
          const pageData = {
            title: formData.get('title'),
            content: editPageEditor.value(),
            excerpt: formData.get('excerpt'),
            status: formData.get('status'),
            comment_status: formData.get('comment_status')
          };

          const slug = formData.get('slug');
          if (slug && slug.trim()) {
            pageData.slug = slug.trim();
          }

          const response = await fetch(API_BASE + '/pages/' + id, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(pageData)
          });

          if (response.ok) {
            modal.remove();
            await loadPagesList();
          }
        } catch (error) {
          console.error('Failed to update page:', error);
        }
      });
    };

    window.deletePage = async function(id) {
      if (!confirm('Are you sure you want to delete this page?')) return;

      try {
        await fetch(API_BASE + '/pages/' + id + '?force=true', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        await loadPagesList();
      } catch (error) {
        console.error('Failed to delete page:', error);
      }
    };

    function logout() {
      localStorage.removeItem('auth_token');
      authToken = null;
      currentUser = null;
      showLogin();
    }

    // Initialize
    async function init() {
      const authenticated = await checkAuth();
      if (authenticated) {
        navigate('/');
      }
    }

    // Start app
    init();
  </script>
</body>
</html>
  `);
});

export default app;
