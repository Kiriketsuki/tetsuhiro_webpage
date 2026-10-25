import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { WatercolourPass } from './composite-pass.js'

// Quality ladder without bloom. No tier has Kuwahara yet, so the ladder drops MSAA first
// and then the pixel ratio. Reduced motion is not a tier: it renders one frame.
export const TIERS = [
    { name: 'msaa4', samples: 4, maxPixelRatio: 2 },
    { name: 'no-msaa', samples: 0, maxPixelRatio: 2 },
    { name: 'dpr-1.5', samples: 0, maxPixelRatio: 1.5 },
    { name: 'dpr-1', samples: 0, maxPixelRatio: 1 },
]

// Frame budgets from docs/site-rewrite-plan.md.
export const BUDGET_MS = { desktop: 16.7, mobile: 22 }

// A phone already draws at 2x or 3x, so it starts without MSAA.
export const startTier = (mobile) => (mobile ? 1 : 0)

// Builds the composer for one tier: the scene into a half-float target, then the
// watercolour composite to the screen.
export function createPipeline({ renderer, scene, camera, tier }) {
    const pixelRatio = Math.min(tier.maxPixelRatio, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pixelRatio)
    const size = renderer.getSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
        type: THREE.HalfFloatType,
        samples: tier.samples,
    })
    target.texture.name = `aerie.main.${tier.name}`
    const composer = new EffectComposer(renderer, target)
    const watercolour = new WatercolourPass()
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(watercolour)

    const resize = (width, height) => {
        composer.setPixelRatio(pixelRatio)
        composer.setSize(width, height)
        watercolour.setPixelRatio(pixelRatio)
    }
    resize(size.x, size.y)

    const dispose = () => {
        watercolour.dispose()
        composer.dispose()
    }
    return { composer, watercolour, pixelRatio, resize, dispose, render: () => composer.render() }
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
