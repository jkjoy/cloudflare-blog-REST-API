<script setup lang="ts">
import {
  Clipboard,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Info,
  Search,
  Trash2,
  UploadCloud,
} from '@lucide/vue';
import {
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
  useMessage,
} from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ApiError, apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

interface MediaItem {
  id: number;
  date: string;
  title: { rendered: string };
  caption: { rendered: string };
  description: { rendered: string };
  alt_text: string;
  media_type: string;
  mime_type: string;
  source_url: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    filesize: number;
  };
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const auth = useAuthStore();
const message = useMessage();
const { isChinese, t } = useAdminI18n();
const items = ref<MediaItem[]>([]);
const loading = ref(false);
const uploading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const uploadOpen = ref(false);
const detailOpen = ref(false);
const activeItem = ref<MediaItem | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref('');
const search = ref('');
const mediaType = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const perPage = 24;
const uploadForm = reactive({ title: '', altText: '', caption: '', description: '' });
const detailForm = reactive({ title: '', altText: '', caption: '', description: '' });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const filterOptions = computed(() => [
  { label: t('media.allTypes'), value: '' },
  { label: t('media.images'), value: 'image' },
  { label: t('media.videos'), value: 'video' },
  { label: t('media.documents'), value: 'file' },
]);

function cleanRendered(value = '') {
  return value.replace(/<[^>]*>/g, '').trim();
}

