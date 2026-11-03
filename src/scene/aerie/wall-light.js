import * as THREE from 'three'
import { bulbColor, filament } from './light-switch.js'

// The light of the workshop wall at night. The brass picture light is a long bar above the
// board, so it washes the cork evenly from side to side, brightest just under the bar and
// dimmer toward the bottom. A dim cool fill keeps the shadows blue grey and not black,
// which gives the split tone of the island: warm light, cool shade.
//
// One spot light draws the wash and the shadows. A spot alone lights a round pool, so the
// spot throws its light through a mask (SpotLight.map). The mask divides out the angle at
// which the light meets the cork, so the board shows the wash of a bar and not a cone.
// A RectAreaLight would need about 100 kB of lookup tables and casts no shadow.

const WARM = 0xffead0
// The spot hangs out in front of the bar, so its cone covers the whole frame inside the
// sharp part of its edge. Positions are in metres on the board, from the cork centre.
const LAMP = { at: [0, 0.66, 0.8], aim: [0, 0.1, 0], angle: 1, penumbra: 0.06 }
// The light that falls on the cork under the middle of the bar. The brightest card there
// peaks at about 80 percent of full white, so the lamp never clips a card to a flat white.
const PEAK = 2.4
const MASK = 128
// The share of the steady fill and desk light that matches the room at the dark point of the
// lamp switch, for each share of room light. The board under the fill and desk light alone
// matches the room copy at the board stop with its exposure at about 0.042 (lamp probe,
// November 2026: 0.048 on a desktop, 0.037 on a phone). The full switch dims the room to that
// share, so the fill stays steady and only the lamp warms. The shallower reduced motion
// switch keeps the fill steady too, and its longer still blend covers the gap at the swap.
const DARK_MATCH = 24
const smooth = THREE.MathUtils.smoothstep

// The wash on the cork plane, 1 under the middle of the bar. It falls to about 0.32 at the
// bottom of the cork and to about half at the sides of the frame. It fades out on the wall
// past the frame, and it stops at the bar, so the lamp never lights its own brass.
const wash = (x, y) => {
    const down = 0.07 + 0.93 * smooth(y, -0.92, 0.5)
    const above = 1 - smooth(y, 0.5, 0.58)
    const side = (1 - 0.5 * smooth(Math.abs(x), 0.4, 0.95)) * (1 - 0.75 * smooth(Math.abs(x), 0.8, 1.3))
    return down * above * side
}

// Draws the mask of the lamp. Each texel casts a ray from the lamp to the cork plane and
// takes the wash there over the cosine of the light on the cork. Returns the mask and the
// largest ratio on the board, which the lamp takes as its intensity factor.
function washMask(lamp) {
    lamp.updateMatrixWorld()
    lamp.target.updateMatrixWorld()
    lamp.shadow.updateMatrices(lamp)
    const from = lamp.position
    const ray = new THREE.Vector3()
    const ratios = new Float32Array(MASK * MASK)
    let most = 0
    for (let j = 0; j < MASK; j++) {
        for (let i = 0; i < MASK; i++) {
            // The canvas texture flips on upload, so canvas row 0 is the top of the light view.
            ray.set(((i + 0.5) / MASK) * 2 - 1, (1 - (j + 0.5) / MASK) * 2 - 1, 0.5).unproject(lamp.shadow.camera).sub(from)
            if (ray.z >= 0) continue
            const t = -from.z / ray.z
            const x = from.x + ray.x * t
            const y = from.y + ray.y * t
            const ratio = (wash(x, y) * Math.hypot(x - from.x, y - from.y, from.z)) / from.z
            ratios[j * MASK + i] = ratio
            if (Math.abs(x) < 0.8 && Math.abs(y) < 0.5) most = Math.max(most, ratio)
        }
    }
    const canvas = Object.assign(document.createElement('canvas'), { width: MASK, height: MASK })
    const ctx = canvas.getContext('2d')
    const image = ctx.createImageData(MASK, MASK)
    ratios.forEach((ratio, k) => {
        const v = Math.round(Math.min(1, ratio / most) * 255)
        image.data.set([v, v, v, 255], k * 4)
    })
    ctx.putImageData(image, 0, 0)
    return { texture: new THREE.CanvasTexture(canvas), most }
}

