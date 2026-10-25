import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GradePass } from './grade-pass.js'
import { GlowPass } from './glow-pass.js'

// The quality ladder. The soft glow runs on the desktop only, and the ladder drops it
// first, then MSAA, then the pixel ratio. Reduced motion is not a tier: it renders one frame.
export const TIERS = [
    { name: 'glow-msaa4', samples: 4, maxPixelRatio: 2, glow: true },
    { name: 'msaa4', samples: 4, maxPixelRatio: 2, glow: false },
    { name: 'no-msaa', samples: 0, maxPixelRatio: 2, glow: false },
    { name: 'dpr-1.5', samples: 0, maxPixelRatio: 1.5, glow: false },
    { name: 'dpr-1', samples: 0, maxPixelRatio: 1, glow: false },
]

// Frame budgets from docs/site-rewrite-plan.md.
export const BUDGET_MS = { desktop: 16.7, mobile: 22 }

// A phone already draws at 2x or 3x, so it starts without MSAA, and it never gets the glow.
export const startTier = (mobile) => (mobile ? 2 : 0)

// Builds the composer for one tier: the scene into a half-float target, the glow on the
// desktop tier, then the grade pass to the screen.
export function createPipeline({ renderer, scene, camera, tier, small = false }) {
    const pixelRatio = Math.min(tier.maxPixelRatio, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pixelRatio)
    const size = renderer.getSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
        type: THREE.HalfFloatType,
        samples: tier.samples,
    })
    target.texture.name = `aerie.main.${tier.name}`
    const composer = new EffectComposer(renderer, target)
    const renderPass = new RenderPass(scene, camera)
    const grade = new GradePass()
    const glow = tier.glow && !small ? new GlowPass() : null
    composer.addPass(renderPass)
    if (glow) composer.addPass(glow)
    composer.addPass(grade)
    grade.setGlow(glow?.texture ?? null)

    const resize = (width, height) => {
        composer.setPixelRatio(pixelRatio)
        composer.setSize(width, height)
    }
    resize(size.x, size.y)

    const dispose = () => {
        grade.dispose()
        glow?.dispose()
        composer.dispose()
    }
    // Swaps what the scene pass draws, for the telescope's skill sky.
    const setView = (nextScene, nextCamera) => {
        renderPass.scene = nextScene
        renderPass.camera = nextCamera
    }
    return { composer, grade, pixelRatio, resize, dispose, setView, render: () => composer.render() }
}

// Steps down one tier when the median frame time stays over budget. It never steps back
// up, so the quality cannot swing back and forth.
export function createGovernor({ budgetMs, tier, onStep, window: size = 90, cooldownMs = 2000 }) {
    const samples = []
    let current = tier
    let quietUntil = 0
    const sample = (frameMs, now) => {
        if (now < quietUntil || current >= TIERS.length - 1) return
        samples.push(frameMs)
        if (samples.length < size) return
        const median = [...samples].sort((a, b) => a - b)[Math.floor(size / 2)]
        samples.length = 0
        if (median <= budgetMs * 1.1) return
        current += 1
        quietUntil = now + cooldownMs
        onStep(current, median)
    }
    const reset = (next) => {
        current = next
        samples.length = 0
    }
    return { sample, reset, get tier() { return current } }
}
