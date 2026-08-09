<script setup lang="ts">
import { ArrowLeft, Image as ImageIcon, Plus, Save, Search, X } from '@lucide/vue';
import {
  NButton,
  NDatePicker,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui';
import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ApiError, apiFetch, apiJson } from '../api/client';
import MarkdownEditor from '../components/MarkdownEditor.vue';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type ContentKind = 'posts' | 'pages';
type ContentStatus = 'publish' | 'draft' | 'pending' | 'private';
type MediaMode = 'content' | 'featured';

interface TermItem {
  id: number;
  name: string;
  parent?: number;
}

interface EditorContent {
  id: number;
  date: string;
  slug: string;
  status: ContentStatus;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_image_url?: string;
  comment_status?: 'open' | 'closed';
  sticky?: boolean;
  categories?: number[];
  tags?: number[];
  parent?: number;
  menu_hidden?: boolean;
  menu_priority?: number;
}

interface MediaItem {
  id: number;
  title: { rendered: string };
  alt_text: string;
  media_type: string;
  source_url: string;
  media_details: { file: string };
}

const props = defineProps<{ kind: ContentKind }>();
const auth = useAuthStore();
const message = useMessage();
const route = useRoute();
const router = useRouter();
const { t } = useAdminI18n();
const loading = ref(true);
const saving = ref(false);
const dependencyLoading = ref(false);
const creatingTag = ref(false);
const mediaLoading = ref(false);
const mediaOpen = ref(false);
const mediaMode = ref<MediaMode>('content');
const mediaItems = ref<MediaItem[]>([]);
const mediaSearch = ref('');
const mediaTotal = ref(0);
const categories = ref<TermItem[]>([]);
const tags = ref<TermItem[]>([]);
const parentPages = ref<EditorContent[]>([]);
const newTagName = ref('');
const markdownEditor = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const savedSnapshot = ref('');
let requestVersion = 0;
let allowLeave = false;

const form = reactive({
  title: '',
  slug: '',
  content: '',
  excerpt: '',
  status: 'draft' as ContentStatus,
  commentStatus: 'open' as 'open' | 'closed',
  sticky: false,
  publishDate: null as number | null,
  categories: [] as number[],
  tags: [] as number[],
  featuredImageUrl: '',
  parent: 0,
  menuHidden: false,
  menuPriority: 0,
});

const isPost = computed(() => props.kind === 'posts');
const contentId = computed(() => {
  const id = Number(route.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
});
const isEditing = computed(() => contentId.value !== null);
const pageTitle = computed(() => t(isEditing.value
  ? (isPost.value ? 'editor.editPost' : 'editor.editPage')
  : (isPost.value ? 'editor.createPost' : 'editor.createPage')));
const listRoute = computed(() => isPost.value ? '/posts' : '/pages');
const statusOptions = computed(() => {
  const role = auth.user?.role || '';
  const canPublish = isPost.value
    ? ['administrator', 'editor', 'author'].includes(role)
    : ['administrator', 'editor'].includes(role);
  const options = [
    { label: t('content.statusDraft'), value: 'draft' },
    { label: t('content.statusPending'), value: 'pending' },
    { label: t('content.statusPrivate'), value: 'private' },
  ];
  if (canPublish || form.status === 'publish') {
    options.unshift({ label: t('content.statusPublish'), value: 'publish' });
  }
  return options;
});
const categoryOptions = computed(() => categories.value.map((item) => ({ label: item.name, value: item.id })));
const tagOptions = computed(() => tags.value.map((item) => ({ label: item.name, value: item.id })));
const parentOptions = computed(() => [
  { label: t('editor.noParent'), value: 0 },
  ...parentPages.value
    .filter((item) => item.id !== contentId.value)
    .map((item) => ({ label: item.title.rendered || t('content.untitled'), value: item.id })),
]);
const commentOptions = computed(() => [
  { label: t('content.statusOpen'), value: 'open' },
  { label: t('content.statusClosed'), value: 'closed' },
]);
const snapshot = computed(() => JSON.stringify({ ...form }));
const dirty = computed(() => !loading.value && savedSnapshot.value !== snapshot.value);

function resetForm() {
  Object.assign(form, {
    title: '', slug: '', content: '', excerpt: '', status: 'draft', commentStatus: 'open',
    sticky: false, publishDate: null, categories: [], tags: [], featuredImageUrl: '', parent: 0,
    menuHidden: false, menuPriority: 0,
  });
}

function applyContent(data: EditorContent) {
  Object.assign(form, {
    title: data.title.rendered || '',
    slug: data.slug || '',
    content: data.content.rendered || '',
    excerpt: data.excerpt.rendered || '',
    status: data.status || 'draft',
    commentStatus: data.comment_status || 'open',
    sticky: Boolean(data.sticky),
    publishDate: data.status === 'publish' && data.date ? Date.parse(data.date) : null,
    categories: data.categories || [],
    tags: data.tags || [],
    featuredImageUrl: data.featured_image_url || '',
    parent: data.parent || 0,
    menuHidden: Boolean(data.menu_hidden),
    menuPriority: Number(data.menu_priority || 0),
  });
}

async function loadDependencies() {
  dependencyLoading.value = true;
  try {
    if (isPost.value) {
      const [categoryData, tagData] = await Promise.all([
        apiJson<TermItem[]>('/categories?per_page=100', {}, auth.token),
        apiJson<TermItem[]>('/tags?per_page=100', {}, auth.token),
      ]);
      categories.value = categoryData;
      tags.value = tagData;
      return;
    }
    parentPages.value = await apiJson<EditorContent[]>('/pages?per_page=100&status=all', {}, auth.token);
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('editor.dependenciesFailed'));
  } finally {
    dependencyLoading.value = false;
  }
}

