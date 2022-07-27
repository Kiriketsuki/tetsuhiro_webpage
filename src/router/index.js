import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue';
import Test from '../views/Test.vue';
const routes = [
  {
    path: '/',
    name: 'home',
    component: Home
  }, 
  {
    path: '/test',
    name: 'test',
    component: Test
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
