import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue';
import Test from '../views/Test.vue';
import Skills from '../views/Skills.vue';
import Projects from '../views/Projects.vue';

import Fractals from '../views/projects/Fractals.vue';
import RRPSS from '../views/projects/RRPSS.vue';
import DancingTables from '../views/projects/DancingTables.vue';
import Placeholders from '../views/projects/Placeholders.vue';

const routes = [{
    path: '/',
    name: 'Home',
    component: Home
    }, {
    path: '/test',
    name: 'test',
    component: Test
    }, {
    path: '/skills',
    name: 'Skills',
    component: Skills,
    }, {
        path: '/projects',
        name: 'Projects',
        component: Projects
    }, {
        path: '/projects/fractals',
        name: 'Fractals',
        component: Fractals
    }, {
        path: '/projects/rrpss',
        name: 'RRPSS',
        component: RRPSS
    }, {
        path: '/projects/dancing_tables',
        name: 'DancingTables',
        component: DancingTables
    }, {
        path: '/projects/placeholders',
        name: 'Placeholders',
        component: Placeholders
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router