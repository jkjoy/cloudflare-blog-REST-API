import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiJson } from '../api/client';
import type { PublicSettings } from '../types';

export const useSiteStore = defineStore('site', () => {
  const title = ref('CFBlog');
  const description = ref('');
  let loading: Promise<void> | null = null;

  async function load() {
    if (loading) return loading;
    loading = apiJson<PublicSettings>('/settings')
      .then((settings) => {
        title.value = settings.site_title?.trim() || 'CFBlog';
        description.value = settings.site_description?.trim() || '';
        document.title = `${title.value} - Admin`;
      })
      .catch(() => undefined)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  return { description, load, title };
});
