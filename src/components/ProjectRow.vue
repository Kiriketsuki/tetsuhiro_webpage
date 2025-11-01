<script setup>
import { computed } from 'vue'

// One numbered line of the project index. It is a link when the project has
// somewhere to go, and plain text when it is not public.
const props = defineProps({
    project: { type: Object, required: true },
    number: { type: Number, required: true },
    // /projects shows the blurb and role under the title. Home keeps one line.
    detail: { type: Boolean, default: false },
})

const emit = defineEmits(['peek'])

const tag = computed(() => {
    if (props.project.action?.to) return 'router-link'
    if (props.project.action?.href) return 'a'
    return 'div'
})

const attrs = computed(() => {
    const action = props.project.action
    if (action?.to) return { to: action.to }
    if (action?.href) return { href: action.href, target: '_blank', rel: 'noopener' }
    return {}
})

const label = computed(() => String(props.number).padStart(2, '0'))
</script>

<template>
    <li>
        <component
            :is="tag"
            v-bind="attrs"
            class="index-row"
            :class="{ linked: tag !== 'div' }"
            @mouseenter="emit('peek')"
            @focus="emit('peek')"
        >
            <span class="index-number">{{ label }}</span>
            <span class="index-title">{{ project.title }}</span>
            <span class="index-stack">{{ project.stack }}</span>
            <span class="index-year">{{ project.year }}</span>
            <span class="index-mark" aria-hidden="true">{{ tag === 'div' ? '' : tag === 'a' ? '↗' : '→' }}</span>
            <span v-if="detail" class="index-blurb">
                {{ project.blurb }}
                <span class="index-role">{{ project.role }}<template v-if="tag === 'div'">, not public</template></span>
            </span>
        </component>
    </li>
</template>

<style scoped>
.index-row {
    display: grid;
    grid-template-columns: 1.75rem 1fr auto 1rem;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.6rem 0.25rem;
    border-bottom: 1px solid var(--color-line);
    color: var(--color-text-body);
    transition: background-color 0.2s, color 0.2s;
}

.index-number,
.index-stack,
.index-year,
.index-mark {
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
}

.index-number {
    color: var(--color-text-faint);
}

.index-title {
    min-width: 0;
    color: var(--color-text-strong);
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 1.7vw, 1.45rem);
    line-height: 1.1;
}

.index-stack {
    display: none;
    color: var(--color-text-faint);
    text-transform: uppercase;
}

.index-year {
    color: var(--color-text-muted);
    white-space: nowrap;
}

.index-mark {
    color: var(--color-sand);
}

@media (min-width: 640px) {
    .index-row {
        grid-template-columns: 1.75rem 1fr auto auto 1rem;
    }

    .index-stack {
        display: block;
        max-width: 12rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.index-blurb {
    grid-column: 2 / -1;
    margin-top: -0.2rem;
    color: var(--color-text-body);
    font-family: var(--font-body);
    font-size: 0.85rem;
}

.index-role {
    display: block;
    margin-top: 0.25rem;
    color: var(--color-text-faint);
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.index-row:hover,
.index-row:focus-visible {
    background: var(--color-bg-overlay);
}

.index-row.linked:hover .index-title {
    color: var(--color-sand);
}

.index-row:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: -2px;
}
</style>
