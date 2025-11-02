import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import { findProject } from '../data/projects.js'

const routes = [
    { path: '/', name: 'Home', component: Home, meta: { title: 'Home' } },
    {
        path: '/skills',
        name: 'Skills',
        component: () => import('../views/Skills.vue'),
        meta: { title: 'Skills' },
    },
    {
        path: '/projects',
        name: 'Projects',
        component: () => import('../views/Projects.vue'),
        meta: { title: 'Projects' },
    },
    {
        path: '/projects/dancing_tables',
        name: 'DancingTables',
        component: () => import('../views/projects/DancingTables.vue'),
        meta: { title: 'Dancing Tables' },
    },
    {
        path: '/projects/placeholders',
        name: 'Placeholders',
        component: () => import('../views/projects/Placeholders.vue'),
        meta: { title: 'Find My HDB' },
    },
    // One page for every featured project. An unknown id falls through to the 404.
    {
        path: '/projects/:id',
        name: 'Project',
        component: () => import('../views/ProjectDetail.vue'),
        meta: { title: (to) => findProject(to.params.id)?.title },
        beforeEnter: (to) =>
            findProject(to.params.id)
                ? true
                : { name: 'NotFound', params: { pathMatch: to.path.slice(1).split('/') }, replace: true },
    },
    {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('../views/NotFound.vue'),
        meta: { title: 'Not found' },
    },
]

const router = createRouter({
    history: createWebHistory(),
    routes,
})

router.beforeEach((to) => {
    const title = typeof to.meta.title === 'function' ? to.meta.title(to) : to.meta.title
    document.title = `${title ?? 'Home'} | Jovian Lim`
})

export default router
