import { Env, Post, PostResponse, Category, CategoryResponse, Tag, TagResponse, Media, MediaResponse, User, UserResponse, Comment, CommentResponse } from './types';

// Cache for settings to avoid repeated DB queries
let settingsCache: Record<string, any> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

// Get site settings from database
export async function getSiteSettings(env: Env): Promise<Record<string, any>> {
  // Return cached settings if available and not expired
  const now = Date.now();
  if (settingsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return settingsCache;
  }

  try {
    const result = await env.DB.prepare('SELECT setting_key, setting_value FROM site_settings').all();
    const settings: Record<string, any> = {
      site_title: 'CFBlog',
      site_description: '基于 Cloudflare Workers + D1 + R2 构建的现代化博客系统',
      site_url: 'http://localhost:8787',
      admin_email: 'admin@example.com'
    };

    for (const row of result.results as any[]) {
      settings[row.setting_key] = row.setting_value;
    }

    // Cache the settings
    settingsCache = settings;
    cacheTimestamp = now;

    return settings;
  } catch (error) {
    // Return defaults if DB query fails
    return {
      site_title: 'CFBlog',
      site_description: '基于 Cloudflare Workers + D1 + R2 构建的现代化博客系统',
      site_url: 'http://localhost:8787',
      admin_email: 'admin@example.com'
    };
  }
}

// Clear settings cache (call when settings are updated)
export function clearSettingsCache(): void {
  settingsCache = null;
  cacheTimestamp = 0;
}

// Normalize base URL by removing trailing slash
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

