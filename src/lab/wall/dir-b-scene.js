import * as THREE from 'three'
import { createLoaders, disposeLoaders } from '../../scene/loaders.js'
import kitUrl from '../../assets/models/corkboard_kit.glb?url'
import { PX } from './dir-b-paper.js'

// The WebGL half of direction b. The base canvas sits under the paper and draws the wall,
// the kit Board, the brass picture light and the soft paper shadows. The overlay canvas sits
// above the paper and draws the push pins and the tape, so they read on top of the cards.
// Both share one camera, so the pins land exactly on the DOM paper.

// The picture light hangs above the frame and a little out from the wall.
const LAMP = [0, 0.6, 0.26]
const PIN_SCALE = 1.15
const PIN_TINT = { tools: 0xd9a634, fun: 0x3f9470, work: 0xc8352b, '3d': 0xefe8da }

// A soft four step ramp gives the toon read on the frame bevels without hard cel bands.
function ramp() {
    const texture = new THREE.DataTexture(new Uint8Array([96, 150, 206, 255]), 4, 1, THREE.RedFormat)
    texture.minFilter = texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
}

// One blurred rectangle serves every paper shadow and every pin shadow.
function softRect() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const g = canvas.getContext('2d')
    g.shadowColor = '#000'
    g.shadowBlur = 14
    g.shadowOffsetX = 512
    g.fillRect(22 - 512, 22, 84, 84)
    return new THREE.CanvasTexture(canvas)
}

