import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiJson } from '../api/client';
import type { AdminUser, AuthResponse } from '../types';

export const useAuthStore = defineStore('auth', () => {
  localStorage.removeItem('auth_token');
  const token = ref('');
  const user = ref<AdminUser | null>(null);
  const checking = ref(false);
  const hasUsers = ref(true);
  const authenticated = computed(() => !!user.value);

  function persistSession(response: AuthResponse) {
    user.value = response.user;
  }

  function clearSession() {
    token.value = '';
    user.value = null;
  }

  async function checkSession() {
    if (user.value) return true;
    checking.value = true;
    try {
      user.value = await apiJson<AdminUser>('/users/me');
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      checking.value = false;
    }
  }

  async function checkHasUsers() {
    try {
      const status = await apiJson<{ has_users: boolean }>('/users/registration-status');
      hasUsers.value = status.has_users;
    } catch {
      hasUsers.value = true;
    }
  }

  async function login(username: string, password: string) {
    const response = await apiJson<AuthResponse>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, use_cookie: true }),
    });
    persistSession(response);
  }

  async function register(input: {
    username: string;
    email: string;
    password: string;
    display_name: string;
  }) {
    const response = await apiJson<AuthResponse>('/users/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, use_cookie: true }),
    });
    persistSession(response);
  }

  async function logout() {
    try {
      await apiJson<{ success: boolean }>('/users/logout', { method: 'POST' });
    } catch {
      // Local state still needs to be cleared when the network is unavailable.
    } finally {
      clearSession();
    }
  }

  return {
    authenticated,
    checkHasUsers,
    checkSession,
    checking,
    clearSession,
    hasUsers,
    login,
    logout,
    register,
    token,
    user,
  };
});
