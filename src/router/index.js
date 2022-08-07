import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue';
import Test from '../views/Test.vue';
import Skills from '../views/Skills.vue';
const routes = [{
    path: '/',
    name: 'home',
    component: Skills
  }, {
    path: '/test',
    name: 'test',
    component: Test
  }, {
    path: '/projects',
    name: 'Projects',
    component: Test
  }, {
    path: '/skills',
    name: 'Skills',
    component: Skills,
  }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router