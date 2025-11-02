<script setup>
import { computed } from 'vue'
import { branchOf, logoColor, skills } from '../data/skills.js'

const props = defineProps({
    skill: { type: Object, required: true },
})

const children = computed(() => skills.filter((child) => child.parent === props.skill.id))
const branch = computed(() => branchOf(props.skill))
</script>

<template>
    <li class="node" :style="{ '--node': `var(--color-${branch?.color ?? 'teal'})` }">
        <div class="row">
            <span class="logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" :fill="logoColor(skill)"><path :d="skill.icon.path" /></svg>
            </span>
            <span class="name">{{ skill.name }}</span>
            <span class="branch">{{ branch?.label }}</span>
        </div>
        <ul v-if="children.length" class="children">
            <SkillNode v-for="child in children" :key="child.id" :skill="child" />
        </ul>
    </li>
</template>

<style scoped>
/*
 * Each skill is a round pod on a drawn branch. The lines are drawn on the
 * list items, not the rows, so a limb runs the full height with no gap. Each
 * child draws its own curved elbow from the limb into the middle of its pod,
 * and the elbow takes a little of the branch colour.
 */
.node {
    --box: 2.5rem;
    --gap: 0.85rem;
    --limb: color-mix(in oklab, var(--node) 45%, var(--color-line));
    list-style: none;
}

.row {
    display: grid;
    grid-template-columns: var(--box) 1fr auto;
    align-items: center;
    gap: 0.85rem;
}

.logo {
    display: grid;
    place-items: center;
    width: var(--box);
    height: var(--box);
    background: radial-gradient(circle at 50% 35%, #16294a, var(--color-bg-raised));
    border: 2px solid var(--node);
    border-radius: 50%;
    box-shadow: 0 0 0.9rem color-mix(in oklab, var(--node) 40%, transparent);
}

.logo svg {
    width: 1.2rem;
    height: 1.2rem;
}

.row:hover .logo {
    animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
    0%,
    100% {
        transform: scale(1);
        box-shadow: 0 0 0.9rem color-mix(in oklab, var(--node) 40%, transparent);
    }
    50% {
        transform: scale(1.08);
        box-shadow: 0 0 1.5rem color-mix(in oklab, var(--node) 70%, transparent);
    }
}

@media (prefers-reduced-motion: reduce) {
    .row:hover .logo {
        animation: none;
    }
}

.name {
    min-width: 0;
    color: var(--color-text-strong);
    font-family: var(--font-label);
    font-size: clamp(0.85rem, 1vw, 0.95rem);
}

.branch {
    color: var(--color-text-faint);
    font-family: var(--font-label);
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

/* The limb sits under the middle of the parent's pod. */
.children {
    margin-left: calc(var(--box) / 2);
}

.children > .node {
    position: relative;
    padding-top: var(--gap);
    padding-left: 1.6rem;
}

.children > .node::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1px;
    border-left: 2px solid var(--limb);
}

.children > .node:last-child::before {
    display: none;
}

.children > .node::after {
    content: '';
    position: absolute;
    top: 0;
    left: -1px;
    width: 1.6rem;
    height: calc(var(--gap) + var(--box) / 2);
    border-left: 2px solid var(--limb);
    border-bottom: 2px solid var(--limb);
    border-bottom-left-radius: 1rem;
}
</style>
