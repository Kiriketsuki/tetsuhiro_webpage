import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// The lens pulls focus toward what the cursor rests on. A 1x1 pass reads the scene depth at the
// cursor and writes it as a log depth in two bytes, because WebGL2 cannot read a depth texture
// back. readRenderTargetPixelsAsync reads that pixel through a pixel buffer and a fence, so the
// CPU never waits on the GPU. The depth covers every surface that writes depth. The city plane
// writes none, so a pointer over the city reads the far plane, and the lens then keeps the city
// sharp.
//
// The values are a mutable object, so the owner can tune them live from the dev console.
export const HOVER_FOCUS = {
    // The pointer rests this long, in milliseconds, before the focus moves.
    rest: 150,
    // The spring rate. A critically damped spring at 18 per second settles in about 250 ms.
    rate: 18,
    // A change of log depth under this size keeps the focus where it is, so it does not hunt.
    dead: 0.15,
    // How far the focus goes from the stop's own focus toward the hovered depth. At 0.8 the
    // stop's subject keeps a fifth of its sharpness when the cursor rests far behind it.
    cap: 0.8,
    // The cursor clear patch while the hover focus holds. 0.4 is the patch without it.
    clear: 0,
}

// The probe reads no more often than this, in milliseconds.
const PROBE_MS = 60

const probeShader = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform sampler2D tDepth;
uniform vec2 uCursor;
uniform float uNear;
uniform float uFar;
void main() {
    float d = uNear * uFar / ( uFar - ( uFar - uNear ) * texture2D( tDepth, uCursor ).x );
    float v = clamp( log( d / uNear ) / log( uFar / uNear ), 0.0, 1.0 ) * 255.0;
    gl_FragColor = vec4( floor( v ) / 255.0, fract( v ), 0.0, 1.0 );
}
`

// renderer: the WebGLRenderer. update() runs once a frame, before the frame draws, and returns
// the eased hover focus in metres, its weight from 0 to 1, and true while the spring still moves.
export function createHoverFocus(renderer) {
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
    const uniforms = { tDepth: { value: null }, uCursor: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1 } }
    const quad = new FullScreenQuad(new THREE.RawShaderMaterial({ uniforms, vertexShader: 'attribute vec3 position;void main(){gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: probeShader, depthTest: false, depthWrite: false }))
    const bytes = new Uint8Array(4)
    // read: the newest depth { log, at }. aim: the log depth the spring moves to. onAt: the time
    // the hover focus last turned on, so a depth read before a camera move never counts after it.
    const s = { read: null, reading: false, probedAt: -Infinity, aim: null, x: 0, v: 0, w: 0, onAt: Infinity }

    const probe = (depthTexture, cursor, camera, now) => {
        uniforms.tDepth.value = depthTexture
        uniforms.uCursor.value.copy(cursor)
        uniforms.uNear.value = camera.near
        uniforms.uFar.value = camera.far
        const current = renderer.getRenderTarget()
        renderer.setRenderTarget(target)
        quad.render(renderer)
        renderer.setRenderTarget(current)
        s.reading = true
        s.probedAt = now
        const { near, far } = camera
        renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1, bytes).then(
            () => {
                s.read = { log: Math.log(near) + ((bytes[0] + bytes[1] / 255) / 255) * Math.log(far / near), at: now }
                s.reading = false
            },
            () => {
                s.reading = false
            },
        )
    }

    // on: the lens is on, the camera is still and a cursor is over the scene. movedAt: the time
    // the cursor last moved. focus: the stop's focus in metres. dt: the frame step in seconds.
    const update = ({ on, cursor, movedAt, depthTexture, camera, focus, now, dt }) => {
        if (!on) s.onAt = Infinity
        else if (s.onAt === Infinity) s.onAt = now
        if (on && depthTexture && !s.reading && now - s.probedAt > PROBE_MS) probe(depthTexture, cursor, camera, now)
        const rested = now - movedAt >= HOVER_FOCUS.rest
        const fresh = s.read && s.read.at >= Math.max(movedAt, s.onAt)
        if (on && rested && fresh && (s.aim === null || Math.abs(s.read.log - s.aim) > HOVER_FOCUS.dead)) s.aim = s.read.log
        const wAim = on && s.aim !== null ? 1 : 0
        // Without weight the spring starts at the stop's focus, so the pull eases out from it.
        if (s.w < 0.01) {
            s.x = Math.log(focus)
            s.v = 0
        }
        // The critically damped spring, solved exactly for one frame step.
        const e = Math.exp(-HOVER_FOCUS.rate * dt)
        const d = s.x - (s.aim ?? s.x)
        const t = (s.v + HOVER_FOCUS.rate * d) * dt
        s.v = (s.v - HOVER_FOCUS.rate * t) * e
        s.x = (s.aim ?? s.x) + (d + t) * e
        s.w += (wAim - s.w) * (1 - Math.exp(-dt / 0.12))
        if (!on) s.aim = null
        // The frames go on until a depth read after the rest lands, then until the spring settles.
        const busy = Math.abs(s.w - wAim) > 0.005 || Math.abs(d) > 0.005 || (on && !(rested && fresh))
        return { focus: Math.exp(s.x), weight: s.w, busy }
    }

    const dispose = () => {
        target.dispose()
        quad.material.dispose()
        quad.dispose()
    }
    return { update, dispose }
}
