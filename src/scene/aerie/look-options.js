import { GRADE } from './grade-pass.js'

// The look options on top of the base night look. Each one sets uniforms only, so a change
// never recompiles a program. The site ships the diorama mix (user pick, 2026-11-02). The lab
// toggles each option for comparison.
//
//   ink    soft ink outline on the house, trees, bridge, pad and props (grade-pass.js)
//   bands  three soft cel bands in the moon light
//   cel    a two-tone cel with an indigo shade and stepped lamp pools
//   rim    a cool moon rim on every silhouette
//   lamps  a stronger moon key, less fill, brighter and wider window and fire pools
//   split  split toning: indigo shade, amber light, a deeper vignette
//   lens   a miniature tilt-shift lens, focused at the middle of the frame (grade-pass.js)
export const LOOK_OPTIONS = ['ink', 'bands', 'cel', 'rim', 'lamps', 'split', 'lens']
export const SITE_LOOK = new Set(['ink', 'rim', 'lamps', 'split', 'lens'])

// Keeps the base uniform values, read once before any option changes them.
export function createLookControl(uniforms) {
    const base = {
        moon: uniforms.uToonMoon.value.clone(),
        sky: uniforms.uToonSky.value.clone(),
        ground: uniforms.uToonGround.value.clone(),
        warm: uniforms.uToonWarm.value.clone(),
        rim: uniforms.uToonRim.value.clone(),
        radii: uniforms.uToonBounce.value.map((spot) => spot.w),
    }
    // Sets the uniforms for one set of options. grade: the grade pass uniforms of the pipeline.
    const apply = (set, grade) => {
        const on = (name) => (set.has(name) ? 1 : 0)
        uniforms.uToonBands.value = on('bands')
        uniforms.uToonCel.value = on('cel')
        uniforms.uToonRimSpread.value = on('rim') * 0.6
        uniforms.uToonRim.value.copy(base.rim).multiplyScalar(set.has('rim') ? 5 : 1)
        // The toon options need a stronger key too, or the band steps hide in the dim moon light.
        const toon = set.has('bands') || set.has('cel')
        const key = (set.has('lamps') ? 1.45 : 1) * (toon ? 1.6 : 1)
        const fill = (set.has('lamps') ? 0.72 : 1) * (toon ? 0.8 : 1)
        uniforms.uToonMoon.value.copy(base.moon).multiplyScalar(key)
        uniforms.uToonSky.value.copy(base.sky).multiplyScalar(fill)
        uniforms.uToonGround.value.copy(base.ground).multiplyScalar(fill)
        uniforms.uToonWarm.value.copy(base.warm).multiplyScalar(set.has('lamps') ? 2.1 : 1)
        uniforms.uToonBounce.value.forEach((spot, i) => (spot.w = base.radii[i] * (set.has('lamps') ? 1.5 : 1)))
        grade.uInk.value = on('ink')
        grade.uDof.value = on('lens')
        grade.uSplit.value = on('split')
        grade.uVignette.value = set.has('split') ? 0.34 : GRADE.vignette
    }
    return { apply }
}
