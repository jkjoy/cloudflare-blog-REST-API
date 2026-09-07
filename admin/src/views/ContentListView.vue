<script setup lang="ts">
import {
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  Files,
  MessageSquare,
  Pin,
  RotateCcw,
  Search,
  Trash2,
} from '@lucide/vue';
import {
  NButton,
  NEmpty,
  NIcon,
  NInput,
  NPopconfirm,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError, apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type ContentKind = 'posts' | 'pages';
type ContentStatus = 'publish' | 'draft' | 'pending' | 'private' | 'trash';

interface ContentItem {
  id: number;
  date: string;
  modified: string;
  slug: string;
  status: ContentStatus;
  title: { rendered: string };
  author_name?: string | null;
  comment_status?: string;
  comment_count?: number;
  view_count?: number;
  sticky?: boolean;
}

const props = defineProps<{ kind: ContentKind }>();
const auth = useAuthStore();
const router = useRouter();
const message = useMessage();
const { isChinese, t } = useAdminI18n();
const items = ref<ContentItem[]>([]);
const loading = ref(false);
const actionId = ref<number | null>(null);
const status = ref('all');
const search = ref('');
const page = ref(1);
const perPage = 15;
const total = ref(0);
const totalPages = ref(1);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const isPosts = computed(() => props.kind === 'posts');
const title = computed(() => t(isPosts.value ? 'content.postsTitle' : 'content.pagesTitle'));
const description = computed(() => t(isPosts.value ? 'content.postsDescription' : 'content.pagesDescription'));
const statusOptions = computed(() => [
  { label: t('content.statusAll'), value: 'all' },
  { label: t('content.statusPublish'), value: 'publish' },
  { label: t('content.statusDraft'), value: 'draft' },
  { label: t('content.statusPending'), value: 'pending' },
  { label: t('content.statusPrivate'), value: 'private' },
  { label: t('content.statusTrash'), value: 'trash' },
]);

function openEditor(id?: number) {
  const name = isPosts.value
    ? (id ? 'post-edit' : 'post-create')
    : (id ? 'page-edit' : 'page-create');
  router.push(id ? { name, params: { id } } : { name });
}

function statusLabel(value: string) {
  const keys: Record<string, string> = {
    publish: 'content.statusPublish',
    draft: 'content.statusDraft',
    pending: 'content.statusPending',
    private: 'content.statusPrivate',
    trash: 'content.statusTrash',
    open: 'content.statusOpen',
    closed: 'content.statusClosed',
  };
  return t(keys[value] || 'content.statusUnknown');
}

function statusType(value: string): 'success' | 'warning' | 'info' | 'error' | 'default' {
  if (value === 'publish') return 'success';
  if (value === 'pending') return 'warning';
  if (value === 'private') return 'info';
  if (value === 'trash') return 'error';
  return 'default';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(isChinese.value ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

async function loadItems() {
  const version = ++requestVersion;
  loading.value = true;
  const params = new URLSearchParams({
    page: String(page.value),
    per_page: String(perPage),
    status: status.value,
  });
  if (search.value.trim()) params.set('search', search.value.trim());

  try {
    const response = await apiFetch(`/${props.kind}?${params.toString()}`, {}, auth.token);
    const data = await response.json() as ContentItem[];
    if (version !== requestVersion) return;
    items.value = data;
    total.value = Number(response.headers.get('X-WP-Total')) || data.length;
    totalPages.value = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1);
  } catch (error) {
    if (version !== requestVersion) return;
    items.value = [];
    message.error(error instanceof ApiError ? error.message : t('content.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function resetAndLoad() {
  const statusWillChange = status.value !== 'all';
  status.value = 'all';
  search.value = '';
  page.value = 1;
  if (!statusWillChange) loadItems();
}

function handleSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadItems();
  }, 300);
}

function changePage(nextPage: number) {
  page.value = nextPage;
  loadItems();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function mutateItem(item: ContentItem, action: 'trash' | 'restore' | 'delete') {
  actionId.value = item.id;
  try {
    const suffix = action === 'restore' ? '/restore' : action === 'delete' ? '?force=true' : '';
    await apiFetch(`/${props.kind}/${item.id}${suffix}`, {
      method: action === 'restore' ? 'POST' : 'DELETE',
    }, auth.token);
    message.success(t(`content.${action}Success`));
    if (items.value.length === 1 && page.value > 1) page.value -= 1;
    await loadItems();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('content.actionFailed'));
  } finally {
    actionId.value = null;
  }
}

watch(() => props.kind, resetAndLoad, { immediate: true });
watch(status, () => {
  page.value = 1;
  loadItems();
});
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>

<template>
  <section class="content-list-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('content.manage') }}</p>
        <h1>{{ title }}</h1>
        <p class="view-description">{{ description }}</p>
      </div>
      <NButton type="primary" @click="openEditor()">
        <template #icon><NIcon><FilePlus2 /></NIcon></template>
        {{ t('content.addNew') }}
      </NButton>
    </header>

    <div class="content-toolbar">
      <NInput
        v-model:value="search"
        clearable
        :placeholder="t('content.searchPlaceholder')"
        :input-props="{ type: 'search', autocomplete: 'off' }"
        @input="handleSearchInput"
        @clear="handleSearchInput"
      >
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>
      <NSelect v-model:value="status" :options="statusOptions" :aria-label="t('content.filterStatus')" />
      <span class="content-count">{{ t('content.total').replace('{count}', String(total)) }}</span>
    </div>

    <NSpin :show="loading">
      <div v-if="items.length" class="content-table" :class="{ 'is-pages': !isPosts }">
        <div class="content-table-head" aria-hidden="true">
          <span>{{ t('content.titleColumn') }}</span>
          <span>{{ t('content.statusColumn') }}</span>
          <span>{{ isPosts ? t('content.performanceColumn') : t('content.detailsColumn') }}</span>
          <span>{{ t('content.modifiedColumn') }}</span>
          <span>{{ t('content.actionsColumn') }}</span>
        </div>

        <article v-for="item in items" :key="item.id" class="content-row">
          <div class="content-title-cell">
            <component :is="isPosts ? FileText : Files" :size="18" stroke-width="1.8" />
            <div>
              <div class="content-title-line">
                <a
                  v-if="isPosts && item.status === 'publish'"
                  class="content-title-link"
                  :href="`/${encodeURIComponent(item.slug)}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{{ item.title.rendered || t('content.untitled') }}</strong>
                </a>
                <strong v-else>{{ item.title.rendered || t('content.untitled') }}</strong>
                <NTag v-if="isPosts && item.sticky" class="content-sticky-tag" size="small" type="warning" :bordered="false">
                  <template #icon><NIcon><Pin /></NIcon></template>
                  {{ t('content.sticky') }}
                </NTag>
              </div>
              <small>/{{ item.slug }}</small>
            </div>
          </div>
          <div class="content-status-cell">
            <NTag size="small" :type="statusType(item.status)" :bordered="false">
              {{ statusLabel(item.status) }}
            </NTag>
          </div>
          <div class="content-detail-cell">
            <template v-if="isPosts">
              <span><Eye :size="15" />{{ item.view_count || 0 }}</span>
              <span><MessageSquare :size="15" />{{ item.comment_count || 0 }}</span>
            </template>
            <template v-else>
              <span>{{ item.author_name || t('content.unknownAuthor') }}</span>
              <span>{{ t('content.comments') }}: {{ statusLabel(item.comment_status || '') }}</span>
            </template>
          </div>
          <time class="content-date-cell" :datetime="item.modified || item.date">
            {{ formatDate(item.modified || item.date) }}
          </time>
          <div class="content-actions-cell">
            <NButton v-if="item.status !== 'trash'" quaternary size="small" class="content-action" @click="openEditor(item.id)">
              <template #icon><NIcon><Edit3 /></NIcon></template>
              {{ t('content.edit') }}
            </NButton>

            <NPopconfirm
              v-if="item.status !== 'trash'"
              :positive-text="t('content.confirm')"
              :negative-text="t('content.cancel')"
              @positive-click="mutateItem(item, 'trash')"
            >
              <template #trigger>
                <NButton quaternary size="small" type="error" class="content-action" :loading="actionId === item.id">
                  <template #icon><NIcon><Trash2 /></NIcon></template>
                  {{ t('content.trash') }}
                </NButton>
              </template>
              {{ t('content.trashConfirm') }}
            </NPopconfirm>

            <NButton v-if="item.status === 'trash'" quaternary size="small" class="content-action" :loading="actionId === item.id" @click="mutateItem(item, 'restore')">
              <template #icon><NIcon><RotateCcw /></NIcon></template>
              {{ t('content.restore') }}
            </NButton>

            <NPopconfirm
              v-if="item.status === 'trash'"
              :positive-text="t('content.confirmDelete')"
              :negative-text="t('content.cancel')"
              @positive-click="mutateItem(item, 'delete')"
            >
              <template #trigger>
                <NButton quaternary size="small" type="error" class="content-action" :loading="actionId === item.id">
                  <template #icon><NIcon><Trash2 /></NIcon></template>
                  {{ t('content.deleteForever') }}
                </NButton>
              </template>
              {{ t('content.deleteConfirm') }}
            </NPopconfirm>
          </div>
        </article>
      </div>

      <NEmpty v-else-if="!loading" class="content-empty" :description="search ? t('content.noSearchResults') : t('content.empty')">
        <template #extra>
          <NButton secondary @click="openEditor()">{{ t('content.addFirst') }}</NButton>
        </template>
      </NEmpty>
    </NSpin>

    <footer v-if="totalPages > 1" class="content-pagination">
      <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
      <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
      <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
    </footer>
  </section>
</template>
