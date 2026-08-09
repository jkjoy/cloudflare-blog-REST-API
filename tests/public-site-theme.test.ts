import { describe, expect, it } from 'vitest';
import { normalizeSiteTheme } from '../src/public-site';
import { clearPublicSiteSettingsCache } from '../src/public-site/cache';
import type { Env } from '../src/types';

describe('public-site theme selection', () => {
  it.each(['classic', 'minimal', 'editorial', 'magazine'] as const)('accepts the built-in %s theme', (theme) => {
    expect(normalizeSiteTheme(theme)).toBe(theme);
  });

  it('falls back to classic for missing or unknown themes', () => {
    expect(normalizeSiteTheme(undefined)).toBe('classic');
    expect(normalizeSiteTheme('custom-css')).toBe('classic');
  });

  it('clears cached site metadata after settings change', async () => {
    const deletedKeys: string[] = [];
    const env = {
      CACHE: {
        delete: async (key: string) => {
          deletedKeys.push(key);
        },
      },
    } as unknown as Env;

    await clearPublicSiteSettingsCache(env, 'https://blog.example/wp-json/wp/v2/settings');

    expect(deletedKeys).toEqual([
      'cfblog:v4:public:common:https://blog.example',
      'cfblog:v4:public:site-meta:https://blog.example',
    ]);
  });
});
