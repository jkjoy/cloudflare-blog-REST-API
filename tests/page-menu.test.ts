import { describe, expect, it } from 'vitest';
import { getNavPages } from '../src/public-site';
import { clearPublicSiteCommonCache } from '../src/public-site/cache';
import { normalizeMenuPriority } from '../src/routes/pages';
import type { Env } from '../src/types';

describe('page menu settings', () => {
  it('normalizes menu priority to a bounded integer', () => {
    expect(normalizeMenuPriority(undefined)).toBe(0);
    expect(normalizeMenuPriority(-3)).toBe(0);
    expect(normalizeMenuPriority(12.8)).toBe(12);
    expect(normalizeMenuPriority(10000)).toBe(9999);
  });

  it('loads visible published pages in descending priority order', async () => {
    let preparedSql = '';
    const env = {
      DB: {
        prepare(sql: string) {
          preparedSql = sql.replace(/\s+/g, ' ').trim();
          return {
            async all() {
              return {
                results: [
                  { title: 'Priority page', slug: 'priority-page' },
                  { title: 'Reserved page', slug: 'links' },
                ],
              };
            },
          };
        },
      },
    } as unknown as Env;

    await expect(getNavPages(env)).resolves.toEqual([
      { title: 'Priority page', slug: 'priority-page' },
    ]);
    expect(preparedSql).toContain("post_type = 'page'");
    expect(preparedSql).toContain("status = 'publish'");
    expect(preparedSql).toContain('COALESCE(menu_hidden, 0) = 0');
    expect(preparedSql).toContain('ORDER BY COALESCE(menu_priority, 0) DESC');
    expect(preparedSql).not.toContain('LIMIT 4');
  });

  it('clears the cached navigation data after a page change', async () => {
    const deletedKeys: string[] = [];
    const env = {
      CACHE: {
        async delete(key: string) {
          deletedKeys.push(key);
        },
      },
    } as unknown as Env;

    await clearPublicSiteCommonCache(env, 'https://blog.example/wp-json/wp/v2/pages/12');

    expect(deletedKeys).toEqual(['cfblog:v4:public:common:https://blog.example']);
  });
});
