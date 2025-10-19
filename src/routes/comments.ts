import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../auth';

const comments = new Hono<{ Bindings: Env }>();

// Get all comments
comments.get('/', async (c) => {
  try {
    const url = new URL(c.req.url);
    const perPage = parseInt(url.searchParams.get('per_page') || '20');
    const page = parseInt(url.searchParams.get('page') || '1');
    const postId = url.searchParams.get('post');
    const status = url.searchParams.get('status') || 'approved';
    const offset = (page - 1) * perPage;

    let query = `
      SELECT c.*, p.title as post_title
      FROM comments c
      LEFT JOIN posts p ON c.post_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (postId) {
      query += ` AND c.post_id = ?`;
      params.push(parseInt(postId));
    }

    if (status !== 'all') {
      query += ` AND c.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM comments WHERE 1=1`;
    const countParams: any[] = [];
    if (postId) {
      countQuery += ` AND post_id = ?`;
      countParams.push(parseInt(postId));
    }
    if (status !== 'all') {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    const { total } = await c.env.DB.prepare(countQuery).bind(...countParams).first() as any;

    const totalPages = Math.ceil(total / perPage);

    c.header('X-WP-Total', total.toString());
    c.header('X-WP-TotalPages', totalPages.toString());

    return c.json(results.map(comment => ({
      id: comment.id,
      post: comment.post_id,
      post_title: comment.post_title,
      parent: comment.parent_id || 0,
      author_name: comment.author_name,
      author_email: comment.author_email,
      author_url: comment.author_url || '',
      author_ip: comment.author_ip || '',
      date: comment.created_at,
      content: {
        rendered: comment.content
      },
      status: comment.status,
      user_id: comment.user_id || 0,
      _links: {
        self: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/comments/${comment.id}` }],
        collection: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/comments` }]
      }
    })));
  } catch (error: any) {
    console.error('[DEBUG] Failed to get comments:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Get single comment
comments.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const comment = await c.env.DB.prepare(`
      SELECT c.*, p.title as post_title
      FROM comments c
      LEFT JOIN posts p ON c.post_id = p.id
      WHERE c.id = ?
    `).bind(id).first();

    if (!comment) {
      return c.json({ code: 'rest_comment_invalid', message: 'Invalid comment ID.' }, 404);
    }

    return c.json({
      id: comment.id,
      post: comment.post_id,
      post_title: comment.post_title,
      parent: comment.parent_id || 0,
      author_name: comment.author_name,
      author_email: comment.author_email,
      author_url: comment.author_url || '',
      author_ip: comment.author_ip || '',
      date: comment.created_at,
      content: {
        rendered: comment.content
      },
      status: comment.status,
      user_id: comment.user_id || 0
    });
  } catch (error: any) {
    console.error('[DEBUG] Failed to get comment:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Create comment (public - no auth required for visitors)
comments.post('/', async (c) => {
  try {
    const { post_id, author_name, author_email, author_url, content, parent_id } = await c.req.json();

    if (!post_id || !author_name || !author_email || !content) {
      return c.json({
        code: 'rest_missing_callback_param',
        message: 'Missing required parameters: post_id, author_name, author_email, content'
      }, 400);
    }

    // Verify post exists
    const post = await c.env.DB.prepare(`
      SELECT id, comment_status FROM posts WHERE id = ?
    `).bind(post_id).first();

    if (!post) {
      return c.json({ code: 'rest_post_invalid', message: 'Invalid post ID.' }, 404);
    }

    if (post.comment_status === 'closed') {
      return c.json({ code: 'rest_comment_closed', message: 'Comments are closed for this post.' }, 403);
    }

    // Get IP from request
    const author_ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';

    const now = new Date().toISOString();

    const result = await c.env.DB.prepare(`
      INSERT INTO comments (post_id, parent_id, author_name, author_email, author_url, author_ip, content, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      post_id,
      parent_id || 0,
      author_name,
      author_email,
      author_url || '',
      author_ip,
      content,
      'pending', // Default to pending for moderation
      now
    ).run();

    // Update comment count
    await c.env.DB.prepare(`
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?
    `).bind(post_id).run();

    const newComment = await c.env.DB.prepare(`
      SELECT * FROM comments WHERE id = ?
    `).bind(result.meta.last_row_id).first();

    return c.json({
      id: newComment.id,
      post: newComment.post_id,
      parent: newComment.parent_id || 0,
      author_name: newComment.author_name,
      author_email: newComment.author_email,
      author_url: newComment.author_url || '',
      date: newComment.created_at,
      content: {
        rendered: newComment.content
      },
      status: newComment.status
    }, 201);
  } catch (error: any) {
    console.error('[DEBUG] Failed to create comment:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Update comment (requires authentication)
comments.put('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const { status, content, author_name, author_email, author_url } = await c.req.json();

    const existingComment = await c.env.DB.prepare(`
      SELECT * FROM comments WHERE id = ?
    `).bind(id).first();

    if (!existingComment) {
      return c.json({ code: 'rest_comment_invalid', message: 'Invalid comment ID.' }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (author_name !== undefined) {
      updates.push('author_name = ?');
      params.push(author_name);
    }

    if (author_email !== undefined) {
      updates.push('author_email = ?');
      params.push(author_email);
    }

    if (author_url !== undefined) {
      updates.push('author_url = ?');
      params.push(author_url);
    }

    if (updates.length === 0) {
      return c.json({
        id: existingComment.id,
        post: existingComment.post_id,
        author_name: existingComment.author_name,
        author_email: existingComment.author_email,
        content: { rendered: existingComment.content },
        status: existingComment.status
      });
    }

    const updateQuery = `UPDATE comments SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    await c.env.DB.prepare(updateQuery).bind(...params).run();

    const updatedComment = await c.env.DB.prepare(`
      SELECT * FROM comments WHERE id = ?
    `).bind(id).first();

    return c.json({
      id: updatedComment.id,
      post: updatedComment.post_id,
      parent: updatedComment.parent_id || 0,
      author_name: updatedComment.author_name,
      author_email: updatedComment.author_email,
      author_url: updatedComment.author_url || '',
      date: updatedComment.created_at,
      content: {
        rendered: updatedComment.content
      },
      status: updatedComment.status
    });
  } catch (error: any) {
    console.error('[DEBUG] Failed to update comment:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Delete comment (requires authentication)
comments.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  const force = c.req.query('force') === 'true';

  try {
    const comment = await c.env.DB.prepare(`
      SELECT * FROM comments WHERE id = ?
    `).bind(id).first();

    if (!comment) {
      return c.json({ code: 'rest_comment_invalid', message: 'Invalid comment ID.' }, 404);
    }

    if (force) {
      // Permanently delete
      await c.env.DB.prepare(`
        DELETE FROM comments WHERE id = ?
      `).bind(id).run();

      // Update comment count
      await c.env.DB.prepare(`
        UPDATE posts SET comment_count = comment_count - 1 WHERE id = ?
      `).bind(comment.post_id).run();

      return c.json({ deleted: true, previous: comment });
    } else {
      // Move to trash
      await c.env.DB.prepare(`
        UPDATE comments SET status = 'trash' WHERE id = ?
      `).bind(id).run();

      const trashedComment = await c.env.DB.prepare(`
        SELECT * FROM comments WHERE id = ?
      `).bind(id).first();

      return c.json({
        id: trashedComment.id,
        status: trashedComment.status
      });
    }
  } catch (error: any) {
    console.error('[DEBUG] Failed to delete comment:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

export default comments;
