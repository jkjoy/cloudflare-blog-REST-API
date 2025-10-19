import { Env, Post, PostResponse, Category, CategoryResponse, Tag, TagResponse, Media, MediaResponse, User, UserResponse } from './types';

// Generate WordPress-style _links for HATEOAS
export function generatePostLinks(post: Post, env: Env): any {
  const baseUrl = env.SITE_URL || '';
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
export function formatPostResponse(post: Post, env: Env, categories: number[] = [], tags: number[] = []): PostResponse {
  return {
    id: post.id,
    date: post.published_at || post.created_at,
    date_gmt: post.published_at || post.created_at,
    modified: post.updated_at,
    modified_gmt: post.updated_at,
    slug: post.slug,
    status: post.status,
    type: post.post_type,
    link: `${env.SITE_URL}/${post.slug}`,
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
    featured_media: 0,
    comment_status: post.comment_status,
    ping_status: 'closed',
    sticky: false,
    template: '',
    format: 'standard',
    meta: [],
    categories: categories,
    tags: tags,
    _links: generatePostLinks(post, env)
  };
}

// Convert database Category to WordPress REST API response format
export function formatCategoryResponse(category: Category, env: Env): CategoryResponse {
  const baseUrl = env.SITE_URL || '';
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
export function formatTagResponse(tag: Tag, env: Env): TagResponse {
  const baseUrl = env.SITE_URL || '';
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
export function formatMediaResponse(media: Media, env: Env): MediaResponse {
  const baseUrl = env.SITE_URL || '';
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
export function formatUserResponse(user: User, env: Env): UserResponse {
  const baseUrl = env.SITE_URL || '';
  return {
    id: user.id,
    name: user.display_name || user.username,
    url: '',
    description: user.bio || '',
    link: `${baseUrl}/author/${user.username}`,
    slug: user.username,
    avatar_urls: {
      24: user.avatar_url || `https://www.gravatar.com/avatar/?s=24&d=mm&r=g`,
      48: user.avatar_url || `https://www.gravatar.com/avatar/?s=48&d=mm&r=g`,
      96: user.avatar_url || `https://www.gravatar.com/avatar/?s=96&d=mm&r=g`
    },
    roles: [user.role],
    role: user.role, // For backward compatibility
    email: user.email,
    registered_date: user.registered_at,
    meta: [],
    _links: {
      self: [{ href: `${baseUrl}/wp-json/wp/v2/users/${user.id}` }],
      collection: [{ href: `${baseUrl}/wp-json/wp/v2/users` }]
    }
  };
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
