import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

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
        path: '/projects/fractals',
        name: 'Fractals',
        component: () => import('../views/projects/Fractals.vue'),
        meta: { title: 'Fractals' },
    },
    {
        path: '/projects/rrpss',
        name: 'RRPSS',
        component: () => import('../views/projects/RRPSS.vue'),
        meta: { title: 'RRPSS' },
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
        meta: { title: 'Placeholders' },
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
    document.title = `${to.meta.title ?? 'Home'} | Jovian Lim`
})

export default router
