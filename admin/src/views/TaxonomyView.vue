<script setup lang="ts">
import { FolderTree, Hash, Pencil, Plus, Search, Tags, Trash2 } from '@lucide/vue';
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
  NTag,
  useMessage,
} from 'naive-ui';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ApiError, apiFetch, apiJson } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type TaxonomyKind = 'categories' | 'tags';

interface Term {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  parent?: number;
}

const props = defineProps<{ kind: TaxonomyKind }>();
const auth = useAuthStore();
const message = useMessage();
const { t } = useAdminI18n();
const terms = ref<Term[]>([]);
const allCategories = ref<Term[]>([]);
const loading = ref(false);
const saving = ref(false);
const deletingId = ref<number | null>(null);
const editorOpen = ref(false);
const editingId = ref<number | null>(null);
const search = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const perPage = 20;
const form = reactive({ name: '', slug: '', description: '', parent: 0 });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const isCategories = computed(() => props.kind === 'categories');
const title = computed(() => t(isCategories.value ? 'taxonomy.categoriesTitle' : 'taxonomy.tagsTitle'));
const description = computed(() => t(isCategories.value ? 'taxonomy.categoriesDescription' : 'taxonomy.tagsDescription'));
const emptyText = computed(() => t(isCategories.value ? 'taxonomy.categoriesEmpty' : 'taxonomy.tagsEmpty'));
const addFirstText = computed(() => t(isCategories.value ? 'taxonomy.addFirstCategory' : 'taxonomy.addFirstTag'));
const editorTitle = computed(() => t(editingId.value
  ? (isCategories.value ? 'taxonomy.editCategory' : 'taxonomy.editTag')
  : (isCategories.value ? 'taxonomy.createCategory' : 'taxonomy.createTag')));
const parentOptions = computed(() => {
  const excluded = new Set<number>();
  if (editingId.value) {
    excluded.add(editingId.value);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of allCategories.value) {
        if (category.parent && excluded.has(category.parent) && !excluded.has(category.id)) {
          excluded.add(category.id);
          changed = true;
        }
      }
    }
  }
  return [
    { label: t('taxonomy.noParent'), value: 0 },
    ...allCategories.value
      .filter((category) => !excluded.has(category.id))
      .map((category) => ({ label: category.name, value: category.id })),
  ];
});
const parentNames = computed(() => new Map(allCategories.value.map((category) => [category.id, category.name])));

async function loadAllCategories() {
  if (!isCategories.value) {
    allCategories.value = [];
    return;
  }
  const first = await apiFetch('/categories?per_page=100&page=1&orderby=name', {}, auth.token);
  const collected = await first.json() as Term[];
  const pages = Number(first.headers.get('X-WP-TotalPages')) || 1;
  if (pages > 1) {
    const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) =>
      apiJson<Term[]>(`/categories?per_page=100&page=${index + 2}&orderby=name`, {}, auth.token)));
    collected.push(...remaining.flat());
  }
  allCategories.value = collected;
}

async function loadTerms() {
  const version = ++requestVersion;
  loading.value = true;
  const params = new URLSearchParams({
    page: String(page.value),
    per_page: String(perPage),
    orderby: 'name',
  });
  if (search.value.trim()) params.set('search', search.value.trim());

  try {
    const [response] = await Promise.all([
      apiFetch(`/${props.kind}?${params.toString()}`, {}, auth.token),
      isCategories.value ? loadAllCategories() : Promise.resolve(),
    ]);
    const data = await response.json() as Term[];
    if (version !== requestVersion) return;
    terms.value = data;
    total.value = Number(response.headers.get('X-WP-Total')) || data.length;
    totalPages.value = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1);
  } catch (error) {
    if (version !== requestVersion) return;
    terms.value = [];
    message.error(error instanceof ApiError ? error.message : t('taxonomy.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function resetAndLoad() {
  editorOpen.value = false;
  editingId.value = null;
  search.value = '';
  page.value = 1;
  loadTerms();
}

function handleSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadTerms();
  }, 300);
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, { name: '', slug: '', description: '', parent: 0 });
  editorOpen.value = true;
}

function openEdit(term: Term) {
  editingId.value = term.id;
  Object.assign(form, {
    name: term.name,
    slug: term.slug,
    description: term.description || '',
    parent: term.parent || 0,
  });
  editorOpen.value = true;
}

