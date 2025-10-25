<template>
    <div class="flex h-full w-screen items-center justify-center px-5 pb-24 lg:justify-end lg:px-16">
        <div class="glass flex w-full max-w-lg flex-col gap-5 p-6 sm:p-10">
            <p class="label text-teal">Contact</p>
            <h2 class="font-slab text-[clamp(2.25rem,5vw,4rem)] leading-none text-text-strong">
                Say hello
            </h2>
            <p class="font-body text-[clamp(0.95rem,1.1vw,1.05rem)] text-text-body">
                Thanks for looking around. If you want to talk about a role, a project idea, or
                anything on this island, email is the quickest way to reach me. I usually reply
                within a day or two.
            </p>

            <dl class="grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-3 text-sm">
                <template v-for="link in links" :key="link.label">
                    <dt class="label pt-0.5 text-text-faint">{{ link.label }}</dt>
                    <dd class="min-w-0 font-body break-words text-text-body">
                        <a
                            :href="link.href"
                            :target="link.external ? '_blank' : undefined"
                            :rel="link.external ? 'noopener' : undefined"
                            class="contact-link"
                            >{{ link.text }}</a
                        >
                    </dd>
                </template>
            </dl>

            <a href="mailto:limzh.jovian@gmail.com" class="action mt-2">Send an email</a>
        </div>
    </div>
</template>

<script setup>
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

<style scoped>
.contact-link {
    color: var(--color-sand);
    border-bottom: 1px solid transparent;
}

.contact-link:hover,
.contact-link:focus-visible {
    border-bottom-color: var(--color-teal);
    outline: none;
}
</style>
