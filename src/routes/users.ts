import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { AppEnv, JWTPayload, User } from '../types';
import {
  formatUserResponse,
  buildPaginationHeaders,
  createWPError,
  getSiteSettings,
  parsePageParam,
  parsePerPageParam,
  parseSqlOrder
} from '../utils';
import { authMiddleware, optionalAuthMiddleware, requireRole, generateToken, hashPassword, comparePassword, isUnsafeJwtSecret, validatePassword } from '../auth';

const users = new Hono<AppEnv>();
const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const DUMMY_PASSWORD_HASH = '$2a$10$Entv3A1i49.2oDBTCDHgKOfDKiuTSxymSzdea7bUkK8KQWB6G76wK';

type LoginLimit = {
  key: string;
  limit: number;
  windowSeconds: number;
};

function setAuthCookie(c: any, token: string): void {
  setCookie(c, AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: '/',
    priority: 'High',
    sameSite: 'Strict',
    secure: new URL(c.req.url).protocol === 'https:'
  });
}

function clearAuthCookie(c: any): void {
  deleteCookie(c, AUTH_COOKIE_NAME, {
    path: '/',
    secure: new URL(c.req.url).protocol === 'https:'
  });
}

function getClientIp(c: any): string {
  return String(
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    ''
  )
    .split(',')[0]
    .trim();
}

async function hashRateLimitValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getLoginLimits(c: any, user: User | null, username: string): Promise<LoginLimit[]> {
  const ip = getClientIp(c) || 'unknown';
  const account = user ? `user:${user.id}` : `login:${username.trim().toLowerCase()}`;
  const [ipHash, accountHash] = await Promise.all([
    hashRateLimitValue(ip),
    hashRateLimitValue(account)
  ]);

  return [
    { key: `pair:${ipHash}:${accountHash}`, limit: 10, windowSeconds: 300 },
    { key: `ip:${ipHash}`, limit: 60, windowSeconds: 300 },
    { key: `account:${accountHash}`, limit: 30, windowSeconds: 900 }
  ];
}

async function isLoginRateLimited(c: any, limits: LoginLimit[]): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const results = await c.env.DB.batch(
    limits.map((item) => c.env.DB.prepare(
      'SELECT attempts, window_started_at FROM auth_login_attempts WHERE attempt_key = ?'
    ).bind(item.key))
  );

  return results.some((result: D1Result, index: number) => {
    const row = result.results?.[0] as { attempts?: number; window_started_at?: number } | undefined;
    return !!row &&
      Number(row.window_started_at) > now - limits[index].windowSeconds &&
      Number(row.attempts) >= limits[index].limit;
  });
}

async function recordFailedLogin(c: any, limits: LoginLimit[]): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const updates = limits.map((item) => {
    const resetBefore = now - item.windowSeconds;
    return c.env.DB.prepare(`
      INSERT INTO auth_login_attempts (attempt_key, attempts, window_started_at)
      VALUES (?, 1, ?)
      ON CONFLICT(attempt_key) DO UPDATE SET
        attempts = CASE
          WHEN auth_login_attempts.window_started_at <= ? THEN 1
          ELSE auth_login_attempts.attempts + 1
        END,
        window_started_at = CASE
          WHEN auth_login_attempts.window_started_at <= ? THEN ?
          ELSE auth_login_attempts.window_started_at
        END
    `).bind(item.key, now, resetBefore, resetBefore, now);
  });

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_login_attempts WHERE window_started_at <= ?')
      .bind(now - 86400),
    ...updates
  ]);
}

async function clearLoginRateLimit(c: any, limits: LoginLimit[]): Promise<void> {
  await c.env.DB.batch(
    limits.map((item) => c.env.DB.prepare(
      'DELETE FROM auth_login_attempts WHERE attempt_key = ?'
    ).bind(item.key))
  );
}

