import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const page = (file) => fileURLToPath(new URL(file, import.meta.url))

// Splits the vendors out of the entry, so a site change does not bust their
// cache. three only loads with the scene, from the Home route.
const manualChunks = (id) => {
    // The walk's Capsule stays with the walk in its lazy explore chunk. In the three chunk it
    // would count toward the scene budget.
    if (id.includes('node_modules/three/examples/jsm/math/Capsule.js')) return undefined
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
// It also drops the spaces inside the round brackets, round the commas, braces and semicolons,
// and round an operator with a space on each side, in every multi-line template string that
// a /* glsl */ comment comes right before. An untagged string, such as an HTML or text
// overlay, keeps its spaces. It reads the template strings from the parsed module, so it
// never touches a one-line string, an expression or a comment. It keeps every line break,
// because a preprocessor line must stay on a line of its own. An #include path has no space
// after its <, so it keeps its space.
// It keeps the spaces of "a - -b", where two signs would join into one token, and the spaces
// of an operator at the end of a string part, where a ${} value such as -100.0 follows. It
// also writes a float literal short, as GLSL allows: 1.0 as 1. and 0.5 as .5.
const compactShader = (text) =>
    text
        .replace(/\b(\d+)\.0(?![\d.eE])/g, '$1.')
        .replace(/(?<![\w.])0\.(\d)/g, '.$1')
        .replace(/\([ \t]+/g, '(')
        .replace(/[ \t]+\)/g, ')')
        .replace(/[ \t]*([,;{}])[ \t]*/g, '$1')
        .replace(/[ \t]+(==|!=|<=|>=|&&|\|\||[=*+\-/<>?:]) (?![=*+\-/<>]|$)/g, '$1')
const GLSL_TAG = /\/\*\s*glsl\s*\*\/\s*$/
const shaderQuasis = (node, code, found) => {
    if (!node || typeof node.type !== 'string') return found
    const tagged = node.type === 'TemplateLiteral' && GLSL_TAG.test(code.slice(Math.max(0, node.start - 40), node.start))
    if (tagged && node.quasis.some((q) => q.value.raw.includes('\n'))) found.push(...node.quasis)
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((child) => shaderQuasis(child, code, found))
        else if (value && typeof value === 'object') shaderQuasis(value, code, found)
    }
    return found
}
const stripShaderComments = () => ({
    name: 'strip-shader-comments',
    apply: 'build',
    transform(code, id) {
        if (!/[\\/]src[\\/]scene[\\/].*\.js$/.test(id)) return null
        const quasis = shaderQuasis(this.parse(code), code, []).sort((a, b) => b.start - a.start)
        const compact = quasis.reduce((text, q) => text.slice(0, q.start) + compactShader(text.slice(q.start, q.end)) + text.slice(q.end), code)
        return { code: compact.replace(/^[ \t]*\/\/[^\n]*\n/gm, '').replace(/^[ \t]+/gm, ''), map: null }
    },
})

// The shell CSS must not hold up the first paint. The gate in index.html carries its own styles
// and covers the page until the app mounts, so on a slow line it used to wait for nothing: the
// first paint came only after the shell CSS, about 2 s after the HTML on slow 3G. This plugin
// turns the stylesheet links of index.html into preloads that switch to stylesheets once they
// arrive. A preload keeps the high fetch priority of a stylesheet. src/main.js mounts the app
// only after every such sheet applies, so no view measures itself unstyled. 404.html keeps its
// plain links, because it has no gate to show.
const deferShellCss = () => ({
    name: 'defer-shell-css',
    apply: 'build',
    transformIndexHtml: {
        order: 'post',
        handler: (html, { filename }) =>
            filename.replaceAll('\\', '/').endsWith('/index.html')
                ? html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, `<link rel="preload" as="style" crossorigin href="$1" data-shell-css onload="this.onload=null;this.rel='stylesheet'">`)
                : html,
    },
})

// The gate title paints in the first paint, in the two faces its words use. This plugin
// preloads those two font files in index.html, so they arrive early and the words change face
// once, soon. The gate sets every line height, so the swap moves nothing.
const GATE_FONTS = ['instrument-serif-latin-400-normal', 'jetbrains-mono-latin-400-normal']
const preloadGateFonts = () => ({
    name: 'preload-gate-fonts',
    apply: 'build',
    transformIndexHtml: {
        order: 'post',
        handler: (html, { filename, bundle }) => {
            if (!filename.replaceAll('\\', '/').endsWith('/index.html') || !bundle) return html
            const files = Object.keys(bundle).filter((name) => GATE_FONTS.some((font) => name.includes(font)) && name.endsWith('.woff2'))
            if (files.length !== GATE_FONTS.length) throw new Error(`preload-gate-fonts found ${files.length} of ${GATE_FONTS.length} gate fonts.`)
            return {
                html,
                tags: files.map((file) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: true }, injectTo: 'head' })),
            }
        },
    },
})

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss(), stripShaderComments(), deferShellCss(), preloadGateFonts()],
    // The look worker is its own bundle, so it needs the shader comment strip of its own.
    worker: { plugins: () => [stripShaderComments()] },
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
