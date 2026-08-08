import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { getSiteSettings } from './utils';
import posts from './routes/posts';
import categories from './routes/categories';
import tags from './routes/tags';
import media from './routes/media';
import users from './routes/users';
import links from './routes/links';
import link分类 from './routes/link-categories';
import comments from './routes/comments';
import pages from './routes/pages';
import settings from './routes/settings';
import moments from './routes/moments';
import imports from './routes/import';
import { registerPublicSiteRoutes, renderPublicHome } from './public-site';

const app = new Hono<AppEnv>();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-WP-Total', 'X-WP-TotalPages', 'Link'],
  maxAge: 600,
}));

// Root endpoint - Simple landing page
app.get('/', async (c) => {
  return renderPublicHome(c);

  const siteSettings = await getSiteSettings(c.env);
  const apiUrl = siteSettings.site_url || 'http://localhost:8787';

  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteSettings.site_title || 'CFBlog'} - API Server</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #333;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 50px;
      max-width: 600px;
      width: 90%;
      text-align: center;
    }
    h1 {
      font-size: 36px;
      margin-bottom: 10px;
      color: #2c3e50;
    }
    .subtitle {
      font-size: 18px;
      color: #7f8c8d;
      margin-bottom: 40px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #e8f5e9;
      border: 2px solid #4caf50;
      border-radius: 8px;
      padding: 15px 25px;
      margin: 20px 0;
      font-weight: 600;
      color: #2e7d32;
    }
    .status.checking {
      background: #fff3e0;
      border-color: #ff9800;
      color: #e65100;
    }
    .status.error {
      background: #ffebee;
      border-color: #f44336;
      color: #c62828;
    }
    .indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4caf50;
      animation: pulse 2s infinite;
    }
    .status.checking .indicator {
      background: #ff9800;
    }
    .status.error .indicator {
      background: #f44336;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .button-group {
      display: flex;
      gap: 15px;
      justify-content: center;
      margin-top: 30px;
      flex-wrap: wrap;
    }
    .button {
      display: inline-block;
      padding: 14px 30px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: all 0.3s;
      border: none;
      cursor: pointer;
      font-size: 16px;
    }
    .button:hover {
      background: #764ba2;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }
    .button.secondary {
      background: #ecf0f1;
      color: #2c3e50;
    }
    .button.secondary:hover {
      background: #bdc3c7;
    }
    .info {
      margin-top: 40px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
      text-align: left;
    }
    .info h3 {
      color: #2c3e50;
      margin-bottom: 15px;
      font-size: 18px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-item:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #2c3e50;
      font-family: 'Courier New', monospace;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      color: #95a5a6;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${siteSettings.site_title || 'CFBlog'}</h1>
    <p class="subtitle">${siteSettings.site_description || 'WordPress-like Headless CMS'}</p>

    <div id="status" class="status checking">
      <span class="indicator"></span>
      <span id="status-text">Checking API status...</span>
    </div>

    <div class="button-group">
      <a href="/wp-admin" class="button">Go to Dashboard</a>
      <a href="/wp-json/" class="button secondary">View API Info</a>
    </div>

    <div class="info">
      <h3>API Endpoints</h3>
      <div class="info-item">
        <span class="info-label">API Root:</span>
        <span class="info-value">/wp-json/</span>
      </div>
      <div class="info-item">
        <span class="info-label">Posts:</span>
        <span class="info-value">/wp-json/wp/v2/posts</span>
      </div>
      <div class="info-item">
        <span class="info-label">分类:</span>
        <span class="info-value">/wp-json/wp/v2/categories</span>
      </div>
      <div class="info-item">
        <span class="info-label">标签:</span>
        <span class="info-value">/wp-json/wp/v2/tags</span>
      </div>
      <div class="info-item">
        <span class="info-label">Media:</span>
        <span class="info-value">/wp-json/wp/v2/media</span>
      </div>
      <div class="info-item">
        <span class="info-label">Dashboard:</span>
        <span class="info-value">/wp-admin</span>
      </div>
    </div>

    <div class="footer">
      Powered by Cloudflare Workers + D1 + R2
    </div>
  </div>

  <script>
    // Check API status
    async function checkApiStatus() {
      const statusEl = document.getElementById('status');
      const statusTextEl = document.getElementById('status-text');

      try {
        const response = await fetch('/wp-json/');
        if (response.ok) {
          const data = await response.json();
          statusEl.className = 'status';
          statusTextEl.textContent = 'API is online and ready';
        } else {
          throw new Error('API returned error');
        }
      } catch (error) {
        statusEl.className = 'status error';
        statusTextEl.textContent = 'API connection failed';
      }
    }

    // Run check on load
    checkApiStatus();

    // Recheck every 30 seconds
    setInterval(checkApiStatus, 30000);
  </script>
</body>
</html>
  `);
});

// WordPress REST API root - Discovery endpoint
app.get('/wp-json', async (c) => {
  const siteSettings = await getSiteSettings(c.env);
  return c.json({
    name: siteSettings.site_title || 'CFBlog',
    description: siteSettings.site_description || 'WordPress-like headless CMS powered by Cloudflare Workers',
    url: siteSettings.site_url || 'http://localhost:8787',
    home: siteSettings.site_url || 'http://localhost:8787',
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
          self: `${siteSettings.site_url || 'http://localhost:8787'}/wp-json/`
        }
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
      '/wp-json/wp/v2/pages': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/pages/(?P<id>[\\d]+)': {
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
      },
      '/wp-json/wp/v2/links': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/links/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/link-categories': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/link-categories/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/comments': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/comments/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/import': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/settings': {
        methods: ['GET', 'PUT']
      }
    }
  });
});

// WordPress REST API root with trailing slash (alias)
app.get('/wp-json/', async (c) => {
  const siteSettings = await getSiteSettings(c.env);
  return c.json({
    name: siteSettings.site_title || 'CFBlog',
    description: siteSettings.site_description || 'WordPress-like headless CMS powered by Cloudflare Workers',
    url: siteSettings.site_url || 'http://localhost:8787',
    home: siteSettings.site_url || 'http://localhost:8787',
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
          self: `${siteSettings.site_url || 'http://localhost:8787'}/wp-json/`
        }
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
      '/wp-json/wp/v2/pages': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/pages/(?P<id>[\\d]+)': {
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
      },
      '/wp-json/wp/v2/links': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/links/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/link-categories': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/link-categories/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/comments': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/comments/(?P<id>[\\d]+)': {
        methods: ['GET', 'PUT', 'DELETE']
      },
      '/wp-json/wp/v2/import': {
        methods: ['GET', 'POST']
      },
      '/wp-json/wp/v2/settings': {
        methods: ['GET', 'PUT']
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
      },
      '/wp/v2/import': {
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
app.route('/wp-json/wp/v2/link-categories', link分类);
app.route('/wp-json/wp/v2/comments', comments);
app.route('/wp-json/wp/v2/import', imports);
app.route('/wp-json/wp/v2/settings', settings);
app.route('/wp-json/wp/v2/moments', moments);

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

// Short admin alias.
app.get('/admin', (c) => c.redirect('/wp-admin', 302));

// Vue admin entry. The SPA uses hash routing, so the Worker only serves one shell.
app.get('/wp-admin', async (c) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = '/_cfblog/admin/index.html';
  assetUrl.search = '';
  return c.env.ASSETS.fetch(new Request(assetUrl, {
    method: 'GET',
    headers: c.req.raw.headers,
  }));
});
app.get('/wp-admin/', (c) => c.redirect('/wp-admin', 302));

// Preserve old bookmarks while serving the Vue admin only.
app.get('/wp-admin/legacy', (c) => c.redirect('/wp-admin', 302));

registerPublicSiteRoutes(app);

app.notFound(async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }
  return c.text('Not Found', 404);
});

export default app;