// MD5 hash function for Gravatar
export async function md5(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate WordPress-style _links for HATEOAS
export function generatePostLinks(post: Post, baseUrl: string): any {
  baseUrl = normalizeBaseUrl(baseUrl);
  return {
    self: [{ href: `${baseUrl}/wp-json/wp/v2/posts/${post.id}` }],
    collection: [{ href: `${baseUrl}/wp-json/wp/v2/posts` }],
    about: [{ href: `${baseUrl}/wp-json/wp/v2/types/${post.post_type}` }],
    author: [
      {
        embeddable: true,
        href: `${baseUrl}/wp-json/wp/v2/users/${post.author_id}`
      }
    ],
    replies: [
      {
        embeddable: true,
        href: `${baseUrl}/wp-json/wp/v2/comments?post=${post.id}`
      }
    ],
    'version-history': [
      {
        count: 1,
        href: `${baseUrl}/wp-json/wp/v2/posts/${post.id}/revisions`
      }
    ],
    'wp:attachment': [
      {
        href: `${baseUrl}/wp-json/wp/v2/media?parent=${post.id}`
      }
    ],
    'wp:term': [
      {
        taxonomy: 'category',
        embeddable: true,
        href: `${baseUrl}/wp-json/wp/v2/categories?post=${post.id}`
      },
      {
        taxonomy: 'post_tag',
        embeddable: true,
        href: `${baseUrl}/wp-json/wp/v2/tags?post=${post.id}`
      }
    ],
    curies: [
      {
        name: 'wp',
        href: 'https://api.w.org/{rel}',
        templated: true
      }
    ]
  };
}

// Convert database Post to WordPress REST API response format
export function formatPostResponse(post: Post, baseUrl: string, categories: number[] = [], tags: number[] = []): PostResponse {
  baseUrl = normalizeBaseUrl(baseUrl);
  return {
    id: post.id,
    date: post.published_at || post.created_at,
    date_gmt: post.published_at || post.created_at,
    modified: post.updated_at,
    modified_gmt: post.updated_at,
    slug: post.slug,
    status: post.status,
    type: post.post_type,
    link: `${baseUrl}/${post.slug}`,
    title: {
      rendered: post.title
    },
    content: {
      rendered: post.content || '',
      protected: post.status === 'private'
    },
    excerpt: {
      rendered: post.excerpt || '',
      protected: false
    },
    author: post.author_id,
    featured_media: post.featured_media_id || 0,
    featured_image_url: post.featured_image_url || undefined,
    comment_status: post.comment_status,
    ping_status: 'closed',
    sticky: false,
    template: '',
    format: 'standard',
    meta: [],
    categories: categories,
    tags: tags,
    comment_count: post.comment_count || 0,
    view_count: post.view_count || 0,
    _links: generatePostLinks(post, baseUrl)
  };
}

// Convert database Category to WordPress REST API response format
export function formatCategoryResponse(category: Category, baseUrl: string): CategoryResponse {
  baseUrl = normalizeBaseUrl(baseUrl);
  return {
    id: category.id,
    count: category.count,
    description: category.description || '',
    link: `${baseUrl}/category/${category.slug}`,
    name: category.name,
    slug: category.slug,
    taxonomy: 'category',
    parent: category.parent_id,
    meta: [],
    _links: {
      self: [{ href: `${baseUrl}/wp-json/wp/v2/categories/${category.id}` }],
      collection: [{ href: `${baseUrl}/wp-json/wp/v2/categories` }],
      about: [{ href: `${baseUrl}/wp-json/wp/v2/taxonomies/category` }],
      'wp:post_type': [
        {
          href: `${baseUrl}/wp-json/wp/v2/posts?categories=${category.id}`
        }
      ],
      curies: [
        {
          name: 'wp',
          href: 'https://api.w.org/{rel}',
          templated: true
        }
      ]
    }
  };
}

// Convert database Tag to WordPress REST API response format
export function formatTagResponse(tag: Tag, baseUrl: string): TagResponse {
  baseUrl = normalizeBaseUrl(baseUrl);
  return {
    id: tag.id,
    count: tag.count,
    description: tag.description || '',
    link: `${baseUrl}/tag/${tag.slug}`,
    name: tag.name,
    slug: tag.slug,
    taxonomy: 'post_tag',
    meta: [],
    _links: {
      self: [{ href: `${baseUrl}/wp-json/wp/v2/tags/${tag.id}` }],
      collection: [{ href: `${baseUrl}/wp-json/wp/v2/tags` }],
      about: [{ href: `${baseUrl}/wp-json/wp/v2/taxonomies/post_tag` }],
      'wp:post_type': [
        {
          href: `${baseUrl}/wp-json/wp/v2/posts?tags=${tag.id}`
        }
      ],
      curies: [
        {
          name: 'wp',
          href: 'https://api.w.org/{rel}',
          templated: true
        }
      ]
    }
  };
}

// Convert database Media to WordPress REST API response format
export function formatMediaResponse(media: Media, baseUrl: string): MediaResponse {
  baseUrl = normalizeBaseUrl(baseUrl);
  return {
    id: media.id,
    date: media.created_at,
    date_gmt: media.created_at,
    modified: media.created_at,
    modified_gmt: media.created_at,
    slug: media.filename,
    status: 'inherit',
    type: 'attachment',
    link: media.url,
    title: {
      rendered: media.title
    },
    author: media.author_id,
    comment_status: 'closed',
    ping_status: 'closed',
    template: '',
    meta: [],
    description: {
      rendered: media.description || ''
    },
    caption: {
      rendered: media.caption || ''
    },
    alt_text: media.alt_text || '',
    media_type: media.file_type,
    mime_type: media.mime_type,
    media_details: {
      width: media.width || 0,
      height: media.height || 0,
      file: media.filename,
      filesize: media.file_size
    },
    source_url: media.url,
    _links: {
      self: [{ href: `${baseUrl}/wp-json/wp/v2/media/${media.id}` }],
      collection: [{ href: `${baseUrl}/wp-json/wp/v2/media` }],
      about: [{ href: `${baseUrl}/wp-json/wp/v2/types/attachment` }],
      author: [
        {
          embeddable: true,
          href: `${baseUrl}/wp-json/wp/v2/users/${media.author_id}`
        }
      ],
      replies: [
        {
          embeddable: true,
          href: `${baseUrl}/wp-json/wp/v2/comments?post=${media.id}`
        }
      ]
    }
  };
}

// Convert database User to WordPress REST API response format
export async function formatUserResponse(user: User, baseUrl: string, isAdmin: boolean = false): Promise<UserResponse> {
  baseUrl = normalizeBaseUrl(baseUrl);

  // Generate Gravatar hash from email
  const emailHash = await md5(user.email || '');

  const response: any = {
    id: user.id,
    name: user.display_name || user.username,
    url: '',
    description: user.bio || '',
    link: `${baseUrl}/author/${user.username}`,
    slug: user.username,
    avatar_urls: {
      24: user.avatar_url || `https://www.gravatar.com/avatar/${emailHash}?s=24&d=mm&r=g`,
      48: user.avatar_url || `https://www.gravatar.com/avatar/${emailHash}?s=48&d=mm&r=g`,
      96: user.avatar_url || `https://www.gravatar.com/avatar/${emailHash}?s=96&d=mm&r=g`
    },
    roles: [user.role],
    role: user.role, // For backward compatibility
    registered_date: user.registered_at,
    meta: [],
    _links: {
      self: [{ href: `${baseUrl}/wp-json/wp/v2/users/${user.id}` }],
      collection: [{ href: `${baseUrl}/wp-json/wp/v2/users` }]
    }
  };

  // Only include email for admin users
  if (isAdmin) {
    response.email = user.email;
  }

  return response;
}

// Generate comment _links for HATEOAS
export function generateCommentLinks(comment: Comment, baseUrl: string): any {
  baseUrl = normalizeBaseUrl(baseUrl);
  return {
    self: [{ href: `${baseUrl}/wp-json/wp/v2/comments/${comment.id}` }],
    collection: [{ href: `${baseUrl}/wp-json/wp/v2/comments` }],
    up: [
      {
        embeddable: true,
        post_type: 'post',
        href: `${baseUrl}/wp-json/wp/v2/posts/${comment.post_id}`
      }
    ]
  };
}

// Convert database Comment to WordPress REST API response format
export async function formatCommentResponse(
  comment: Comment,
  baseUrl: string,
  postSlug?: string,
  isAdmin: boolean = false
): Promise<CommentResponse> {
  baseUrl = normalizeBaseUrl(baseUrl);

  // Generate Gravatar hash from email
  const emailHash = await md5(comment.author_email || '');

  const response: CommentResponse = {
    id: comment.id,
    post: comment.post_id,
    parent: comment.parent_id || 0,
    author: comment.user_id || 0,
    author_name: comment.author_name,
    author_url: comment.author_url || '',
    date: comment.created_at,
    date_gmt: comment.created_at,
    content: {
      rendered: comment.content
    },
    link: postSlug
      ? `${baseUrl}/${postSlug}#comment-${comment.id}`
      : `${baseUrl}/posts/${comment.post_id}#comment-${comment.id}`,
    status: comment.status,
    type: 'comment',
    author_avatar_urls: {
      24: `https://www.gravatar.com/avatar/${emailHash}?s=24&d=mm&r=g`,
      48: `https://www.gravatar.com/avatar/${emailHash}?s=48&d=mm&r=g`,
      96: `https://www.gravatar.com/avatar/${emailHash}?s=96&d=mm&r=g`
    },
    meta: [],
    _links: generateCommentLinks(comment, baseUrl)
  };

  // Only include sensitive fields for admin users
  if (isAdmin) {
    response.author_email = comment.author_email;
    response.author_ip = comment.author_ip || '';
  }

  return response;
}

// Generate slug from title
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Pagination helper
export function buildPaginationHeaders(page: number, perPage: number, totalItems: number, baseUrl: string): Record<string, string> {
  baseUrl = normalizeBaseUrl(baseUrl);
  const totalPages = Math.ceil(totalItems / perPage);

  const headers: Record<string, string> = {
    'X-WP-Total': totalItems.toString(),
    'X-WP-TotalPages': totalPages.toString()
  };

  const links: string[] = [];

  if (page > 1) {
    links.push(`<${baseUrl}?page=${page - 1}&per_page=${perPage}>; rel="prev"`);
  }
  if (page < totalPages) {
    links.push(`<${baseUrl}?page=${page + 1}&per_page=${perPage}>; rel="next"`);
  }

  if (links.length > 0) {
    headers['Link'] = links.join(', ');
  }

  return headers;
}

// Create WordPress-style error response
export function createWPError(code: string, message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({
      code,
      message,
      data: { status }
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

// Webhook notification types
export type WebhookEvent =
  | 'post.created'
  | 'post.updated'
  | 'post.deleted'
  | 'post.published'
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'tag.created'
  | 'tag.updated'
  | 'tag.deleted'
  | 'media.uploaded'
  | 'media.deleted'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'settings.updated';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
  site_url: string;
}

// Send webhook notification
export async function sendWebhook(env: Env, event: WebhookEvent, data: any): Promise<void> {
  try {
    const settings = await getSiteSettings(env);
    const webhookUrl = settings.webhook_url;
    const webhookSecret = settings.webhook_secret;
    const webhookEvents = settings.webhook_events || '';

    // Log webhook configuration for debugging
    console.log(`[Webhook] Event: ${event}`);
    console.log(`[Webhook] URL configured: ${webhookUrl ? 'Yes' : 'No'}`);

    // Skip if no webhook URL configured
    if (!webhookUrl || webhookUrl.trim() === '') {
      console.log('[Webhook] Skipped: No webhook URL configured');
      return;
    }

    // Check if this event should trigger webhook
    const enabledEvents = webhookEvents.split(',').map(e => e.trim());
    if (enabledEvents.length > 0 && !enabledEvents.includes(event)) {
      console.log(`[Webhook] Skipped: Event '${event}' not in enabled events`);
      return;
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
      site_url: settings.site_url || 'http://localhost:8787'
    };

    // Create HMAC signature if secret is provided
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CFBlog-Webhook/1.0'
    };

    if (webhookSecret && webhookSecret.trim() !== '') {
      // Create signature using Web Crypto API
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhookSecret);
      const messageData = encoder.encode(JSON.stringify(payload));

      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        messageData
      );

      const hashArray = Array.from(new Uint8Array(signature));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      headers['X-Webhook-Signature'] = `sha256=${hashHex}`;
      console.log('[Webhook] Signature added');
    }

    console.log(`[Webhook] Sending to: ${webhookUrl}`);

    // Send webhook - await it to ensure it's sent
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[Webhook] Successfully sent (${response.status})`);
      } else {
        console.error(`[Webhook] Failed with status ${response.status}: ${await response.text()}`);
      }
    } catch (fetchError: any) {
      console.error('[Webhook] Delivery failed:', fetchError.message);
      // Silently fail - don't block the main operation
    }

  } catch (error: any) {
    console.error('[Webhook] Error:', error.message);
    // Silently fail - don't block the main operation
  }
}

// AI-powered slug generation
export async function generateSlugWithAI(env: Env, title: string): Promise<string> {
  try {
    // Use AI to generate a clean, SEO-friendly slug
    const prompt = `Generate a clean, SEO-friendly URL slug for this article title. The slug should:
- Be in lowercase
- Use hyphens to separate words
- Be concise (3-6 words maximum)
- Contain only alphanumeric characters and hyphens
- Not contain any special characters or spaces

Title: "${title}"

Respond with ONLY the slug, nothing else. Example format: "understanding-machine-learning"

Slug:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 50
    }) as { response: string };

    let aiSlug = response.response.trim().toLowerCase();

    // Clean up the AI response
    aiSlug = aiSlug
      .replace(/^slug:\s*/i, '') // Remove "slug:" prefix if present
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

    // Fallback to traditional slug generation if AI fails
    if (!aiSlug || aiSlug.length < 2) {
      return generateSlug(title);
    }

    return aiSlug;
  } catch (error) {
    console.error('AI slug generation failed, using fallback:', error);
    return generateSlug(title);
  }
}

