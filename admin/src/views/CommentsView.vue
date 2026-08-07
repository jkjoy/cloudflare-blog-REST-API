<script setup lang="ts">
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  MessageSquareReply,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
} from '@lucide/vue';
import {
  NAvatar,
  NButton,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NSelect,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui';
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type CommentStatus = 'approved' | 'pending' | 'spam' | 'trash';
type CommentSource = 'comment' | 'moment_comment';
type CommentAction = 'approve' | 'unapprove' | 'spam' | 'trash' | 'restore' | 'delete';

interface AdminComment {
  id: number;
  post?: number;
  moment?: number;
  parent: number;
  author: number;
  author_name: string;
  author_url: string;
  author_email?: string;
  author_ip?: string;
  author_avatar_urls?: Record<string, string>;
  date: string;
  content: { rendered: string };
  link: string;
  status: CommentStatus;
  type: CommentSource;
  post_title?: string;
  depth?: number;
}

const auth = useAuthStore();
const route = useRoute();
const dialog = useDialog();
const message = useMessage();
const { isChinese, t } = useAdminI18n();
const comments = ref<AdminComment[]>([]);
const loading = ref(false);
const saving = ref(false);
const replying = ref(false);
const actionKey = ref('');
const status = ref('all');
const source = ref(route.query.source === 'moments' ? 'moment_comment' : 'all');
const search = ref('');
const page = ref(1);
const perPage = 20;
const editorOpen = ref(false);
const replyOpen = ref(false);
const activeComment = ref<AdminComment | null>(null);
const editForm = reactive({ authorName: '', authorEmail: '', authorUrl: '', content: '', status: 'pending' as CommentStatus });
const replyForm = reactive({ content: '' });
let requestVersion = 0;

const statusCounts = computed(() => ({
  all: comments.value.length,
  approved: comments.value.filter((item) => item.status === 'approved').length,
  pending: comments.value.filter((item) => item.status === 'pending').length,
  spam: comments.value.filter((item) => item.status === 'spam').length,
  trash: comments.value.filter((item) => item.status === 'trash').length,
}));
const statusOptions = computed(() => [
  { label: `${t('comments.statusAll')} (${statusCounts.value.all})`, value: 'all' },
  { label: `${t('comments.statusPending')} (${statusCounts.value.pending})`, value: 'pending' },
  { label: `${t('comments.statusApproved')} (${statusCounts.value.approved})`, value: 'approved' },
  { label: `${t('comments.statusSpam')} (${statusCounts.value.spam})`, value: 'spam' },
  { label: `${t('comments.statusTrash')} (${statusCounts.value.trash})`, value: 'trash' },
]);
const sourceOptions = computed(() => [
  { label: t('comments.sourceAll'), value: 'all' },
  { label: t('comments.sourcePosts'), value: 'comment' },
  { label: t('comments.sourceMoments'), value: 'moment_comment' },
]);
const editStatusOptions = computed(() => statusOptions.value.slice(1).map((option) => ({
  label: option.label.replace(/ \(\d+\)$/, ''),
  value: option.value,
})));

const filteredComments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return comments.value.filter((item) => {
    if (status.value !== 'all' && item.status !== status.value) return false;
    if (source.value !== 'all' && item.type !== source.value) return false;
    if (!query) return true;
    return [item.author_name, item.author_email, item.content.rendered, item.post_title]
      .some((value) => cleanText(value || '').toLocaleLowerCase().includes(query));
  });
});
const total = computed(() => filteredComments.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)));
const pageItems = computed(() => filteredComments.value.slice((page.value - 1) * perPage, page.value * perPage));

