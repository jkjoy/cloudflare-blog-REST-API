<script setup lang="ts">
import {
  Check,
  Edit3,
  Eye,
  Heart,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  X,
} from '@lucide/vue';
import {
  NAvatar,
  NButton,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NPopconfirm,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError, apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type MomentStatus = 'publish' | 'draft' | 'trash';

interface MomentItem {
  id: number;
  content: { rendered: string; raw: string };
  author: number;
  author_name: string;
  author_avatar: string;
  status: MomentStatus;
  media_urls: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  date: string;
  modified: string;
}

interface MediaItem {
  id: number;
  title: { rendered: string };
  alt_text: string;
  source_url: string;
  media_details: { file: string };
}

const auth = useAuthStore();
const router = useRouter();
const message = useMessage();
const { isChinese, t } = useAdminI18n();
const items = ref<MomentItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const actionId = ref<number | null>(null);
const search = ref('');
const status = ref('all');
const page = ref(1);
const perPage = 12;
const total = ref(0);
const totalPages = ref(1);
const editorOpen = ref(false);
const activeMoment = ref<MomentItem | null>(null);
const mediaOpen = ref(false);
const mediaLoading = ref(false);
const mediaSearch = ref('');
const mediaItems = ref<MediaItem[]>([]);
const mediaTotal = ref(0);
const form = reactive({ content: '', status: 'draft' as Exclude<MomentStatus, 'trash'>, mediaText: '' });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const statusOptions = computed(() => [
  { label: t('moments.statusAll'), value: 'all' },
  { label: t('moments.statusPublish'), value: 'publish' },
  { label: t('moments.statusDraft'), value: 'draft' },
  { label: t('moments.statusTrash'), value: 'trash' },
]);
const editorStatusOptions = computed(() => statusOptions.value.slice(1, 3));
const formMediaUrls = computed(() => normalizeMediaUrls(form.mediaText));

function normalizeMediaUrls(value: string) {
  return [...new Set(value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))];
}

