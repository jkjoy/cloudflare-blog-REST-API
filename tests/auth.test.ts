import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { authMiddleware, generateToken, requireRole, validatePassword, verifyToken } from '../src/auth';
import posts from '../src/routes/posts';
import type { AppEnv, Env, User } from '../src/types';

const JWT_SECRET = 'test-secret-with-at-least-32-random-looking-characters-123456';

const tokenUser: User = {
  id: 7,
  username: 'admin',
  email: 'admin@example.com',
  password: undefined,
  display_name: 'Admin',
  role: 'administrator',
  status: 'active',
  registered_at: '2026-01-01T00:00:00.000Z',
  last_login: null,
  avatar_url: null,
  bio: null,
  token_version: 3
};

type CurrentUser = Pick<User, 'id' | 'username' | 'email' | 'role' | 'status' | 'token_version'>;

function createEnv(currentUser: CurrentUser | null): Env {
  const statement = {
    bind() {
      return statement;
    },
    async first() {
      return currentUser;
    }
  };

  return {
    DB: {
      prepare() {
        return statement;
      }
    },
    JWT_SECRET
  } as unknown as Env;
}

function createProtectedApp() {
  const app = new Hono<AppEnv>();
  app.get('/protected', authMiddleware, requireRole('administrator'), (c) => {
    return c.json({ role: c.get('user').role });
  });
  app.post('/protected', authMiddleware, requireRole('administrator'), (c) => c.json({ ok: true }));
  return app;
}

describe('JWT authentication', () => {
  it('uses the current database role instead of the role embedded in the token', async () => {
    const token = await generateToken(tokenUser, JWT_SECRET);
    const app = createProtectedApp();
    const response = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` }
    }, createEnv({ ...tokenUser, role: 'editor' }));

    expect(response.status).toBe(403);
  });

  it('rejects a token after the session version changes', async () => {
    const token = await generateToken(tokenUser, JWT_SECRET);
    const app = createProtectedApp();
    const response = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` }
    }, createEnv({ ...tokenUser, token_version: tokenUser.token_version + 1 }));

    expect(response.status).toBe(401);
  });

  it('rejects a token when the user no longer has an active database row', async () => {
    const token = await generateToken(tokenUser, JWT_SECRET);
    const app = createProtectedApp();
    const response = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` }
    }, createEnv(null));

    expect(response.status).toBe(401);
  });

  it('rejects cross-origin writes authenticated by cookie', async () => {
    const token = await generateToken(tokenUser, JWT_SECRET);
    const app = createProtectedApp();
    const response = await app.request('https://blog.example/protected', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${token}`,
        Origin: 'https://attacker.example'
      }
    }, createEnv(tokenUser));

    expect(response.status).toBe(403);
  });

  it('accepts only the configured JWT algorithm and claims', async () => {
    const key = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      userId: tokenUser.id,
      username: tokenUser.username,
      email: tokenUser.email,
      role: tokenUser.role,
      tokenVersion: tokenUser.token_version
    })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer('cfblog')
      .setAudience('cfblog-admin')
      .setExpirationTime('5m')
      .sign(key);

    expect(await verifyToken(token, JWT_SECRET)).toBeNull();
  });

  it('blocks subscribers before the post creation handler runs', async () => {
    const subscriber = { ...tokenUser, role: 'subscriber' as const };
    const token = await generateToken(subscriber, JWT_SECRET);
    const app = new Hono<AppEnv>();
    app.route('/posts', posts);
    const response = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Unauthorized draft' })
    }, createEnv(subscriber));

    expect(response.status).toBe(403);
  });
});

describe('password validation', () => {
  it('rejects short passwords and bcrypt-truncated inputs', () => {
    expect(validatePassword('short')).toContain('at least 12');
    expect(validatePassword('a'.repeat(73))).toContain('72 UTF-8 bytes');
    expect(validatePassword('correct horse battery staple')).toBeNull();
  });
});
