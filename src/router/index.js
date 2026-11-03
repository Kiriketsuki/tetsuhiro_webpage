import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import { findProject } from '../data/projects.js'
import { land } from '../composables/useWaypoints.js'

// The routes whose way back to Home lands on the Projects section.
const PROJECT_ROUTES = ['Projects', 'Project', 'DancingTables', 'Placeholders']

const routes = [
    {
        path: '/',
        name: 'Home',
        component: Home,
        meta: { title: 'Home' },
        // /#projects opens Home on that section, and the address drops the hash. Back from a
        // project page, the browser's own Back too, lands on Projects and not on the welcome.
        beforeEnter: (to, from) => {
            if (to.hash) return land(to.hash) ? { path: '/', hash: '' } : true
            if (PROJECT_ROUTES.includes(from.name)) land('projects')
            return true
        },
    },
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
    // One page for every featured project. An unknown id goes to the wall, so a link to a
    // project that left the site still lands somewhere useful.
    {
        path: '/projects/:id',
        name: 'Project',
        // The same view as Projects: the wall with this pin open, or the project page.
        component: () => import('../views/Projects.vue'),
        meta: { title: (to) => findProject(to.params.id)?.title },
        beforeEnter: (to) => (findProject(to.params.id) ? true : { path: '/projects', replace: true }),
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
