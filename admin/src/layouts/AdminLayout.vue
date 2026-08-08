<script setup lang="ts">
import {
  BarChart3,
  FileText,
  Files,
  FolderTree,
  House,
  Image,
  Languages,
  Link2,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  Tags,
  Upload,
  Users,
  Zap,
} from '@lucide/vue';
import { NAvatar, NButton, NDrawer, NDrawerContent, NDropdown, NIcon } from 'naive-ui';
import { computed, h, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

const auth = useAuthStore();
const site = useSiteStore();
const router = useRouter();
const route = useRoute();
const drawerOpen = ref(false);
const { t, toggleLocale } = useAdminI18n();

const navItems = computed(() => [
  { key: 'dashboard', path: '/dashboard', label: t('nav.dashboard'), icon: BarChart3 },
  { key: '/posts', path: '/posts', label: t('nav.posts'), icon: FileText },
  { key: '/pages', path: '/pages', label: t('nav.pages'), icon: Files },
  { key: '/moments', path: '/moments', label: t('nav.moments'), icon: Zap },
  { key: '/categories', path: '/categories', label: t('nav.categories'), icon: FolderTree },
  { key: '/tags', path: '/tags', label: t('nav.tags'), icon: Tags },
  { key: '/media', path: '/media', label: t('nav.media'), icon: Image },
  { key: '/links', path: '/links', label: t('nav.links'), icon: Link2 },
  { key: '/comments', path: '/comments', label: t('nav.comments'), icon: MessagesSquare },
  { key: '/import', path: '/import', label: t('nav.import'), icon: Upload },
  { key: '/users', path: '/users', label: t('nav.users'), icon: Users },
  { key: '/settings', path: '/settings', label: t('nav.settings'), icon: Settings },
]);
const pageTitle = computed(() => t(String(route.meta.titleKey || 'dashboard.title')));

const avatarUrl = computed(() => auth.user?.avatar_urls?.['48'] || '');
const userOptions = computed(() => [
  { key: 'language', label: t('common.language'), icon: () => h(NIcon, null, { default: () => h(Languages) }) },
  { key: 'logout', label: t('common.logout'), icon: () => h(NIcon, null, { default: () => h(LogOut) }) },
]);

function openItem(item: (typeof navItems.value)[number]) {
  drawerOpen.value = false;
  router.push(item.path);
}

async function handleUserAction(key: string) {
  if (key === 'language') {
    toggleLocale();
    return;
  }
  if (key === 'logout') {
    drawerOpen.value = false;
    await auth.logout();
    router.replace('/login');
  }
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" aria-label="Admin navigation">
      <div class="admin-brand">
        <span class="admin-brand-mark">C</span>
        <span class="admin-brand-copy">
          <strong>{{ site.title }}</strong>
          <small>{{ t('brandSuffix') }}</small>
        </span>
      </div>
      <nav class="admin-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="admin-nav-item"
          :class="{ active: item.path === route.path }"
          @click="openItem(item)"
        >
          <component :is="item.icon" :size="18" stroke-width="1.8" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <NDropdown trigger="click" placement="top-start" :options="userOptions" @select="handleUserAction">
        <button type="button" class="sidebar-user-menu" :aria-label="auth.user?.name || t('common.account')">
          <NAvatar round :size="34" :src="avatarUrl || undefined">
            {{ auth.user?.name?.slice(0, 1).toUpperCase() }}
          </NAvatar>
          <span class="sidebar-user-copy">
            <strong>{{ auth.user?.name }}</strong>
            <small>{{ t('common.account') }}</small>
          </span>
        </button>
      </NDropdown>
    </aside>

    <NDrawer v-model:show="drawerOpen" placement="left" width="min(300px, 84vw)">
      <NDrawerContent :native-scrollbar="false" body-content-style="padding: 0;">
        <div class="mobile-nav-panel">
          <div class="admin-brand">
            <span class="admin-brand-mark">C</span>
            <span class="admin-brand-copy">
              <strong>{{ site.title }}</strong>
              <small>{{ t('brandSuffix') }}</small>
            </span>
          </div>
          <nav class="admin-nav">
            <button
              v-for="item in navItems"
              :key="item.key"
              type="button"
              class="admin-nav-item"
              :class="{ active: item.path === route.path }"
              @click="openItem(item)"
            >
              <component :is="item.icon" :size="19" stroke-width="1.8" />
              <span>{{ item.label }}</span>
            </button>
          </nav>
          <NDropdown trigger="click" placement="top-start" :options="userOptions" @select="handleUserAction">
            <button type="button" class="sidebar-user-menu" :aria-label="auth.user?.name || t('common.account')">
              <NAvatar round :size="34" :src="avatarUrl || undefined">
                {{ auth.user?.name?.slice(0, 1).toUpperCase() }}
              </NAvatar>
              <span class="sidebar-user-copy">
                <strong>{{ auth.user?.name }}</strong>
                <small>{{ t('common.account') }}</small>
              </span>
            </button>
          </NDropdown>
        </div>
      </NDrawerContent>
    </NDrawer>

    <main class="admin-main">
      <header class="admin-topbar">
        <NButton class="mobile-menu-button" quaternary circle aria-label="Open menu" @click="drawerOpen = true">
          <template #icon><NIcon><Menu /></NIcon></template>
        </NButton>
        <div class="admin-topbar-title">
          <strong>{{ pageTitle }}</strong>
          <span>{{ site.title }}</span>
        </div>
        <a class="site-home-link" href="/" target="_blank" rel="noopener noreferrer">
          <House :size="18" stroke-width="1.8" />
          <span>{{ t('common.siteHome') }}</span>
        </a>
      </header>
      <div class="admin-content">
        <RouterView />
      </div>
    </main>
  </div>
</template>
