import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { generateToken } from '../src/auth';
import settings from '../src/routes/settings';
import type { AppEnv, Env, User } from '../src/types';

const JWT_SECRET = 'test-secret-with-at-least-32-random-looking-characters-123456';
const admin: User = {
  id: 1,
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
  token_version: 0
};

describe('security-sensitive routes', () => {
  it('returns only configured flags for stored secrets', async () => {
    const token = await generateToken(admin, JWT_SECRET);
    const database = {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement;
          },
          async first() {
            return admin;
          },
          async all() {
            if (!sql.includes('FROM site_settings')) {
              return { results: [] };
            }
            return {
              results: [
                { setting_key: 'site_title', setting_value: 'CFBlog' },
                { setting_key: 'site_theme', setting_value: 'editorial' },
                { setting_key: 'resend_api_key', setting_value: 'resend-secret' },
                { setting_key: 'comment_turnstile_secret_key', setting_value: 'turnstile-secret' },
                { setting_key: 'webhook_secret', setting_value: 'webhook-secret' }
              ]
            };
          }
        };
        return statement;
      }
    };
    const env = { DB: database, JWT_SECRET } as unknown as Env;
    const routeApp = new Hono<AppEnv>();
    routeApp.route('/settings', settings);
    const response = await routeApp.request('/settings/admin', {
      headers: { Authorization: `Bearer ${token}` }
    }, env);
    const body = await response.json() as Record<string, string>;

    expect(response.status).toBe(200);
    expect(body.site_title).toBe('CFBlog');
    expect(body.resend_api_key_configured).toBe('1');
    expect(body.comment_turnstile_secret_key_configured).toBe('1');
    expect(body.webhook_secret_configured).toBe('1');
    expect(JSON.stringify(body)).not.toContain('resend-secret');
    expect(JSON.stringify(body)).not.toContain('turnstile-secret');
    expect(JSON.stringify(body)).not.toContain('webhook-secret');

    const publicResponse = await routeApp.request('/settings', {}, env);
    const publicBody = await publicResponse.json() as Record<string, string>;
    expect(publicBody.site_theme).toBe('editorial');
    expect(JSON.stringify(publicBody)).not.toContain('resend-secret');
  });

  it('adds admin security headers and rejects foreign CORS origins', async () => {
    const env = {
      ASSETS: {
        fetch: async () => new Response('<!doctype html><title>Admin</title>', {
          headers: { 'Content-Type': 'text/html' }
        })
      }
    } as unknown as Env;

    const adminResponse = await app.request('https://blog.example/wp-admin', {}, env);
    expect(adminResponse.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(adminResponse.headers.get('strict-transport-security')).toBe('max-age=31536000');
    expect(adminResponse.headers.get('x-content-type-options')).toBe('nosniff');

    const corsResponse = await app.request('https://blog.example/wp-json/wp/v2', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'GET'
      }
    }, env);
    expect(corsResponse.headers.get('access-control-allow-origin')).toBeNull();
  });
});
