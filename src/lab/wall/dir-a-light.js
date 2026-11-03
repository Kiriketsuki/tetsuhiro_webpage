import * as THREE from 'three'

// The light of the workshop wall at night. The brass picture light hangs above the board
// and throws a warm pool down the cork, so the top of the board reads brightest and the
// corners fall into the dark. A dim cool fill keeps the shadows blue grey and not black,
// which gives the split tone of the island: warm light, cool shade.

const WARM = 0xffead0

// A phone takes a smaller shadow map. The wall draws it only when a pin lifts, so the size
// costs memory and not frame time.
export function createLight(small) {
    const lamp = new THREE.SpotLight(WARM, 5, 0, 0.95, 1, 1.6)
    lamp.position.set(0, 0.6, 0.34)
    lamp.target.position.set(0, -0.12, 0)
    lamp.castShadow = true
    lamp.shadow.mapSize.setScalar(small ? 1024 : 2048)
    lamp.shadow.camera.near = 0.05
    lamp.shadow.camera.far = 3
    lamp.shadow.bias = -0.0003
    lamp.shadow.normalBias = 0.001
    lamp.shadow.radius = 4
    // The shade keeps some of the lamp, so the yarn shadows read soft and do not hatch the board.
    lamp.shadow.intensity = 0.7

    const fill = new THREE.HemisphereLight(0x8c97b8, 0x2a2430, 0.55)
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
    return [lamp, lamp.target, fill, desk, bar, lip, ...rods, top, wall]
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
