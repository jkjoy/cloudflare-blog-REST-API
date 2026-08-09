import type { Env } from '../types';
import { normalizeBaseUrl } from '../utils';

export const PUBLIC_KV_CACHE_VERSION = 'v4';
export const PUBLIC_COMMON_CACHE_TTL_SECONDS = 300;
export const PUBLIC_RSS_CACHE_TTL_SECONDS = 900;
export const PUBLIC_SITEMAP_CACHE_TTL_SECONDS = 3600;

function getPublicCacheOrigin(requestUrl: string): string {
  return normalizeBaseUrl(new URL(requestUrl).origin);
}

export function buildPublicCacheKey(requestUrl: string, name: string, ...parts: unknown[]): string {
  const suffix = parts
    .map((part) =>
      encodeURIComponent(typeof part === 'string' ? part : JSON.stringify(part)),
    )
    .join(':');
  const baseKey = `cfblog:${PUBLIC_KV_CACHE_VERSION}:public:${name}:${getPublicCacheOrigin(requestUrl)}`;
  return suffix ? `${baseKey}:${suffix}` : baseKey;
}

export async function clearPublicSiteCommonCache(env: Env, requestUrl: string): Promise<void> {
  if (!env.CACHE) return;

  await env.CACHE.delete(buildPublicCacheKey(requestUrl, 'common'));
}

export async function clearPublicSiteSettingsCache(env: Env, requestUrl: string): Promise<void> {
  if (!env.CACHE) return;

  await Promise.all([
    clearPublicSiteCommonCache(env, requestUrl),
    env.CACHE.delete(buildPublicCacheKey(requestUrl, 'site-meta')),
  ]);
}
