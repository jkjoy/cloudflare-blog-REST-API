<script setup lang="ts">
import { Save } from '@lucide/vue';
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
  useMessage,
} from 'naive-ui';
import { computed, reactive, ref } from 'vue';
import { ApiError, apiFetch } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

const auth = useAuthStore();
const site = useSiteStore();
const message = useMessage();
const { locale, t, toggleLocale } = useAdminI18n();
const loading = ref(true);
const saving = ref(false);
const activeTab = ref('general');

const form = reactive({
  siteTitle: '', siteUrl: '', adminEmail: '', gravatarBaseUrl: 'https://cn.cravatar.com/avatar', siteDescription: '',
  homePostsPerPage: 15, siteKeywords: '', siteAuthor: '', siteFavicon: '', siteLogo: '', siteNotice: '', siteIcp: '', siteFooterText: '', headHtml: '',
  mailFromName: '', mailFromEmail: '', mailNotificationsEnabled: false, notifyAdminOnComment: true, notifyCommenterOnReply: true,
  commentTurnstileEnabled: false, commentTurnstileSiteKey: '', commentTurnstileSecretKey: '', commentModerationFirstComment: true,
  commentRateLimitSeconds: 30, commentMaxLinks: 2, commentSpamKeywords: '',
  socialTelegram: '', socialX: '', socialMastodon: '', socialEmail: '', socialQq: '',
  webhookUrl: '', webhookSecret: '', webhookEvents: [] as string[],
});

const language = computed({
  get: () => locale.value,
  set: (value: 'zh' | 'en') => { if (value !== locale.value) toggleLocale(); },
});
const languageOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
];
const tabOptions = computed(() => [
  { label: t('settings.generalTab'), value: 'general' },
  { label: t('settings.appearanceTab'), value: 'appearance' },
  { label: t('settings.mailTab'), value: 'mail' },
  { label: t('settings.commentsTab'), value: 'comments' },
  { label: t('settings.integrationsTab'), value: 'integrations' },
]);
const webhookOptions = [
  ['post.created', 'settings.webhookPostCreated'], ['post.updated', 'settings.webhookPostUpdated'],
  ['post.published', 'settings.webhookPostPublished'], ['post.deleted', 'settings.webhookPostDeleted'],
  ['comment.created', 'settings.webhookCommentCreated'], ['comment.updated', 'settings.webhookCommentUpdated'],
  ['comment.deleted', 'settings.webhookCommentDeleted'],
] as const;

function enabled(value: string | undefined, fallback: boolean) {
  return value === undefined ? fallback : value === '1';
}

function applySettings(data: Record<string, string>) {
  Object.assign(form, {
    siteTitle: data.site_title || '', siteUrl: data.site_url || '', adminEmail: data.admin_email || '',
    gravatarBaseUrl: data.gravatar_base_url || 'https://cn.cravatar.com/avatar', siteDescription: data.site_description || '',
    homePostsPerPage: Number(data.home_posts_per_page) || 15, siteKeywords: data.site_keywords || '', siteAuthor: data.site_author || '',
    siteFavicon: data.site_favicon || '', siteLogo: data.site_logo || '', siteNotice: data.site_notice || '', siteIcp: data.site_icp || '',
    siteFooterText: data.site_footer_text || '', headHtml: data.head_html || '', mailFromName: data.mail_from_name || data.site_title || '',
    mailFromEmail: data.mail_from_email || '', mailNotificationsEnabled: enabled(data.mail_notifications_enabled, false),
    notifyAdminOnComment: enabled(data.notify_admin_on_comment, true), notifyCommenterOnReply: enabled(data.notify_commenter_on_reply, true),
    commentTurnstileEnabled: enabled(data.comment_turnstile_enabled, false), commentTurnstileSiteKey: data.comment_turnstile_site_key || '',
    commentTurnstileSecretKey: data.comment_turnstile_secret_key || '', commentModerationFirstComment: enabled(data.comment_moderation_first_comment, true),
    commentRateLimitSeconds: Number(data.comment_rate_limit_seconds) || 30, commentMaxLinks: Number(data.comment_max_links) || 2,
    commentSpamKeywords: data.comment_spam_keywords || '', socialTelegram: data.social_telegram || '', socialX: data.social_x || '',
    socialMastodon: data.social_mastodon || '', socialEmail: data.social_email || '', socialQq: data.social_qq || '',
    webhookUrl: data.webhook_url || '', webhookSecret: data.webhook_secret || '', webhookEvents: (data.webhook_events || '').split(',').filter(Boolean),
  });
}

