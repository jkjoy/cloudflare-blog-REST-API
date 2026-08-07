<script setup lang="ts">
import {
  CheckCircle2,
  FileText,
  Files,
  FolderTree,
  Image,
  Link2,
  MessageSquare,
  RefreshCw,
  Tags,
  Upload,
  Users,
  Zap,
} from '@lucide/vue';
import { NButton, NIcon, NSpin, useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type StatKey = 'posts' | 'pages' | 'comments' | 'categories' | 'tags' | 'media' | 'links' | 'users' | 'moments';

const auth = useAuthStore();
const message = useMessage();
const { t } = useAdminI18n();
const loading = ref(true);
const stats = ref<Record<StatKey, number>>({
  posts: 0, pages: 0, comments: 0, categories: 0, tags: 0, media: 0, links: 0, users: 0, moments: 0,
});

const statDefinitions = computed(() => [
  { key: 'posts' as const, label: t('stats.posts'), icon: FileText, tone: 'blue' },
  { key: 'pages' as const, label: t('stats.pages'), icon: Files, tone: 'cyan' },
  { key: 'comments' as const, label: t('stats.comments'), icon: MessageSquare, tone: 'green' },
  { key: 'categories' as const, label: t('stats.categories'), icon: FolderTree, tone: 'amber' },
  { key: 'tags' as const, label: t('stats.tags'), icon: Tags, tone: 'violet' },
  { key: 'media' as const, label: t('stats.media'), icon: Image, tone: 'rose' },
  { key: 'links' as const, label: t('stats.links'), icon: Link2, tone: 'teal' },
  { key: 'users' as const, label: t('stats.users'), icon: Users, tone: 'slate' },
  { key: 'moments' as const, label: t('stats.moments'), icon: Zap, tone: 'orange' },
]);

const endpoints: Record<StatKey, string> = {
  posts: '/posts?per_page=1&status=all',
  pages: '/pages?per_page=1&status=all',
  comments: '/comments?per_page=1&status=all',
  categories: '/categories?per_page=1',
  tags: '/tags?per_page=1',
  media: '/media?per_page=1',
  links: '/links?per_page=1&visible=all',
  users: '/users?per_page=1',
  moments: '/moments?per_page=1&status=all',
};

async function fetchCount(path: string) {
  const response = await apiFetch(path, {}, auth.token);
  const headerCount = Number(response.headers.get('X-WP-Total'));
  if (Number.isFinite(headerCount)) return headerCount;
  const data = await response.json();
  return Array.isArray(data) ? data.length : 0;
}

async function loadStats(notify = false) {
  loading.value = true;
  try {
    const entries = await Promise.all(
      Object.entries(endpoints).map(async ([key, path]) => {
        if (key === 'comments') {
          const [postComments, momentComments] = await Promise.all([
            fetchCount(path),
            fetchCount('/moments/comments/all?per_page=1&status=all'),
          ]);
          return [key, postComments + momentComments] as const;
        }
        return [key, await fetchCount(path)] as const;
      }),
    );
    stats.value = Object.fromEntries(entries) as Record<StatKey, number>;
    if (notify) message.success(t('dashboard.refreshed'));
  } catch {
    message.error(t('dashboard.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadStats());
</script>

<template>
  <section class="dashboard-view">
    <header class="view-header">
      <div>
        <p class="view-eyebrow">{{ t('dashboard.greeting') }}</p>
        <h1>{{ t('dashboard.title') }}</h1>
      </div>
      <NButton secondary :loading="loading" @click="loadStats(true)">
        <template #icon><NIcon><RefreshCw /></NIcon></template>
        {{ t('dashboard.refresh') }}
      </NButton>
    </header>

    <NSpin :show="loading">
      <div class="stats-list">
        <article v-for="item in statDefinitions" :key="item.key" class="stat-panel">
          <span class="stat-icon" :class="`tone-${item.tone}`">
            <component :is="item.icon" :size="20" stroke-width="1.8" />
          </span>
          <div>
            <span>{{ item.label }}</span>
            <strong>{{ stats[item.key] }}</strong>
          </div>
        </article>
      </div>
    </NSpin>

    <div class="dashboard-lower">
      <section class="dashboard-section">
        <h2>{{ t('dashboard.quickActions') }}</h2>
        <div class="quick-actions">
          <RouterLink to="/posts"><FileText :size="19" />{{ t('dashboard.managePosts') }}</RouterLink>
          <RouterLink to="/comments"><MessageSquare :size="19" />{{ t('dashboard.reviewComments') }}</RouterLink>
          <RouterLink to="/media"><Upload :size="19" />{{ t('dashboard.uploadMedia') }}</RouterLink>
        </div>
      </section>
      <section class="dashboard-section status-section">
        <h2>{{ t('dashboard.siteStatus') }}</h2>
        <div class="status-row"><CheckCircle2 :size="18" /><span>{{ t('dashboard.apiOnline') }}</span></div>
        <div class="status-row"><CheckCircle2 :size="18" /><span>{{ t('dashboard.sessionActive') }}</span></div>
      </section>
    </div>
  </section>
</template>
