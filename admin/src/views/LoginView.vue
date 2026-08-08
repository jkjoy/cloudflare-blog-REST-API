<script setup lang="ts">
import { LockKeyhole, Mail, UserRound } from '@lucide/vue';
import { NButton, NForm, NFormItem, NIcon, NInput, NTabPane, NTabs, useMessage } from 'naive-ui';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { useAdminI18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

const auth = useAuthStore();
const site = useSiteStore();
const router = useRouter();
const message = useMessage();
const { t } = useAdminI18n();
const submitting = ref(false);
const mode = ref<'login' | 'register'>('login');
const loginForm = reactive({ username: '', password: '' });
const registerForm = reactive({ username: '', email: '', password: '', display_name: '' });
const canRegister = computed(() => !auth.hasUsers);

onMounted(async () => {
  await Promise.all([site.load(), auth.checkHasUsers()]);
  if (!auth.hasUsers) mode.value = 'register';
});

function reportError(error: unknown) {
  message.error(error instanceof ApiError ? error.message : '操作失败，请稍后重试。');
}

async function submitLogin() {
  if (!loginForm.username.trim() || !loginForm.password) return;
  submitting.value = true;
  try {
    await auth.login(loginForm.username.trim(), loginForm.password);
    await router.replace('/dashboard');
  } catch (error) {
    reportError(error);
  } finally {
    submitting.value = false;
  }
}

async function submitRegister() {
  if (!registerForm.username.trim() || !registerForm.email.trim() || registerForm.password.length < 12) return;
  submitting.value = true;
  try {
    await auth.register({ ...registerForm });
    await router.replace('/dashboard');
  } catch (error) {
    reportError(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="login-shell">
    <section class="login-frame" aria-label="Admin sign in">
      <aside class="login-visual">
        <div class="login-brand">
          <span class="admin-brand-mark light">C</span>
          <div>
            <strong>{{ site.title }}</strong>
            <small>{{ t('brandSuffix') }}</small>
          </div>
        </div>
        <div class="login-visual-copy">
          <h1>{{ site.title }}</h1>
          <p>{{ site.description }}</p>
        </div>
      </aside>

      <div class="login-form-panel">
        <NTabs v-if="canRegister" v-model:value="mode" type="segment" animated>
          <NTabPane name="login" :tab="t('login.submit')">
            <div class="login-heading">
              <h2>{{ t('login.title') }}</h2>
              <p>{{ t('login.subtitle') }}</p>
            </div>
            <NForm :model="loginForm" size="large" @submit.prevent="submitLogin">
              <NFormItem :label="t('login.username')">
                <NInput v-model:value="loginForm.username" :input-props="{ autocomplete: 'username' }" :placeholder="t('login.username')">
                  <template #prefix><NIcon><UserRound /></NIcon></template>
                </NInput>
              </NFormItem>
              <NFormItem :label="t('login.password')">
                <NInput v-model:value="loginForm.password" type="password" show-password-on="click" :input-props="{ autocomplete: 'current-password' }" @keyup.enter="submitLogin">
                  <template #prefix><NIcon><LockKeyhole /></NIcon></template>
                </NInput>
              </NFormItem>
              <NButton type="primary" block size="large" :loading="submitting" @click="submitLogin">
                {{ submitting ? t('login.submitting') : t('login.submit') }}
              </NButton>
            </NForm>
          </NTabPane>
          <NTabPane name="register" :tab="t('login.create')">
            <div class="login-heading">
              <h2>{{ t('login.createTitle') }}</h2>
              <p>{{ t('login.createSubtitle') }}</p>
            </div>
            <NForm :model="registerForm" size="large" @submit.prevent="submitRegister">
              <div class="form-grid">
                <NFormItem :label="t('login.username')">
                  <NInput v-model:value="registerForm.username" :input-props="{ autocomplete: 'username' }"><template #prefix><NIcon><UserRound /></NIcon></template></NInput>
                </NFormItem>
                <NFormItem :label="t('login.displayName')">
                  <NInput v-model:value="registerForm.display_name" :input-props="{ autocomplete: 'name' }" />
                </NFormItem>
              </div>
              <NFormItem :label="t('login.email')">
                <NInput v-model:value="registerForm.email" type="text" :input-props="{ autocomplete: 'email', type: 'email' }"><template #prefix><NIcon><Mail /></NIcon></template></NInput>
              </NFormItem>
              <NFormItem :label="t('login.password')">
                <NInput v-model:value="registerForm.password" type="password" show-password-on="click" :input-props="{ autocomplete: 'new-password', minlength: 12 }"><template #prefix><NIcon><LockKeyhole /></NIcon></template></NInput>
              </NFormItem>
              <NButton type="primary" block size="large" :loading="submitting" @click="submitRegister">
                {{ submitting ? t('login.creating') : t('login.create') }}
              </NButton>
            </NForm>
          </NTabPane>
        </NTabs>

        <template v-else>
          <div class="login-heading">
            <h2>{{ t('login.title') }}</h2>
            <p>{{ t('login.subtitle') }}</p>
          </div>
          <NForm :model="loginForm" size="large" @submit.prevent="submitLogin">
            <NFormItem :label="t('login.username')">
              <NInput v-model:value="loginForm.username" :input-props="{ autocomplete: 'username' }" :placeholder="t('login.username')">
                <template #prefix><NIcon><UserRound /></NIcon></template>
              </NInput>
            </NFormItem>
            <NFormItem :label="t('login.password')">
              <NInput v-model:value="loginForm.password" type="password" show-password-on="click" :input-props="{ autocomplete: 'current-password' }" @keyup.enter="submitLogin">
                <template #prefix><NIcon><LockKeyhole /></NIcon></template>
              </NInput>
            </NFormItem>
            <NButton type="primary" block size="large" :loading="submitting" @click="submitLogin">
              {{ submitting ? t('login.submitting') : t('login.submit') }}
            </NButton>
          </NForm>
        </template>
      </div>
    </section>
  </main>
</template>
