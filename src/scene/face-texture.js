import * as THREE from 'three'
import { iconPaths } from '../data/icon-paths.js'

const SIZE = 1024
const BASE = '#03111e'
// Frame and icon colour per kind: games sand, shows and manhwa rose, hobbies violet.
const TINTS = { game: '#e8c089', show: '#ee8d9f', manhwa: '#ee8d9f', hobby: '#a383e3' }

// The face code maps a pentagon with a vertex on top into this square. The
// circumradius is SIZE / 1.95 and the centre sits a little below the middle.
const RADIUS = SIZE / 1.95
const CENTRE_X = SIZE / 2
const CENTRE_Y = SIZE / 2 + RADIUS * 0.0955
const ICON_SIZE = 540

function pentagon(ctx, radius) {
    ctx.beginPath()
    for (let k = 0; k < 5; k++) {
        const angle = Math.PI / 2 + (k * 2 * Math.PI) / 5
        const x = CENTRE_X + radius * Math.cos(angle)
        const y = CENTRE_Y - radius * Math.sin(angle)
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.closePath()
}

// Draws one face: a flat base, a thin pentagon frame and the icon from its path data.
export function createFaceTexture(interest) {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    const tint = TINTS[interest.kind] ?? TINTS.game

    ctx.fillStyle = BASE
    ctx.fillRect(0, 0, SIZE, SIZE)

    ctx.strokeStyle = tint
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 6
    ctx.lineJoin = 'round'
    pentagon(ctx, RADIUS * 0.9)
    ctx.stroke()
    ctx.globalAlpha = 1

    const scale = ICON_SIZE / 512
    ctx.save()
    ctx.translate(CENTRE_X - ICON_SIZE / 2, CENTRE_Y - ICON_SIZE / 2)
    ctx.scale(scale, scale)
    ctx.fillStyle = tint
    ctx.fill(new Path2D(iconPaths[interest.icon]))
    ctx.restore()

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
}
