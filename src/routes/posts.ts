import { Hono } from 'hono';
import { Env, Post, JWTPayload } from '../types';
import { formatPostResponse, generateSlug, buildPaginationHeaders, createWPError } from '../utils';
import { authMiddleware, optionalAuthMiddleware, canEditPost, canDeletePost, canPublishPost } from '../auth';

const posts = new Hono<{ Bindings: Env }>();

// GET /wp/v2/posts - List posts
posts.get('/', optionalAuthMiddleware, async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('per_page') || '10');
    const status = c.req.query('status') || 'publish';
    const author = c.req.query('author');
    const categories = c.req.query('categories');
    const tags = c.req.query('tags');
    const search = c.req.query('search');
    const orderby = c.req.query('orderby') || 'date';
    const order = c.req.query('order') || 'desc';

    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM posts WHERE post_type = ? AND status = ?';
    const params: any[] = ['post', status];

    if (author) {
      query += ' AND author_id = ?';
      params.push(parseInt(author));
    }

    if (search) {
      query += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Order
    const orderMap: Record<string, string> = {
      date: 'published_at',
      modified: 'updated_at',
      title: 'title',
      id: 'id'
    };
    const orderColumn = orderMap[orderby] || 'published_at';
    query += ` ORDER BY ${orderColumn} ${order.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM posts WHERE post_type = ? AND status = ?';
    const countParams: any[] = ['post', status];
    if (author) {
      countQuery += ' AND author_id = ?';
      countParams.push(parseInt(author));
    }
    if (search) {
      countQuery += ' AND (title LIKE ? OR content LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first();
    const totalItems = (countResult?.count as number) || 0;

    // Get categories and tags for each post
    const formattedPosts = await Promise.all(
      (result.results as Post[]).map(async (post) => {
        // Get categories
        const categoryResult = await c.env.DB.prepare(
          'SELECT category_id FROM post_categories WHERE post_id = ?'
        )
          .bind(post.id)
          .all();
        const categoryIds = categoryResult.results.map((r: any) => r.category_id);

        // Get tags
        const tagResult = await c.env.DB.prepare(
          'SELECT tag_id FROM post_tags WHERE post_id = ?'
        )
          .bind(post.id)
          .all();
        const tagIds = tagResult.results.map((r: any) => r.tag_id);

        return formatPostResponse(post, c.env, categoryIds, tagIds);
      })
    );

    // Add pagination headers
    const headers = buildPaginationHeaders(
      page,
      perPage,
      totalItems,
      `${c.env.SITE_URL}/wp-json/wp/v2/posts`
    );

    return c.json(formattedPosts, 200, headers);
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// GET /wp/v2/posts/:id - Get single post
posts.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ? AND post_type = ?')
      .bind(id, 'post')
      .first<Post>();

    if (!post) {
      return createWPError('rest_post_invalid_id', 'Invalid post ID.', 404);
    }

    // Get categories
    const categoryResult = await c.env.DB.prepare(
      'SELECT category_id FROM post_categories WHERE post_id = ?'
    )
      .bind(id)
      .all();
    const categoryIds = categoryResult.results.map((r: any) => r.category_id);

    // Get tags
    const tagResult = await c.env.DB.prepare('SELECT tag_id FROM post_tags WHERE post_id = ?')
      .bind(id)
      .all();
    const tagIds = tagResult.results.map((r: any) => r.tag_id);

    // Increment view count
    await c.env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?')
      .bind(id)
      .run();

    return c.json(formatPostResponse(post, c.env, categoryIds, tagIds));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// POST /wp/v2/posts - Create post
posts.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const body = await c.req.json();

    const { title, content, excerpt, slug, status, categories, tags, featured_image } = body;

    if (!title) {
      return createWPError('rest_invalid_param', 'Title is required.', 400);
    }

    // Check if user can publish
    const postStatus = status || 'draft';
    if (postStatus === 'publish' && !canPublishPost(user)) {
      return createWPError(
        'rest_cannot_publish',
        'Sorry, you are not allowed to publish posts.',
        403
      );
    }

    // Generate slug - only if slug is empty or not provided
    let postSlug = (slug && slug.trim()) ? slug.trim() : generateSlug(title);

    // Ensure slug is unique
    let slugExists = await c.env.DB.prepare('SELECT id FROM posts WHERE slug = ?')
      .bind(postSlug)
      .first();
    let counter = 1;
    while (slugExists) {
      postSlug = `${slug || generateSlug(title)}-${counter}`;
      slugExists = await c.env.DB.prepare('SELECT id FROM posts WHERE slug = ?')
        .bind(postSlug)
        .first();
      counter++;
    }

    const now = new Date().toISOString();
    const publishedAt = postStatus === 'publish' ? now : null;

    // Insert post
    const result = await c.env.DB.prepare(
      `INSERT INTO posts (title, content, excerpt, slug, status, post_type, author_id, featured_image, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        title,
        content || '',
        excerpt || '',
        postSlug,
        postStatus,
        'post',
        user.userId,
        featured_image || null,
        publishedAt,
        now,
        now
      )
      .run();

    const postId = result.meta.last_row_id;

    // Add categories
    if (categories && Array.isArray(categories)) {
      for (const categoryId of categories) {
        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)'
        )
          .bind(postId, categoryId)
          .run();

        // Update category count
        await c.env.DB.prepare('UPDATE categories SET count = count + 1 WHERE id = ?')
          .bind(categoryId)
          .run();
      }
    }

    // Add tags
    if (tags && Array.isArray(tags)) {
      for (const tagId of tags) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)')
          .bind(postId, tagId)
          .run();

        // Update tag count
        await c.env.DB.prepare('UPDATE tags SET count = count + 1 WHERE id = ?')
          .bind(tagId)
          .run();
      }
    }

    // Get the created post
    const createdPost = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?')
      .bind(postId)
      .first<Post>();

    return c.json(
      formatPostResponse(createdPost!, c.env, categories || [], tags || []),
      201
    );
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// PUT /wp/v2/posts/:id - Update post
posts.put('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const id = parseInt(c.req.param('id'));

    // Check if post exists
    const existingPost = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ? AND post_type = ?')
      .bind(id, 'post')
      .first<Post>();

    if (!existingPost) {
      return createWPError('rest_post_invalid_id', 'Invalid post ID.', 404);
    }

    // Check permissions
    if (!(await canEditPost(c, id))) {
      return createWPError(
        'rest_cannot_edit',
        'Sorry, you are not allowed to edit this post.',
        403
      );
    }

    const body = await c.req.json();
    const { title, content, excerpt, slug, status, categories, tags, featured_image } = body;

    // Check publish permission
    if (status === 'publish' && existingPost.status !== 'publish' && !canPublishPost(user)) {
      return createWPError(
        'rest_cannot_publish',
        'Sorry, you are not allowed to publish posts.',
        403
      );
    }

    const now = new Date().toISOString();
    const publishedAt =
      status === 'publish' && !existingPost.published_at ? now : existingPost.published_at;

    // Build update query dynamically to avoid undefined values
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (excerpt !== undefined) {
      updates.push('excerpt = ?');
      params.push(excerpt);
    }

    if (slug !== undefined) {
      // If slug is provided and not empty, use it; otherwise generate from title
      const newSlug = (slug && slug.trim()) ? slug.trim() : (title ? generateSlug(title) : existingPost.slug);
      updates.push('slug = ?');
      params.push(newSlug);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      updates.push('published_at = ?');
      params.push(publishedAt);
    }

    if (featured_image !== undefined) {
      updates.push('featured_image = ?');
      params.push(featured_image);
    }

    const updateQuery = `UPDATE posts SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    await c.env.DB.prepare(updateQuery).bind(...params).run();

    // Update categories if provided
    if (categories && Array.isArray(categories)) {
      // Remove old categories
      const oldCategories = await c.env.DB.prepare(
        'SELECT category_id FROM post_categories WHERE post_id = ?'
      )
        .bind(id)
        .all();

      for (const oldCat of oldCategories.results) {
        await c.env.DB.prepare('UPDATE categories SET count = count - 1 WHERE id = ?')
          .bind((oldCat as any).category_id)
          .run();
      }

      await c.env.DB.prepare('DELETE FROM post_categories WHERE post_id = ?').bind(id).run();

      // Add new categories
      for (const categoryId of categories) {
        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)'
        )
          .bind(id, categoryId)
          .run();

        await c.env.DB.prepare('UPDATE categories SET count = count + 1 WHERE id = ?')
          .bind(categoryId)
          .run();
      }
    }

    // Update tags if provided
    if (tags && Array.isArray(tags)) {
      // Remove old tags
      const oldTags = await c.env.DB.prepare('SELECT tag_id FROM post_tags WHERE post_id = ?')
        .bind(id)
        .all();

      for (const oldTag of oldTags.results) {
        await c.env.DB.prepare('UPDATE tags SET count = count - 1 WHERE id = ?')
          .bind((oldTag as any).tag_id)
          .run();
      }

      await c.env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();

      // Add new tags
      for (const tagId of tags) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)')
          .bind(id, tagId)
          .run();

        await c.env.DB.prepare('UPDATE tags SET count = count + 1 WHERE id = ?')
          .bind(tagId)
          .run();
      }
    }

    // Get updated post
    const updatedPost = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?')
      .bind(id)
      .first<Post>();

    // Get categories and tags
    const categoryResult = await c.env.DB.prepare(
      'SELECT category_id FROM post_categories WHERE post_id = ?'
    )
      .bind(id)
      .all();
    const categoryIds = categoryResult.results.map((r: any) => r.category_id);

    const tagResult = await c.env.DB.prepare('SELECT tag_id FROM post_tags WHERE post_id = ?')
      .bind(id)
      .all();
    const tagIds = tagResult.results.map((r: any) => r.tag_id);

    return c.json(formatPostResponse(updatedPost!, c.env, categoryIds, tagIds));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// DELETE /wp/v2/posts/:id - Delete post
posts.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const force = c.req.query('force') === 'true';

    // Check if post exists
    const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ? AND post_type = ?')
      .bind(id, 'post')
      .first<Post>();

    if (!post) {
      return createWPError('rest_post_invalid_id', 'Invalid post ID.', 404);
    }

    // Check permissions
    if (!(await canDeletePost(c, id))) {
      return createWPError(
        'rest_cannot_delete',
        'Sorry, you are not allowed to delete this post.',
        403
      );
    }

    if (force) {
      // Permanently delete
      await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
      await c.env.DB.prepare('DELETE FROM post_categories WHERE post_id = ?').bind(id).run();
      await c.env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
      await c.env.DB.prepare('DELETE FROM post_meta WHERE post_id = ?').bind(id).run();

      return c.json({ deleted: true, previous: formatPostResponse(post, c.env) });
    } else {
      // Move to trash
      await c.env.DB.prepare('UPDATE posts SET status = ? WHERE id = ?').bind('trash', id).run();

      const trashedPost = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?')
        .bind(id)
        .first<Post>();

      return c.json(formatPostResponse(trashedPost!, c.env));
    }
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

export default posts;
