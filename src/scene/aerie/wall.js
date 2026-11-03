import * as THREE from 'three'
import kitUrl from '../../assets/models/corkboard_kit.glb?url'
import { BOARD_SCALE, GROUPS, PINS, STRINGS } from '../../data/wall.js'
import { ATLAS_SCALE, SHARP, SIZE, drawAtlas, drawSharp, loadFonts, loadPictures } from './wall-atlas.js'
import { createView } from './wall-view.js'
import { createLight, corkGrain, haloTexture } from './wall-light.js'

// The evidence wall in the workshop, the Projects view. scene-manager.js loads this module
// in its own chunk after the island, like the skill sky, and draws the scene through the same
// pipeline. The board, the papers, the pins, the tape and the red yarn are kit meshes. The
// brass picture light is one spot light with a shadow map, so every sheet and every string
// casts a soft shadow on the cork. The scene is still, so it needs frames only while the view
// or a pin moves, and the shadow map renders again only when a pin lifts.
//
// All paper faces share one overview atlas at half size. When the view comes close, the few
// pins on screen get a sharp page each (SLOTS), so the text stays sharp at the maximum zoom.

// The kit pieces are real size. These scales fit them to the pin spacing in wall.js.
const SCALE = { hero: 1.7, card: 1.4, note: 1.4 }
const KIT = { hero: [0.088, 0.107], card: [0.127, 0.076], note: [0.076, 0.076] }
const NODE = { hero: 'Photo', card: 'Card', note: 'Note' }
const PIN_SCALE = 1.2
const PIN_TINTS = [0xa8443a, 0xc0913a, 0x4f7a8c, 0x6f8a5c, 0xd9cdb8]
const LIFT = 0.016
const YARN = 0x9e1f22
// Sharp pages: how many, and when a pin takes one. A pin takes a page when the screen shows
// more than SHARP_AT device pixels for each texel of its overview cell. The pages change only
// when the view has been still for SHARP_WAIT milliseconds, so a pinch never stalls on a redraw.
const SLOTS = { small: 2, wide: 3 }
const SHARP_AT = 1.15
const SHARP_WAIT = 150
// The room copy has no lights of its own. Its paper takes this dim lamp-lit colour.
const ROOM_TINT = new THREE.Color(0.8, 0.72, 0.62)
const deg = THREE.MathUtils.degToRad

const images = (() => {
    const shots = import.meta.glob('../../assets/projects/*/{thumb,cover}.webp', { eager: true, query: '?url', import: 'default' })
    const shot = (id, name) => shots[`../../assets/projects/${id}/${name}.webp`] ?? null
    return Object.fromEntries(
        PINS.map((pin) => {
            const id = pin.page ?? pin.id
            const thumb = shot(id, 'thumb')
            return [pin.id, thumb ? { thumb, cover: shot(id, 'cover') ?? thumb } : null]
        }),
    )
})()

