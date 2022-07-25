import { createApp } from 'vue';
import { TroisJSVuePlugin  } from 'troisjs';
import App from './App.vue';
import router from './router';
import './index.css';

createApp(App)
    .use(router)
    .use(TroisJSVuePlugin)
    .mount('#app')
