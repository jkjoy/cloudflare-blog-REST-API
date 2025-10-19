import { Hono } from 'hono';
import { Env, Tag, JWTPayload } from '../types';
import { formatTagResponse, generateSlug, buildPaginationHeaders, createWPError } from '../utils';
import { authMiddleware, optionalAuthMiddleware, requireRole } from '../auth';

const tags = new Hono<{ Bindings: Env }>();

// GET /wp/v2/tags - List tags
tags.get('/', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('per_page') || '10');
    const search = c.req.query('search');
    const post = c.req.query('post');
    const orderby = c.req.query('orderby') || 'name';
    const order = c.req.query('order') || 'asc';

    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM tags WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    if (post) {
      query = `SELECT t.* FROM tags t
               INNER JOIN post_tags pt ON t.id = pt.tag_id
               WHERE pt.post_id = ?`;
      params.push(parseInt(post));
    }

    // Order
    const orderMap: Record<string, string> = {
      name: 'name',
      count: 'count',
      id: 'id'
    };
    const orderColumn = orderMap[orderby] || 'name';
    query += ` ORDER BY ${orderColumn} ${order.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM tags';
    const countParams: any[] = [];
    if (search) {
      countQuery += ' WHERE name LIKE ?';
      countParams.push(`%${search}%`);
    }

    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first();
    const totalItems = (countResult?.count as number) || 0;

    const formattedTags = (result.results as Tag[]).map((tag) =>
      formatTagResponse(tag, c.env)
    );

    // Add pagination headers
    const headers = buildPaginationHeaders(
      page,
      perPage,
      totalItems,
      `${c.env.SITE_URL}/wp-json/wp/v2/tags`
    );

    return c.json(formattedTags, 200, headers);
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// GET /wp/v2/tags/:id - Get single tag
tags.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    const tag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    if (!tag) {
      return createWPError('rest_term_invalid', 'Term does not exist.', 404);
    }

    return c.json(formatTagResponse(tag, c.env));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// POST /wp/v2/tags - Create tag
tags.post('/', authMiddleware, requireRole('administrator', 'editor', 'author'), async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, slug } = body;

    if (!name) {
      return createWPError('rest_invalid_param', 'Name is required.', 400);
    }

    // Generate slug
    let tagSlug = slug || generateSlug(name);

    // Ensure slug is unique
    let slugExists = await c.env.DB.prepare('SELECT id FROM tags WHERE slug = ?')
      .bind(tagSlug)
      .first();
    let counter = 1;
    while (slugExists) {
      tagSlug = `${slug || generateSlug(name)}-${counter}`;
      slugExists = await c.env.DB.prepare('SELECT id FROM tags WHERE slug = ?')
        .bind(tagSlug)
        .first();
      counter++;
    }

    const now = new Date().toISOString();

    // Insert tag
    const result = await c.env.DB.prepare(
      'INSERT INTO tags (name, slug, description, created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(name, tagSlug, description || '', now)
      .run();

    const tagId = result.meta.last_row_id;

    // Get created tag
    const createdTag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
      .bind(tagId)
      .first<Tag>();

    return c.json(formatTagResponse(createdTag!, c.env), 201);
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// PUT /wp/v2/tags/:id - Update tag
tags.put('/:id', authMiddleware, requireRole('administrator', 'editor'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    // Check if tag exists
    const existingTag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    if (!existingTag) {
      return createWPError('rest_term_invalid', 'Term does not exist.', 404);
    }

    const body = await c.req.json();
    const { name, description, slug } = body;

    // Build update query dynamically to avoid undefined values
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (slug !== undefined) {
      updates.push('slug = ?');
      params.push(slug);
    }

    // If no fields to update, return current tag
    if (updates.length === 0) {
      return c.json(formatTagResponse(existingTag, c.env));
    }

    const updateQuery = `UPDATE tags SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    await c.env.DB.prepare(updateQuery).bind(...params).run();

    // Get updated tag
    const updatedTag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    return c.json(formatTagResponse(updatedTag!, c.env));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// DELETE /wp/v2/tags/:id - Delete tag
tags.delete('/:id', authMiddleware, requireRole('administrator', 'editor'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const force = c.req.query('force') === 'true';

    // Check if tag exists
    const tag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    if (!tag) {
      return createWPError('rest_term_invalid', 'Term does not exist.', 404);
    }

    if (force) {
      // Delete tag
      await c.env.DB.prepare('DELETE FROM post_tags WHERE tag_id = ?').bind(id).run();
      await c.env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();

      return c.json({ deleted: true, previous: formatTagResponse(tag, c.env) });
    } else {
      return createWPError(
        'rest_trash_not_supported',
        'Terms do not support trashing. Set force=true to delete.',
        501
      );
    }
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

export default tags;
