import * as THREE from 'three'
import kitUrl from '../../assets/models/corkboard_kit.glb?url'
import { createLoaders, disposeLoaders } from '../../scene/loaders.js'
import { drawAtlas } from './dir-a-atlas.js'
import { createView } from './dir-a-view.js'
import { createLight, corkGrain, haloTexture } from './dir-a-light.js'

// Direction a: the lamp-lit 3D wall. The board, the papers, the pins, the tape and the red
// yarn are kit meshes in their own scene. The brass picture light is one spot light with a
// shadow map, so every sheet and every string casts a soft shadow on the cork. The scene is
// still, so the loop draws only while something moves, and the shadow map renders again only
// when a pin lifts. All paper faces share one atlas and one material.

// The kit pieces are real size. These scales fit them to the pin spacing in wall.js.
const SCALE = { hero: 1.7, card: 1.4, note: 1.4 }
const KIT = { hero: [0.088, 0.107], card: [0.127, 0.076], note: [0.076, 0.076] }
const NODE = { hero: 'Photo', card: 'Card', note: 'Note' }
const PIN_SCALE = 1.2
const PIN_TINTS = [0xa8443a, 0xc0913a, 0x4f7a8c, 0x6f8a5c, 0xd9cdb8]
const LIFT = 0.016
const YARN = 0x9e1f22
const deg = THREE.MathUtils.degToRad

// Moves the 0..1 UVs of a kit sheet into its atlas cell.
// The kit sheet UVs run v from top to bottom, so those flip against the canvas.
function toCell(geometry, cell, flip = false) {
    const g = geometry.clone()
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) {
        const v = flip ? 1 - uv.getY(i) : uv.getY(i)
        uv.setXY(i, cell.u + uv.getX(i) * cell.du, cell.v + v * cell.dv)
    }
    return g
}

// The slack varies from string to string, so strings between pins in a row do not lie on one line.
function yarn(a, b, slack) {
    const len = a.distanceTo(b)
    const mid = a.clone().lerp(b, 0.5)
    // The control point sits at twice the sag, so the curve dips by the sag at its middle.
    mid.y -= 2 * (0.006 + 0.03 * len) * slack
    mid.z -= 0.004
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 32, 0.0011, 5)
}