async function loadSettings() {
  loading.value = true;
  try {
    const response = await apiFetch('/settings/admin', {}, auth.token);
    applySettings(await response.json() as Record<string, string>);
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('settings.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  if (!form.siteTitle.trim() || !form.siteUrl.trim() || !form.adminEmail.trim()) {
    message.warning(t('settings.requiredFields'));
    activeTab.value = 'general';
    return;
  }
  saving.value = true;
  const payload = {
    site_title: form.siteTitle.trim(), site_url: form.siteUrl.trim(), admin_email: form.adminEmail.trim(), gravatar_base_url: form.gravatarBaseUrl.trim(),
    site_description: form.siteDescription, home_posts_per_page: String(form.homePostsPerPage || 15), site_keywords: form.siteKeywords,
    site_author: form.siteAuthor, site_favicon: form.siteFavicon.trim(), site_logo: form.siteLogo.trim(), site_notice: form.siteNotice,
    site_icp: form.siteIcp, site_footer_text: form.siteFooterText, head_html: form.headHtml,
    mail_from_name: form.mailFromName, mail_from_email: form.mailFromEmail.trim(), mail_notifications_enabled: form.mailNotificationsEnabled ? '1' : '0',
    notify_admin_on_comment: form.notifyAdminOnComment ? '1' : '0', notify_commenter_on_reply: form.notifyCommenterOnReply ? '1' : '0',
    comment_turnstile_enabled: form.commentTurnstileEnabled ? '1' : '0', comment_turnstile_site_key: form.commentTurnstileSiteKey,
    comment_turnstile_secret_key: form.commentTurnstileSecretKey, comment_moderation_first_comment: form.commentModerationFirstComment ? '1' : '0',
    comment_rate_limit_seconds: String(form.commentRateLimitSeconds || 30), comment_max_links: String(form.commentMaxLinks || 2),
    comment_spam_keywords: form.commentSpamKeywords, social_telegram: form.socialTelegram, social_x: form.socialX,
    social_mastodon: form.socialMastodon, social_email: form.socialEmail, social_qq: form.socialQq,
    webhook_url: form.webhookUrl.trim(), webhook_secret: form.webhookSecret, webhook_events: form.webhookEvents.join(','),
  };
  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(payload) }, auth.token);
    await site.load();
    message.success(t('settings.saved'));
  } catch (error) {
    message.error(error instanceof ApiError ? error.message : t('settings.saveFailed'));
  } finally {
    saving.value = false;
  }
}

loadSettings();
</script>