// AI-powered excerpt generation
export async function generateExcerptWithAI(env: Env, title: string, content: string): Promise<string> {
  try {
    // Strip HTML tags from content
    const cleanContent = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit content length for AI processing
    const contentPreview = cleanContent.substring(0, 2000);

    const prompt = `Generate a concise and engaging excerpt (summary) for this blog article. The excerpt should:
- Be 1-2 sentences (around 150-200 characters)
- Capture the main idea of the article
- Be engaging and make readers want to read more
- Be in the same language as the article

Title: "${title}"

Content preview: "${contentPreview}"

Generate ONLY the excerpt text, nothing else:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 100
    }) as { response: string };

    let aiExcerpt = response.response.trim();

    // Remove common prefixes that AI might add
    aiExcerpt = aiExcerpt
      .replace(/^(excerpt:|summary:|description:)\s*/i, '')
      .replace(/^["']|["']$/g, ''); // Remove surrounding quotes

    // Fallback to simple excerpt if AI fails
    if (!aiExcerpt || aiExcerpt.length < 10) {
      return cleanContent.substring(0, 200) + (cleanContent.length > 200 ? '...' : '');
    }

    // Ensure excerpt is not too long
    if (aiExcerpt.length > 300) {
      aiExcerpt = aiExcerpt.substring(0, 297) + '...';
    }

    return aiExcerpt;
  } catch (error) {
    console.error('AI excerpt generation failed, using fallback:', error);
    // Fallback: return first 200 characters of content
    const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return cleanContent.substring(0, 200) + (cleanContent.length > 200 ? '...' : '');
  }
}

