import * as THREE from 'three'

// What makes the skill tree look like it feeds the skills: a soft glow on the
// bark near each pod, in the colour of the pod's branch. The leaves come from
// the SkillTreeCanopy mesh in island.glb, so nothing here builds foliage.

const GLOW_RADIUS = 6
const GLOW_SIZE = 1.6

function softDot() {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(canvas)
}

function treeVertices(tree) {
    tree.updateWorldMatrix(true, false)
    const position = tree.geometry.getAttribute('position')
    return Array.from({ length: position.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(tree.matrixWorld)
    )
}

// Each vertex near a pod takes that pod's colour, fading with the distance.
function createGlow(vertices, pods) {
    const positions = []
    const colors = []
    const color = new THREE.Color()
    vertices.forEach((v) => {
        let best = null
        let bestDistance = GLOW_RADIUS
        pods.forEach((pod) => {
            const d = v.distanceTo(pod.tip)
            if (d < bestDistance) {
                best = pod
                bestDistance = d
            }
        })
        if (!best) return
        const strength = (1 - bestDistance / GLOW_RADIUS) ** 2
        color.set(best.color).multiplyScalar(strength * 0.5)
        positions.push(v.x, v.y, v.z)
        colors.push(color.r, color.g, color.b)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const map = softDot()
    const material = new THREE.PointsMaterial({
        size: GLOW_SIZE,
        map,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.name = 'skill-glow'
    return { points, map }
}

// Where each pod hangs. Every pod starts straight below its branch tip. Pods
// closer than `spacing` (on screen from the skills shot: the y and z plane) push
// apart, and each stays within `reach` of its own tip so the twig stays short.
export function hangPoints(tips, { view = new THREE.Vector3(-1, 0, 0), drop = 1.2, spacing = 2.5, reach = 4.2 } = {}) {
    // The screen plane, as seen along the view direction.
    const forward = view.clone().normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    const centres = tips.map((tip) => tip.clone().addScaledVector(up, -drop))
    for (let pass = 0; pass < 80; pass++) {
        for (let i = 0; i < centres.length; i++) {
            for (let j = i + 1; j < centres.length; j++) {
                const delta = centres[i].clone().sub(centres[j])
                const dx = delta.dot(right)
                const dy = delta.dot(up)
                const d = Math.hypot(dx, dy)
                if (d >= spacing) continue
                const push = (spacing - d) / 2
                const nx = d > 1e-4 ? dx / d : 1
                const ny = d > 1e-4 ? dy / d : 0
                const shift = right.clone().multiplyScalar(nx * push).addScaledVector(up, ny * push)
                centres[i].add(shift)
                centres[j].sub(shift)
            }
        }
        centres.forEach((centre, i) => {
            const offset = centre.clone().sub(tips[i])
            if (offset.length() > reach) centre.copy(tips[i]).addScaledVector(offset.normalize(), reach)
        })
    }
    return centres
}

// Closest bark vertex to a point, so a twig can start on the tree itself.
export function nearestBark(tree, point) {
    let best = null
    let bestDistance = Infinity
    treeVertices(tree).forEach((v) => {
        const d = v.distanceToSquared(point)
        if (d < bestDistance) {
            best = v
            bestDistance = d
        }
    })
    return best ?? point.clone()
}

// pods: [{ tip: Vector3, centre: Vector3, color: '#rrggbb' }]
export function createTreeGrowth(scene, tree, pods, { reducedMotion } = {}) {
    const vertices = treeVertices(tree)
    const glow = createGlow(vertices, pods)
    const group = new THREE.Group()
    group.name = 'tree-growth'
    group.add(glow.points)
    scene.add(group)

    const update = (delta, time) => {
        const pulse = reducedMotion?.value ? 0 : Math.sin(time * 1.4)
        glow.points.material.opacity = 0.85 + pulse * 0.2
    }
    return { group, glow, update }
}

export function disposeTreeGrowth(scene, { group, glow }) {
    scene.remove(group)
    glow.points.geometry.dispose()
    glow.points.material.dispose()
    glow.map.dispose()
}
