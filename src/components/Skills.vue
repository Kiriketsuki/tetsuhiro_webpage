<template>
    <div class="stop" :data-side="sideOf('skills')">
        <article class="frame frame-violet flex w-full max-w-[24rem] flex-col gap-5 p-6 pt-8 sm:p-8 sm:pt-9">
            <span class="frame-legend">04 / out to the telescope</span>
            <h2 class="font-slab text-[clamp(2.25rem,4vw,3.25rem)] leading-none text-text-strong">
                Skill tree
            </h2>
            <p class="hidden font-body text-sm text-text-body sm:block sm:text-[0.95rem]">
                What I reach for as of November 2026. Mostly web and 3D, with Python and Go
                behind them, from the database to the agents.
            </p>
            <!-- A phone keeps the card short, so the telescope above it stays in view. -->
            <p class="font-body text-sm text-text-body sm:hidden">
                {{ skills.length }} skills in {{ branches.length }} groups, from the web to the agents,
                each one a star in the sky.
            </p>
            <dl class="rows hidden text-sm sm:grid">
                <template v-for="branch in branches" :key="branch.id">
                    <dt class="branch" :style="{ '--branch': `var(--color-${branch.color})` }">
                        {{ branch.label }}
                    </dt>
                    <dd>{{ names(branch.id) }}</dd>
                </template>
            </dl>
            <router-link v-slot="{ href, navigate }" to="/skills" custom>
                <a :href="href" class="action stellar" @click="launch($event, navigate)">
                    <span class="stellar-text">Plot my stellar skills</span>
                    <span v-for="n in 5" :key="n" class="twinkle" aria-hidden="true">&#x2726;</span>
                </a>
            </router-link>
        </article>
    </div>
</template>

<script setup>
import { branches, skills } from '../data/skills.js'
import { sideOf, useWaypoints } from '../composables/useWaypoints.js'

const { reducedMotion } = useWaypoints()

// A press throws a little star dust in the constellation colours, then opens the sky once
// the dust has flown. Reduced motion and a new-tab click go straight through.
const DUST = ['--color-teal', '--color-violet', '--color-amber', '--color-rose', '--color-moss', '--color-sand']
const DUST_MS = 380

function launch(e, navigate) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    if (reducedMotion.value) {
        navigate()
        return
    }
    const link = e.currentTarget
    const box = link.getBoundingClientRect()
    const x = e.clientX ? e.clientX - box.left : box.width / 2
    const y = e.clientY ? e.clientY - box.top : box.height / 2
    DUST.concat(DUST, DUST).forEach((color, i) => {
        const angle = (i / 18) * Math.PI * 2
        const reach = 26 + (i % 3) * 12
        const mote = document.createElement('span')
        mote.className = 'dust'
        mote.setAttribute('aria-hidden', 'true')
        mote.style.cssText = `left:${x}px;top:${y}px;--c:var(${color});--dx:${Math.cos(angle) * reach}px;--dy:${Math.sin(angle) * reach}px`
        mote.addEventListener('animationend', () => mote.remove())
        link.append(mote)
    })
    setTimeout(navigate, DUST_MS)
}

const names = (id) =>
    skills
        .filter((skill) => skill.branch === id)
        .map((skill) => skill.name)
        .join(', ')
</script>

<style scoped>
/*
 * The link to the skill sky has a little sparkle: a shimmer runs along the words now and
 * then, three small stars in the constellation colours twinkle around it, and a hover or a
 * focus makes them glint. Reduced motion keeps a calm, still glow.
 */
.stellar {
    position: relative;
}

.stellar-text {
    background: linear-gradient(100deg, var(--color-teal-action-hover) 0 32%, #fff6d8 46%, #fff 50%, #fff6d8 54%, var(--color-teal-action-hover) 68% 100%);
    background-size: 240% 100%;
    background-position: 100% 0;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 0.35rem color-mix(in oklab, var(--color-teal) 45%, transparent));
    animation: stellar-shimmer 3.2s ease-in-out infinite;
}

@keyframes stellar-shimmer {
    0%,
    35% {
        background-position: 100% 0;
    }
    80%,
    100% {
        background-position: 0 0;
    }
}

.twinkle {
    position: absolute;
    color: var(--star);
    font-size: 0.85rem;
    line-height: 1;
    text-shadow: 0 0 0.5rem var(--star), 0 0 0.15rem #fff;
    pointer-events: none;
    animation: twinkle 2.6s ease-in-out infinite;
}

.twinkle:nth-of-type(2) {
    --star: var(--color-violet);
    top: -0.75rem;
    left: -0.8rem;
}

.twinkle:nth-of-type(3) {
    --star: var(--color-amber);
    top: -0.95rem;
    right: 2.4rem;
    font-size: 0.6rem;
    animation-delay: -0.9s;
}

.twinkle:nth-of-type(4) {
    --star: var(--color-teal);
    right: -1.2rem;
    bottom: 0;
    font-size: 0.7rem;
    animation-delay: -1.7s;
}

.twinkle:nth-of-type(5) {
    --star: var(--color-rose);
    top: -0.65rem;
    left: 42%;
    font-size: 0.5rem;
    animation-delay: -0.4s;
}

.twinkle:nth-of-type(6) {
    --star: var(--color-sand);
    bottom: -0.55rem;
    left: 28%;
    font-size: 0.45rem;
    animation-delay: -2.1s;
}

@keyframes twinkle {
    0%,
    100% {
        opacity: 0.25;
        transform: scale(0.6) rotate(0deg);
    }
    50% {
        opacity: 1;
        transform: scale(1.1) rotate(45deg);
    }
}

.stellar:hover .stellar-text,
.stellar:focus-visible .stellar-text {
    animation-duration: 1.4s;
}

.stellar:hover .twinkle,
.stellar:focus-visible .twinkle {
    animation-duration: 0.9s;
}

.stellar :deep(.dust) {
    position: absolute;
    width: 5px;
    height: 5px;
    margin: -2.5px 0 0 -2.5px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 8px var(--c), 0 0 2px #fff;
    pointer-events: none;
    animation: dust 0.55s ease-out forwards;
}

@keyframes dust {
    to {
        opacity: 0;
        transform: translate(var(--dx), var(--dy)) scale(0.3);
    }
}

@media (prefers-reduced-motion: reduce) {
    .stellar-text {
        background: none;
        color: var(--color-teal-action-hover);
        filter: none;
        text-shadow: 0 0 0.6rem color-mix(in oklab, var(--color-teal) 55%, transparent);
        animation: none;
    }

    .twinkle {
        opacity: 0.8;
        animation: none;
    }
}

/* A coloured tick at the start of each branch row. */
.branch {
    border-left: 3px solid var(--branch);
    padding-left: 0.6rem;
}
</style>
