<template>
    <div class="stop" :data-side="sideOf('contact')">
        <article class="frame flex w-full max-w-[25rem] flex-col gap-5 p-6 pt-8 sm:p-8 sm:pt-9">
            <span class="frame-legend">05 / contact</span>
            <h2 class="font-slab text-[clamp(2.25rem,4vw,3.25rem)] leading-none text-text-strong">
                Say hello
            </h2>
            <p class="font-body text-sm text-text-body sm:text-[0.95rem]">
                Thanks for looking around. If you want to talk about a role, a project idea, or
                anything on this island, email is the quickest way to reach me.
            </p>

            <dl class="rows text-sm">
                <template v-for="link in links" :key="link.label">
                    <dt>{{ link.label }}</dt>
                    <dd>
                        <a
                            :href="link.href"
                            :target="link.external ? '_blank' : undefined"
                            :rel="link.external ? 'noopener' : undefined"
                            class="text-link"
                            >{{ link.text }}</a
                        >
                    </dd>
                </template>
            </dl>

            <a href="mailto:limzh.jovian@gmail.com" class="action">Send an email</a>
        </article>
    </div>
</template>

<script setup>
import { sideOf } from '../composables/useWaypoints.js'

// As of October 2025. No Discord any more.
const links = [
    { label: 'Email', text: 'limzh.jovian@gmail.com', href: 'mailto:limzh.jovian@gmail.com' },
    { label: 'GitHub', text: 'Kiriketsuki', href: 'https://github.com/Kiriketsuki', external: true },
    {
        label: 'LinkedIn',
        text: 'jovian-lim-tetsuhiro',
        href: 'https://www.linkedin.com/in/jovian-lim-tetsuhiro',
        external: true,
    },
]
</script>
