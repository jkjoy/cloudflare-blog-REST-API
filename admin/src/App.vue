<script setup lang="ts">
import { onMounted } from 'vue';
import { NConfigProvider, NDialogProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui';
import { useAdminI18n } from './i18n';
import { useSiteStore } from './stores/site';

const site = useSiteStore();
const { isChinese } = useAdminI18n();

onMounted(() => site.load());
</script>

<template>
  <NConfigProvider
    :locale="isChinese ? zhCN : undefined"
    :date-locale="isChinese ? dateZhCN : undefined"
    :theme-overrides="{
      common: {
        primaryColor: '#2271b1',
        primaryColorHover: '#135e96',
        primaryColorPressed: '#0a4b78',
        primaryColorSuppl: '#2271b1',
        borderRadius: '6px',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      },
    }"
  >
    <NDialogProvider>
      <NMessageProvider placement="top-right">
        <RouterView />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
