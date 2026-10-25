// Checks the production build against the size budgets in
// docs/site-rewrite-plan.md. Run it after `vite build`, or use `npm run check`.
// It reads the Vite manifest, so the shell is exactly what index.html loads
// before any dynamic import, and the scene is what the Home route imports.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist'
const MANIFEST = join(DIST, '.vite', 'manifest.json')
// The module that Home.vue imports on idle. Its chunk and every chunk under
// it that the shell does not already load count as the scene.
const SCENE_SOURCE = 'src/three.js'

// Limits in bytes. Gzip limits use level 9, so they sit a little under the
// numbers that Vite prints.
// Baseline on 25 Oct 2026, before Phase 2: one 290 kB entry with three inside.
// After Phase 2 the shell is 108 kB. gsap is 49 kB of it, because Home needs
// ScrollTrigger and ScrambleText at once. The plan target is 100 kB.
// Phase 4 swapped in island_b.glb (0.90 MB), so the model limit is the plan's 1.5 MB.
const LIMITS = {
    shellJs: 110_000,
    sceneJs: 200_000,
    lazyChunk: 8_000,
    shellCss: 8_000,
    model: 1_500_000,
}

const gzipSize = (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length
const rawSize = (file) => statSync(join(DIST, file)).size

function readManifest() {
    try {
        return JSON.parse(readFileSync(MANIFEST, 'utf8'))
    } catch (error) {
        console.error(`Cannot read ${MANIFEST}. Run vite build first, with build.manifest on.`)
        console.error(error.message)
        process.exit(1)
    }
}

// Walks the static imports from one manifest key and returns every chunk key.
function closure(manifest, key, seen = new Set()) {
    if (seen.has(key) || !manifest[key]) return seen
    seen.add(key)
    for (const next of manifest[key].imports ?? []) closure(manifest, next, seen)
    return seen
}

const filesOf = (manifest, keys, field) =>
    [...new Set([...keys].flatMap((key) => (field === 'file' ? [manifest[key].file] : manifest[key][field] ?? [])))]

const sum = (files, size) => files.reduce((total, file) => total + size(file), 0)

const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`

function measure(manifest) {
    const entry = Object.keys(manifest).find((key) => manifest[key].isEntry && key.endsWith('index.html'))
    if (!entry) {
        console.error('The manifest has no index.html entry.')
        process.exit(1)
    }
    const shellKeys = closure(manifest, entry)
    const sceneKey = Object.keys(manifest).find((key) => manifest[key].src === SCENE_SOURCE && !shellKeys.has(key))
    const sceneKeys = sceneKey
        ? new Set([...closure(manifest, sceneKey)].filter((key) => !shellKeys.has(key)))
        : new Set()

    const shellFiles = filesOf(manifest, shellKeys, 'file').filter((file) => file.endsWith('.js'))
    const sceneFiles = filesOf(manifest, sceneKeys, 'file').filter((file) => file.endsWith('.js'))
    const taken = new Set([...shellFiles, ...sceneFiles])
    const lazyFiles = [...new Set(Object.values(manifest).map((chunk) => chunk.file))].filter(
        (file) => file.endsWith('.js') && !taken.has(file)
    )
    const largestLazy = lazyFiles.map((file) => ({ file, size: gzipSize(file) })).sort((a, b) => b.size - a.size)[0]
    const models = readdirSync(join(DIST, 'assets'))
        .filter((file) => file.endsWith('.glb'))
        .map((file) => ({ file: `assets/${file}`, size: rawSize(`assets/${file}`) }))
        .sort((a, b) => b.size - a.size)

    return [
        { name: 'shell JS (gzip)', limit: LIMITS.shellJs, size: sum(shellFiles, gzipSize), note: shellFiles.join(', ') },
        {
            name: 'scene JS, lazy (gzip)',
            limit: LIMITS.sceneJs,
            size: sum(sceneFiles, gzipSize),
            note: sceneKey ? sceneFiles.join(', ') : 'no separate scene chunk, the shell holds it',
        },
        { name: 'largest route chunk (gzip)', limit: LIMITS.lazyChunk, size: largestLazy?.size ?? 0, note: largestLazy?.file ?? 'none' },
        {
            name: 'shell CSS (gzip)',
            limit: LIMITS.shellCss,
            size: sum(filesOf(manifest, shellKeys, 'css'), gzipSize),
            note: filesOf(manifest, shellKeys, 'css').join(', '),
        },
        { name: 'largest model (raw)', limit: LIMITS.model, size: models[0]?.size ?? 0, note: models[0]?.file ?? 'none' },
    ]
}

const rows = measure(readManifest())
let failed = 0
for (const row of rows) {
    const ok = row.size <= row.limit
    if (!ok) failed += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${row.name.padEnd(28)} ${kB(row.size).padStart(12)} / ${kB(row.limit).padStart(12)}  ${row.note}`)
}

if (failed) {
    console.error(`\n${failed} size budget(s) failed. Make the build smaller, or change LIMITS in scripts/size-budget.mjs with a reason.`)
    process.exit(1)
}
console.log('\nAll size budgets pass.')