function cleanText(value: string) {
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function commentKey(item: AdminComment) {
  return `${item.type}:${item.id}`;
}

function apiPath(item: AdminComment) {
  return item.type === 'moment_comment'
    ? `/moments/${item.moment}/comments/${item.id}`
    : `/comments/${item.id}`;
}

function resourceTitle(item: AdminComment) {
  if (item.post_title) return cleanText(item.post_title);
  return item.type === 'moment_comment'
    ? t('comments.momentNumber').replace('{id}', String(item.moment || 0))
    : t('comments.postNumber').replace('{id}', String(item.post || 0));
}

function avatarUrl(item: AdminComment) {
  return item.author_avatar_urls?.['48'] || '';
}

function statusLabel(value: CommentStatus) {
  return t(`comments.status${value[0].toUpperCase()}${value.slice(1)}`);
}

function statusType(value: CommentStatus): 'success' | 'warning' | 'error' | 'default' {
  if (value === 'approved') return 'success';
  if (value === 'pending') return 'warning';
  if (value === 'spam') return 'error';
  return 'default';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(isChinese.value ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

async function fetchAllPages(path: string) {
  const first = await apiFetch(`${path}?page=1&per_page=100&status=all`, {}, auth.token);
  const collected = await first.json() as AdminComment[];
  const pages = Number(first.headers.get('X-WP-TotalPages')) || 1;
  if (pages > 1) {
    const remaining = await Promise.all(Array.from({ length: pages - 1 }, async (_, index) => {
      const response = await apiFetch(`${path}?page=${index + 2}&per_page=100&status=all`, {}, auth.token);
      return response.json() as Promise<AdminComment[]>;
    }));
    collected.push(...remaining.flat());
  }
  return collected;
}

function addThreadDepth(items: AdminComment[]) {
  const byKey = new Map(items.map((item) => [commentKey(item), item]));
  function resolveDepth(item: AdminComment, seen = new Set<string>()): number {
    if (!item.parent) return 0;
    const key = commentKey(item);
    if (seen.has(key)) return 0;
    seen.add(key);
    const parent = byKey.get(`${item.type}:${item.parent}`);
    return parent ? Math.min(resolveDepth(parent, seen) + 1, 3) : 0;
  }
  return items.map((item) => ({ ...item, depth: resolveDepth(item) }));
}

async function loadComments(notify = false) {
  const version = ++requestVersion;
  loading.value = true;
  try {
    const [postComments, momentComments] = await Promise.all([
      fetchAllPages('/comments'),
      fetchAllPages('/moments/comments/all'),
    ]);
    if (version !== requestVersion) return;
    comments.value = addThreadDepth([...postComments, ...momentComments])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (page.value > totalPages.value) page.value = totalPages.value;
    if (notify) message.success(t('comments.refreshed'));
  } catch (error) {
    if (version !== requestVersion) return;
    comments.value = [];
    message.error(error instanceof ApiError ? error.message : t('comments.loadFailed'));
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function changePage(nextPage: number) {
  page.value = nextPage;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openEditor(item: AdminComment) {
  activeComment.value = item;
  Object.assign(editForm, {
    authorName: item.author_name,
    authorEmail: item.author_email || '',
    authorUrl: item.author_url || '',
    content: cleanText(item.content.rendered),
    status: item.status,
  });
  editorOpen.value = true;
}

function openReply(item: AdminComment) {
  activeComment.value = item;
  replyForm.content = '';
  replyOpen.value = true;
}

async function saveComment() {
  if (!activeComment.value || !editForm.authorName.trim() || !editForm.authorEmail.trim() || !editForm.content.trim()) return;
  saving.value = true;
  try {
    await apiFetch(apiPath(activeComment.value), {
      method: 'PUT',
      body: JSON.stringify({
        author_name: editForm.authorName.trim(),
        author_email: editForm.authorEmail.trim(),
        author_url: editForm.authorUrl.trim(),
        content: editForm.content.trim(),
        status: editForm.status,
      }),
    }, auth.token);
    message.success(t('comments.updated'));
    editorOpen.value = false;
    await loadComments();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('comments.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function submitReply() {
  if (!activeComment.value || !replyForm.content.trim()) return;
  replying.value = true;
  const item = activeComment.value;
  const path = item.type === 'moment_comment' ? `/moments/${item.moment}/comments` : '/comments';
  const body = item.type === 'moment_comment'
    ? { parent: item.id, content: replyForm.content.trim() }
    : { post: item.post, parent: item.id, content: replyForm.content.trim() };
  try {
    await apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, auth.token);
    message.success(t('comments.replied'));
    replyOpen.value = false;
    await loadComments();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('comments.replyFailed'));
  } finally {
    replying.value = false;
  }
}

async function mutateComment(item: AdminComment, action: CommentAction) {
  actionKey.value = `${commentKey(item)}:${action}`;
  try {
    if (action === 'trash' || action === 'delete') {
      await apiFetch(`${apiPath(item)}${action === 'delete' ? '?force=true' : ''}`, { method: 'DELETE' }, auth.token);
    } else {
      const nextStatus: CommentStatus = action === 'approve'
        ? 'approved'
        : action === 'spam'
          ? 'spam'
          : 'pending';
      await apiFetch(apiPath(item), {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      }, auth.token);
    }
    message.success(t(`comments.${action}Success`));
    await loadComments();
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('comments.actionFailed'));
  } finally {
    actionKey.value = '';
  }
}

function iconOption(icon: typeof ExternalLink) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

function actionOptions(item: AdminComment) {
  const options: Array<Record<string, unknown>> = [
    { key: 'open', label: t('comments.openContext'), icon: iconOption(ExternalLink) },
    { key: 'divider', type: 'divider' },
  ];
  if (item.status === 'trash') {
    options.push(
      { key: 'restore', label: t('comments.restore'), icon: iconOption(RotateCcw) },
      { key: 'delete', label: t('comments.deleteForever'), icon: iconOption(Trash2) },
    );
  } else {
    if (item.status !== 'spam') options.push({ key: 'spam', label: t('comments.markSpam'), icon: iconOption(ShieldAlert) });
    options.push({ key: 'trash', label: t('comments.moveTrash'), icon: iconOption(Trash2) });
  }
  return options;
}

function handleMenuAction(item: AdminComment, key: string) {
  if (key === 'open') {
    window.open(item.link, '_blank', 'noopener,noreferrer');
    return;
  }
  if (key === 'delete') {
    dialog.warning({
      title: t('comments.deleteTitle'),
      content: t('comments.deleteConfirm'),
      positiveText: t('comments.confirmDelete'),
      negativeText: t('content.cancel'),
      onPositiveClick: () => mutateComment(item, 'delete'),
    });
    return;
  }
  mutateComment(item, key as CommentAction);
}

watch([status, source, search], () => { page.value = 1; });
watch(() => route.query.source, (value) => {
  source.value = value === 'moments' ? 'moment_comment' : 'all';
});
onMounted(loadComments);
</script>

<template>
  <section class="comments-view">
    <header class="view-header content-view-header">
      <div>
        <p class="view-eyebrow">{{ t('comments.manage') }}</p>
        <h1>{{ t('comments.title') }}</h1>
        <p class="view-description">{{ t('comments.description') }}</p>
      </div>
      <NButton secondary :loading="loading" @click="loadComments(true)">
        <template #icon><NIcon><RefreshCw /></NIcon></template>
        {{ t('comments.refresh') }}
      </NButton>
    </header>

    <div class="comments-toolbar">
      <NInput
        v-model:value="search"
        clearable
        :placeholder="t('comments.searchPlaceholder')"
        :input-props="{ type: 'search', autocomplete: 'off' }"
      >
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>
      <NSelect v-model:value="status" :options="statusOptions" :aria-label="t('comments.filterStatus')" />
      <NSelect v-model:value="source" :options="sourceOptions" :aria-label="t('comments.filterSource')" />
      <span class="content-count">{{ t('comments.total').replace('{count}', String(total)) }}</span>
    </div>

    <NSpin :show="loading">
      <div v-if="pageItems.length" class="comments-table">
        <div class="comments-table-head" aria-hidden="true">
          <span>{{ t('comments.author') }}</span>
          <span>{{ t('comments.comment') }}</span>
          <span>{{ t('comments.context') }}</span>
          <span>{{ t('comments.status') }}</span>
          <span>{{ t('comments.date') }}</span>
          <span>{{ t('comments.actions') }}</span>
        </div>

        <article
          v-for="item in pageItems"
          :key="commentKey(item)"
          class="comment-row"
          :class="`depth-${Math.min(item.depth || 0, 3)}`"
        >
          <div class="comment-author-cell">
            <NAvatar round :size="38" :src="avatarUrl(item) || undefined">
              {{ item.author_name?.slice(0, 1).toUpperCase() || '?' }}
            </NAvatar>
            <div>
              <strong>{{ item.author_name || t('comments.anonymous') }}</strong>
              <small>{{ item.author_email || t('comments.noEmail') }}</small>
            </div>
          </div>
          <div class="comment-content-cell">
            <MessageSquareReply v-if="item.parent" :size="15" stroke-width="1.8" />
            <p>{{ cleanText(item.content.rendered) }}</p>
          </div>
          <div class="comment-context-cell">
            <NTag size="small" :bordered="false" :type="item.type === 'moment_comment' ? 'info' : 'default'">
              {{ item.type === 'moment_comment' ? t('comments.moment') : t('comments.post') }}
            </NTag>
            <span :title="resourceTitle(item)">{{ resourceTitle(item) }}</span>
          </div>
          <div class="comment-status-cell">
            <NTag size="small" :bordered="false" :type="statusType(item.status)">{{ statusLabel(item.status) }}</NTag>
          </div>
          <time class="comment-date-cell" :datetime="item.date">{{ formatDate(item.date) }}</time>
          <div class="comment-actions-cell">
            <NButton
              v-if="item.status !== 'approved' && item.status !== 'trash'"
              quaternary
              size="small"
              class="comment-action"
              :loading="actionKey === `${commentKey(item)}:approve`"
              @click="mutateComment(item, 'approve')"
            >
              <template #icon><NIcon><CheckCircle2 /></NIcon></template>
              {{ t('comments.approve') }}
            </NButton>
            <NButton
              v-else-if="item.status === 'approved'"
              quaternary
              size="small"
              class="comment-action"
              :loading="actionKey === `${commentKey(item)}:unapprove`"
              @click="mutateComment(item, 'unapprove')"
            >
              {{ t('comments.unapprove') }}
            </NButton>
            <NButton v-if="item.status !== 'trash'" quaternary size="small" class="comment-action" @click="openReply(item)">
              <template #icon><NIcon><MessageSquareReply /></NIcon></template>
              {{ t('comments.reply') }}
            </NButton>
            <NButton v-if="item.status !== 'trash'" quaternary size="small" class="comment-action" @click="openEditor(item)">
              <template #icon><NIcon><Edit3 /></NIcon></template>
              {{ t('comments.edit') }}
            </NButton>
            <NDropdown trigger="click" :options="actionOptions(item)" @select="handleMenuAction(item, $event)">
              <NButton quaternary circle class="comment-more" :aria-label="t('comments.moreActions')" :title="t('comments.moreActions')">
                <template #icon><NIcon><MoreHorizontal /></NIcon></template>
              </NButton>
            </NDropdown>
          </div>
        </article>
      </div>

      <NEmpty
        v-else-if="!loading"
        class="content-empty"
        :description="search || status !== 'all' || source !== 'all' ? t('comments.noResults') : t('comments.empty')"
      >
        <template #icon><NIcon><UserRound /></NIcon></template>
      </NEmpty>
    </NSpin>

    <footer v-if="totalPages > 1" class="content-pagination">
      <NButton secondary :disabled="page <= 1" @click="changePage(page - 1)">{{ t('content.previous') }}</NButton>
      <span>{{ t('content.pageSummary').replace('{page}', String(page)).replace('{pages}', String(totalPages)) }}</span>
      <NButton secondary :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t('content.next') }}</NButton>
    </footer>

    <NDrawer v-model:show="editorOpen" placement="right" width="min(500px, 100vw)">
      <NDrawerContent :title="t('comments.editTitle')" closable :native-scrollbar="false">
        <NForm :model="editForm" label-placement="top" size="large" @submit.prevent="saveComment">
          <NFormItem :label="t('comments.authorName')" required>
            <NInput v-model:value="editForm.authorName" />
          </NFormItem>
          <NFormItem :label="t('comments.authorEmail')" required>
            <NInput v-model:value="editForm.authorEmail" :input-props="{ type: 'email' }" />
          </NFormItem>
          <NFormItem :label="t('comments.authorUrl')">
            <NInput v-model:value="editForm.authorUrl" :input-props="{ type: 'url' }" />
          </NFormItem>
          <NFormItem :label="t('comments.comment')" required>
            <NInput v-model:value="editForm.content" type="textarea" :rows="6" />
          </NFormItem>
          <NFormItem :label="t('comments.status')">
            <NSelect v-model:value="editForm.status" :options="editStatusOptions" />
          </NFormItem>
          <div class="comment-drawer-actions">
            <NButton @click="editorOpen = false">{{ t('content.cancel') }}</NButton>
            <NButton type="primary" attr-type="submit" :loading="saving" :disabled="!editForm.authorName.trim() || !editForm.authorEmail.trim() || !editForm.content.trim()">
              {{ t('comments.saveChanges') }}
            </NButton>
          </div>
        </NForm>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="replyOpen" placement="right" width="min(460px, 100vw)">
      <NDrawerContent :title="t('comments.replyTitle')" closable :native-scrollbar="false">
        <div v-if="activeComment" class="comment-reply-context">
          <strong>{{ activeComment.author_name }}</strong>
          <p>{{ cleanText(activeComment.content.rendered) }}</p>
        </div>
        <NForm :model="replyForm" label-placement="top" size="large" @submit.prevent="submitReply">
          <NFormItem :label="t('comments.replyContent')" required>
            <NInput v-model:value="replyForm.content" type="textarea" :rows="7" :placeholder="t('comments.replyPlaceholder')" />
          </NFormItem>
          <div class="comment-drawer-actions">
            <NButton @click="replyOpen = false">{{ t('content.cancel') }}</NButton>
            <NButton type="primary" attr-type="submit" :loading="replying" :disabled="!replyForm.content.trim()">
              {{ t('comments.sendReply') }}
            </NButton>
          </div>
        </NForm>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>
