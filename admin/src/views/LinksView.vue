<script setup lang="ts">
import { ExternalLink, FolderCog, Link2, Pencil, Plus, Search, Trash2 } from '@lucide/vue';
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
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ApiError, apiFetch, apiJson } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

interface LinkCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

interface LinkItem {
  id: number;
  name: string;
  url: string;
  description: string;
  avatar: string;
  category: { id: number; name: string | null; slug: string | null };
  target: '_blank' | '_self';
  visible: 'yes' | 'no';
  rating: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const auth = useAuthStore();
const message = useMessage();
const { t } = useAdminI18n();
const activeTab = ref<'links' | 'categories'>('links');
const links = ref<LinkItem[]>([]);
const categories = ref<LinkCategory[]>([]);
const loading = ref(false);
const categoriesLoading = ref(false);
const saving = ref(false);
const categorySaving = ref(false);
const deletingId = ref<number | null>(null);
const deletingCategoryId = ref<number | null>(null);
const editorOpen = ref(false);
const categoryEditorOpen = ref(false);
const editingId = ref<number | null>(null);
const editingCategoryId = ref<number | null>(null);
const search = ref('');
const visible = ref('all');
const categoryFilter = ref(0);
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const perPage = 20;
const form = reactive({
  name: '',
  url: '',
  description: '',
  avatar: '',
  categoryId: 1,
  target: '_blank' as '_blank' | '_self',
  visible: true,
  sortOrder: 0,
});
const categoryForm = reactive({ name: '', slug: '', description: '' });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const categoryOptions = computed(() => categories.value.map((category) => ({ label: category.name, value: category.id })));
const categoryFilterOptions = computed(() => [
  { label: t('links.allCategories'), value: 0 },
  ...categoryOptions.value,
]);
const visibleOptions = computed(() => [
  { label: t('links.allVisibility'), value: 'all' },
  { label: t('links.visible'), value: 'yes' },
  { label: t('links.hidden'), value: 'no' },
]);
const targetOptions = computed(() => [
  { label: t('links.newWindow'), value: '_blank' },
  { label: t('links.sameWindow'), value: '_self' },
]);
const headerActionLabel = computed(() => activeTab.value === 'links' ? t('links.addLink') : t('links.addCategory'));

async function loadCategories() {
  categoriesLoading.value = true;
  try {
    categories.value = await apiJson<LinkCategory[]>('/link-categories', {}, auth.token);
  } catch (error) {
    categories.value = [];
    message.error(error instanceof ApiError ? error.message : t('links.categoriesLoadFailed'));
  } finally {
    categoriesLoading.value = false;
  }
}

async function loadLinks() {
  const version = ++requestVersion;
  loading.value = true;
  const params = new URLSearchParams({
    page: String(page.value),
    per_page: String(perPage),
    visible: visible.value,
  });
  if (search.value.trim()) params.set('search', search.value.trim());
  if (categoryFilter.value) params.set('category', String(categoryFilter.value));

  try {
    const response = await apiFetch(`/links?${params.toString()}`, {}, auth.token);
    const data = await response.json() as LinkItem[];
    if (version !== requestVersion) return;
    links.value = data;
    total.value = Number(response.headers.get('X-WP-Total')) || data.length;
    totalPages.value = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1);
  } catch (error) {
    if (version !== requestVersion) return;
    links.value = [];
    message.error(error instanceof ApiError ? error.message : t('links.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function handleSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadLinks();
  }, 300);
}

function handleFilterChange() {
  page.value = 1;
  loadLinks();
}

function changePage(nextPage: number) {
  page.value = nextPage;
  loadLinks();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openHeaderAction() {
  if (activeTab.value === 'links') openCreate();
  else openCategoryCreate();
}

function defaultCategoryId() {
  return categories.value.find((category) => category.id === 1)?.id || categories.value[0]?.id || 1;
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    name: '', url: '', description: '', avatar: '', categoryId: defaultCategoryId(),
    target: '_blank', visible: true, sortOrder: 0,
  });
  editorOpen.value = true;
}

function openEdit(item: LinkItem) {
  editingId.value = item.id;
  Object.assign(form, {
    name: item.name,
    url: item.url,
    description: item.description || '',
    avatar: item.avatar || '',
    categoryId: item.category.id || defaultCategoryId(),
    target: item.target,
    visible: item.visible === 'yes',
    sortOrder: item.sort_order || 0,
  });
  editorOpen.value = true;
}

