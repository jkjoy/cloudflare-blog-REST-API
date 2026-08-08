import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import type { AppContext, AppEnv, JWTPayload, User } from './types';
import { createWPError } from './utils';
import bcrypt from 'bcryptjs';

const DEFAULT_JWT_SECRETS = new Set([
  'your-jwt-secret-here-change-in-production',
  'your-jwt-secret-here'
]);
const JWT_ISSUER = 'cfblog';
const JWT_AUDIENCE = 'cfblog-admin';
const AUTH_COOKIE_NAME = 'auth_token';
const USER_ROLES = new Set(['administrator', 'editor', 'author', 'contributor', 'subscriber']);

type AuthCredential = {
  source: 'bearer' | 'cookie';
  token: string;
};

export function isUnsafeJwtSecret(secret: string): boolean {
  const normalized = String(secret || '').trim();
  return normalized.length < 32 || DEFAULT_JWT_SECRETS.has(normalized);
}

// Generate JWT token
export async function generateToken(user: User, secret: string): Promise<string> {
  if (isUnsafeJwtSecret(secret)) {
    throw new Error('JWT_SECRET is not configured securely.');
  }

  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    tokenVersion: user.token_version
  };

  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);

  return token;
}

// Verify JWT token
export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    if (isUnsafeJwtSecret(secret)) {
      return null;
    }

    const encoder = new TextEncoder();
    const secretKey = encoder.encode(secret);

    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });

    if (
      !Number.isInteger(payload.userId) ||
      typeof payload.username !== 'string' ||
      typeof payload.email !== 'string' ||
      !USER_ROLES.has(String(payload.role)) ||
      !Number.isInteger(payload.tokenVersion)
    ) {
      return null;
    }

    return payload as JWTPayload;
  } catch (error) {
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Compare password
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || Array.from(password).length < 12) {
    return 'Password must be at least 12 characters long.';
  }

  if (new TextEncoder().encode(password).length > 72) {
    return 'Password must not exceed 72 UTF-8 bytes.';
  }

  return null;
}

// Extract token from request
function extractAuthCredential(c: Context): AuthCredential | null {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token ? { source: 'bearer', token } : null;
  }

  const token = getCookie(c, AUTH_COOKIE_NAME);
  if (token) {
    return { source: 'cookie', token };
  }

  return null;
}

export function extractToken(c: Context): string | null {
  return extractAuthCredential(c)?.token || null;
}

function isCookieRequestOriginAllowed(c: Context): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method.toUpperCase())) {
    return true;
  }

  const requestOrigin = new URL(c.req.url).origin;
  const origin = c.req.header('Origin');
  if (origin) {
    return origin === requestOrigin;
  }

  const fetchSite = c.req.header('Sec-Fetch-Site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

async function getCurrentUser(c: AppContext, token: string): Promise<JWTPayload | null> {
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return null;
  }

  const user = await c.env.DB.prepare(
    'SELECT id, username, email, role, status, token_version FROM users WHERE id = ? AND status = ?'
  )
    .bind(payload.userId, 'active')
    .first<Pick<User, 'id' | 'username' | 'email' | 'role' | 'status' | 'token_version'>>();

  if (!user || user.token_version !== payload.tokenVersion) {
    return null;
  }

  return {
    ...payload,
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    tokenVersion: user.token_version
  };
}

// Auth middleware - requires authentication
export async function authMiddleware(c: AppContext, next: Next) {
  const credential = extractAuthCredential(c);

  if (!credential) {
    return createWPError('rest_not_logged_in', 'You are not currently logged in.', 401);
  }

  if (credential.source === 'cookie' && !isCookieRequestOriginAllowed(c)) {
    return createWPError('rest_invalid_origin', 'Cross-origin cookie authentication is not allowed.', 403);
  }

  const payload = await getCurrentUser(c, credential.token);

  if (!payload) {
    return createWPError('rest_invalid_token', 'Invalid or expired token.', 401);
  }

  // Store user info in context
  c.set('user', payload);

  await next();
}

// Optional auth middleware - doesn't require authentication but populates user if authenticated
export async function optionalAuthMiddleware(c: AppContext, next: Next) {
  const credential = extractAuthCredential(c);

  if (credential) {
    if (credential.source === 'cookie' && !isCookieRequestOriginAllowed(c)) {
      return createWPError('rest_invalid_origin', 'Cross-origin cookie authentication is not allowed.', 403);
    }

    const payload = await getCurrentUser(c, credential.token);
    if (payload) {
      c.set('user', payload);
    }
  }

  await next();
}

// Role-based authorization middleware
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user') as JWTPayload | undefined;

    if (!user) {
      return createWPError('rest_not_logged_in', 'You are not currently logged in.', 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return createWPError(
        'rest_forbidden',
        'Sorry, you are not allowed to do that.',
        403
      );
    }

    await next();
  };
}

// Check if user can edit post
export async function canEditPost(c: Context<AppEnv>, postId: number): Promise<boolean> {
  const user = c.get('user') as JWTPayload | undefined;

  if (!user) {
    return false;
  }

  // Admin and editor can edit any post
  if (user.role === 'administrator' || user.role === 'editor') {
    return true;
  }

  // Author can edit their own posts
  if (user.role === 'author' || user.role === 'contributor') {
    const post = await c.env.DB.prepare('SELECT author_id FROM posts WHERE id = ?')
      .bind(postId)
      .first<{ author_id: number }>();

    return post?.author_id === user.userId;
  }

  return false;
}

// Check if user can delete post
export async function canDeletePost(c: Context<AppEnv>, postId: number): Promise<boolean> {
  const user = c.get('user') as JWTPayload | undefined;

  if (!user) {
    return false;
  }

  // Only admin and editor can delete posts
  if (user.role === 'administrator' || user.role === 'editor') {
    return true;
  }

  return false;
}

// Check if user can publish post
export function canPublishPost(user: JWTPayload | undefined): boolean {
  if (!user) {
    return false;
  }

  return ['administrator', 'editor', 'author'].includes(user.role);
}
