import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import AdminLayout from './layouts/AdminLayout.vue';

export const router = createRouter({
  history: createWebHashHistory('/wp-admin'),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { titleKey: 'dashboard.title' } },
        { path: 'posts/new', name: 'post-create', component: () => import('./views/ContentEditorView.vue'), props: { kind: 'posts' }, meta: { titleKey: 'nav.posts' } },
        { path: 'posts/:id/edit', name: 'post-edit', component: () => import('./views/ContentEditorView.vue'), props: { kind: 'posts' }, meta: { titleKey: 'nav.posts' } },
        { path: 'posts', name: 'posts', component: () => import('./views/ContentListView.vue'), props: { kind: 'posts' }, meta: { titleKey: 'nav.posts' } },
        { path: 'pages/new', name: 'page-create', component: () => import('./views/ContentEditorView.vue'), props: { kind: 'pages' }, meta: { titleKey: 'nav.pages' } },
        { path: 'pages/:id/edit', name: 'page-edit', component: () => import('./views/ContentEditorView.vue'), props: { kind: 'pages' }, meta: { titleKey: 'nav.pages' } },
        { path: 'pages', name: 'pages', component: () => import('./views/ContentListView.vue'), props: { kind: 'pages' }, meta: { titleKey: 'nav.pages' } },
        { path: 'moments', name: 'moments', component: () => import('./views/MomentsView.vue'), meta: { titleKey: 'nav.moments' } },
        { path: 'categories', name: 'categories', component: () => import('./views/TaxonomyView.vue'), props: { kind: 'categories' }, meta: { titleKey: 'nav.categories' } },
        { path: 'tags', name: 'tags', component: () => import('./views/TaxonomyView.vue'), props: { kind: 'tags' }, meta: { titleKey: 'nav.tags' } },
        { path: 'media', name: 'media', component: () => import('./views/MediaView.vue'), meta: { titleKey: 'nav.media' } },
        { path: 'links', name: 'links', component: () => import('./views/LinksView.vue'), meta: { titleKey: 'nav.links' } },
        { path: 'comments', name: 'comments', component: () => import('./views/CommentsView.vue'), meta: { titleKey: 'nav.comments' } },
        { path: 'import', name: 'import', component: () => import('./views/ImportView.vue'), meta: { titleKey: 'nav.import' } },
        { path: 'users', name: 'users', component: () => import('./views/UsersView.vue'), meta: { titleKey: 'nav.users' } },
        { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { titleKey: 'nav.settings' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const signedIn = await auth.checkSession();
  if (!to.meta.public && !signedIn) return { name: 'login' };
  if (to.name === 'login' && signedIn) return { name: 'dashboard' };
  return true;
});