// A light speckle so the cork reads as cork and not as felt. It is texture, not facet noise.
function speckle() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const g = canvas.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 5200; i++) {
        g.fillStyle = Math.random() < 0.7 ? 'rgba(110,64,34,.16)' : 'rgba(255,236,206,.26)'
        g.beginPath()
        g.arc(Math.random() * 256, Math.random() * 256, 0.4 + Math.random() * 1.1, 0, 7)
        g.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(7, 4.2)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

// The warm lamp pool and a cool fill: the split tone of the aerie, warm lights over cool shade.
function light(scene) {
    const spot = new THREE.SpotLight(0xffe2c2, 3.2, 0, 1.1, 0.9, 1.2)
    spot.position.set(...LAMP)
    spot.target.position.set(0, 0.0, 0)
    scene.add(spot, spot.target, new THREE.HemisphereLight(0x67749a, 0x3d2c20, 0.95))
}

const meshesOf = (root, name) => {
    const out = []
    root?.getObjectByName(name)?.traverse((o) => o.isMesh && out.push(o))
    return out
}

export async function createStage({ canvas, overlay, items, small }) {
    const loaders = createLoaders()
    let kit = null
    try {
        kit = (await loaders.gltf.loadAsync(kitUrl)).scene
    } catch (error) {
        console.error('Wall b: the corkboard kit did not load, so the board falls back to plain shapes.', error)
    } finally {
        disposeLoaders(loaders)
    }
    const gradientMap = ramp()
    const shadowMap = softRect()
    const cork = speckle()
    const toon = (m, extra = {}) =>
        new THREE.MeshToonMaterial({ color: m.color, vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity, depthWrite: !m.transparent, gradientMap, ...extra })

    const base = new THREE.Scene()
    const top = new THREE.Scene()
    light(base)
    light(top)

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshToonMaterial({ color: 0x6a4c38, gradientMap }))
    wall.position.z = -0.042
    // A dark plate a little larger than the frame draws the soft ink outline around it.
    const ink = new THREE.Mesh(new THREE.PlaneGeometry(1.616, 1.016), new THREE.MeshBasicMaterial({ color: 0x1a0f09 }))
    ink.position.z = -0.039
    base.add(wall, ink)

    const board = kit?.getObjectByName('Board')
    if (board) {
        board.traverse((o) => {
            if (!o.isMesh) return
            const old = o.material
            o.material = toon(old, old.name === 'kit_cork' ? { map: cork, color: 0xdccbb9 } : {})
            old.dispose()
        })
        base.add(board)
    } else {
        base.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.04).translate(0, 0, -0.02), new THREE.MeshToonMaterial({ color: 0xc08a58, gradientMap })))
    }

    // The brass picture light: a bar, two rods to the wall and a warm glowing slot under it.
    const brass = new THREE.MeshToonMaterial({ color: 0xb98d4c, gradientMap })
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.74, 10).rotateZ(Math.PI / 2), brass)
    bar.position.set(0, 0.585, 0.14)
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.008), new THREE.MeshBasicMaterial({ color: 0xffd497 }))
    slot.position.set(0, 0.57, 0.16)
    base.add(bar, slot)
    for (const x of [-0.25, 0.25]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6).rotateX(Math.PI / 2), brass)
        rod.position.set(x, 0.6, 0.05)
        base.add(rod)
    }

    const plane = new THREE.PlaneGeometry(1, 1)
    const soft = (opacity) => new THREE.MeshBasicMaterial({ map: shadowMap, color: 0x140803, transparent: true, opacity, depthWrite: false, depthTest: false })
    const shadows = new THREE.InstancedMesh(plane, soft(0.62), items.length)
    shadows.renderOrder = 2
    base.add(shadows)

    const pinned = items.filter((item) => item.head)
    const pinParts = meshesOf(kit, 'Pin_Push')
    const parts = pinParts.length ? pinParts : [new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8).translate(0, 0, 0.008), { name: 'kit_pin', color: new THREE.Color(0xffffff) })]
    const pinMeshes = parts.map((part) => {
        const tinted = part.material.name === 'kit_pin'
        const mesh = new THREE.InstancedMesh(part.geometry, toon(part.material, tinted ? { color: 0xffffff } : {}), pinned.length)
        if (tinted) pinned.forEach((item, i) => mesh.setColorAt(i, new THREE.Color(PIN_TINT[item.pin.group] ?? 0xc8352b)))
        return mesh
    })
    const pinShadows = new THREE.InstancedMesh(plane, soft(0.4), pinned.length)
    pinShadows.renderOrder = -1
    const tapes = items.flatMap((item) => item.tapes.map((tape) => ({ item, tape })))
    const tapePart = meshesOf(kit, 'Tape')[0]
    const tapeMesh = new THREE.InstancedMesh(
        tapePart?.geometry ?? new THREE.PlaneGeometry(0.1, 0.026),
        tapePart ? toon(tapePart.material) : new THREE.MeshBasicMaterial({ color: 0xe8dcb8, transparent: true, opacity: 0.8 }),
        Math.max(1, tapes.length),
    )
    tapeMesh.count = tapes.length
    top.add(pinShadows, ...pinMeshes, tapeMesh)

    const matrix = new THREE.Matrix4()
    const turn = new THREE.Quaternion()
    const at = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const axis = new THREE.Vector3(0, 0, 1)
    const lean = new THREE.Euler()
    const put = (mesh, i, x, y, z, t, sx, sy = sx, sz = sx, tip = 0) => {
        // A pushed pin leans a little, so its round side shows and it reads as a pin, not a nut.
        if (tip) turn.setFromEuler(lean.set(-0.32 + 0.12 * Math.sin(tip * 2.1), 0.22 * Math.sin(tip * 3.7), tip))
        else turn.setFromAxisAngle(axis, t)
        mesh.setMatrixAt(i, matrix.compose(at.set(x, y, z), turn, scale.set(sx, sy, sz)))
        mesh.instanceMatrix.needsUpdate = true
    }
    // The shadow falls away from the lamp, and a lifted card throws a wider, further shadow.
    const placeItem = (item) => {
        const lift = item.z
        const dx = item.x - LAMP[0]
        const dy = item.y - LAMP[1]
        const len = Math.hypot(dx, dy) || 1
        const reach = 0.002 + lift * 0.7
        const grow = 1.52 * (1 + lift * 5)
        put(shadows, items.indexOf(item), item.x + (dx / len) * reach, item.y + (dy / len) * reach - 0.002 - lift * 0.4, 0.0008, item.t, item.pw * PX * grow, item.ph * PX * grow, 1)
        const p = pinned.indexOf(item)
        if (p >= 0) {
            const [hx, hy] = item.head
            for (const mesh of pinMeshes) put(mesh, p, hx, hy, lift + 0.0008, 0, PIN_SCALE, PIN_SCALE, PIN_SCALE, p + 1)
            put(pinShadows, p, hx + 0.003, hy - 0.006, lift + 0.0005, 0, 0.03, 0.03, 1)
        }
        tapes.forEach(({ item: owner, tape }, i) => {
            if (owner === item) put(tapeMesh, i, tape[0], tape[1], lift + 0.0016, tape[2], tape[3])
        })
    }
    items.forEach(placeItem)

    const renderers = [new THREE.WebGLRenderer({ canvas, antialias: true }), new THREE.WebGLRenderer({ canvas: overlay, antialias: true, alpha: true })]
    renderers[0].setClearColor(0x120d0a)
    renderers[1].setClearColor(0x000000, 0)

    return {
        resize(width, height) {
            // The base layer is soft cork and plaster, so a phone draws it at a lower ratio.
            // The pins are small and stay at full ratio.
            renderers.forEach((r, i) => {
                r.setPixelRatio(Math.min(devicePixelRatio, small && i === 0 ? 1.5 : 2))
                r.setSize(width, height, false)
            })
        },
        render(camera) {
            renderers[0].render(base, camera)
            renderers[1].render(top, camera)
        },
        placeItem,
        dispose() {
            for (const scene of [base, top])
                scene.traverse((o) => {
                    o.geometry?.dispose()
                    o.material?.dispose?.()
                })
            ;[gradientMap, shadowMap, cork].forEach((t) => t.dispose())
            renderers.forEach((r) => r.dispose())
        },
    }
}
