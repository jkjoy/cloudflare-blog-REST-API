<script setup lang="ts">
import { AlertTriangle, CheckCircle2, FileJson, FlaskConical, Play, Upload } from '@lucide/vue';
import {
  NButton,
  NEmpty,
  NIcon,
  NInput,
  NProgress,
  NSelect,
  NSwitch,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui';
import { computed, reactive, ref } from 'vue';
import { ApiError, apiFetch, apiJson } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';

type ConflictStrategy = 'update' | 'skip' | 'duplicate';
interface ImportPackage { format?: string; version?: string; source?: Record<string, unknown> | null; categories?: unknown[]; tags?: unknown[]; content?: Array<{ type?: string }>; moments?: unknown[] }
interface ImportSummary { total_content_items?: number; total_moment_items?: number; posts_detected?: number; pages_detected?: number; moments_detected?: number; created?: number; updated?: number; skipped?: number; failed?: number; categories_created?: number; categories_matched?: number; tags_created?: number; tags_matched?: number }
interface ImportIssue { level: 'warning' | 'error'; scope: string; identifier: string; message: string }
interface ImportResult { success: boolean; dry_run: boolean; format?: string; version?: string; strategy?: string; source?: Record<string, unknown> | null; summary: ImportSummary; issues: ImportIssue[] }

const BATCH_SIZE = 20;
const auth = useAuthStore();
const dialog = useDialog();
const message = useMessage();
const { t } = useAdminI18n();
const jsonText = ref('');
const strategy = ref<ConflictStrategy>('update');
const dryRun = ref(true);
const running = ref(false);
const progress = reactive({ current: 0, total: 0 });
const result = ref<ImportResult | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const strategyOptions = computed(() => [
  { label: t('importer.strategyUpdate'), value: 'update' },
  { label: t('importer.strategySkip'), value: 'skip' },
  { label: t('importer.strategyDuplicate'), value: 'duplicate' },
]);
const progressPercent = computed(() => progress.total ? Math.round((progress.current / progress.total) * 100) : 0);
const summaryCards = computed(() => result.value ? [
  ['created', t('importer.created'), result.value.summary.created || 0],
  ['updated', t('importer.updated'), result.value.summary.updated || 0],
  ['skipped', t('importer.skipped'), result.value.summary.skipped || 0],
  ['failed', t('importer.failed'), result.value.summary.failed || 0],
  ['categories', t('importer.categories'), result.value.summary.categories_created || 0],
  ['tags', t('importer.tags'), result.value.summary.tags_created || 0],
] : []);

function toArray(value: unknown) { return Array.isArray(value) ? value : []; }

function createBatches(pkg: ImportPackage) {
  const batches: ImportPackage[] = [];
  const base = { format: pkg.format || 'cfblog-import', version: pkg.version || '1.1', source: pkg.source || null };
  const content = toArray(pkg.content);
  const moments = toArray(pkg.moments);
  for (let start = 0; start < content.length; start += BATCH_SIZE) {
    batches.push({ ...base, categories: batches.length ? [] : toArray(pkg.categories), tags: batches.length ? [] : toArray(pkg.tags), content: content.slice(start, start + BATCH_SIZE) as Array<{ type?: string }>, moments: [] });
  }
  for (let start = 0; start < moments.length; start += BATCH_SIZE) {
    batches.push({ ...base, categories: [], tags: [], content: [], moments: moments.slice(start, start + BATCH_SIZE) });
  }
  return batches;
}

function createAggregate(pkg: ImportPackage): ImportResult {
  const content = toArray(pkg.content) as Array<{ type?: string }>;
  const moments = toArray(pkg.moments);
  const posts = content.filter((item) => (item.type || 'post') === 'post').length;
  return {
    success: true, dry_run: dryRun.value, format: pkg.format || 'cfblog-import', version: pkg.version || '1.1', strategy: strategy.value,
    source: pkg.source || null,
    summary: { total_content_items: content.length, total_moment_items: moments.length, posts_detected: posts, pages_detected: content.length - posts, moments_detected: moments.length, created: 0, updated: 0, skipped: 0, failed: 0, categories_created: 0, categories_matched: 0, tags_created: 0, tags_matched: 0 },
    issues: [],
  };
}

function mergeResult(target: ImportResult, source: ImportResult) {
  target.success = target.success && source.success !== false;
  for (const key of ['created', 'updated', 'skipped', 'failed', 'categories_created', 'categories_matched', 'tags_created', 'tags_matched'] as const) {
    target.summary[key] = (target.summary[key] || 0) + (source.summary?.[key] || 0);
  }
  if (source.issues?.length) target.issues.push(...source.issues);
}

async function loadTemplate() {
  try {
    const template = await apiJson<ImportPackage>('/import/template', {}, auth.token);
    jsonText.value = JSON.stringify(template, null, 2);
    result.value = null;
    message.success(t('importer.templateLoaded'));
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('importer.templateFailed'));
  }
}

async function handleFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    jsonText.value = await file.text();
    result.value = null;
    message.success(t('importer.fileLoaded'));
  } catch {
    message.error(t('importer.fileFailed'));
  } finally {
    (event.target as HTMLInputElement).value = '';
  }
}

