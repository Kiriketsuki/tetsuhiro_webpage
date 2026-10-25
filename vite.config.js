import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const page = (file) => fileURLToPath(new URL(file, import.meta.url))

// Splits the vendors out of the entry, so a site change does not bust their
// cache. three only loads with the scene, from the Home route.
const manualChunks = (id) => {
    if (id.includes('node_modules/three/')) return 'three'
    if (id.includes('node_modules/gsap/')) return 'gsap'
    if (/node_modules\/(@vue|vue|vue-router)\//.test(id)) return 'vue'
    return undefined
}

// The scene chunk is not a manual chunk. Rollup moves the dependencies of a
// manual chunk into it, so useWaypoints would land there and pull the scene
// into the shell. The scene stays a plain dynamic chunk, and only its name
// changes, so it does not read as a second copy of three.
const chunkFileNames = (chunk) =>
    chunk.facadeModuleId?.replaceAll('\\', '/').endsWith('/src/three.js')
        ? 'assets/scene-[hash].js'
        : 'assets/[name]-[hash].js'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss()],
    build: {
        // scripts/size-budget.mjs reads the manifest to tell the shell from the lazy chunks.
        manifest: true,
        rollupOptions: {
            // 404.html is the page Firebase serves for paths it does not rewrite.
            input: { main: page('./index.html'), notFound: page('./404.html') },
            output: { manualChunks, chunkFileNames },
        },
    },
})