function cleanText(value: string) {
  const parsed = new DOMParser().parseFromString(value || '', 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function statusLabel(value: MomentStatus) {
  return t(`moments.status${value[0].toUpperCase()}${value.slice(1)}`);
}

function statusType(value: MomentStatus): 'success' | 'warning' | 'error' | 'default' {
  if (value === 'publish') return 'success';
  if (value === 'trash') return 'error';
  if (value === 'draft') return 'warning';
  return 'default';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(isChinese.value ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function canManage(item: MomentItem) {
  return auth.user?.role === 'administrator' || auth.user?.id === item.author;
}

async function loadMoments() {
  const version = ++requestVersion;
  loading.value = true;
  const params = new URLSearchParams({
    page: String(page.value),
    per_page: String(perPage),
    status: status.value,
  });
  if (search.value.trim()) params.set('search', search.value.trim());

  try {
    const response = await apiFetch(`/moments?${params.toString()}`, {}, auth.token);
    const data = await response.json() as MomentItem[];
    if (version !== requestVersion) return;
    items.value = data;
    total.value = Number(response.headers.get('X-WP-Total')) || data.length;
    totalPages.value = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1);
  } catch (error) {
    if (version !== requestVersion) return;
    items.value = [];
    message.error(error instanceof ApiError ? error.message : t('moments.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function handleSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadMoments();
  }, 300);
}

function changePage(nextPage: number) {
  page.value = nextPage;
  loadMoments();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openEditor(item?: MomentItem) {
  activeMoment.value = item || null;
  Object.assign(form, {
    content: item?.content.raw || '',
    status: item?.status === 'publish' ? 'publish' : 'draft',
    mediaText: (item?.media_urls || []).join('\n'),
  });
  editorOpen.value = true;
}

async function saveMoment() {
  if (!form.content.trim()) {
    message.warning(t('moments.contentRequired'));
    return;
  }
  saving.value = true;
  try {
    await apiFetch(activeMoment.value ? `/moments/${activeMoment.value.id}` : '/moments', {
      method: activeMoment.value ? 'PUT' : 'POST',
      body: JSON.stringify({
        content: form.content.trim(),
        status: form.status,
        media_urls: formMediaUrls.value,
      }),
    }, auth.token);
    message.success(t(activeMoment.value ? 'moments.updated' : 'moments.created'));
    editorOpen.value = false;
    if (!activeMoment.value) page.value = 1;
    await loadMoments();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('moments.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function mutateMoment(item: MomentItem, action: 'trash' | 'restore' | 'delete') {
  actionId.value = item.id;
  try {
    if (action === 'restore') {
      await apiFetch(`/moments/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'draft' }),
      }, auth.token);
    } else {
      await apiFetch(`/moments/${item.id}${action === 'delete' ? '?force=true' : ''}`, {
        method: 'DELETE',
      }, auth.token);
    }
    message.success(t(`moments.${action}Success`));
    if (items.value.length === 1 && page.value > 1) page.value -= 1;
    await loadMoments();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('moments.actionFailed'));
  } finally {
    actionId.value = null;
  }
}

function removeMedia(url: string) {
  form.mediaText = formMediaUrls.value.filter((item) => item !== url).join('\n');
}

function mediaTitle(item: MediaItem) {
  return item.title.rendered || item.media_details.file || t('media.untitled');
}

async function loadMedia() {
  mediaLoading.value = true;
  const params = new URLSearchParams({ per_page: '48', media_type: 'image' });
  if (mediaSearch.value.trim()) params.set('search', mediaSearch.value.trim());
  try {
    const response = await apiFetch(`/media?${params.toString()}`, {}, auth.token);
    mediaItems.value = await response.json() as MediaItem[];
    mediaTotal.value = Number(response.headers.get('X-WP-Total')) || mediaItems.value.length;
  } catch (error) {
    mediaItems.value = [];
    message.error(error instanceof ApiError ? error.message : t('moments.mediaLoadFailed'));
  } finally {
    mediaLoading.value = false;
  }
}

function openMedia() {
  mediaSearch.value = '';
  mediaOpen.value = true;
  loadMedia();
}

function toggleMedia(item: MediaItem) {
  const urls = formMediaUrls.value;
  form.mediaText = (urls.includes(item.source_url)
    ? urls.filter((url) => url !== item.source_url)
    : [...urls, item.source_url]).join('\n');
}

function openComments() {
  router.push({ path: '/comments', query: { source: 'moments' } });
}

watch(status, () => {
  page.value = 1;
  loadMoments();
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>

<template>
  <section class="moments-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('moments.manage') }}</p>
        <h1>{{ t('moments.title') }}</h1>
        <p class="view-description">{{ t('moments.description') }}</p>
      </div>
      <NButton type="primary" @click="openEditor()">
        <template #icon><NIcon><Plus /></NIcon></template>
        {{ t('moments.addNew') }}
      </NButton>
    </header>

    <div class="moments-toolbar">
      <NInput
        v-model:value="search"
        clearable
        :placeholder="t('moments.searchPlaceholder')"
        :input-props="{ type: 'search', autocomplete: 'off' }"
        @input="handleSearchInput"
        @clear="handleSearchInput"
      >
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>
      <NSelect v-model:value="status" :options="statusOptions" :aria-label="t('moments.filterStatus')" />
      <span class="content-count">{{ t('moments.total').replace('{count}', String(total)) }}</span>
    </div>

    <NSpin :show="loading">
      <div v-if="items.length" class="moments-list">
        <article v-for="item in items" :key="item.id" class="moment-row">
          <header class="moment-row-header">
            <div class="moment-author">
              <NAvatar round :size="38" :src="item.author_avatar || undefined">
                {{ item.author_name?.slice(0, 1).toUpperCase() || '?' }}
              </NAvatar>
              <div>
                <strong>{{ item.author_name || t('moments.unknownAuthor') }}</strong>
                <time :datetime="item.modified || item.date">{{ formatDate(item.modified || item.date) }}</time>
              </div>
            </div>
            <NTag size="small" :type="statusType(item.status)" :bordered="false">
              {{ statusLabel(item.status) }}
            </NTag>
          </header>

          <p class="moment-content">{{ cleanText(item.content.rendered) }}</p>

          <div v-if="item.media_urls.length" class="moment-media-strip">
            <img
              v-for="url in item.media_urls.slice(0, 3)"
              :key="url"
              :src="url"
              :alt="t('moments.mediaPreview')"
              loading="lazy"
            />
            <span v-if="item.media_urls.length > 3">+{{ item.media_urls.length - 3 }}</span>
          </div>

          <footer class="moment-row-footer">
            <div class="moment-metrics">
              <span><Eye :size="15" />{{ item.view_count || 0 }}</span>
              <span><Heart :size="15" />{{ item.like_count || 0 }}</span>
              <span><MessageSquare :size="15" />{{ item.comment_count || 0 }}</span>
            </div>
            <div class="moment-actions">
              <NButton quaternary size="small" class="moment-action" @click="openComments">
                <template #icon><NIcon><MessageSquare /></NIcon></template>
                {{ t('moments.comments') }}
              </NButton>
              <NButton v-if="item.status !== 'trash' && canManage(item)" quaternary size="small" class="moment-action" @click="openEditor(item)">
                <template #icon><NIcon><Edit3 /></NIcon></template>
                {{ t('moments.edit') }}
              </NButton>
              <NPopconfirm
                v-if="item.status !== 'trash' && canManage(item)"
                :positive-text="t('moments.confirm')"
                :negative-text="t('content.cancel')"
                @positive-click="mutateMoment(item, 'trash')"
              >
                <template #trigger>
                  <NButton quaternary size="small" type="error" class="moment-action" :loading="actionId === item.id">
                    <template #icon><NIcon><Trash2 /></NIcon></template>
                    {{ t('moments.trash') }}
                  </NButton>
                </template>
                {{ t('moments.trashConfirm') }}
              </NPopconfirm>
              <NButton v-if="item.status === 'trash' && canManage(item)" quaternary size="small" class="moment-action" :loading="actionId === item.id" @click="mutateMoment(item, 'restore')">
                <template #icon><NIcon><RotateCcw /></NIcon></template>
                {{ t('moments.restore') }}
              </NButton>
              <NPopconfirm
                v-if="item.status === 'trash' && canManage(item)"
                :positive-text="t('moments.deleteForever')"
                :negative-text="t('content.cancel')"
                @positive-click="mutateMoment(item, 'delete')"
              >
                <template #trigger>
                  <NButton quaternary size="small" type="error" class="moment-action" :loading="actionId === item.id">
                    <template #icon><NIcon><Trash2 /></NIcon></template>
                    {{ t('moments.deleteForever') }}
                  </NButton>
                </template>
                {{ t('moments.deleteConfirm') }}
              </NPopconfirm>
            </div>
          </footer>
        </article>
      </div>

      <NEmpty v-else-if="!loading" class="content-empty" :description="search || status !== 'all' ? t('moments.noResults') : t('moments.empty')">
        <template #icon><NIcon><UserRound /></NIcon></template>
        <template #extra><NButton secondary @click="openEditor()">{{ t('moments.addFirst') }}</NButton></template>
      </NEmpty>
    </NSpin>

    <footer v-if="totalPages > 1" class="content-pagination">
      <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
      <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
      <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
    </footer>

    <NDrawer v-model:show="editorOpen" placement="right" width="min(600px, 100vw)">
      <NDrawerContent :title="activeMoment ? t('moments.editTitle') : t('moments.createTitle')" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top" size="large" @submit.prevent="saveMoment">
          <NFormItem :label="t('moments.content')" required>
            <NInput v-model:value="form.content" type="textarea" :rows="9" :placeholder="t('moments.contentPlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('moments.status')">
            <NSelect v-model:value="form.status" :options="editorStatusOptions" />
          </NFormItem>
          <NFormItem :label="t('moments.mediaUrls')">
            <NInput v-model:value="form.mediaText" type="textarea" :rows="4" :placeholder="t('moments.mediaPlaceholder')" />
          </NFormItem>
          <NButton secondary class="moment-media-button" @click="openMedia">
            <template #icon><NIcon><ImageIcon /></NIcon></template>
            {{ t('moments.chooseMedia') }}
          </NButton>
          <div v-if="formMediaUrls.length" class="moment-form-media">
            <figure v-for="url in formMediaUrls" :key="url">
              <img :src="url" :alt="t('moments.mediaPreview')" loading="lazy" />
              <NButton quaternary circle type="error" :aria-label="t('moments.removeMedia')" :title="t('moments.removeMedia')" @click="removeMedia(url)">
                <template #icon><NIcon><X /></NIcon></template>
              </NButton>
            </figure>
          </div>
          <div class="moment-drawer-actions">
            <NButton @click="editorOpen = false">{{ t('content.cancel') }}</NButton>
            <NButton type="primary" attr-type="submit" :loading="saving" :disabled="!form.content.trim()">
              {{ activeMoment ? t('moments.saveChanges') : t('moments.create') }}
            </NButton>
          </div>
        </NForm>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="mediaOpen" placement="right" width="min(720px, 100vw)">
      <NDrawerContent :title="t('moments.chooseMedia')" closable :native-scrollbar="false">
        <div class="editor-media-toolbar">
          <NInput v-model:value="mediaSearch" clearable :placeholder="t('media.searchPlaceholder')" @clear="loadMedia" @keydown.enter.prevent="loadMedia">
            <template #prefix><NIcon><Search /></NIcon></template>
          </NInput>
          <NButton secondary :loading="mediaLoading" @click="loadMedia">{{ t('editor.search') }}</NButton>
          <span>{{ t('media.total').replace('{count}', String(mediaTotal)) }}</span>
        </div>
        <NSpin :show="mediaLoading">
          <div v-if="mediaItems.length" class="editor-media-grid">
            <button
              v-for="item in mediaItems"
              :key="item.id"
              type="button"
              class="editor-media-item moment-media-choice"
              :class="{ selected: formMediaUrls.includes(item.source_url) }"
              @click="toggleMedia(item)"
            >
              <img :src="item.source_url" :alt="item.alt_text || mediaTitle(item)" loading="lazy" />
              <span>{{ mediaTitle(item) }}</span>
              <span class="moment-media-check" aria-hidden="true"><Check :size="15" /></span>
            </button>
          </div>
          <NEmpty v-else-if="!mediaLoading" class="editor-media-empty" :description="t('editor.noImages')" />
        </NSpin>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
