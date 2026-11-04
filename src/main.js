import { createApp } from 'vue'
import './index.css'
import App from './App.vue'
import router from './router';


// The gate art in index.html waits for this bundle before it loads its sharp layers, so the
// bundle has the line to itself first. A page that hides the gate loads none of them.
const art = document.getElementById('gate-art')
if (art && !art.hidden) art.load?.()

// vite.config.js (deferShellCss) loads the shell CSS without holding up the first paint. The
// app mounts once every shell sheet applies. A sheet that fails to load does not hold it back. A
// browser without preload support would never load the sheet, so it gets a plain stylesheet.
const applied = (link) =>
    new Promise((resolve) => {
        if (link.rel === 'preload' && !link.relList.supports?.('preload')) link.rel = 'stylesheet'
        const check = () => link.rel === 'stylesheet' && link.sheet && resolve()
        link.addEventListener('load', check)
        link.addEventListener('error', resolve, { once: true })
        check()
    })

Promise.all([...document.querySelectorAll('link[data-shell-css]')].map(applied)).then(() => createApp(App).use(router).mount('#app'))