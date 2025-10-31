import { Hono } from 'hono';
import { Env, JWTPayload } from '../types';
import { buildPaginationHeaders, createWPError, getSiteSettings } from '../utils';
import { authMiddleware, optionalAuthMiddleware } from '../auth';

const moments = new Hono<{ Bindings: Env }>();

// Helper function to format moment response
function formatMomentResponse(moment: any, author: any, baseUrl: string) {
  const mediaUrls = moment.media_urls ? JSON.parse(moment.media_urls) : [];

  return {
    id: moment.id,
    content: {
      rendered: moment.content,
      raw: moment.content
    },
    author: author.id,
    author_name: author.display_name || author.username,
    author_avatar: author.avatar_url || `https://www.gravatar.com/avatar/${moment.author_id}?d=mp`,
    status: moment.status,
    media_urls: mediaUrls,
    view_count: moment.view_count || 0,
    like_count: moment.like_count || 0,
    comment_count: moment.comment_count || 0,
    date: moment.created_at,
    date_gmt: moment.created_at,
    modified: moment.updated_at,
    modified_gmt: moment.updated_at,
    _links: {
      self: [{ href: `${baseUrl}/wp-json/wp/v2/moments/${moment.id}` }],
      author: [{ href: `${baseUrl}/wp-json/wp/v2/users/${author.id}` }]
    }
  };
}

// GET /wp/v2/moments - List moments
moments.get('/', optionalAuthMiddleware, async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = String(settings?.site_url || 'http://localhost:8787');

    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('per_page') || '10');
    const status = c.req.query('status') || 'publish';
    const author = c.req.query('author');
    const order = c.req.query('order') || 'desc';

    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM moments WHERE 1=1';
    const params: any[] = [];

    // Handle status filter - 'all' means no status filter
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (author) {
      query += ' AND author_id = ?';
      params.push(parseInt(author));
    }

    query += ` ORDER BY created_at ${order.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM moments WHERE 1=1';
    const countParams: any[] = [];
    if (status && status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (author) {
      countQuery += ' AND author_id = ?';
      countParams.push(parseInt(author));
    }
    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first();
    const total = (countResult as any)?.total || 0;

    // Format moments with author info
    const formattedMoments = await Promise.all(
      result.results.map(async (moment: any) => {
        const author = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
          .bind(moment.author_id)
          .first();
        return formatMomentResponse(moment, author, baseUrl);
      })
    );

    // Add pagination headers
    const totalPages = Math.ceil(total / perPage);
    const headers = buildPaginationHeaders(
      page,
      perPage,
      total,
      `${baseUrl}/wp-json/wp/v2/moments`
    );

    return c.json(formattedMoments, 200, headers);
  } catch (error) {
    console.error('Error fetching moments:', error);
    return createWPError('fetch_error', 'Failed to fetch moments', 500);
  }
});

// GET /wp/v2/moments/:id - Get single moment
moments.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = String(settings?.site_url || 'http://localhost:8787');
    const id = parseInt(c.req.param('id'));

    const moment = await c.env.DB.prepare('SELECT * FROM moments WHERE id = ?').bind(id).first();

    if (!moment) {
      return createWPError('moment_not_found', 'Moment not found', 404);
    }

    // Get author info
    const author = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind((moment as any).author_id)
      .first();

    // Increment view count
    await c.env.DB.prepare('UPDATE moments SET view_count = view_count + 1 WHERE id = ?')
      .bind(id)
      .run();

    return c.json(formatMomentResponse(moment, author, baseUrl));
  } catch (error) {
    console.error('Error fetching moment:', error);
    return createWPError('fetch_error', 'Failed to fetch moment', 500);
  }
});

// POST /wp/v2/moments - Create moment
moments.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const body = await c.req.json();

    const { content, status = 'publish', media_urls = [] } = body;

    if (!content || content.trim() === '') {
      return createWPError('missing_content', 'Content is required', 400);
    }

    // Validate status
    if (!['publish', 'draft', 'trash'].includes(status)) {
      return createWPError('invalid_status', 'Invalid status', 400);
    }

    // Insert moment
    const mediaUrlsJson = JSON.stringify(media_urls);
    const result = await c.env.DB.prepare(`
      INSERT INTO moments (content, author_id, status, media_urls)
      VALUES (?, ?, ?, ?)
    `).bind(content, user.userId, status, mediaUrlsJson).run();

    const momentId = result.meta.last_row_id;

    // Fetch the created moment
    const moment = await c.env.DB.prepare('SELECT * FROM moments WHERE id = ?')
      .bind(momentId)
      .first();

    const author = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(user.userId)
      .first();

    const settings = await getSiteSettings(c.env);
    const baseUrl = String(settings?.site_url || 'http://localhost:8787');

    return c.json(formatMomentResponse(moment, author, baseUrl), 201);
  } catch (error) {
    console.error('Error creating moment:', error);
    return createWPError('create_error', 'Failed to create moment', 500);
  }
});

// PUT /wp/v2/moments/:id - Update moment
moments.put('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();

    // Check if moment exists
    const existingMoment = await c.env.DB.prepare('SELECT * FROM moments WHERE id = ?')
      .bind(id)
      .first() as any;

    if (!existingMoment) {
      return createWPError('moment_not_found', 'Moment not found', 404);
    }

    // Check permissions (only author or admin can edit)
    if (existingMoment.author_id !== user.userId && user.role !== 'administrator') {
      return createWPError('forbidden', 'You do not have permission to edit this moment', 403);
    }

    const { content, status, media_urls } = body;

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (status !== undefined) {
      if (!['publish', 'draft', 'trash'].includes(status)) {
        return createWPError('invalid_status', 'Invalid status', 400);
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (media_urls !== undefined) {
      updates.push('media_urls = ?');
      params.push(JSON.stringify(media_urls));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) {
      return createWPError('no_changes', 'No changes to update', 400);
    }

    params.push(id);

    await c.env.DB.prepare(`
      UPDATE moments SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    // Fetch updated moment
    const moment = await c.env.DB.prepare('SELECT * FROM moments WHERE id = ?')
      .bind(id)
      .first();

    const author = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind((moment as any).author_id)
      .first();

    const settings = await getSiteSettings(c.env);
    const baseUrl = String(settings?.site_url || 'http://localhost:8787');

    return c.json(formatMomentResponse(moment, author, baseUrl));
  } catch (error) {
    console.error('Error updating moment:', error);
    return createWPError('update_error', 'Failed to update moment', 500);
  }
});

