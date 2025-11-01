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
    <li class="node">
        <div class="row" :style="{ '--node': `var(--color-${branch?.color ?? 'teal'})` }">
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
 * The lines are drawn on the list items, not the rows, so a line runs the
 * full height of a branch with no gap. Each child draws its own elbow from
 * the line into the middle of its logo box.
 */
.node {
    --box: 2.25rem;
    --gap: 0.85rem;
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
    background: var(--color-bg-base);
    border: 1px solid var(--node);
    border-radius: 2px;
}

.logo svg {
    width: 1.2rem;
    height: 1.2rem;
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

/* The trunk line sits under the middle of the parent's logo box. */
.children {
    margin-left: calc(var(--box) / 2);
}

.children > .node {
    position: relative;
    padding-top: var(--gap);
    padding-left: 1.4rem;
}

.children > .node::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-left: 1px solid var(--color-line);
}

.children > .node:last-child::before {
    bottom: auto;
    height: calc(var(--gap) + var(--box) / 2);
}

.children > .node::after {
    content: '';
    position: absolute;
    top: calc(var(--gap) + var(--box) / 2);
    left: 0;
    width: 1.4rem;
    border-top: 1px solid var(--color-line);
}
</style>
