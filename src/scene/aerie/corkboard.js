import * as THREE from 'three'

// Project cards pinned on the workshop corkboard, drawn from src/data/projects.js, so a new
// project needs no Blender edit. All cards share one canvas atlas and one mesh. The words
// stay in the DOM for search engines and screen readers. The cards only show them.

const COLUMNS = 3
const ROWS = 2
const CELL = { width: 512, height: 340 }
const PAPER = ['#efe6d2', '#e9dcc0', '#f3ead9', '#e5d6bd', '#efe1c7', '#ebe4d6']
const PIN = ['#c8463b', '#3d6f9a', '#d9a441', '#5c8a5a', '#a383e3', '#ee8d9f']
// Each card covers this share of its cell, so cork shows between them.
const FILL = 0.82
const SURFACE_OFFSET = 0.012
// The board search: steps of this many metres, out to this far from the centre.
const STEP = 0.04
const REACH = 1.6

function drawCard(ctx, project, i) {
    const x = (i % COLUMNS) * CELL.width
    const y = Math.floor(i / COLUMNS) * CELL.height
    ctx.fillStyle = PAPER[i % PAPER.length]
    ctx.fillRect(x + 8, y + 8, CELL.width - 16, CELL.height - 16)
    ctx.fillStyle = '#2b2a33'
    ctx.font = '600 22px "JetBrains Mono", ui-monospace, monospace'
    ctx.fillText(project.year ?? '', x + 36, y + 64)
    ctx.font = '52px "Instrument Serif", Georgia, serif'
    wrap(ctx, project.title, x + 36, y + 130, CELL.width - 72, 54, 3)
    ctx.fillStyle = PIN[i % PIN.length]
    ctx.beginPath()
    ctx.arc(x + CELL.width / 2, y + 34, 14, 0, Math.PI * 2)
    ctx.fill()
}

function wrap(ctx, text, x, y, width, lineHeight, maxLines) {
    const words = text.split(' ')
    let line = ''
    let lines = 0
    for (const word of words) {
        const next = line ? `${line} ${word}` : word
        if (ctx.measureText(next).width > width && line) {
            ctx.fillText(line, x, y + lines * lineHeight)
            lines += 1
            line = word
            if (lines >= maxLines) return
        } else {
            line = next
        }
    }
    if (line) ctx.fillText(line, x, y + lines * lineHeight)
}

function atlas(projects) {
    const canvas = document.createElement('canvas')
    canvas.width = CELL.width * COLUMNS
    canvas.height = CELL.height * ROWS
    const ctx = canvas.getContext('2d')
    projects.forEach((project, i) => drawCard(ctx, project, i))
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
}

// Finds the corkboard plane: a ray along the workshop camera's view hits the board. The
// search then walks out along the board while the hits stay on the same plane and on cork.
export function findBoard(root, camera) {
    const meshes = []
    root.traverse((node) => {
        if (node.isMesh && node.userData.webMaterial === 'web_soft_goods') meshes.push(node)
    })
    const solid = []
    root.traverse((node) => {
        if (node.isMesh && !/glass/.test(node.userData.webMaterial ?? '')) solid.push(node)
    })
    camera.updateMatrixWorld(true)
    const origin = camera.getWorldPosition(new THREE.Vector3())
    const forward = camera.getWorldDirection(new THREE.Vector3())
    const raycaster = new THREE.Raycaster(origin, forward, 0.1, 30)
    const hit = raycaster.intersectObjects(solid, false)[0]
    if (!hit || !meshes.includes(hit.object)) return null
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    if (normal.dot(forward) > 0) normal.negate()
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize()
    const up = new THREE.Vector3().crossVectors(normal, right)

    const onBoard = (u, v) => {
        const probe = hit.point.clone().addScaledVector(right, u).addScaledVector(up, v)
        raycaster.set(probe.clone().addScaledVector(normal, 0.3), normal.clone().negate())
        const h = raycaster.intersectObjects(solid, false)[0]
        return h && meshes.includes(h.object) && Math.abs(h.point.clone().sub(hit.point).dot(normal)) < 0.03
    }
    const walk = (du, dv) => {
        let d = 0
        while (d < REACH && onBoard(du * (d + STEP), dv * (d + STEP))) d += STEP
        return d
    }
    const left = walk(-1, 0)
    const rightReach = walk(1, 0)
    const down = walk(0, -1)
    const top = walk(0, 1)
    const centre = hit.point.clone().addScaledVector(right, (rightReach - left) / 2).addScaledVector(up, (top - down) / 2)
    return { centre, normal, right, up, width: left + rightReach, height: down + top }
}

export function createCorkboard({ board, projects }) {
    const shown = projects.slice(0, COLUMNS * ROWS)
    const texture = atlas(shown)
    const cellW = board.width / COLUMNS
    const cellH = board.height / ROWS
    const positions = []
    const uvs = []
    const index = []
    shown.forEach((project, i) => {
        const col = i % COLUMNS
        const row = Math.floor(i / COLUMNS)
        // A small fixed tilt per card, so the board looks pinned by hand.
        const tilt = Math.sin(i * 2.3) * 0.05
        const cx = (col + 0.5) * cellW - board.width / 2
        const cy = board.height / 2 - (row + 0.5) * cellH
        const hw = (cellW * FILL) / 2
        const hh = (cellH * FILL) / 2
        const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
        const u0 = col / COLUMNS
        const v0 = 1 - (row + 1) / ROWS
        const cornerUv = [[u0, v0], [u0 + 1 / COLUMNS, v0], [u0 + 1 / COLUMNS, v0 + 1 / ROWS], [u0, v0 + 1 / ROWS]]
        const base = positions.length / 3
        corners.forEach(([x, y], k) => {
            const rx = x * Math.cos(tilt) - y * Math.sin(tilt) + cx
            const ry = x * Math.sin(tilt) + y * Math.cos(tilt) + cy
            const p = board.centre.clone().addScaledVector(board.right, rx).addScaledVector(board.up, ry).addScaledVector(board.normal, SURFACE_OFFSET + i * 0.001)
            positions.push(p.x, p.y, p.z)
            uvs.push(...cornerUv[k])
        })
        index.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    geometry.computeBoundingSphere()
    // Basic colour at a little under full, so the cards read as paper in a lamp-lit room.
    const material = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0.78, 0.7, 0.6) })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'ProjectCards'
    const dispose = () => {
        geometry.dispose()
        material.dispose()
        texture.dispose()
    }
    return { mesh, dispose }
}