// DELETE /wp/v2/moments/:id - Delete moment
moments.delete('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const id = parseInt(c.req.param('id'));
    const force = c.req.query('force') === 'true';

    // Check if moment exists
    const existingMoment = await c.env.DB.prepare('SELECT * FROM moments WHERE id = ?')
      .bind(id)
      .first() as any;

    if (!existingMoment) {
      return createWPError('moment_not_found', 'Moment not found', 404);
    }

    // Check permissions
    if (existingMoment.author_id !== user.userId && user.role !== 'administrator') {
      return createWPError('forbidden', 'You do not have permission to delete this moment', 403);
    }

    if (force) {
      // Permanently delete
      await c.env.DB.prepare('DELETE FROM moments WHERE id = ?').bind(id).run();
      return c.json({ deleted: true, previous: existingMoment });
    } else {
      // Move to trash
      await c.env.DB.prepare('UPDATE moments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind('trash', id)
        .run();

      const moment = await c.env.DB.prepare('SELECT * FROM moments WHERE id = ?')
        .bind(id)
        .first();

      const author = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind((moment as any).author_id)
        .first();

      const settings = await getSiteSettings(c.env);
      const baseUrl = String(settings?.site_url || 'http://localhost:8787');

      return c.json(formatMomentResponse(moment, author, baseUrl));
    }
  } catch (error) {
    console.error('Error deleting moment:', error);
    return createWPError('delete_error', 'Failed to delete moment', 500);
  }
});

export default moments;