export function createWall({ canvas, layer, groups, pins, strings, images, small, reducedMotion }) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor(0x120d0a)
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    const scene = new THREE.Scene()
    const view = createView(reducedMotion)
    const loaders = createLoaders()
    const raycaster = new THREE.Raycaster()
    const items = new Map()
    const yarns = []
    const pickables = []
    let halo = null
    let marked = null
    let frame = 0
    let last = 0
    let before = null

    const vignette = document.createElement('div')
    vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 42%, transparent 55%, rgba(8,5,3,0.55) 85%, rgba(5,3,2,0.85))'
    // A quiet hint until the first pan or zoom. A phone shows it in the dark space below the board.
    const hint = document.createElement('p')
    hint.textContent = matchMedia('(pointer: coarse)').matches ? 'drag to look · pinch to zoom · tap a pin' : 'drag to look · scroll to zoom · click a pin'
    hint.style.cssText = `position:absolute;left:0;right:0;margin:0;text-align:center;pointer-events:none;${reducedMotion ? "" : "transition:opacity .6s;"}color:#9c8268;font:500 12px/1.4 "JetBrains Mono",monospace;letter-spacing:.04em;${innerWidth < 768 ? 'top:51%' : 'bottom:22px'}`
    layer.append(vignette, hint)
    const used = () => (hint.style.opacity = '0')

    const draw = () => {
        frame = 0
        const now = performance.now()
        const dt = Math.min(0.05, (now - (last || now)) / 1000)
        last = now
        const moving = view.step(dt) | lift(dt)
        renderer.render(scene, view.camera)
        if (moving) request()
        else last = 0
    }
    const request = () => {
        if (!frame) frame = requestAnimationFrame(draw)
    }

    // Eases each pin toward its lift and rebuilds the strings that hang from it.
    function lift(dt) {
        let changed = false
        for (const item of items.values()) {
            if (item.lift === item.target) continue
            const next = reducedMotion ? item.target : item.lift + (item.target - item.lift) * Math.min(1, dt * 10)
            item.lift = Math.abs(next - item.target) < 2e-4 ? item.target : next
            item.group.position.z = item.base + item.lift
            item.group.scale.setScalar(1 + item.lift * 2)
            item.group.updateMatrixWorld(true)
            if (marked === item) halo.material.opacity = (item.lift / LIFT) * 0.9
            yarns.filter((s) => s.from === item || s.to === item).forEach(hang)
            changed = true
        }
        if (changed) renderer.shadowMap.needsUpdate = true
        return changed
    }

    const anchor = (item) => item.pin.localToWorld(new THREE.Vector3(0, 0, 0.0095))
    const hang = (s) => {
        s.mesh.geometry.dispose()
        s.mesh.geometry = yarn(anchor(s.from), anchor(s.to), s.slack)
    }

    function material(source, mats, tints, i) {
        const name = source.name
        if (name === 'kit_pin') {
            const tint = PIN_TINTS[i % PIN_TINTS.length]
            tints[tint] ??= new THREE.MeshPhongMaterial({ color: tint, shininess: 70, specular: 0x554433 })
            return tints[tint]
        }
        return mats[name] ?? mats.kit_paper
    }

    function build(kit, atlas, anisotropy) {
        const paper = new THREE.MeshLambertMaterial({ map: atlas.texture })
        const ink = new THREE.MeshLambertMaterial({ map: atlas.texture, transparent: true, depthWrite: false })
        const mats = {
            kit_cork: new THREE.MeshLambertMaterial({ color: 0xa8865f, map: corkGrain(anisotropy) }),
            kit_wood: new THREE.MeshLambertMaterial({ vertexColors: true }),
            kit_paper: new THREE.MeshLambertMaterial({ vertexColors: true }),
            kit_steel: new THREE.MeshPhongMaterial({ color: 0x9a9690, shininess: 90 }),
            kit_tape: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }),
        }
        const tints = {}
        const copy = (name, i, cell) => {
            const object = kit.getObjectByName(name).clone()
            object.traverse((mesh) => {
                if (!mesh.isMesh) return
                const face = ['kit_card', 'kit_note', 'kit_photo_window'].includes(mesh.material.name)
                if (face) mesh.geometry = toCell(mesh.geometry, cell, true)
                mesh.material = face ? paper : material(mesh.material, mats, tints, i)
                mesh.castShadow = name !== 'Board' && name !== 'Tape'
                mesh.receiveShadow = true
            })
            return object
        }
        scene.add(copy('Board'))

        pins.forEach((pin, i) => {
            const s = SCALE[pin.kind]
            const w = KIT[pin.kind][0] * s
            const h = KIT[pin.kind][1] * s
            const group = new THREE.Group()
            const base = 0.0004 + 0.0006 * i
            group.position.set(pin.at[0], pin.at[1], base)
            group.rotation.z = deg(pin.tilt)
            const sheet = copy(NODE[pin.kind], i, atlas.cells.get(pin.id))
            sheet.scale.setScalar(s)
            group.add(sheet)
            let top = h / 2 - 0.0085
            if (pin.kind === 'hero') {
                const cell = atlas.cells.get(`${pin.id}:strip`)
                const strip = new THREE.Mesh(toCell(new THREE.PlaneGeometry(0.084, 0.084 / cell.aspect), cell), ink)
                strip.position.set(0, -0.0418, 0.0016)
                sheet.add(strip)
                const tape = copy('Tape', i)
                tape.scale.setScalar(1.35)
                tape.position.set(0, h / 2 - 0.002, 0.0022)
                tape.rotation.z = Math.sin(i * 2.7) * 0.09
                group.add(tape)
                top = h / 2 - 0.004
            }
            const head = copy('Pin_Push', i)
            head.scale.setScalar(PIN_SCALE)
            head.position.set(0, top, pin.kind === 'hero' ? 0.0035 : 0.0012)
            head.rotation.set(-0.3, Math.sin(i * 1.9) * 0.25, 0)
            group.add(head)
            group.userData.id = pin.id
            scene.add(group)
            group.updateMatrixWorld(true)
            pickables.push(sheet)
            items.set(pin.id, { pin: head, group, base, lift: 0, target: 0, w, h, x: pin.at[0], y: pin.at[1], tilt: group.rotation.z })
        })

        groups.forEach((group, i) => {
            const cell = atlas.cells.get(`group:${group.id}`)
            const label = new THREE.Mesh(toCell(new THREE.PlaneGeometry(0.052 * cell.aspect, 0.052), cell), ink)
            label.position.set(group.at[0], group.at[1], 0.003)
            label.rotation.z = Math.sin(i * 3.1 + 1) * 0.035
            label.receiveShadow = true
            scene.add(label)
        })

        const red = new THREE.MeshLambertMaterial({ color: YARN })
        strings.forEach(({ from, to }, i) => {
            const s = { from: items.get(from), to: items.get(to), slack: 0.5 + ((i * 0.618) % 1) * 1.1 }
            if (!s.from || !s.to) return
            s.mesh = new THREE.Mesh(new THREE.BufferGeometry(), red)
            s.mesh.castShadow = true
            hang(s)
            yarns.push(s)
            scene.add(s.mesh)
        })

        halo = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ map: haloTexture(), color: 0xffc27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        scene.add(halo, ...createLight(small))
    }

    const resize = () => {
        renderer.setSize(innerWidth, innerHeight, false)
        view.resize(innerWidth, innerHeight)
        request()
    }

    const ready = (async () => {
        const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        const [gltf, atlas] = await Promise.all([loaders.gltf.loadAsync(kitUrl), drawAtlas({ pins, groups, images, anisotropy })])
        build(gltf.scene, atlas, anisotropy)
        resize()
        renderer.shadowMap.needsUpdate = true
        renderer.render(scene, view.camera)
        await new Promise((done) => requestAnimationFrame(done))
    })().catch((error) => {
        layer.append(Object.assign(document.createElement('p'), {
            textContent: 'The wall could not load. Reload the page to try again.',
            style: 'position:absolute;top:40%;width:100%;text-align:center;color:#f3e2c7;font:16px Inter,sans-serif',
        }))
        throw error
    })

    const rect = (item) => ({ x: item.x, y: item.y, w: item.w + 0.03, h: item.h + 0.03 })

    const highlight = (id) => {
        const item = items.get(id) ?? null
        if (marked && marked !== item) marked.target = 0
        marked = item
        if (item) {
            item.target = LIFT
            halo.position.set(item.x, item.y, 0.0009)
            halo.rotation.z = item.tilt
            halo.scale.set((item.w + 0.035) * 2, (item.h + 0.035) * 2, 1)
            view.reveal(rect(item))
        } else if (halo) halo.material.opacity = 0
        request()
    }

    const focus = (id, { instant = false } = {}) => {
        const item = items.get(id)
        if (!item) return
        before ??= view.snapshot()
        used()
        view.focusOn(rect(item), instant)
        request()
    }

    const unfocus = ({ instant = false } = {}) => {
        if (!before) return
        view.go(before, instant)
        before = null
        request()
    }

    const tap = (x, y) => {
        raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2), view.camera)
        let node = raycaster.intersectObjects(pickables, true)[0]?.object
        while (node && !node.userData.id) node = node.parent
        return node?.userData.id ?? null
    }

    const dispose = () => {
        cancelAnimationFrame(frame)
        scene.traverse((node) => {
            node.geometry?.dispose()
            ;[node.material].flat().forEach((m) => {
                m?.map?.dispose()
                m?.dispose()
            })
        })
        renderer.dispose()
        disposeLoaders(loaders)
        vignette.remove()
        hint.remove()
    }

    return {
        ready,
        highlight,
        focus,
        unfocus,
        pan: (dx, dy) => (view.pan(dx, dy), used(), request()),
        zoom: (factor, x, y) => (view.zoom(factor, x, y), used(), request()),
        tap,
        resize,
        dispose,
    }
}
