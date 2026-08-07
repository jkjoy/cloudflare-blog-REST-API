<script setup lang="ts">
import {
  Bold,
  Code2,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from '@lucide/vue';
import { marked } from 'marked';
import { NButton, NIcon, NRadioButton, NRadioGroup, NTooltip } from 'naive-ui';
import { computed, nextTick, ref } from 'vue';
import { useAdminI18n } from '../i18n';

const props = defineProps<{
  modelValue: string;
  placeholder: string;
  allowMedia?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'request-media': [];
}>();

const { t } = useAdminI18n();
const mode = ref<'write' | 'preview'>('write');
const textarea = ref<HTMLTextAreaElement | null>(null);

const characterCount = computed(() => props.modelValue.length);
const lineCount = computed(() => props.modelValue ? props.modelValue.split('\n').length : 0);
const previewDocument = computed(() => {
  const content = props.modelValue.trim()
    ? marked.parse(props.modelValue, { async: false }) as string
    : `<p class="empty">${t('editor.previewEmpty')}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    :root{color:#273746;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.75}
    body{margin:0;padding:18px 20px;overflow-wrap:anywhere}
    h1,h2,h3,h4{margin:1.2em 0 .55em;color:#18212b;line-height:1.35;letter-spacing:0}
    h1{font-size:1.8em}h2{font-size:1.45em}h3{font-size:1.2em}
    p,ul,ol,blockquote,pre{margin:.8em 0}a{color:#2271b1}
    img{max-width:100%;height:auto;outline:1px solid rgba(0,0,0,.1);outline-offset:-1px}
    blockquote{padding:.2em 1em;border-left:3px solid #72aee6;color:#52606d}
    code{padding:.15em .35em;border-radius:3px;background:#eef2f5;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
    pre{overflow:auto;padding:14px;border-radius:6px;background:#18212b;color:#f5f7f9}pre code{padding:0;background:transparent;color:inherit}
    .empty{color:#7a8590;text-align:center}
  </style></head><body>${content}</body></html>`;
});

function updateValue(value: string) {
  emit('update:modelValue', value);
}

async function wrapSelection(prefix: string, suffix = '', fallback = '') {
  mode.value = 'write';
  await nextTick();
  const element = textarea.value;
  if (!element) return;
  const start = element.selectionStart;
  const end = element.selectionEnd;
  const selected = props.modelValue.slice(start, end) || fallback;
  const value = `${props.modelValue.slice(0, start)}${prefix}${selected}${suffix}${props.modelValue.slice(end)}`;
  updateValue(value);
  await nextTick();
  const selectionStart = start + prefix.length;
  element.focus();
  element.setSelectionRange(selectionStart, selectionStart + selected.length);
}

function insertText(value: string) {
  wrapSelection(value);
}

function handleTab() {
  wrapSelection('  ');
}

defineExpose({ insertText });
</script>

<template>
  <div class="markdown-editor">
    <div class="markdown-editor-header">
      <div class="markdown-toolbar" :aria-label="t('editor.formatting')">
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.bold')" @click="wrapSelection('**', '**', t('editor.selection'))"><template #icon><NIcon><Bold /></NIcon></template></NButton></template>{{ t('editor.bold') }}</NTooltip>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.italic')" @click="wrapSelection('_', '_', t('editor.selection'))"><template #icon><NIcon><Italic /></NIcon></template></NButton></template>{{ t('editor.italic') }}</NTooltip>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.heading')" @click="wrapSelection('## ', '', t('editor.headingText'))"><template #icon><NIcon><Heading2 /></NIcon></template></NButton></template>{{ t('editor.heading') }}</NTooltip>
        <span class="markdown-toolbar-divider" aria-hidden="true"></span>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.quote')" @click="wrapSelection('> ', '', t('editor.selection'))"><template #icon><NIcon><Quote /></NIcon></template></NButton></template>{{ t('editor.quote') }}</NTooltip>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.bulletList')" @click="wrapSelection('- ', '', t('editor.selection'))"><template #icon><NIcon><List /></NIcon></template></NButton></template>{{ t('editor.bulletList') }}</NTooltip>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.numberedList')" @click="wrapSelection('1. ', '', t('editor.selection'))"><template #icon><NIcon><ListOrdered /></NIcon></template></NButton></template>{{ t('editor.numberedList') }}</NTooltip>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.link')" @click="wrapSelection('[', '](https://)', t('editor.linkText'))"><template #icon><NIcon><LinkIcon /></NIcon></template></NButton></template>{{ t('editor.link') }}</NTooltip>
        <NTooltip trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.code')" @click="wrapSelection('`', '`', t('editor.selection'))"><template #icon><NIcon><Code2 /></NIcon></template></NButton></template>{{ t('editor.code') }}</NTooltip>
        <NTooltip v-if="allowMedia" trigger="hover"><template #trigger><NButton quaternary circle :aria-label="t('editor.media')" @click="emit('request-media')"><template #icon><NIcon><ImageIcon /></NIcon></template></NButton></template>{{ t('editor.media') }}</NTooltip>
      </div>
      <NRadioGroup v-model:value="mode" size="small" class="markdown-mode">
        <NRadioButton value="write">{{ t('editor.write') }}</NRadioButton>
        <NRadioButton value="preview">{{ t('editor.preview') }}</NRadioButton>
      </NRadioGroup>
    </div>

    <textarea
      v-if="mode === 'write'"
      ref="textarea"
      class="markdown-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="t('editor.content')"
      @input="updateValue(($event.target as HTMLTextAreaElement).value)"
      @keydown.tab.prevent="handleTab"
    ></textarea>
    <iframe
      v-else
      class="markdown-preview"
      sandbox=""
      :title="t('editor.preview')"
      :srcdoc="previewDocument"
    ></iframe>

    <div class="markdown-editor-status">
      <span>{{ t('editor.characters').replace('{count}', String(characterCount)) }}</span>
      <span>{{ t('editor.lines').replace('{count}', String(lineCount)) }}</span>
    </div>
  </div>
</template>
