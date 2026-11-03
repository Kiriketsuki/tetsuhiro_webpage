// toKin, held back from the site on 3 November 2026 because the owner has not finished it.
// Nothing imports this file, and it sits outside src, so no build ships it. To bring toKin
// back, copy each part into the file named above it.

// src/data/projects.js, into the `all` list after `statusline`.
export const project = {
    id: 'tokin',
    title: 'toKin',
    stack: 'TypeScript, Bun, Claude Code mods',
    year: '2026',
    role: 'Solo, Tetsuhiro Development',
    group: 'recent',
}

// src/data/project-pages.js, into `pages`.
export const page = {
    tokin: {
        blurb: 'An incremental game about the first AI company. It also runs inside Claude Code.',
        body: [
            'toKin is an incremental game. You start by typing tokens by hand, then train small networks, take gigs and publish papers, until you distil it all into Logits and start again a little stronger.',
            'One engine runs in two places: in the browser, and as a pane inside Claude Code, so it ticks over beside the work. Its sibling mod, clodeKs, connects Claude Code to the Codex CLI.',
        ],
        links: [{ label: 'Play toKin', href: 'https://tokin.tetsuhiro.dev' }],
    },
}

// src/data/wall.js, into the pins (it was in the fun group) and into the strings.
export const pin = {
    id: 'tokin',
    group: 'fun',
    kind: 'card',
    title: 'toKin',
    year: '2026',
    line: 'An incremental game about the first AI company. It also runs inside Claude Code.',
    stack: ['TypeScript', 'Bun', 'Claude Code mods'],
    link: 'https://tokin.tetsuhiro.dev',
    page: 'tokin',
    at: [0.27, 0.26],
    tilt: -2,
}

export const strings = [
    ['kinopy', 'tokin', 'two games on tetsuhiro.dev'],
    ['tokin', 'agenkic-orkistrator', 'AI agents turned into games'],
    ['agenkic-hub', 'tokin', 'both extend Claude Code'],
]