<template>
  <section class="settings-view">
    <header class="view-header content-view-header">
      <div><p class="view-eyebrow">{{ t('settings.manage') }}</p><h1>{{ t('settings.title') }}</h1><p class="view-description">{{ t('settings.description') }}</p></div>
      <NButton type="primary" :loading="saving" :disabled="loading" @click="saveSettings"><template #icon><NIcon><Save /></NIcon></template>{{ t('settings.save') }}</NButton>
    </header>

    <NSpin :show="loading">
      <NForm v-if="!loading" :model="form" label-placement="top" class="settings-surface" @submit.prevent="saveSettings">
        <NSelect v-model:value="activeTab" class="settings-mobile-tab-select" :options="tabOptions" :aria-label="t('settings.sectionPicker')" />
        <NTabs v-model:value="activeTab" type="line" animated class="settings-tabs">
          <NTabPane name="general" :tab="t('settings.generalTab')">
            <section class="settings-section"><h2>{{ t('settings.interfaceSection') }}</h2><div class="settings-form-grid"><NFormItem :label="t('settings.language')"><NSelect v-model:value="language" :options="languageOptions" /></NFormItem></div></section>
            <section class="settings-section"><h2>{{ t('settings.siteSection') }}</h2><div class="settings-form-grid">
              <NFormItem :label="t('settings.siteTitle')" required><NInput v-model:value="form.siteTitle" /></NFormItem>
              <NFormItem :label="t('settings.siteUrl')" required><NInput v-model:value="form.siteUrl" placeholder="https://example.com" :input-props="{ type: 'url' }" /></NFormItem>
              <NFormItem :label="t('settings.adminEmail')" required><NInput v-model:value="form.adminEmail" placeholder="admin@example.com" :input-props="{ type: 'email' }" /></NFormItem>
              <NFormItem :label="t('settings.gravatarBaseUrl')"><NInput v-model:value="form.gravatarBaseUrl" placeholder="https://cn.cravatar.com/avatar" :input-props="{ type: 'url' }" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.siteDescription')"><NInput v-model:value="form.siteDescription" type="textarea" :rows="3" /></NFormItem>
              <NFormItem :label="t('settings.homePostsPerPage')"><NInputNumber v-model:value="form.homePostsPerPage" :min="1" :max="100" /></NFormItem>
              <NFormItem :label="t('settings.siteAuthor')"><NInput v-model:value="form.siteAuthor" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.siteKeywords')"><NInput v-model:value="form.siteKeywords" :placeholder="t('settings.keywordsPlaceholder')" /></NFormItem>
            </div></section>
          </NTabPane>

          <NTabPane name="appearance" :tab="t('settings.appearanceTab')">
            <section class="settings-section"><h2>{{ t('settings.brandSection') }}</h2><div class="settings-form-grid">
              <NFormItem :label="t('settings.siteFavicon')"><NInput v-model:value="form.siteFavicon" placeholder="https://example.com/favicon.ico" :input-props="{ type: 'url' }" /></NFormItem>
              <NFormItem :label="t('settings.siteLogo')"><NInput v-model:value="form.siteLogo" placeholder="https://example.com/logo.png" :input-props="{ type: 'url' }" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.siteNotice')"><NInput v-model:value="form.siteNotice" type="textarea" :rows="3" /></NFormItem>
              <NFormItem :label="t('settings.siteIcp')"><NInput v-model:value="form.siteIcp" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.footerText')"><NInput v-model:value="form.siteFooterText" type="textarea" :rows="3" /></NFormItem>
              <NFormItem class="settings-span-2 settings-code-field" :label="t('settings.headHtml')"><NInput v-model:value="form.headHtml" type="textarea" :rows="7" /></NFormItem>
            </div></section>
          </NTabPane>

          <NTabPane name="mail" :tab="t('settings.mailTab')">
            <section class="settings-section"><h2>{{ t('settings.mailSection') }}</h2><div class="settings-form-grid">
              <NFormItem :label="t('settings.fromName')"><NInput v-model:value="form.mailFromName" /></NFormItem>
              <NFormItem :label="t('settings.fromEmail')"><NInput v-model:value="form.mailFromEmail" placeholder="notifications@example.com" :input-props="{ type: 'email' }" /></NFormItem>
            </div><div class="settings-switch-list">
              <label class="settings-switch-row"><span><strong>{{ t('settings.enableMail') }}</strong><small>{{ t('settings.enableMailHint') }}</small></span><NSwitch v-model:value="form.mailNotificationsEnabled" /></label>
              <label class="settings-switch-row"><span><strong>{{ t('settings.notifyAdmin') }}</strong></span><NSwitch v-model:value="form.notifyAdminOnComment" /></label>
              <label class="settings-switch-row"><span><strong>{{ t('settings.notifyCommenter') }}</strong></span><NSwitch v-model:value="form.notifyCommenterOnReply" /></label>
            </div></section>
          </NTabPane>

          <NTabPane name="comments" :tab="t('settings.commentsTab')">
            <section class="settings-section"><h2>{{ t('settings.commentSection') }}</h2><div class="settings-switch-list">
              <label class="settings-switch-row"><span><strong>{{ t('settings.enableTurnstile') }}</strong><small>{{ t('settings.enableTurnstileHint') }}</small></span><NSwitch v-model:value="form.commentTurnstileEnabled" /></label>
              <label class="settings-switch-row"><span><strong>{{ t('settings.firstCommentModeration') }}</strong></span><NSwitch v-model:value="form.commentModerationFirstComment" /></label>
            </div><div class="settings-form-grid settings-grid-spaced">
              <NFormItem :label="t('settings.turnstileSiteKey')"><NInput v-model:value="form.commentTurnstileSiteKey" /></NFormItem>
              <NFormItem :label="t('settings.turnstileSecretKey')"><NInput v-model:value="form.commentTurnstileSecretKey" type="password" show-password-on="click" /></NFormItem>
              <NFormItem :label="t('settings.rateLimit')"><NInputNumber v-model:value="form.commentRateLimitSeconds" :min="1" /></NFormItem>
              <NFormItem :label="t('settings.maxLinks')"><NInputNumber v-model:value="form.commentMaxLinks" :min="1" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.spamKeywords')"><NInput v-model:value="form.commentSpamKeywords" type="textarea" :rows="6" :placeholder="t('settings.spamKeywordsPlaceholder')" /></NFormItem>
            </div></section>
          </NTabPane>

          <NTabPane name="integrations" :tab="t('settings.integrationsTab')">
            <section class="settings-section"><h2>{{ t('settings.socialSection') }}</h2><div class="settings-form-grid">
              <NFormItem label="Telegram"><NInput v-model:value="form.socialTelegram" /></NFormItem><NFormItem label="X"><NInput v-model:value="form.socialX" /></NFormItem>
              <NFormItem label="Mastodon"><NInput v-model:value="form.socialMastodon" /></NFormItem><NFormItem :label="t('settings.socialEmail')"><NInput v-model:value="form.socialEmail" :input-props="{ type: 'email' }" /></NFormItem>
              <NFormItem label="QQ"><NInput v-model:value="form.socialQq" /></NFormItem>
            </div></section>
            <section class="settings-section"><h2>{{ t('settings.webhookSection') }}</h2><div class="settings-form-grid">
              <NFormItem class="settings-span-2" :label="t('settings.webhookUrl')"><NInput v-model:value="form.webhookUrl" placeholder="https://example.com/webhook" :input-props="{ type: 'url' }" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.webhookSecret')"><NInput v-model:value="form.webhookSecret" type="password" show-password-on="click" /></NFormItem>
              <NFormItem class="settings-span-2" :label="t('settings.webhookEvents')"><NCheckboxGroup v-model:value="form.webhookEvents"><div class="settings-checkbox-grid"><NCheckbox v-for="option in webhookOptions" :key="option[0]" :value="option[0]" :label="`${option[0]} (${t(option[1])})`" /></div></NCheckboxGroup></NFormItem>
            </div></section>
          </NTabPane>
        </NTabs>
        <div class="settings-savebar"><span>{{ t('settings.saveHint') }}</span><NButton type="primary" attr-type="submit" :loading="saving"><template #icon><NIcon><Save /></NIcon></template>{{ t('settings.save') }}</NButton></div>
      </NForm>
    </NSpin>
  </section>
</template>