// The wall draws the shadow map only when a pin lifts, so its size costs memory, not frame time.
// Returns the objects for the scene, the fixture that the room copy shows too, and setLamp,
// which sets the light of the lamp for the lamp switch (light-switch.js).
export function createLight(small) {
    // A decay of 0 leaves all the falloff to the mask.
    const lamp = new THREE.SpotLight(WARM, 1, 0, LAMP.angle, LAMP.penumbra, 0)
    lamp.position.set(...LAMP.at)
    lamp.target.position.set(...LAMP.aim)
    lamp.castShadow = true
    // The wide cone spreads the shadow map, so a wide screen takes 1536 texels, about 2 mm each.
    lamp.shadow.mapSize.setScalar(small ? 1024 : 1536)
    lamp.shadow.camera.near = 0.2
    lamp.shadow.camera.far = 3
    lamp.shadow.bias = -0.0003
    lamp.shadow.normalBias = 0.001
    lamp.shadow.radius = 4
    // The shade keeps some of the lamp, so the yarn shadows read soft and do not hatch the board.
    lamp.shadow.intensity = 0.7
    const mask = washMask(lamp)
    lamp.map = mask.texture
    lamp.intensity = PEAK * mask.most

    const fill = new THREE.HemisphereLight(0x8c97b8, 0x2a2430, 0.7)
    // A low warm glow from a desk lamp off to the left, so the lower corners keep some colour.
    const desk = new THREE.PointLight(0xffa860, 0.5, 0, 0.6)
    desk.position.set(-1.6, -0.9, 1.2)

    const brass = new THREE.MeshPhongMaterial({ color: 0x9c7436, shininess: 60, specular: 0x8a6a3a })
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.72, 20), brass)
    bar.rotation.z = Math.PI / 2
    bar.position.set(0, 0.6, 0.17)
    // The lit lip under the bar. It is a flat bright colour and needs no bloom.
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.68, 10), new THREE.MeshBasicMaterial({ color: 0xffe9c0 }))
    lip.rotation.z = Math.PI / 2
    lip.position.set(0, 0.584, 0.172)
    const rods = [-0.25, 0.25].map((x) => {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.22, 8), brass)
        rod.rotation.x = Math.PI / 2
        rod.position.set(x, 0.6, 0.06)
        return rod
    })

    // The oak worktop under the board. A phone shows its front edge below the board.
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.045, 0.6), new THREE.MeshLambertMaterial({ color: 0x7a5434 }))
    top.position.set(0, -0.76, 0.26)
    top.receiveShadow = true

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshLambertMaterial({ color: 0x3e3029 }))
    wall.position.z = -0.04
    wall.receiveShadow = true
    // The steady state. setLamp(1) gives these values back exactly.
    const steady = { lamp: lamp.intensity, fill: fill.intensity, desk: desk.intensity, color: lamp.color.clone(), lip: lip.material.color.clone() }
    // light: the lamp from 0 (off) to 1 (steady). dark: the dark point of the switch, which
    // sets the fill and the desk light that the lamp starts from. The light rises a little
    // slower than the level at first, so the filament shows before the board lights.
    const setLamp = (light, dark) => {
        const k = light ** 1.4
        // The fill never starts above its steady value, so no part of the wall gets darker
        // while the lamp warms. The still blend at the swap covers a shallower dark point.
        const start = Math.min(1, dark * DARK_MATCH)
        const ambient = start + (1 - start) * k
        lamp.intensity = steady.lamp * k
        bulbColor(lamp.color, steady.color, light)
        fill.intensity = steady.fill * ambient
        desk.intensity = steady.desk * ambient
        bulbColor(lip.material.color, steady.lip, light).multiplyScalar(filament(light))
    }
    return { objects: [lamp, lamp.target, fill, desk, bar, lip, ...rods, top, wall], fixture: [bar, lip, ...rods], lip, setLamp }
}

// A small grey grain that tiles over the cork, so the cork reads as cork up close. It is a
// texture, not a colour per face, so the low-poly faces never show a checkerboard.
export function corkGrain(anisotropy) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f4f0ea'
    ctx.fillRect(0, 0, 256, 256)
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 5000; i++) {
        const v = 175 + rand() * 80
        ctx.fillStyle = `rgba(${v},${v * 0.9},${v * 0.8},${0.25 + rand() * 0.35})`
        ctx.beginPath()
        ctx.arc(rand() * 256, rand() * 256, 0.4 + rand() * 1.1, 0, Math.PI * 2)
        ctx.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(10, 6)
    texture.anisotropy = anisotropy
    return texture
}

// A soft glow round a rectangle. It lies on the cork under a marked pin, so a ring of lamp
// light shows round the edge of the lifted sheet. The rectangle covers the middle half.
export function haloTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    ctx.filter = 'blur(9px)'
    ctx.fillStyle = '#fff'
    ctx.fillRect(32, 32, 64, 64)
    return new THREE.CanvasTexture(canvas)
}
