<template>
    <main class="flex min-h-screen w-screen flex-col items-center gap-10 px-5 pt-16 pb-32">
        <header class="flex max-w-2xl flex-col items-center gap-4 text-center">
            <p class="label text-teal">Skills</p>
            <h1 class="font-slab text-[clamp(2.75rem,8vw,6rem)] leading-none text-text-strong">
                Skill tree
            </h1>
            <p class="font-body text-[clamp(0.95rem,1.2vw,1.1rem)] text-text-body">
                The same {{ skills.length }} skills that hang on the tree on the island. Each line
                shows what a skill grew out of, so Tailwind sits under Vue and Vue sits under
                JavaScript.
            </p>
        </header>

        <ul class="legend" aria-label="Branches">
            <li v-for="branch in branches" :key="branch.id" :style="{ '--node': colorOf(branch) }">
                <span class="hex" aria-hidden="true"></span>
                {{ branch.label }}
            </li>
        </ul>

        <div class="grid w-full max-w-5xl items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <section v-for="root in trees" :key="root.skill.id" class="frame frame-line p-5 sm:p-6">
                <h2 class="sr-only">{{ root.skill.name }} and what grew from it</h2>
                <ul class="tree">
                    <li
                        v-for="row in root.rows"
                        :key="row.skill.id"
                        class="node"
                        :class="{ child: row.depth > 0, last: row.last }"
                        :style="{ '--depth': row.depth, '--node': colorOf(branchOf(row.skill)) }"
                    >
                        <span class="hex" aria-hidden="true"></span>
                        <span class="name">{{ row.skill.name }}</span>
                        <span class="branch">{{ branchOf(row.skill)?.label }}</span>
                    </li>
                </ul>
            </section>
        </div>

        <router-link to="/" class="action self-center">Back to the island</router-link>
    </main>
</template>

<script setup>
import { branches, branchOf, skills } from '../data/skills.js'

const colorOf = (branch) => `var(--color-${branch?.color ?? 'teal'})`

// Walks down from one root and flattens the tree into rows with a depth, so the
// template stays a flat list and CSS draws the lines.
const rowsFrom = (skill, depth = 0, last = true) => {
    const children = skills.filter((child) => child.parent === skill.id)
    return [
        { skill, depth, last },
        ...children.flatMap((child, i) => rowsFrom(child, depth + 1, i === children.length - 1)),
    ]
}

// Bigger trees first, so the grid reads from the trunk out.
const trees = skills
    .filter((skill) => !skill.parent)
    .map((skill) => ({ skill, rows: rowsFrom(skill) }))
    .sort((a, b) => b.rows.length - a.rows.length)
</script>

<style scoped>
.legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem 1.25rem;
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
}

.legend li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.tree {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.node {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding-left: calc(var(--depth) * 1.75rem);
}

/* The elbow from the parent above down into this node. */
.node.child::before {
    content: '';
    position: absolute;
    left: calc(var(--depth) * 1.75rem - 1.1rem);
    top: -0.85rem;
    width: 0.9rem;
    height: calc(50% + 0.85rem);
    border-left: 1px solid var(--color-line);
    border-bottom: 1px solid var(--color-line);
    border-bottom-left-radius: 6px;
}

.hex {
    display: inline-block;
    width: 1.1rem;
    height: 1.25rem;
    background: var(--node);
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    box-shadow: 0 0 12px var(--node);
}

.name {
    font-family: var(--font-label);
    font-size: clamp(0.85rem, 1vw, 0.95rem);
    color: var(--color-text-strong);
}

.branch {
    font-family: var(--font-label);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-faint);
}
</style>
