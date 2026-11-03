import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run with: node --test tests/leaf-carpet.test.mjs
// The new carpet paint skips the pixels outside the leaf strip. These tests prove that the
// skip changes no byte, against a verbatim copy of the paint from before the skip.

const here = path.dirname(fileURLToPath(import.meta.url))
const NEW_SOURCE = path.join(here, '..', 'src', 'scene', 'aerie', 'leaf-carpet.js')
const OLD_SOURCE = path.join(here, 'fixtures', 'leaf-carpet-reference.js')
const SEEDS = [1, 77, 4242, 31337, 999983, 9137]

// Writes a copy of a carpet source with its seed replaced, and loads it. The copy lives in
// a temp folder, so it imports three by an absolute URL.
async function loadWithSeed(file, seed, dir) {
    const three = import.meta.resolve('three')
    const source = fs
        .readFileSync(file, 'utf8')
        .replace("from 'three'", `from '${three}'`)
        .replace(/const SEED = \d+/, `const SEED = ${seed}`)
    assert.ok(source.includes(`const SEED = ${seed}`), 'the seed constant must be present')
    const out = path.join(dir, `${path.basename(file, '.js')}-${seed}.mjs`)
    fs.writeFileSync(out, source)
    return import(pathToFileURL(out).href)
}

const same = (a, b) => Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) === 0

test('leaf and shadow data match the reference paint byte for byte', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leaf-carpet-'))
    try {
        for (const seed of SEEDS) {
            const ref = (await loadWithSeed(OLD_SOURCE, seed, dir)).createLeafCarpet({})
            const now = (await loadWithSeed(NEW_SOURCE, seed, dir)).createLeafCarpet({})
            assert.ok(same(ref.texture.image.data, now.texture.image.data), `leafData, seed ${seed}`)
            assert.ok(same(ref.shadow.image.data, now.shadow.image.data), `shadowData, seed ${seed}`)
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

test('halfWidth stays under the 1.06 bound that the pixel skip relies on', () => {
    const source = fs.readFileSync(NEW_SOURCE, 'utf8')
    const body = source.match(/function halfWidth\(leaf, t\) \{[\s\S]*?\n\}/)
    assert.ok(body, 'halfWidth must be found in the source')
    const halfWidth = new Function(`${body[0]}; return halfWidth`)()
    const bound = Number(source.match(/const WIDTH_BOUND = ([\d.]+)/)[1])
    assert.equal(bound, 1.06)
    const leaf = { width: 1 }
    let widest = 0
    for (let i = 0; i <= 200000; i += 1) {
        const t = -1 + (2 * i) / 200000
        widest = Math.max(widest, halfWidth(leaf, t) / leaf.width)
    }
    assert.ok(widest < bound, `widest ${widest} must stay under ${bound}`)
})