async function initializeEditor() {
  const version = ++requestVersion;
  loading.value = true;
  resetForm();
  categories.value = [];
  tags.value = [];
  parentPages.value = [];
  try {
    const requests: Promise<unknown>[] = [loadDependencies()];
    if (contentId.value) requests.push(apiJson<EditorContent>(`/${props.kind}/${contentId.value}`, {}, auth.token));
    const results = await Promise.all(requests);
    if (version !== requestVersion) return;
    if (contentId.value) applyContent(results[1] as EditorContent);
    if (isPost.value && !contentId.value && !form.categories.length) {
      const defaultCategory = categories.value.find((item) => item.id === 1) || categories.value[0];
      if (defaultCategory) form.categories = [defaultCategory.id];
    }
    savedSnapshot.value = snapshot.value;
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('editor.loadFailed'));
    allowLeave = true;
    await router.replace(listRoute.value);
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

async function saveContent() {
  if (!form.title.trim()) {
    message.warning(t('editor.titleRequired'));
    return;
  }
  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      content: form.content,
      excerpt: form.excerpt,
      status: form.status,
    };
    if (form.slug.trim() || isEditing.value) payload.slug = form.slug.trim();

    if (isPost.value) {
      const defaultCategory = categories.value.find((item) => item.id === 1) || categories.value[0];
      payload.categories = form.categories.length ? form.categories : defaultCategory ? [defaultCategory.id] : [];
      payload.tags = form.tags;
      payload.sticky = form.sticky;
      payload.featured_image_url = form.featuredImageUrl.trim() || null;
      if (form.publishDate) payload.date = new Date(form.publishDate).toISOString();
    } else {
      payload.parent = form.parent;
      payload.comment_status = form.commentStatus;
      payload.menu_hidden = form.menuHidden;
      payload.menu_priority = form.menuPriority;
    }

    const response = await apiFetch(contentId.value ? `/${props.kind}/${contentId.value}` : `/${props.kind}`, {
      method: contentId.value ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }, auth.token);
    const data = await response.json() as EditorContent;
    applyContent(data);
    savedSnapshot.value = snapshot.value;
    message.success(t(contentId.value ? 'editor.updated' : 'editor.created'));

    if (!contentId.value) {
      allowLeave = true;
      await router.replace({ name: isPost.value ? 'post-edit' : 'page-edit', params: { id: data.id } });
    }
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('editor.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function createTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  creatingTag.value = true;
  try {
    const tag = await apiJson<TermItem>('/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, auth.token);
    tags.value = [...tags.value, tag].sort((a, b) => a.name.localeCompare(b.name));
    form.tags = [...form.tags, tag.id];
    newTagName.value = '';
    message.success(t('editor.tagCreated'));
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('editor.tagCreateFailed'));
  } finally {
    creatingTag.value = false;
  }
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
    message.error(error instanceof ApiError ? error.message : t('editor.mediaLoadFailed'));
  } finally {
    mediaLoading.value = false;
  }
}