async function executeImport() {
  let pkg: ImportPackage;
  try {
    pkg = JSON.parse(jsonText.value || '{}') as ImportPackage;
  } catch {
    message.error(t('importer.invalidJson'));
    return;
  }
  const batches = createBatches(pkg);
  if (!batches.length) {
    message.error(t('importer.emptyPackage'));
    return;
  }

  running.value = true;
  progress.current = 0;
  progress.total = batches.length;
  const aggregate = createAggregate(pkg);
  result.value = aggregate;
  try {
    for (let index = 0; index < batches.length; index += 1) {
      progress.current = index;
      const response = await apiFetch('/import', {
        method: 'POST',
        body: JSON.stringify({ package: batches[index], options: { dry_run: dryRun.value, conflict_strategy: strategy.value } }),
      }, auth.token);
      mergeResult(aggregate, await response.json() as ImportResult);
      progress.current = index + 1;
    }
    result.value = { ...aggregate };
    message.success(t(dryRun.value ? 'importer.dryRunComplete' : 'importer.importComplete'));
  } catch (error) {
    aggregate.success = false;
    aggregate.issues.push({ level: 'error', scope: 'package', identifier: `batch-${progress.current + 1}`, message: error instanceof Error ? error.message : t('importer.runFailed') });
    result.value = { ...aggregate };
    message.error(error instanceof ApiError ? error.message : t('importer.runFailed'));
  } finally {
    running.value = false;
  }
}

function runImport() {
  if (dryRun.value) { executeImport(); return; }
  dialog.warning({
    title: t('importer.confirmTitle'), content: t('importer.confirmBody'), positiveText: t('importer.confirmRun'), negativeText: t('content.cancel'),
    onPositiveClick: executeImport,
  });
}
</script>

<template>
  <section class="import-view">
    <header class="view-header content-view-header">
      <div><p class="view-eyebrow">{{ t('importer.manage') }}</p><h1>{{ t('importer.title') }}</h1><p class="view-description">{{ t('importer.description') }}</p></div>
      <NTag :type="dryRun ? 'warning' : 'error'" :bordered="false"><template #icon><NIcon><FlaskConical /></NIcon></template>{{ dryRun ? t('importer.dryRunBadge') : t('importer.liveBadge') }}</NTag>
    </header>

    <div class="import-layout">
      <main class="import-surface">
        <div class="import-options">
          <div><label>{{ t('importer.strategy') }}</label><NSelect v-model:value="strategy" :options="strategyOptions" /></div>
          <div class="import-dry-run"><div><strong>{{ t('importer.dryRun') }}</strong><small>{{ t('importer.dryRunHint') }}</small></div><NSwitch v-model:value="dryRun" /></div>
        </div>
        <label class="import-file-picker">
          <input ref="fileInput" type="file" accept=".json,application/json" @change="handleFile" />
          <Upload :size="22" /><span><strong>{{ t('importer.chooseFile') }}</strong><small>{{ t('importer.fileHint') }}</small></span>
        </label>
        <div class="import-json-header"><label>{{ t('importer.jsonLabel') }}</label><span>{{ t('importer.batchHint') }}</span></div>
        <NInput v-model:value="jsonText" class="import-json-input" type="textarea" :autosize="{ minRows: 18, maxRows: 32 }" placeholder='{"format":"cfblog-import","version":"1.1","content":[],"moments":[]}' />
        <div v-if="running" class="import-progress"><NProgress type="line" :percentage="progressPercent" :show-indicator="false" /><span>{{ t('importer.progress').replace('{current}', String(progress.current)).replace('{total}', String(progress.total)) }}</span></div>
        <div class="import-actions"><NButton secondary :disabled="running" @click="loadTemplate"><template #icon><NIcon><FileJson /></NIcon></template>{{ t('importer.loadTemplate') }}</NButton><NButton type="primary" :loading="running" :disabled="!jsonText.trim()" @click="runImport"><template #icon><NIcon><Play /></NIcon></template>{{ dryRun ? t('importer.runDry') : t('importer.runImport') }}</NButton></div>
      </main>

      <aside class="import-result-surface">
        <h2>{{ t('importer.resultTitle') }}</h2>
        <template v-if="result">
          <div class="import-result-meta"><NTag :type="result.success ? 'success' : 'error'" :bordered="false"><template #icon><NIcon><component :is="result.success ? CheckCircle2 : AlertTriangle" /></NIcon></template>{{ result.success ? t('importer.success') : t('importer.failedResult') }}</NTag><span>{{ result.format }} / {{ result.version }}</span></div>
          <div class="import-summary"><div v-for="card in summaryCards" :key="String(card[0])"><span>{{ card[1] }}</span><strong>{{ card[2] }}</strong></div></div>
          <section class="import-detected"><h3>{{ t('importer.detected') }}</h3><p>{{ t('importer.detectedSummary').replace('{posts}', String(result.summary.posts_detected || 0)).replace('{pages}', String(result.summary.pages_detected || 0)).replace('{moments}', String(result.summary.moments_detected || 0)) }}</p></section>
          <section class="import-issues"><h3>{{ t('importer.issues') }}</h3><ul v-if="result.issues.length"><li v-for="(issue, index) in result.issues" :key="`${issue.identifier}-${index}`" :class="issue.level"><strong>{{ issue.identifier }}</strong><span>{{ issue.message }}</span></li></ul><p v-else>{{ t('importer.noIssues') }}</p></section>
        </template>
        <NEmpty v-else :description="t('importer.noResult')" />
      </aside>
    </div>
  </section>
</template>