// POST /wp/v2/users/login - Login (non-standard WordPress endpoint but useful)
users.post('/login', async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const body = await c.req.json();
    const { username, password, use_cookie: useCookie } = body;

    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      return createWPError('rest_invalid_param', 'Username and password are required.', 400);
    }

    if (isUnsafeJwtSecret(c.env.JWT_SECRET)) {
      return createWPError('server_not_configured', 'JWT_SECRET is not configured securely.', 500);
    }

    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND status = ?'
    )
      .bind(username, username, 'active')
      .first<User>();

    const loginLimits = await getLoginLimits(c, user, username);
    if (await isLoginRateLimited(c, loginLimits)) {
      return createWPError('too_many_login_attempts', 'Too many login attempts. Please try again later.', 429);
    }

    const passwordFitsBcrypt = new TextEncoder().encode(password).length <= 72;
    const passwordToCompare = passwordFitsBcrypt ? password : 'invalid-password-over-limit';
    const hashToCompare = passwordFitsBcrypt && user?.password ? user.password : DUMMY_PASSWORD_HASH;
    const isValidPassword = passwordFitsBcrypt && await comparePassword(passwordToCompare, hashToCompare);

    if (!user || !isValidPassword) {
      await recordFailedLogin(c, loginLimits);
      return createWPError('invalid_credentials', 'Invalid username or password.', 401);
    }

    await clearLoginRateLimit(c, loginLimits);

    // Update last login
    await c.env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?')
      .bind(new Date().toISOString(), user.id)
      .run();

    // Generate token
    const token = await generateToken(user, c.env.JWT_SECRET);
    if (useCookie === true) {
      setAuthCookie(c, token);
    }

    // Remove password from response
    delete user.password;

    return c.json({
      ...(useCookie === true ? {} : { token }),
      user: await formatUserResponse(user, baseUrl, true, settings.gravatar_base_url),
      user_email: user.email,
      user_nicename: user.username,
      user_display_name: user.display_name || user.username
    });
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// POST /wp/v2/users/register - Register new user
users.post('/register', async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const body = await c.req.json();
    const { username, email, password, display_name, use_cookie: useCookie } = body;

    if (!username || !email || !password) {
      return createWPError(
        'rest_invalid_param',
        'Username, email, and password are required.',
        400
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return createWPError('rest_invalid_password', passwordError, 400);
    }

    if (isUnsafeJwtSecret(c.env.JWT_SECRET)) {
      return createWPError('server_not_configured', 'JWT_SECRET is not configured securely.', 500);
    }

    // Check if username or email already exists
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    )
      .bind(username, email)
      .first();

    if (existingUser) {
      return createWPError(
        'existing_user_login',
        'Sorry, that username or email already exists!',
        400
      );
    }

    // Check if this is the first user - if so, make them an administrator
    const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users')
      .first<{ count: number }>();

    const isFirstUser = (userCount?.count || 0) === 0;
    if (!isFirstUser) {
      return createWPError('registration_closed', 'Public registration is closed.', 403);
    }

    const userRole = isFirstUser ? 'administrator' : 'subscriber';

    // Hash password
    const hashedPassword = await hashPassword(password);

    const now = new Date().toISOString();

    // Create user
    const result = await c.env.DB.prepare(
      'INSERT INTO users (username, email, password, display_name, role, status, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(username, email, hashedPassword, display_name || username, userRole, 'active', now)
      .run();

    const userId = result.meta.last_row_id;

    // Get created user
    const createdUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first<User>();

    // Generate token
    const token = await generateToken(createdUser!, c.env.JWT_SECRET);
    if (useCookie === true) {
      setAuthCookie(c, token);
    }

    // Remove password from response
    delete createdUser!.password;

    return c.json(
      {
        ...(useCookie === true ? {} : { token }),
        user: await formatUserResponse(createdUser!, baseUrl, true, settings.gravatar_base_url)
      },
      201
    );
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// POST /wp/v2/users/logout - Clear the browser session cookie
users.post('/logout', (c) => {
  clearAuthCookie(c);
  return c.json({ success: true });
});

// GET /wp/v2/users/registration-status - Expose only bootstrap availability
users.get('/registration-status', async (c) => {
  const result = await c.env.DB.prepare('SELECT EXISTS(SELECT 1 FROM users) AS has_users')
    .first<{ has_users: number }>();
  return c.json({ has_users: Number(result?.has_users || 0) === 1 });
});

// GET /wp/v2/users/me - Get current user
users.get('/me', authMiddleware, async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const user = c.get('user') as JWTPayload;

    const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(user.userId)
      .first<User>();

    if (!dbUser) {
      return createWPError('rest_user_invalid_id', 'Invalid user ID.', 404);
    }

    delete dbUser.password;

    return c.json(await formatUserResponse(dbUser, baseUrl, true, settings.gravatar_base_url));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// GET /wp/v2/users - List users
users.get('/', optionalAuthMiddleware, async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    // Check if user is authenticated admin
    let isAdmin = false;
    try {
      const user = c.get('user') as JWTPayload;
      isAdmin = user && ['administrator', 'editor'].includes(user.role);
    } catch (e) {
      // Not authenticated, continue as public user
    }

    const page = parsePageParam(c.req.query('page'));
    const perPage = parsePerPageParam(c.req.query('per_page'), 10);
    const search = c.req.query('search');
    const role = c.req.query('role');
    const orderby = c.req.query('orderby') || 'registered_at';
    const order = parseSqlOrder(c.req.query('order'), 'DESC');

    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM users WHERE status = ?';
    const params: any[] = ['active'];

    if (search) {
      query += isAdmin
        ? ' AND (username LIKE ? OR email LIKE ? OR display_name LIKE ?)'
        : ' AND (username LIKE ? OR display_name LIKE ?)';
      params.push(...(isAdmin
        ? [`%${search}%`, `%${search}%`, `%${search}%`]
        : [`%${search}%`, `%${search}%`]));
    }

    if (role && isAdmin) {
      query += ' AND role = ?';
      params.push(role);
    }

    // Order
    const orderMap: Record<string, string> = {
      registered: 'registered_at',
      name: 'display_name',
      id: 'id',
      email: 'email'
    };
    const orderColumn = orderby === 'email' && !isAdmin
      ? 'registered_at'
      : orderMap[orderby] || 'registered_at';
    query += ` ORDER BY ${orderColumn} ${order} LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const result = await c.env.DB.prepare(query).bind(...params).all<User>();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE status = ?';
    const countParams: any[] = ['active'];
    if (search) {
      countQuery += isAdmin
        ? ' AND (username LIKE ? OR email LIKE ? OR display_name LIKE ?)'
        : ' AND (username LIKE ? OR display_name LIKE ?)';
      countParams.push(...(isAdmin
        ? [`%${search}%`, `%${search}%`, `%${search}%`]
        : [`%${search}%`, `%${search}%`]));
    }
    if (role && isAdmin) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }

    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>();
    const totalItems = countResult?.count || 0;

    const formattedUsers = await Promise.all(result.results.map(async (user) => {
      delete user.password;
      return await formatUserResponse(user, baseUrl, isAdmin, settings.gravatar_base_url);
    }));

    // Add pagination headers
    const headers = buildPaginationHeaders(
      page,
      perPage,
      totalItems,
      `${baseUrl}/wp-json/wp/v2/users`
    );

    return c.json(formattedUsers, 200, headers);
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// GET /wp/v2/users/:id - Get single user
users.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const id = parseInt(c.req.param('id') || '');

    // Check if user is authenticated admin or viewing their own profile
    let isAdmin = false;
    try {
      const currentUser = c.get('user') as JWTPayload;
      isAdmin = (currentUser && ['administrator', 'editor'].includes(currentUser.role)) || currentUser?.userId === id;
    } catch (e) {
      // Not authenticated, continue as public user
    }

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND status = ?')
      .bind(id, 'active')
      .first<User>();

    if (!user) {
      return createWPError('rest_user_invalid_id', 'Invalid user ID.', 404);
    }

    delete user.password;

    return c.json(await formatUserResponse(user, baseUrl, isAdmin, settings.gravatar_base_url));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// POST /wp/v2/users - Create user (admin only)
users.post('/', authMiddleware, requireRole('administrator'), async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const body = await c.req.json();
    const { username, email, password, display_name, role } = body;

    if (!username || !email || !password) {
      return createWPError(
        'rest_invalid_param',
        'Username, email, and password are required.',
        400
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return createWPError('rest_invalid_password', passwordError, 400);
    }

    // Check if username or email already exists
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    )
      .bind(username, email)
      .first();

    if (existingUser) {
      return createWPError(
        'existing_user_login',
        'Sorry, that username or email already exists!',
        400
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    const now = new Date().toISOString();

    // Create user
    const result = await c.env.DB.prepare(
      'INSERT INTO users (username, email, password, display_name, role, status, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        username,
        email,
        hashedPassword,
        display_name || username,
        role || 'subscriber',
        'active',
        now
      )
      .run();

    const userId = result.meta.last_row_id;

    // Get created user
    const createdUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first<User>();

    delete createdUser!.password;

    return c.json(await formatUserResponse(createdUser!, baseUrl, true, settings.gravatar_base_url), 201);
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// PUT /wp/v2/users/:id - Update user
users.put('/:id', authMiddleware, async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const currentUser = c.get('user') as JWTPayload;
    const id = parseInt(c.req.param('id') || '');

    // Check if user can edit (self or admin)
    if (currentUser.userId !== id && currentUser.role !== 'administrator') {
      return createWPError(
        'rest_cannot_edit',
        'Sorry, you are not allowed to edit this user.',
        403
      );
    }

    // Check if user exists
    const existingUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();

    if (!existingUser) {
      return createWPError('rest_user_invalid_id', 'Invalid user ID.', 404);
    }

    const body = await c.req.json();
    const { email, display_name, bio, avatar_url, password, role } = body;

    // Only admins can change roles
    if (role && currentUser.role !== 'administrator') {
      return createWPError(
        'rest_cannot_edit_roles',
        'Sorry, you are not allowed to edit roles.',
        403
      );
    }

    // Check if email is being changed and if it's already in use
    if (email !== undefined && email !== existingUser.email) {
      const emailExists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .bind(email, id)
        .first();

      if (emailExists) {
        return createWPError(
          'existing_user_email',
          'Sorry, that email address is already used!',
          400
        );
      }
    }

    // Build update query dynamically to avoid undefined values
    const updates: string[] = [];
    const params: any[] = [];

    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      params.push(display_name);
    }

    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(bio);
    }

    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }

    let invalidateSessions = false;

    if (password !== undefined) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return createWPError('rest_invalid_password', passwordError, 400);
      }

      const hashedPassword = await hashPassword(password);
      updates.push('password = ?');
      params.push(hashedPassword);
      invalidateSessions = true;
    }

    if (role && currentUser.role === 'administrator') {
      updates.push('role = ?');
      params.push(role);
      invalidateSessions = true;
    }

    if (invalidateSessions) {
      updates.push('token_version = token_version + 1');
    }

    // If no fields to update, return current user
    if (updates.length === 0) {
      delete existingUser.password;
      return c.json(await formatUserResponse(existingUser, baseUrl, true, settings.gravatar_base_url));
    }

    const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    await c.env.DB.prepare(updateQuery).bind(...params).run();

    if (invalidateSessions && currentUser.userId === id) {
      clearAuthCookie(c);
    }

    // Get updated user
    const updatedUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();

    delete updatedUser!.password;

    return c.json(await formatUserResponse(updatedUser!, baseUrl, true, settings.gravatar_base_url));
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

// DELETE /wp/v2/users/:id - Delete user (admin only)
users.delete('/:id', authMiddleware, requireRole('administrator'), async (c) => {
  try {
    const settings = await getSiteSettings(c.env);
    const baseUrl = settings.site_url || 'http://localhost:8787';

    const id = parseInt(c.req.param('id') || '');
    const reassign = c.req.query('reassign');
    const force = c.req.query('force') === 'true';

    // Check if user exists
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();

    if (!user) {
      return createWPError('rest_user_invalid_id', 'Invalid user ID.', 404);
    }

    // Don't allow deleting yourself
    const currentUser = c.get('user') as JWTPayload;
    if (currentUser.userId === id) {
      return createWPError(
        'rest_cannot_delete',
        'Sorry, you cannot delete yourself.',
        403
      );
    }

    if (force) {
      // Reassign posts if specified
      if (reassign) {
        await c.env.DB.prepare('UPDATE posts SET author_id = ? WHERE author_id = ?')
          .bind(parseInt(reassign), id)
          .run();
        await c.env.DB.prepare('UPDATE moments SET author_id = ? WHERE author_id = ?')
          .bind(parseInt(reassign), id)
          .run();
      } else {
        // Delete user's posts
        await c.env.DB.prepare('DELETE FROM posts WHERE author_id = ?').bind(id).run();
      }

      // Delete user
      await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      await c.env.DB.prepare('DELETE FROM user_meta WHERE user_id = ?').bind(id).run();

      delete user.password;

      return c.json({
        deleted: true,
        previous: await formatUserResponse(user, baseUrl, true, settings.gravatar_base_url)
      });
    } else {
      // Deactivate user
      await c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind('inactive', id).run();

      const deactivatedUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first<User>();

      delete deactivatedUser!.password;

      return c.json(
        await formatUserResponse(deactivatedUser!, baseUrl, true, settings.gravatar_base_url)
      );
    }
  } catch (error: any) {
    return createWPError('server_error', error.message, 500);
  }
});

export default users;