function openMedia(mode: MediaMode) {
  mediaMode.value = mode;
  mediaSearch.value = '';
  mediaOpen.value = true;
  loadMedia();
}

function chooseMedia(item: MediaItem) {
  if (mediaMode.value === 'featured') {
    form.featuredImageUrl = item.source_url;
  } else {
    const alt = item.alt_text || item.title.rendered || item.media_details.file || '';
    markdownEditor.value?.insertText(`![${alt}](${item.source_url})`);
  }
  mediaOpen.value = false;
}

function mediaTitle(item: MediaItem) {
  return item.title.rendered || item.media_details.file || t('media.untitled');
}

function goBack() {
  router.push(listRoute.value);
}

watch([() => props.kind, () => route.params.id], initializeEditor, { immediate: true });

onBeforeRouteLeave(() => {
  if (!allowLeave && dirty.value && !window.confirm(t('editor.unsavedConfirm'))) return false;
  allowLeave = false;
  return true;
});
</script>

<template>
  <section class="content-editor-view">
    <header class="editor-view-header">
      <div class="editor-heading-group">
        <NButton quaternary circle class="editor-back" :aria-label="t('editor.back')" :title="t('editor.back')" @click="goBack">
          <template #icon><NIcon><ArrowLeft /></NIcon></template>
        </NButton>
        <div>
          <div class="editor-title-line">
            <h1>{{ pageTitle }}</h1>
            <NTag v-if="dirty" size="small" :bordered="false" type="warning">{{ t('editor.unsaved') }}</NTag>
          </div>
          <p>{{ isPost ? t('editor.postEyebrow') : t('editor.pageEyebrow') }}</p>
        </div>
      </div>
      <div class="editor-header-actions">
        <NButton @click="goBack">{{ t('content.cancel') }}</NButton>
        <NButton type="primary" :loading="saving" :disabled="loading || !form.title.trim()" @click="saveContent">
          <template #icon><NIcon><Save /></NIcon></template>
          {{ isEditing ? t('editor.saveChanges') : t('editor.create') }}
        </NButton>
      </div>
    </header>

    <NSpin :show="loading">
      <NForm v-if="!loading" :model="form" label-placement="top" @submit.prevent="saveContent">
        <div class="editor-layout">
          <main class="editor-main-surface">
            <NFormItem :label="t('editor.title')" required>
              <NInput v-model:value="form.title" size="large" class="editor-title-input" :placeholder="t(isPost ? 'editor.postTitlePlaceholder' : 'editor.pageTitlePlaceholder')" />
            </NFormItem>
            <NFormItem :label="t('editor.slug')">
              <div class="editor-slug-field">
                <span>/</span>
                <NInput v-model:value="form.slug" :placeholder="t('editor.slugPlaceholder')" />
              </div>
            </NFormItem>
            <NFormItem :label="t('editor.content')">
              <MarkdownEditor
                ref="markdownEditor"
                v-model="form.content"
                :placeholder="t(isPost ? 'editor.postContentPlaceholder' : 'editor.pageContentPlaceholder')"
                :allow-media="isPost"
                @request-media="openMedia('content')"
              />
            </NFormItem>
            <NFormItem :label="t('editor.excerpt')">
              <NInput v-model:value="form.excerpt" type="textarea" :rows="4" :placeholder="t('editor.excerptPlaceholder')" />
            </NFormItem>
          </main>

          <aside class="editor-sidebar-surface">
            <section class="editor-sidebar-section">
              <h2>{{ t('editor.publishing') }}</h2>
              <NFormItem :label="t('editor.status')">
                <NSelect v-model:value="form.status" :options="statusOptions" />
              </NFormItem>
              <NFormItem v-if="isPost" :label="t('editor.publishDate')">
                <NDatePicker v-model:value="form.publishDate" type="datetime" clearable />
              </NFormItem>
              <NFormItem v-if="!isPost" :label="t('editor.parentPage')">
                <NSelect v-model:value="form.parent" filterable :options="parentOptions" />
              </NFormItem>
              <NFormItem v-if="!isPost" :label="t('editor.commentStatus')">
                <NSelect v-model:value="form.commentStatus" :options="commentOptions" />
              </NFormItem>
              <div v-if="isPost" class="editor-switch-row">
                <div>
                  <strong>{{ t('editor.sticky') }}</strong>
                  <small>{{ form.sticky ? t('editor.enabled') : t('editor.disabled') }}</small>
                </div>
                <NSwitch v-model:value="form.sticky" />
              </div>
            </section>

            <section v-if="!isPost" class="editor-sidebar-section">
              <h2>{{ t('editor.menuSettings') }}</h2>
              <div class="editor-switch-row">
                <div>
                  <strong>{{ t('editor.hideFromMenu') }}</strong>
                  <small>{{ form.menuHidden ? t('editor.menuHidden') : t('editor.menuVisible') }}</small>
                </div>
                <NSwitch v-model:value="form.menuHidden" />
              </div>
              <NFormItem :label="t('editor.menuPriority')" :feedback="t('editor.menuPriorityHint')">
                <NInputNumber v-model:value="form.menuPriority" :min="0" :max="9999" :step="1" />
              </NFormItem>
            </section>

            <section v-if="isPost" class="editor-sidebar-section">
              <h2>{{ t('editor.organization') }}</h2>
              <NFormItem :label="t('editor.categories')">
                <NSelect v-model:value="form.categories" multiple filterable :options="categoryOptions" :loading="dependencyLoading" />
              </NFormItem>
              <NFormItem :label="t('editor.tags')">
                <NSelect v-model:value="form.tags" multiple filterable :options="tagOptions" :loading="dependencyLoading" />
              </NFormItem>
              <div class="editor-inline-create">
                <NInput v-model:value="newTagName" :placeholder="t('editor.newTag')" @keydown.enter.prevent="createTag" />
                <NButton secondary circle :loading="creatingTag" :disabled="!newTagName.trim()" :aria-label="t('editor.addTag')" :title="t('editor.addTag')" @click="createTag">
                  <template #icon><NIcon><Plus /></NIcon></template>
                </NButton>
              </div>
            </section>

            <section v-if="isPost" class="editor-sidebar-section">
              <h2>{{ t('editor.featuredImage') }}</h2>
              <div v-if="form.featuredImageUrl" class="editor-featured-preview">
                <img :src="form.featuredImageUrl" :alt="t('editor.featuredImage')" />
                <NButton quaternary circle type="error" :aria-label="t('editor.removeImage')" :title="t('editor.removeImage')" @click="form.featuredImageUrl = ''">
                  <template #icon><NIcon><X /></NIcon></template>
                </NButton>
              </div>
              <NInput v-model:value="form.featuredImageUrl" :placeholder="t('editor.imageUrlPlaceholder')" :input-props="{ type: 'url' }" />
              <NButton secondary class="editor-media-button" @click="openMedia('featured')">
                <template #icon><NIcon><ImageIcon /></NIcon></template>
                {{ t('editor.chooseMedia') }}
              </NButton>
            </section>
          </aside>
        </div>
      </NForm>
    </NSpin>

    <NDrawer v-model:show="mediaOpen" placement="right" width="min(720px, 100vw)">
      <NDrawerContent :title="mediaMode === 'featured' ? t('editor.chooseFeatured') : t('editor.insertMedia')" closable :native-scrollbar="false">
        <div class="editor-media-toolbar">
          <NInput v-model:value="mediaSearch" clearable :placeholder="t('media.searchPlaceholder')" @clear="loadMedia" @keydown.enter.prevent="loadMedia">
            <template #prefix><NIcon><Search /></NIcon></template>
          </NInput>
          <NButton secondary :loading="mediaLoading" @click="loadMedia">{{ t('editor.search') }}</NButton>
          <span>{{ t('media.total').replace('{count}', String(mediaTotal)) }}</span>
        </div>
        <NSpin :show="mediaLoading">
          <div v-if="mediaItems.length" class="editor-media-grid">
            <button v-for="item in mediaItems" :key="item.id" type="button" class="editor-media-item" @click="chooseMedia(item)">
              <img :src="item.source_url" :alt="item.alt_text || mediaTitle(item)" loading="lazy" />
              <span>{{ mediaTitle(item) }}</span>
            </button>
          </div>
          <NEmpty v-else-if="!mediaLoading" class="editor-media-empty" :description="t('editor.noImages')" />
        </NSpin>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
