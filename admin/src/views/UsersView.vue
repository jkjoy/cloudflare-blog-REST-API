<script setup lang="ts">
import { Edit3, Plus, Search, Trash2, UserRound } from '@lucide/vue';
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
import { ApiError, apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

interface UserItem {
  id: number;
  name: string;
  slug: string;
  email?: string;
  description: string;
  roles: string[];
  role: string;
  registered_date: string;
  avatar_urls: Record<string, string>;
}

const auth = useAuthStore();
const message = useMessage();
const { isChinese, t } = useAdminI18n();
const users = ref<UserItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const search = ref('');
const role = ref('all');
const page = ref(1);
const perPage = 15;
const total = ref(0);
const totalPages = ref(1);
const editorOpen = ref(false);
const deleteOpen = ref(false);
const activeUser = ref<UserItem | null>(null);
const deleteTarget = ref<UserItem | null>(null);
const reassignTo = ref<number | null>(null);
const form = reactive({ username: '', email: '', password: '', displayName: '', bio: '', role: 'subscriber' });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const isAdministrator = computed(() => auth.user?.role === 'administrator');
const roleOptions = computed(() => [
  { label: t('users.roleAll'), value: 'all' },
  { label: t('users.roleSubscriber'), value: 'subscriber' },
  { label: t('users.roleContributor'), value: 'contributor' },
  { label: t('users.roleAuthor'), value: 'author' },
  { label: t('users.roleEditor'), value: 'editor' },
  { label: t('users.roleAdministrator'), value: 'administrator' },
]);
const editorRoleOptions = computed(() => roleOptions.value.slice(1));
const reassignOptions = computed(() => users.value
  .filter((item) => item.id !== deleteTarget.value?.id)
  .map((item) => ({ label: `${item.name} (@${item.slug})`, value: item.id })));

function roleLabel(value: string) {
  const option = roleOptions.value.find((item) => item.value === value);
  return option?.label || value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(isChinese.value ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(date);
}

function canEdit(item: UserItem) {
  return isAdministrator.value || item.id === auth.user?.id;
}

async function loadUsers() {
  const version = ++requestVersion;
  loading.value = true;
  const params = new URLSearchParams({ page: String(page.value), per_page: String(perPage) });
  if (search.value.trim()) params.set('search', search.value.trim());
  if (role.value !== 'all') params.set('role', role.value);
  try {
    const response = await apiFetch(`/users?${params.toString()}`, {}, auth.token);
    const data = await response.json() as UserItem[];
    if (version !== requestVersion) return;
    users.value = data;
    total.value = Number(response.headers.get('X-WP-Total')) || data.length;
    totalPages.value = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1);
  } catch (error) {
    if (version !== requestVersion) return;
    users.value = [];
    message.error(error instanceof ApiError ? error.message : t('users.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function handleSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; loadUsers(); }, 300);
}

function changePage(nextPage: number) {
  page.value = nextPage;
  loadUsers();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openEditor(item?: UserItem) {
  activeUser.value = item || null;
  Object.assign(form, {
    username: item?.slug || '',
    email: item?.email || '',
    password: '',
    displayName: item?.name || '',
    bio: item?.description || '',
    role: item?.role || item?.roles?.[0] || 'subscriber',
  });
  editorOpen.value = true;
}

async function saveUser() {
  if (!form.email.trim() || (!activeUser.value && (!form.username.trim() || form.password.length < 12))) return;
  saving.value = true;
  const payload: Record<string, unknown> = {
    email: form.email.trim(),
    display_name: form.displayName.trim(),
    role: form.role,
  };
  if (form.password) payload.password = form.password;
  if (activeUser.value) {
    payload.bio = form.bio.trim();
    if (!isAdministrator.value || activeUser.value.id === auth.user?.id) delete payload.role;
  } else {
    payload.username = form.username.trim();
  }

  try {
    await apiFetch(activeUser.value ? `/users/${activeUser.value.id}` : '/users', {
      method: activeUser.value ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }, auth.token);
    message.success(t(activeUser.value ? 'users.updated' : 'users.created'));
    editorOpen.value = false;
    await loadUsers();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('users.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function openDelete(item: UserItem) {
  deleteTarget.value = item;
  reassignTo.value = null;
  deleteOpen.value = true;
}

async function deleteUser() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  const params = new URLSearchParams({ force: 'true' });
  if (reassignTo.value) params.set('reassign', String(reassignTo.value));
  try {
    await apiFetch(`/users/${deleteTarget.value.id}?${params.toString()}`, { method: 'DELETE' }, auth.token);
    message.success(t('users.deleted'));
    deleteOpen.value = false;
    if (users.value.length === 1 && page.value > 1) page.value -= 1;
    await loadUsers();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('users.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

watch(role, () => { page.value = 1; loadUsers(); }, { immediate: true });
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>

<template>
  <section class="users-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('users.manage') }}</p>
        <h1>{{ t('users.title') }}</h1>
        <p class="view-description">{{ t('users.description') }}</p>
      </div>
      <NButton v-if="isAdministrator" type="primary" @click="openEditor()">
        <template #icon><NIcon><Plus /></NIcon></template>{{ t('users.addNew') }}
      </NButton>
    </header>

    <div class="users-toolbar">
      <NInput v-model:value="search" clearable :placeholder="t('users.searchPlaceholder')" :input-props="{ type: 'search', autocomplete: 'off' }" @input="handleSearchInput" @clear="handleSearchInput">
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>
      <NSelect v-model:value="role" :options="roleOptions" :aria-label="t('users.filterRole')" />
      <span class="content-count">{{ t('users.total').replace('{count}', String(total)) }}</span>
    </div>

    <NSpin :show="loading">
      <div v-if="users.length" class="users-table">
        <div class="users-table-head" aria-hidden="true">
          <span>{{ t('users.user') }}</span><span>{{ t('users.email') }}</span><span>{{ t('users.role') }}</span><span>{{ t('users.registered') }}</span><span>{{ t('users.actions') }}</span>
        </div>
        <article v-for="item in users" :key="item.id" class="user-row">
          <div class="user-identity-cell">
            <NAvatar round :size="40" :src="item.avatar_urls?.['48'] || undefined">{{ item.name?.slice(0, 1).toUpperCase() || '?' }}</NAvatar>
            <div><strong>{{ item.name }}</strong><small>@{{ item.slug }}</small></div>
          </div>
          <div class="user-email-cell">{{ item.email || t('users.noEmail') }}</div>
          <div class="user-role-cell"><NTag size="small" :bordered="false" :type="item.role === 'administrator' ? 'info' : 'default'">{{ roleLabel(item.role || item.roles?.[0]) }}</NTag></div>
          <time class="user-date-cell" :datetime="item.registered_date">{{ formatDate(item.registered_date) }}</time>
          <div class="user-actions-cell">
            <NButton v-if="canEdit(item)" quaternary size="small" class="user-action" @click="openEditor(item)"><template #icon><NIcon><Edit3 /></NIcon></template>{{ t('users.edit') }}</NButton>
            <NButton v-if="isAdministrator && item.id !== auth.user?.id" quaternary size="small" type="error" class="user-action" @click="openDelete(item)"><template #icon><NIcon><Trash2 /></NIcon></template>{{ t('users.delete') }}</NButton>
          </div>
        </article>
      </div>
      <NEmpty v-else-if="!loading" class="content-empty" :description="search || role !== 'all' ? t('users.noResults') : t('users.empty')"><template #icon><NIcon><UserRound /></NIcon></template></NEmpty>
    </NSpin>

    <footer v-if="totalPages > 1" class="content-pagination">
      <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
      <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
      <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
    </footer>

    <NDrawer v-model:show="editorOpen" placement="right" width="min(520px, 100vw)">
      <NDrawerContent :title="activeUser ? t('users.editTitle') : t('users.createTitle')" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top" size="large" @submit.prevent="saveUser">
          <NFormItem :label="t('users.username')" :required="!activeUser"><NInput v-model:value="form.username" :disabled="!!activeUser" autocomplete="off" /></NFormItem>
          <NFormItem :label="t('users.email')" required><NInput v-model:value="form.email" :input-props="{ type: 'email', autocomplete: 'off' }" /></NFormItem>
          <NFormItem :label="t('users.displayName')"><NInput v-model:value="form.displayName" /></NFormItem>
          <NFormItem v-if="activeUser" :label="t('users.bio')"><NInput v-model:value="form.bio" type="textarea" :rows="4" /></NFormItem>
          <NFormItem :label="activeUser ? t('users.newPassword') : t('users.password')" :feedback="t('users.passwordHint')" :required="!activeUser"><NInput v-model:value="form.password" type="password" show-password-on="click" :input-props="{ autocomplete: 'new-password', minlength: 12 }" /></NFormItem>
          <NFormItem v-if="!activeUser || (isAdministrator && activeUser.id !== auth.user?.id)" :label="t('users.role')"><NSelect v-model:value="form.role" :options="editorRoleOptions" /></NFormItem>
          <div class="user-drawer-actions"><NButton @click="editorOpen = false">{{ t('content.cancel') }}</NButton><NButton type="primary" attr-type="submit" :loading="saving" :disabled="!form.email.trim() || (!activeUser && (!form.username.trim() || form.password.length < 12))">{{ activeUser ? t('users.saveChanges') : t('users.create') }}</NButton></div>
        </NForm>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="deleteOpen" placement="right" width="min(460px, 100vw)">
      <NDrawerContent :title="t('users.deleteTitle')" closable :native-scrollbar="false">
        <div class="user-delete-warning"><Trash2 :size="20" /><div><strong>{{ deleteTarget?.name }}</strong><p>{{ t('users.deleteWarning') }}</p></div></div>
        <NFormItem :label="t('users.reassignContent')"><NSelect v-model:value="reassignTo" clearable :options="reassignOptions" :placeholder="t('users.deleteContent')" /></NFormItem>
        <p class="form-hint">{{ reassignTo ? t('users.reassignHint') : t('users.deleteContentHint') }}</p>
        <div class="user-drawer-actions"><NButton @click="deleteOpen = false">{{ t('content.cancel') }}</NButton><NPopconfirm :positive-text="t('users.confirmDelete')" :negative-text="t('content.cancel')" @positive-click="deleteUser"><template #trigger><NButton type="error" :loading="deleting">{{ t('users.deleteForever') }}</NButton></template>{{ t('users.deleteConfirm') }}</NPopconfirm></div>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