// Moves the 0..1 UVs of a kit sheet into a cell. The kit sheet UVs run v from top to bottom,
// so those flip against the canvas.
function toCell(uv0, cell, flip, target) {
    const uv = target ?? uv0.clone()
    for (let i = 0; i < uv0.count; i++) {
        const v = flip ? 1 - uv0.getY(i) : uv0.getY(i)
        uv.setXY(i, cell.u + uv0.getX(i) * cell.du, cell.v + v * cell.dv)
    }
    uv.needsUpdate = true
    return uv
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

// loaders: the scene's loaders, so the kit shares the Draco decoder with the island.
// request: asks the manager for a frame, for the sharp pages after the view comes to rest.
export async function createWall({ loaders, small, reducedMotion, anisotropy, pixelRatio = 1, request = () => {} }) {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x120d0a)
    const view = createView(reducedMotion)
    const raycaster = new THREE.Raycaster()
    const items = new Map()
    const yarns = []
    const pickables = []
    const slots = []
    let halo = null
    let marked = null
    let before = null
    let due = 0
    let timer = 0
    let wasMoving = false
    let ratio = pixelRatio
    let shadowDirty = true

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
        if (changed) shadowDirty = true
        return changed
    }

    const anchor = (item) => item.pin.localToWorld(new THREE.Vector3(0, 0, 0.0095))
    const hang = (s) => {
        s.mesh.geometry.dispose()
        s.mesh.geometry = yarn(anchor(s.from), anchor(s.to), s.slack)
    }

    const [gltf, pictures] = await Promise.all([loaders.gltf.loadAsync(kitUrl), loadFonts().then(() => loadPictures(PINS, images))])
    const kit = gltf.scene
    const atlas = drawAtlas({ pins: PINS, groups: GROUPS, pictures, anisotropy })
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
    const material = (source, i) => {
        if (source.name === 'kit_pin') {
            const tint = PIN_TINTS[i % PIN_TINTS.length]
            tints[tint] ??= new THREE.MeshPhongMaterial({ color: tint, shininess: 70, specular: 0x554433 })
            return tints[tint]
        }
        return mats[source.name] ?? mats.kit_paper
    }

    // faces collects the paper faces of the copy: { mesh, key, uv0 }, so a sharp page can
    // move them to its own texture and back.
    const copy = (name, i, key, faces) => {
        const object = kit.getObjectByName(name).clone()
        object.traverse((mesh) => {
            if (!mesh.isMesh) return
            const face = ['kit_card', 'kit_note', 'kit_photo_window'].includes(mesh.material.name)
            if (face) {
                mesh.geometry = mesh.geometry.clone()
                const uv0 = mesh.geometry.attributes.uv.clone()
                toCell(uv0, atlas.cells.get(key), true, mesh.geometry.attributes.uv)
                faces?.push({ mesh, key, uv0, flip: true })
            }
            mesh.material = face ? paper : material(mesh.material, i)
            mesh.castShadow = name !== 'Board' && name !== 'Tape'
            mesh.receiveShadow = true
        })
        return object
    }
    const board = new THREE.Group()
    board.add(copy('Board'))

    let notes = 0
    PINS.forEach((pin, i) => {
        const s = SCALE[pin.kind]
        const w = KIT[pin.kind][0] * s
        const h = KIT[pin.kind][1] * s
        const group = new THREE.Group()
        const base = 0.0004 + 0.0006 * i
        const faces = []
        group.position.set(pin.at[0], pin.at[1], base)
        group.rotation.z = deg(pin.tilt)
        const sheet = copy(NODE[pin.kind], i, pin.id, faces)
        sheet.scale.setScalar(s)
        group.add(sheet)
        let top = h / 2 - 0.0085
        if (pin.kind === 'hero') {
            const key = `${pin.id}:strip`
            const cell = atlas.cells.get(key)
            const plane = new THREE.PlaneGeometry(0.084, 0.084 / cell.aspect)
            const uv0 = plane.attributes.uv.clone()
            toCell(uv0, cell, false, plane.attributes.uv)
            const strip = new THREE.Mesh(plane, ink)
            strip.position.set(0, -0.0418, 0.0016)
            sheet.add(strip)
            faces.push({ mesh: strip, key, uv0, flip: false, ink: true })
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
        board.add(group)
        group.updateMatrixWorld(true)
        pickables.push(sheet)
        // texels: the width of the main face in overview atlas texels, for the sharp page test.
        const full = pin.kind === 'hero' ? SIZE.cover[0] : SIZE[pin.kind][0]
        items.set(pin.id, {
            id: pin.id, pin: head, group, base, lift: 0, target: 0, w, h, x: pin.at[0], y: pin.at[1], tilt: group.rotation.z,
            faces, texels: full * ATLAS_SCALE, picture: pictures[i], note: pin.kind === 'note' ? notes++ : 0, slot: null, source: pin,
        })
    })

    GROUPS.forEach((group, i) => {
        const cell = atlas.cells.get(`group:${group.id}`)
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.052 * cell.aspect, 0.052), ink)
        toCell(label.geometry.attributes.uv.clone(), cell, false, label.geometry.attributes.uv)
        label.position.set(group.at[0], group.at[1], 0.003)
        label.rotation.z = Math.sin(i * 3.1 + 1) * 0.035
        label.receiveShadow = true
        board.add(label)
    })

    const red = new THREE.MeshLambertMaterial({ color: YARN })
    STRINGS.forEach(({ from, to }, i) => {
        const s = { from: items.get(from), to: items.get(to), slack: 0.5 + ((i * 0.618) % 1) * 1.1 }
        if (!s.from || !s.to) return
        s.mesh = new THREE.Mesh(new THREE.BufferGeometry(), red)
        s.mesh.castShadow = true
        hang(s)
        yarns.push(s)
        board.add(s.mesh)
    })

    halo = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: haloTexture(), color: 0xffc27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    scene.add(board, halo, ...createLight(small))

    // The sharp pages. Each one is a canvas texture with its own two materials.
    for (let k = 0; k < (small ? SLOTS.small : SLOTS.wide); k++) {
        const canvas = Object.assign(document.createElement('canvas'), SHARP)
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter
        slots.push({
            canvas,
            texture,
            paper: new THREE.MeshLambertMaterial({ map: texture }),
            ink: new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false }),
            item: null,
        })
    }

    const release = (item) => {
        for (const face of item.faces) {
            toCell(face.uv0, atlas.cells.get(face.key), face.flip, face.mesh.geometry.attributes.uv)
            face.mesh.material = face.ink ? ink : paper
        }
        item.slot.item = null
        item.slot = null
    }
    const claim = (item, slot) => {
        if (slot.item) release(slot.item)
        const cells = drawSharp(slot.canvas, item.source, item.picture, item.note)
        slot.texture.needsUpdate = true
        for (const face of item.faces) {
            toCell(face.uv0, cells.get(face.key), face.flip, face.mesh.geometry.attributes.uv)
            face.mesh.material = face.ink ? slot.ink : slot.paper
        }
        slot.item = item
        item.slot = slot
    }

    // Gives the closest pins on screen a sharp page and returns the rest to the atlas.
    // Returns true when a page changed, so the frame needs a render.
    const sharpen = () => {
        const { x, y, k, w, h } = view.frame()
        const wanted = [...items.values()]
            .filter((item) => Math.abs(item.x - x) < (w * k) / 2 + item.w / 2 && Math.abs(item.y - y) < (h * k) / 2 + item.h / 2)
            .filter((item) => ((item.w / k) * ratio) / item.texels > SHARP_AT)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
            .slice(0, slots.length)
        let changed = false
        for (const slot of slots) {
            if (slot.item && !wanted.includes(slot.item)) {
                release(slot.item)
                changed = true
            }
        }
        for (const item of wanted) {
            if (item.slot) continue
            claim(item, slots.find((slot) => !slot.item))
            changed = true
        }
        return changed
    }

    // Any change of view sets the sharp pages due once the view has been still for a moment.
    const changed = () => {
        due = performance.now() + SHARP_WAIT
        clearTimeout(timer)
        timer = setTimeout(request, SHARP_WAIT + 10)
    }

    // Steps the wall by dt seconds. Returns true while it needs more frames.
    const update = (dt) => {
        const moving = Boolean(view.step(dt) | lift(dt))
        if (wasMoving && !moving) changed()
        wasMoving = moving
        if (moving || !due || performance.now() < due) return moving
        due = 0
        return sharpen()
    }

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
        } else halo.material.opacity = 0
        changed()
    }

    const focus = (id, { instant = false } = {}) => {
        const item = items.get(id)
        if (!item) return
        before ??= view.snapshot()
        view.focusOn(rect(item), instant)
        changed()
    }

    const unfocus = ({ instant = false } = {}) => {
        if (before) view.go(before, instant)
        before = null
        changed()
    }

    const tap = (x, y) => {
        raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2), view.camera)
        let node = raycaster.intersectObjects(pickables, true)[0]?.object
        while (node && !node.userData.id) node = node.parent
        return node?.userData.id ?? null
    }

    // A copy of the board and its papers for the workshop wall, in the board's own metres.
    // It shares the geometry and the atlas, with unlit materials, because the island has no
    // lights. The workshop shows it from across the room, so it takes no sharp pages.
    const roomCopy = () => {
        const room = board.clone(true)
        const unlit = new Map()
        room.traverse((mesh) => {
            if (!mesh.isMesh) return
            // Its own geometry: the wall moves face UVs to its sharp pages and rebuilds yarn.
            mesh.geometry = mesh.geometry.clone()
            const source = mesh.material
            if (!unlit.has(source)) {
                const basic = new THREE.MeshBasicMaterial({
                    map: source.map,
                    vertexColors: source.vertexColors,
                    transparent: source.transparent,
                    opacity: source.opacity,
                    depthWrite: source.depthWrite,
                })
                basic.color.copy(source.color).multiply(ROOM_TINT)
                unlit.set(source, basic)
            }
            mesh.material = unlit.get(source)
            mesh.castShadow = false
            mesh.receiveShadow = false
        })
        room.scale.setScalar(BOARD_SCALE)
        room.name = 'WallRoomCopy'
        const dispose = () => {
            room.traverse((mesh) => mesh.geometry?.dispose())
            unlit.forEach((m) => m.dispose())
        }
        return { group: room, dispose }
    }

    const dispose = () => {
        clearTimeout(timer)
        scene.traverse((node) => {
            node.geometry?.dispose()
            ;[node.material].flat().forEach((m) => {
                m?.map?.dispose()
                m?.dispose()
            })
        })
        slots.forEach((slot) => {
            slot.texture.dispose()
            slot.paper.dispose()
            slot.ink.dispose()
        })
    }

    return {
        scene,
        camera: view.camera,
        update,
        highlight,
        focus,
        unfocus,
        pan: (dx, dy) => {
            view.pan(dx, dy)
            changed()
        },
        zoom: (factor, x, y) => {
            view.zoom(factor, x ?? innerWidth / 2, y ?? innerHeight / 2)
            changed()
        },
        tap,
        resize: (w, h) => {
            view.resize(w, h)
            changed()
        },
        setPixelRatio: (value) => {
            ratio = value
            changed()
        },
        // The shadow map needs a render after a lift. The manager reads and clears this.
        takeShadowDirty: () => {
            const dirty = shadowDirty
            shadowDirty = false
            return dirty
        },
        // The overview framing of the board, for the camera stop in front of the room copy.
        get home() {
            return view.home
        },
        roomCopy,
        dispose,
    }
}
