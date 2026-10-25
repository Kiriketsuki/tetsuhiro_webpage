import * as THREE from 'three'

// Shot framing that holds up on any screen. The Blender cameras were framed at 16:9.
export const FRAMED_ASPECT = 16 / 9
export const MAX_FOV = 75

// Keeps the width of a 16:9 shot on a narrow screen, so a portrait phone still sees the
// whole subject. A wide screen keeps the vertical fov as framed.
export function fitFov(fov, aspect, maxFov = MAX_FOV) {
    if (aspect >= FRAMED_ASPECT) return fov
    const half = THREE.MathUtils.degToRad(fov / 2)
    const wide = Math.atan(Math.tan(half) * FRAMED_ASPECT)
    const tall = 2 * Math.atan(Math.tan(wide) / aspect)
    return Math.min(maxFov, THREE.MathUtils.radToDeg(tall))
}
