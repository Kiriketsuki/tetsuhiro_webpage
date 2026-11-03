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

// The scene shaders sit in template strings, so the minifier keeps their comments. This
// plugin drops every line that holds only a // comment from the scene modules at build time.
// The minifier removes such lines outside the strings anyway, and inside a shader string a
// line that starts with // is always a GLSL comment. The source keeps every comment.
// It also drops the indent of every line, which the minifier keeps inside the shader strings
// too. GLSL ignores the indent, every multi-line template string in src/scene is a shader,
// and the shader patches in toon-material.js match one-line strings only.
const stripShaderComments = () => ({
    name: 'strip-shader-comments',
    apply: 'build',
    transform(code, id) {
        if (!/[\\/]src[\\/]scene[\\/].*\.js$/.test(id)) return null
        return { code: code.replace(/^[ \t]*\/\/[^\n]*\n/gm, '').replace(/^[ \t]+/gm, ''), map: null }
    },
})

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss(), stripShaderComments()],
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