async function saveTerm() {
  if (!form.name.trim()) return;
  saving.value = true;
  const body: Record<string, string | number> = {
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim(),
  };
  if (isCategories.value) body.parent = form.parent;

  try {
    const path = editingId.value ? `/${props.kind}/${editingId.value}` : `/${props.kind}`;
    await apiFetch(path, {
      method: editingId.value ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    }, auth.token);
    message.success(t(editingId.value ? 'taxonomy.updated' : 'taxonomy.created'));
    editorOpen.value = false;
    await loadTerms();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('taxonomy.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function deleteTerm(term: Term) {
  deletingId.value = term.id;
  try {
    await apiFetch(`/${props.kind}/${term.id}?force=true`, { method: 'DELETE' }, auth.token);
    message.success(t('taxonomy.deleted'));
    if (terms.value.length === 1 && page.value > 1) page.value -= 1;
    await loadTerms();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('taxonomy.deleteFailed'));
  } finally {
    deletingId.value = null;
  }
}

function changePage(nextPage: number) {
  page.value = nextPage;
  loadTerms();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

watch(() => props.kind, resetAndLoad, { immediate: true });
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>

<template>
  <section class="taxonomy-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('taxonomy.manage') }}</p>
        <h1>{{ title }}</h1>
        <p class="view-description">{{ description }}</p>
      </div>
      <NButton type="primary" @click="openCreate">
        <template #icon><NIcon><Plus /></NIcon></template>
        {{ t('taxonomy.addNew') }}
      </NButton>
    </header>

    <div class="taxonomy-toolbar">
      <NInput
        v-model:value="search"
        clearable
        :placeholder="t('taxonomy.searchPlaceholder')"
        :input-props="{ type: 'search', autocomplete: 'off' }"
        @input="handleSearchInput"
        @clear="handleSearchInput"
      >
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>
      <span class="content-count">{{ t('taxonomy.total').replace('{count}', String(total)) }}</span>
    </div>

    <NSpin :show="loading">
      <div v-if="terms.length" class="taxonomy-table">
        <div class="taxonomy-table-head" aria-hidden="true">
          <span>{{ t('taxonomy.name') }}</span>
          <span>{{ t('taxonomy.slug') }}</span>
          <span>{{ t('taxonomy.description') }}</span>
          <span>{{ t('taxonomy.count') }}</span>
          <span>{{ t('taxonomy.actions') }}</span>
        </div>
        <article v-for="term in terms" :key="term.id" class="taxonomy-row">
          <div class="taxonomy-name-cell">
            <component :is="isCategories ? FolderTree : Tags" :size="18" stroke-width="1.8" />
            <div>
              <strong>{{ term.name }}</strong>
              <small v-if="isCategories && term.parent">{{ t('taxonomy.parent') }}: {{ parentNames.get(term.parent) || '-' }}</small>
            </div>
            <NTag v-if="isCategories && term.id === 1" size="small" :bordered="false">{{ t('taxonomy.defaultCategory') }}</NTag>
          </div>
          <code class="taxonomy-slug"><Hash :size="13" />{{ term.slug }}</code>
          <p class="taxonomy-description">{{ term.description || t('taxonomy.noDescription') }}</p>
          <strong class="taxonomy-count">{{ term.count }}</strong>
          <div class="taxonomy-actions">
            <NButton quaternary size="small" class="content-action" @click="openEdit(term)">
              <template #icon><NIcon><Pencil /></NIcon></template>
              {{ t('taxonomy.edit') }}
            </NButton>
            <NPopconfirm
              v-if="!isCategories || term.id !== 1"
              :positive-text="t('taxonomy.confirmDelete')"
              :negative-text="t('taxonomy.cancel')"
              @positive-click="deleteTerm(term)"
            >
              <template #trigger>
                <NButton quaternary size="small" type="error" class="content-action" :loading="deletingId === term.id">
                  <template #icon><NIcon><Trash2 /></NIcon></template>
                  {{ t('taxonomy.delete') }}
                </NButton>
              </template>
              {{ isCategories ? t('taxonomy.deleteCategoryConfirm') : t('taxonomy.deleteTagConfirm') }}
            </NPopconfirm>
          </div>
        </article>
      </div>
      <NEmpty v-else-if="!loading" class="content-empty" :description="search ? t('taxonomy.noSearchResults') : emptyText">
        <template #extra><NButton secondary @click="openCreate">{{ addFirstText }}</NButton></template>
      </NEmpty>
    </NSpin>

    <footer v-if="totalPages > 1" class="content-pagination">
      <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
      <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
      <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
    </footer>

    <NDrawer v-model:show="editorOpen" placement="right" width="min(440px, 100vw)">
      <NDrawerContent :title="editorTitle" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top" size="large" @submit.prevent="saveTerm">
          <NFormItem :label="t('taxonomy.name')" required>
            <NInput v-model:value="form.name" :placeholder="t('taxonomy.namePlaceholder')" :input-props="{ autocomplete: 'off' }" />
          </NFormItem>
          <NFormItem :label="t('taxonomy.slug')">
            <NInput v-model:value="form.slug" :placeholder="t('taxonomy.slugPlaceholder')">
              <template #prefix><NIcon><Hash /></NIcon></template>
            </NInput>
            <template #feedback>{{ t('taxonomy.slugHint') }}</template>
          </NFormItem>
          <NFormItem v-if="isCategories" :label="t('taxonomy.parent')">
            <NSelect v-model:value="form.parent" :options="parentOptions" filterable />
          </NFormItem>
          <NFormItem :label="t('taxonomy.description')">
            <NInput v-model:value="form.description" type="textarea" :autosize="{ minRows: 4, maxRows: 9 }" />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="taxonomy-editor-actions">
            <NButton @click="editorOpen = false">{{ t('taxonomy.cancel') }}</NButton>
            <NButton type="primary" :loading="saving" :disabled="!form.name.trim()" @click="saveTerm">
              {{ editingId ? t('taxonomy.saveChanges') : t('taxonomy.create') }}
            </NButton>
          </div>
        </template>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