function itemTitle(item: MediaItem) {
  return cleanRendered(item.title.rendered) || item.media_details.file || t('media.untitled');
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(isChinese.value ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function mediaIcon(item: MediaItem) {
  if (item.media_type === 'video') return Film;
  if (item.media_type === 'image') return ImageIcon;
  return FileText;
}

async function loadMedia() {
  const version = ++requestVersion;
  loading.value = true;
  const params = new URLSearchParams({
    page: String(page.value),
    per_page: String(perPage),
  });
  if (search.value.trim()) params.set('search', search.value.trim());
  if (mediaType.value) params.set('media_type', mediaType.value);

  try {
    const response = await apiFetch(`/media?${params.toString()}`, {}, auth.token);
    const data = await response.json() as MediaItem[];
    if (version !== requestVersion) return;
    items.value = data;
    total.value = Number(response.headers.get('X-WP-Total')) || data.length;
    totalPages.value = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1);
  } catch (error) {
    if (version !== requestVersion) return;
    items.value = [];
    message.error(error instanceof ApiError ? error.message : t('media.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function handleSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadMedia();
  }, 300);
}

function handleTypeChange() {
  page.value = 1;
  loadMedia();
}

function changePage(nextPage: number) {
  page.value = nextPage;
  loadMedia();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

function resetUpload() {
  revokePreview();
  selectedFile.value = null;
  Object.assign(uploadForm, { title: '', altText: '', caption: '', description: '' });
}

function openUpload() {
  resetUpload();
  uploadOpen.value = true;
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;
  revokePreview();
  selectedFile.value = file;
  if (!file) return;
  if (file.size > MAX_UPLOAD_BYTES) {
    selectedFile.value = null;
    input.value = '';
    message.error(t('media.fileTooLarge'));
    return;
  }
  uploadForm.title = file.name.replace(/\.[^/.]+$/, '');
  if (file.type.startsWith('image/')) previewUrl.value = URL.createObjectURL(file);
}

async function uploadMedia() {
  if (!selectedFile.value || !uploadForm.title.trim()) return;
  uploading.value = true;
  const formData = new FormData();
  formData.set('file', selectedFile.value);
  formData.set('title', uploadForm.title.trim());
  formData.set('alt_text', uploadForm.altText.trim());
  formData.set('caption', uploadForm.caption.trim());
  formData.set('description', uploadForm.description.trim());

  try {
    await apiFetch('/media', { method: 'POST', body: formData }, auth.token);
    message.success(t('media.uploaded'));
    uploadOpen.value = false;
    resetUpload();
    page.value = 1;
    await loadMedia();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('media.uploadFailed'));
  } finally {
    uploading.value = false;
  }
}

function openDetails(item: MediaItem) {
  activeItem.value = item;
  Object.assign(detailForm, {
    title: itemTitle(item),
    altText: item.alt_text || '',
    caption: cleanRendered(item.caption.rendered),
    description: cleanRendered(item.description.rendered),
  });
  detailOpen.value = true;
}

async function saveDetails() {
  if (!activeItem.value || !detailForm.title.trim()) return;
  saving.value = true;
  try {
    const updated = await (await apiFetch(`/media/${activeItem.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: detailForm.title.trim(),
        alt_text: detailForm.altText.trim(),
        caption: detailForm.caption.trim(),
        description: detailForm.description.trim(),
      }),
    }, auth.token)).json() as MediaItem;
    activeItem.value = updated;
    const index = items.value.findIndex((item) => item.id === updated.id);
    if (index >= 0) items.value[index] = updated;
    message.success(t('media.updated'));
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('media.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function copyUrl() {
  if (!activeItem.value) return;
  try {
    await navigator.clipboard.writeText(activeItem.value.source_url);
    message.success(t('media.urlCopied'));
  } catch {
    message.error(t('media.copyFailed'));
  }
}

function openSource() {
  if (activeItem.value) window.open(activeItem.value.source_url, '_blank', 'noopener,noreferrer');
}

async function deleteMedia() {
  if (!activeItem.value) return;
  deleting.value = true;
  try {
    await apiFetch(`/media/${activeItem.value.id}?force=true`, { method: 'DELETE' }, auth.token);
    message.success(t('media.deleted'));
    detailOpen.value = false;
    activeItem.value = null;
    if (items.value.length === 1 && page.value > 1) page.value -= 1;
    await loadMedia();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('media.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

watch(uploadOpen, (open) => {
  if (!open && !uploading.value) resetUpload();
});
onMounted(loadMedia);
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  revokePreview();
});
</script>

<template>
  <section class="media-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('media.manage') }}</p>
        <h1>{{ t('media.title') }}</h1>
        <p class="view-description">{{ t('media.description') }}</p>
      </div>
      <NButton type="primary" @click="openUpload">
        <template #icon><NIcon><UploadCloud /></NIcon></template>
        {{ t('media.upload') }}
      </NButton>
    </header>

    <div class="media-toolbar">
      <NInput
        v-model:value="search"
        clearable
        :placeholder="t('media.searchPlaceholder')"
        :input-props="{ type: 'search', autocomplete: 'off' }"
        @input="handleSearchInput"
        @clear="handleSearchInput"
      >
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>
      <NSelect v-model:value="mediaType" :options="filterOptions" @update:value="handleTypeChange" />
      <span class="content-count">{{ t('media.total').replace('{count}', String(total)) }}</span>
    </div>

    <NSpin :show="loading">
      <div v-if="items.length" class="media-grid">
        <button v-for="item in items" :key="item.id" type="button" class="media-card" @click="openDetails(item)">
          <span class="media-thumbnail">
            <img
              v-if="item.media_type === 'image'"
              :src="item.source_url"
              :alt="item.alt_text || itemTitle(item)"
              loading="lazy"
            >
            <span v-else class="media-file-icon">
              <component :is="mediaIcon(item)" :size="34" stroke-width="1.6" />
              <small>{{ item.mime_type }}</small>
            </span>
            <span class="media-card-inspect" aria-hidden="true"><Info :size="17" /></span>
          </span>
          <span class="media-card-copy">
            <strong :title="itemTitle(item)">{{ itemTitle(item) }}</strong>
            <small>{{ formatFileSize(item.media_details.filesize) }} · {{ formatDate(item.date) }}</small>
          </span>
        </button>
      </div>
      <NEmpty
        v-else-if="!loading"
        class="content-empty"
        :description="search || mediaType ? t('media.noResults') : t('media.empty')"
      >
        <template #extra><NButton secondary @click="openUpload">{{ t('media.uploadFirst') }}</NButton></template>
      </NEmpty>
    </NSpin>

    <footer v-if="totalPages > 1" class="content-pagination">
      <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
      <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
      <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
    </footer>

    <NDrawer v-model:show="uploadOpen" placement="right" width="min(480px, 100vw)">
      <NDrawerContent :title="t('media.uploadTitle')" closable :native-scrollbar="false">
        <NForm :model="uploadForm" label-placement="top" size="large" @submit.prevent="uploadMedia">
          <NFormItem :label="t('media.file')" required>
            <label class="media-file-picker">
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,application/pdf" @change="selectFile">
              <UploadCloud :size="28" stroke-width="1.6" />
              <strong>{{ selectedFile?.name || t('media.chooseFile') }}</strong>
              <small>{{ selectedFile ? formatFileSize(selectedFile.size) : t('media.fileHint') }}</small>
            </label>
          </NFormItem>
          <div v-if="previewUrl" class="media-upload-preview">
            <img :src="previewUrl" :alt="uploadForm.altText || uploadForm.title">
          </div>
          <NFormItem :label="t('media.name')" required>
            <NInput v-model:value="uploadForm.title" :placeholder="t('media.namePlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('media.altText')">
            <NInput v-model:value="uploadForm.altText" :placeholder="t('media.altPlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('media.caption')">
            <NInput v-model:value="uploadForm.caption" :placeholder="t('media.captionPlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('media.itemDescription')">
            <NInput v-model:value="uploadForm.description" type="textarea" :rows="3" :placeholder="t('media.descriptionPlaceholder')" />
          </NFormItem>
          <div class="media-drawer-actions">
            <NButton @click="uploadOpen = false">{{ t('content.cancel') }}</NButton>
            <NButton type="primary" attr-type="submit" :loading="uploading" :disabled="!selectedFile || !uploadForm.title.trim()">
              {{ t('media.upload') }}
            </NButton>
          </div>
        </NForm>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="detailOpen" placement="right" width="min(560px, 100vw)">
      <NDrawerContent :title="t('media.detailsTitle')" closable :native-scrollbar="false">
        <template v-if="activeItem">
          <div class="media-detail-preview">
            <img
              v-if="activeItem.media_type === 'image'"
              :src="activeItem.source_url"
              :alt="activeItem.alt_text || itemTitle(activeItem)"
            >
            <video v-else-if="activeItem.media_type === 'video'" :src="activeItem.source_url" controls />
            <span v-else class="media-file-icon">
              <FileText :size="42" stroke-width="1.5" />
              <small>{{ activeItem.mime_type }}</small>
            </span>
          </div>

          <dl class="media-metadata">
            <div><dt>{{ t('media.fileName') }}</dt><dd>{{ activeItem.media_details.file }}</dd></div>
            <div><dt>{{ t('media.fileType') }}</dt><dd>{{ activeItem.mime_type }}</dd></div>
            <div><dt>{{ t('media.fileSize') }}</dt><dd>{{ formatFileSize(activeItem.media_details.filesize) }}</dd></div>
            <div><dt>{{ t('media.uploadedAt') }}</dt><dd>{{ formatDate(activeItem.date) }}</dd></div>
            <div v-if="activeItem.media_details.width && activeItem.media_details.height">
              <dt>{{ t('media.dimensions') }}</dt>
              <dd>{{ activeItem.media_details.width }} × {{ activeItem.media_details.height }}</dd>
            </div>
          </dl>

          <div class="media-url-actions">
            <NButton secondary @click="copyUrl">
              <template #icon><NIcon><Clipboard /></NIcon></template>
              {{ t('media.copyUrl') }}
            </NButton>
            <NButton secondary @click="openSource">
              <template #icon><NIcon><ExternalLink /></NIcon></template>
              {{ t('media.openFile') }}
            </NButton>
          </div>

          <NForm :model="detailForm" label-placement="top" size="large" class="media-detail-form" @submit.prevent="saveDetails">
            <NFormItem :label="t('media.name')" required>
              <NInput v-model:value="detailForm.title" />
            </NFormItem>
            <NFormItem :label="t('media.altText')">
              <NInput v-model:value="detailForm.altText" :disabled="activeItem.media_type !== 'image'" />
            </NFormItem>
            <NFormItem :label="t('media.caption')">
              <NInput v-model:value="detailForm.caption" />
            </NFormItem>
            <NFormItem :label="t('media.itemDescription')">
              <NInput v-model:value="detailForm.description" type="textarea" :rows="3" />
            </NFormItem>
            <div class="media-drawer-actions media-detail-actions">
              <NPopconfirm
                :positive-text="t('media.confirmDelete')"
                :negative-text="t('content.cancel')"
                @positive-click="deleteMedia"
              >
                <template #trigger>
                  <NButton type="error" secondary :loading="deleting">
                    <template #icon><NIcon><Trash2 /></NIcon></template>
                    {{ t('media.delete') }}
                  </NButton>
                </template>
                {{ t('media.deleteConfirm') }}
              </NPopconfirm>
              <NButton type="primary" attr-type="submit" :loading="saving" :disabled="!detailForm.title.trim()">
                {{ t('media.saveChanges') }}
              </NButton>
            </div>
          </NForm>
        </template>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