async function saveLink() {
  if (!form.name.trim() || !form.url.trim()) return;
  saving.value = true;
  try {
    await apiFetch(editingId.value ? `/links/${editingId.value}` : '/links', {
      method: editingId.value ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        avatar: form.avatar.trim(),
        category_id: form.categoryId,
        target: form.target,
        visible: form.visible ? 'yes' : 'no',
        sort_order: form.sortOrder || 0,
      }),
    }, auth.token);
    message.success(t(editingId.value ? 'links.updated' : 'links.created'));
    editorOpen.value = false;
    await Promise.all([loadLinks(), loadCategories()]);
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('links.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function deleteLink(item: LinkItem) {
  deletingId.value = item.id;
  try {
    await apiFetch(`/links/${item.id}`, { method: 'DELETE' }, auth.token);
    message.success(t('links.deleted'));
    if (links.value.length === 1 && page.value > 1) page.value -= 1;
    await Promise.all([loadLinks(), loadCategories()]);
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('links.deleteFailed'));
  } finally {
    deletingId.value = null;
  }
}

function openLink(item: LinkItem) {
  window.open(item.url, '_blank', 'noopener,noreferrer');
}

function openCategoryCreate() {
  editingCategoryId.value = null;
  Object.assign(categoryForm, { name: '', slug: '', description: '' });
  categoryEditorOpen.value = true;
}

function openCategoryEdit(category: LinkCategory) {
  editingCategoryId.value = category.id;
  Object.assign(categoryForm, {
    name: category.name,
    slug: category.slug,
    description: category.description || '',
  });
  categoryEditorOpen.value = true;
}

async function saveCategory() {
  if (!categoryForm.name.trim()) return;
  categorySaving.value = true;
  try {
    await apiFetch(editingCategoryId.value ? `/link-categories/${editingCategoryId.value}` : '/link-categories', {
      method: editingCategoryId.value ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: categoryForm.name.trim(),
        slug: categoryForm.slug.trim(),
        description: categoryForm.description.trim(),
      }),
    }, auth.token);
    message.success(t(editingCategoryId.value ? 'links.categoryUpdated' : 'links.categoryCreated'));
    categoryEditorOpen.value = false;
    await Promise.all([loadCategories(), loadLinks()]);
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('links.categorySaveFailed'));
  } finally {
    categorySaving.value = false;
  }
}

async function deleteCategory(category: LinkCategory) {
  deletingCategoryId.value = category.id;
  try {
    await apiFetch(`/link-categories/${category.id}`, { method: 'DELETE' }, auth.token);
    message.success(t('links.categoryDeleted'));
    if (categoryFilter.value === category.id) categoryFilter.value = 0;
    await Promise.all([loadCategories(), loadLinks()]);
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('links.categoryDeleteFailed'));
  } finally {
    deletingCategoryId.value = null;
  }
}

watch(activeTab, (tab) => {
  if (tab === 'categories') loadCategories();
});
onMounted(async () => {
  await loadCategories();
  await loadLinks();
});
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>

