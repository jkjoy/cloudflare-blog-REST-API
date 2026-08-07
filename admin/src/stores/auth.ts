import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiJson } from '../api/client';
import type { AdminUser, AuthResponse } from '../types';

const TOKEN_KEY = 'auth_token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '');
  const user = ref<AdminUser | null>(null);
  const checking = ref(false);
  const hasUsers = ref(true);
  const authenticated = computed(() => !!token.value && !!user.value);

  function persistSession(response: AuthResponse) {
    token.value = response.token;
    user.value = response.user;
    localStorage.setItem(TOKEN_KEY, response.token);
  }

  function clearSession() {
    token.value = '';
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async function checkSession() {
    if (!token.value) return false;
    if (user.value) return true;
    checking.value = true;
    try {
      user.value = await apiJson<AdminUser>('/users/me', {}, token.value);
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
      const users = await apiJson<AdminUser[]>('/users?per_page=1');
      hasUsers.value = users.length > 0;
    } catch {
      hasUsers.value = true;
    }
  }

  async function login(username: string, password: string) {
    const response = await apiJson<AuthResponse>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
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
      body: JSON.stringify(input),
    });
    persistSession(response);
  }

  return {
    authenticated,
    checkHasUsers,
    checkSession,
    checking,
    clearSession,
    hasUsers,
    login,
    register,
    token,
    user,
  };
});
