import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../auth';
import { generateSlug } from '../utils';

const linkCategories = new Hono<{ Bindings: Env }>();

// Get all link categories
linkCategories.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM link_categories ORDER BY name ASC
    `).all();

    return c.json(results.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      count: cat.count || 0,
      _links: {
        self: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/link-categories/${cat.id}` }],
        collection: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/link-categories` }]
      }
    })));
  } catch (error: any) {
    console.error('[DEBUG] Failed to get link categories:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Get single link category
linkCategories.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const category = await c.env.DB.prepare(`
      SELECT * FROM link_categories WHERE id = ?
    `).bind(id).first();

    if (!category) {
      return c.json({ code: 'rest_category_invalid', message: 'Invalid category ID.' }, 404);
    }

    return c.json({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      count: category.count || 0,
      _links: {
        self: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/link-categories/${category.id}` }],
        collection: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/link-categories` }]
      }
    });
  } catch (error: any) {
    console.error('[DEBUG] Failed to get link category:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Create link category (requires admin/editor)
linkCategories.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!['administrator', 'editor'].includes(user.role)) {
    return c.json({ code: 'rest_forbidden', message: 'Sorry, you are not allowed to create link categories.' }, 403);
  }

  try {
    const { name, slug, description } = await c.req.json();

    if (!name) {
      return c.json({ code: 'rest_missing_callback_param', message: 'Missing parameter: name' }, 400);
    }

    const categorySlug = slug && slug.trim() ? slug.trim() : generateSlug(name);

    const result = await c.env.DB.prepare(`
      INSERT INTO link_categories (name, slug, description)
      VALUES (?, ?, ?)
    `).bind(name, categorySlug, description || '').run();

    const newCategory = await c.env.DB.prepare(`
      SELECT * FROM link_categories WHERE id = ?
    `).bind(result.meta.last_row_id).first();

    return c.json({
      id: newCategory.id,
      name: newCategory.name,
      slug: newCategory.slug,
      description: newCategory.description || '',
      count: 0,
      _links: {
        self: [{ href: `${c.env.SITE_URL}/wp-json/wp/v2/link-categories/${newCategory.id}` }]
      }
    }, 201);
  } catch (error: any) {
    console.error('[DEBUG] Failed to create link category:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Update link category
linkCategories.put('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!['administrator', 'editor'].includes(user.role)) {
    return c.json({ code: 'rest_forbidden', message: 'Sorry, you are not allowed to update link categories.' }, 403);
  }

  const id = parseInt(c.req.param('id'));

  try {
    const { name, slug, description } = await c.req.json();

    const existingCategory = await c.env.DB.prepare(`
      SELECT * FROM link_categories WHERE id = ?
    `).bind(id).first();

    if (!existingCategory) {
      return c.json({ code: 'rest_category_invalid', message: 'Invalid category ID.' }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (slug !== undefined) {
      const newSlug = slug && slug.trim() ? slug.trim() : generateSlug(name || existingCategory.name);
      updates.push('slug = ?');
      params.push(newSlug);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (updates.length === 0) {
      return c.json({
        id: existingCategory.id,
        name: existingCategory.name,
        slug: existingCategory.slug,
        description: existingCategory.description || '',
        count: existingCategory.count || 0
      });
    }

    const updateQuery = `UPDATE link_categories SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    await c.env.DB.prepare(updateQuery).bind(...params).run();

    const updatedCategory = await c.env.DB.prepare(`
      SELECT * FROM link_categories WHERE id = ?
    `).bind(id).first();

    return c.json({
      id: updatedCategory.id,
      name: updatedCategory.name,
      slug: updatedCategory.slug,
      description: updatedCategory.description || '',
      count: updatedCategory.count || 0
    });
  } catch (error: any) {
    console.error('[DEBUG] Failed to update link category:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

// Delete link category
linkCategories.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!['administrator', 'editor'].includes(user.role)) {
    return c.json({ code: 'rest_forbidden', message: 'Sorry, you are not allowed to delete link categories.' }, 403);
  }

  const id = parseInt(c.req.param('id'));

  if (id === 1) {
    return c.json({ code: 'rest_cannot_delete', message: 'Cannot delete the default category.' }, 403);
  }

  try {
    const category = await c.env.DB.prepare(`
      SELECT * FROM link_categories WHERE id = ?
    `).bind(id).first();

    if (!category) {
      return c.json({ code: 'rest_category_invalid', message: 'Invalid category ID.' }, 404);
    }

    // Move links to default category
    await c.env.DB.prepare(`
      UPDATE links SET category_id = 1 WHERE category_id = ?
    `).bind(id).run();

    await c.env.DB.prepare(`
      DELETE FROM link_categories WHERE id = ?
    `).bind(id).run();

    return c.json({ deleted: true, previous: category });
  } catch (error: any) {
    console.error('[DEBUG] Failed to delete link category:', error);
    return c.json({ code: 'rest_internal_error', message: error.message }, 500);
  }
});

export default linkCategories;