<template>
  <section class="links-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('links.manage') }}</p>
        <h1>{{ t('links.title') }}</h1>
        <p class="view-description">{{ t('links.description') }}</p>
      </div>
      <NButton type="primary" @click="openHeaderAction">
        <template #icon><NIcon><Plus /></NIcon></template>
        {{ headerActionLabel }}
      </NButton>
    </header>

    <NTabs v-model:value="activeTab" type="segment" animated class="links-tabs">
      <NTabPane name="links" :tab="t('links.linksTab')">
        <div class="links-toolbar">
          <NInput
            v-model:value="search"
            clearable
            :placeholder="t('links.searchPlaceholder')"
            :input-props="{ type: 'search', autocomplete: 'off' }"
            @input="handleSearchInput"
            @clear="handleSearchInput"
          >
            <template #prefix><NIcon><Search /></NIcon></template>
          </NInput>
          <NSelect v-model:value="categoryFilter" :options="categoryFilterOptions" :aria-label="t('links.filterCategory')" @update:value="handleFilterChange" />
          <NSelect v-model:value="visible" :options="visibleOptions" :aria-label="t('links.filterVisibility')" @update:value="handleFilterChange" />
          <span class="content-count">{{ t('links.total').replace('{count}', String(total)) }}</span>
        </div>

        <NSpin :show="loading">
          <div v-if="links.length" class="links-table">
            <div class="links-table-head" aria-hidden="true">
              <span>{{ t('links.site') }}</span>
              <span>{{ t('links.siteUrl') }}</span>
              <span>{{ t('links.category') }}</span>
              <span>{{ t('links.visibility') }}</span>
              <span>{{ t('links.sortOrder') }}</span>
              <span>{{ t('links.actions') }}</span>
            </div>
            <article v-for="item in links" :key="item.id" class="link-row">
              <div class="link-site-cell">
                <NAvatar round :size="40" :src="item.avatar || undefined">
                  <Link2 :size="18" />
                </NAvatar>
                <div>
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.description || t('links.noDescription') }}</small>
                </div>
              </div>
              <code class="link-url-cell" :title="item.url" :data-label="t('links.siteUrl')">{{ item.url }}</code>
              <span class="link-category-cell" :data-label="t('links.category')">{{ item.category.name || t('links.uncategorized') }}</span>
              <div class="link-visibility-cell">
                <NTag size="small" :bordered="false" :type="item.visible === 'yes' ? 'success' : 'default'">
                  {{ item.visible === 'yes' ? t('links.visible') : t('links.hidden') }}
                </NTag>
              </div>
              <strong class="link-sort-cell" :data-label="t('links.sortOrder')">{{ item.sort_order }}</strong>
              <div class="link-actions-cell">
                <NButton quaternary circle class="link-icon-action" :aria-label="t('links.open')" :title="t('links.open')" @click="openLink(item)">
                  <template #icon><NIcon><ExternalLink /></NIcon></template>
                </NButton>
                <NButton quaternary size="small" class="link-action" @click="openEdit(item)">
                  <template #icon><NIcon><Pencil /></NIcon></template>
                  {{ t('links.edit') }}
                </NButton>
                <NPopconfirm
                  :positive-text="t('links.confirmDelete')"
                  :negative-text="t('content.cancel')"
                  @positive-click="deleteLink(item)"
                >
                  <template #trigger>
                    <NButton quaternary size="small" type="error" class="link-action" :loading="deletingId === item.id">
                      <template #icon><NIcon><Trash2 /></NIcon></template>
                      {{ t('links.delete') }}
                    </NButton>
                  </template>
                  {{ t('links.deleteConfirm') }}
                </NPopconfirm>
              </div>
            </article>
          </div>
          <NEmpty
            v-else-if="!loading"
            class="content-empty"
            :description="search || visible !== 'all' || categoryFilter ? t('links.noResults') : t('links.empty')"
          >
            <template #extra><NButton secondary @click="openCreate">{{ t('links.addFirst') }}</NButton></template>
          </NEmpty>
        </NSpin>

        <footer v-if="totalPages > 1" class="content-pagination">
          <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
          <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
          <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
        </footer>
      </NTabPane>

      <NTabPane name="categories" :tab="t('links.categoriesTab')">
        <NSpin :show="categoriesLoading">
          <div v-if="categories.length" class="link-categories-table">
            <div class="link-categories-head" aria-hidden="true">
              <span>{{ t('links.categoryName') }}</span>
              <span>{{ t('links.slug') }}</span>
              <span>{{ t('links.categoryDescription') }}</span>
              <span>{{ t('links.linkCount') }}</span>
              <span>{{ t('links.actions') }}</span>
            </div>
            <article v-for="category in categories" :key="category.id" class="link-category-row">
              <div class="link-category-name">
                <FolderCog :size="18" stroke-width="1.8" />
                <strong>{{ category.name }}</strong>
                <NTag v-if="category.id === 1" size="small" :bordered="false">{{ t('links.defaultCategory') }}</NTag>
              </div>
              <code class="link-category-slug" :data-label="t('links.slug')">{{ category.slug }}</code>
              <p class="link-category-description" :data-label="t('links.categoryDescription')">{{ category.description || t('links.noDescription') }}</p>
              <strong class="link-category-count" :data-label="t('links.linkCount')">{{ category.count }}</strong>
              <div class="link-category-actions">
                <NButton quaternary size="small" class="link-action" @click="openCategoryEdit(category)">
                  <template #icon><NIcon><Pencil /></NIcon></template>
                  {{ t('links.edit') }}
                </NButton>
                <NPopconfirm
                  v-if="category.id !== 1"
                  :positive-text="t('links.confirmDelete')"
                  :negative-text="t('content.cancel')"
                  @positive-click="deleteCategory(category)"
                >
                  <template #trigger>
                    <NButton quaternary size="small" type="error" class="link-action" :loading="deletingCategoryId === category.id">
                      <template #icon><NIcon><Trash2 /></NIcon></template>
                      {{ t('links.delete') }}
                    </NButton>
                  </template>
                  {{ t('links.categoryDeleteConfirm') }}
                </NPopconfirm>
              </div>
            </article>
          </div>
          <NEmpty v-else-if="!categoriesLoading" class="content-empty" :description="t('links.categoriesEmpty')">
            <template #extra><NButton secondary @click="openCategoryCreate">{{ t('links.addCategory') }}</NButton></template>
          </NEmpty>
        </NSpin>
      </NTabPane>
    </NTabs>

    <NDrawer v-model:show="editorOpen" placement="right" width="min(500px, 100vw)">
      <NDrawerContent :title="editingId ? t('links.editLink') : t('links.createLink')" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top" size="large" @submit.prevent="saveLink">
          <div v-if="form.avatar" class="link-avatar-preview">
            <NAvatar round :size="54" :src="form.avatar"><Link2 :size="20" /></NAvatar>
            <span>{{ form.name || t('links.avatarPreview') }}</span>
          </div>
          <NFormItem :label="t('links.siteName')" required>
            <NInput v-model:value="form.name" :placeholder="t('links.siteNamePlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('links.siteUrl')" required>
            <NInput v-model:value="form.url" :placeholder="t('links.siteUrlPlaceholder')" :input-props="{ type: 'url' }" />
          </NFormItem>
          <NFormItem :label="t('links.descriptionLabel')">
            <NInput v-model:value="form.description" type="textarea" :rows="3" :placeholder="t('links.descriptionPlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('links.avatarUrl')">
            <NInput v-model:value="form.avatar" :placeholder="t('links.avatarPlaceholder')" :input-props="{ type: 'url' }" />
            <template #feedback>{{ t('links.avatarHint') }}</template>
          </NFormItem>
          <div class="link-form-grid">
            <NFormItem :label="t('links.category')">
              <NSelect v-model:value="form.categoryId" :options="categoryOptions" />
            </NFormItem>
            <NFormItem :label="t('links.openMode')">
              <NSelect v-model:value="form.target" :options="targetOptions" />
            </NFormItem>
          </div>
          <div class="link-form-grid link-form-grid-compact">
            <NFormItem :label="t('links.sortOrder')">
              <NInputNumber v-model:value="form.sortOrder" :min="0" :precision="0" />
              <template #feedback>{{ t('links.sortHint') }}</template>
            </NFormItem>
            <NFormItem :label="t('links.visibility')">
              <div class="link-switch-field">
                <NSwitch v-model:value="form.visible" />
                <span>{{ form.visible ? t('links.visible') : t('links.hidden') }}</span>
              </div>
            </NFormItem>
          </div>
          <div class="link-drawer-actions">
            <NButton @click="editorOpen = false">{{ t('content.cancel') }}</NButton>
            <NButton type="primary" attr-type="submit" :loading="saving" :disabled="!form.name.trim() || !form.url.trim() || !categories.length">
              {{ editingId ? t('links.saveChanges') : t('links.create') }}
            </NButton>
          </div>
        </NForm>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="categoryEditorOpen" placement="right" width="min(440px, 100vw)">
      <NDrawerContent :title="editingCategoryId ? t('links.editCategory') : t('links.createCategory')" closable :native-scrollbar="false">
        <NForm :model="categoryForm" label-placement="top" size="large" @submit.prevent="saveCategory">
          <NFormItem :label="t('links.categoryName')" required>
            <NInput v-model:value="categoryForm.name" :placeholder="t('links.categoryNamePlaceholder')" />
          </NFormItem>
          <NFormItem :label="t('links.slug')">
            <NInput v-model:value="categoryForm.slug" :placeholder="t('links.slugPlaceholder')" />
            <template #feedback>{{ t('links.slugHint') }}</template>
          </NFormItem>
          <NFormItem :label="t('links.categoryDescription')">
            <NInput v-model:value="categoryForm.description" type="textarea" :rows="4" />
          </NFormItem>
          <div class="link-drawer-actions">
            <NButton @click="categoryEditorOpen = false">{{ t('content.cancel') }}</NButton>
            <NButton type="primary" attr-type="submit" :loading="categorySaving" :disabled="!categoryForm.name.trim()">
              {{ editingCategoryId ? t('links.saveChanges') : t('links.create') }}
            </NButton>
          </div>
        </NForm>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
