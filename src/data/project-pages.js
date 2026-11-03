// The words and the big pictures for each project, keyed by the id in projects.js. Only
// the project routes import this file, so none of it weighs on the shell.

// cover.webp is the big picture, and 01.webp and up are the gallery on the detail page.
const files = import.meta.glob('../assets/projects/*/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
})

const shot = (id, name) => files[`../assets/projects/${id}/${name}.webp`] ?? null

// The bands on /projects, in order. Each project names its band in projects.js.
export const GROUPS = [
    { key: 'work', legend: 'work', heading: 'Work' },
    { key: 'recent', legend: 'this year', heading: 'Projects from this year' },
    { key: 'school', legend: 'school and earlier', heading: 'School and earlier projects' },
]

// links are outside links on the detail page, each one { label, href }.
const pages = {
    autoconnect: {
        blurb: 'The software that runs driverless vehicles at airports. I built it from the first diagram, alone for the first eighteen months, and now with a team.',
        coverAlt: 'Layout sketch of the stand screen since February: a bento grid with a sidebar, the map and a mission panel.',
        gallery: [
            'The stand screen from December to February: the map fills the screen, with floating panels.',
            'The stand screen before December, with docked lists on both sides of the map.',
            'Layout sketch of remote supervision: camera tiles, a minimap, alerts and a stop panel.',
            'Sketch of the interaction patterns: a panel that shrinks to a pill, an expanding row, slide to authorise, press and hold.',
        ],
        note: 'The real screens are not public, so I redrew these from scratch. Layout only, no real data.',
        body: [
            'Auto-Connect is the software Aurrigo uses to run driverless vehicles on the airside of an airport. I set it up from the first architecture diagram in May 2025. I was its sole engineer for the first eighteen months, and it now has a team.',
            'I wrote the first backend in Flask with MySQL, then rebuilt it in FastAPI with uv that September. The four operator screens, for fleet, stand, baggage area and remote supervision, talk to it over websockets.',
            'The tricky part is keeping a busy screen calm, so the thing that needs you right now is the first thing you see.',
            'In December the stand screen went map-first, with its panels floating over the map.',
            'In February it moved to a bento layout, with the sidebar, the map and the missions each in their own compartment.',
        ],
    },
    teaching: {
        blurb: 'I teach databases at the School of ICT, and I write course materials for its software modules.',
        note: 'The course materials belong to the polytechnic, so this page has no screenshots.',
        body: [
            'In January 2026 I taught the database course at Ngee Ann Polytechnic. Over nine sessions it went from the relational model and normalisation to advanced SQL and NoSQL.',
            'Every student built an application with real persistent storage, then demoed it and defended the database design at the end.',
            'Since August 2026 I have been writing the materials for Software Development and Quality Assurance, a twelve session module on how to build software and how to test it.',
        ],
    },
    kinopy: {
        blurb: 'A daily word puzzle that grows a plant. Link the tiles, and each right link locks green.',
        coverAlt: "A daily Kompanion board: the root word on a soil line, with word tiles branching down as roots.",
        gallery: ['The how to play guide, with a drawn example for each rule.', 'The same board on a phone.'],
        body: [
            'Kinopy is a daily link puzzle shaped like a plant. Each day a root word sits on a soil line. The Rootlet grows down from it as roots, and the Sapling grows up from it as a pine.',
            'You swap tiles until every link is right, and each right link locks green. Each of the five modes has its own rule for a link. In Kompanion two tiles make a phrase, as POINT and BLANK. In catKin two fragments make one word.',
            'It is a static Svelte site with no server. The endless puzzles generate in the browser, and a script makes the dailies.',
        ],
        links: [{ label: "Play today's puzzle", href: 'https://kinopy.day' }],
    },
    seeki: {
        blurb: 'A read-only database viewer that looks like a spreadsheet, for people who do not write SQL.',
        coverAlt: 'A users table in the SeeKi grid, with the table list on the left and stat cards on top.',
        gallery: [
            'An orders table, with a filter box under each column header.',
            'The dialog that brings in columns from a linked table.',
        ],
        note: 'The rows in these screenshots are the sample data of the frontend mock mode.',
        body: [
            'Every team has people who need to look at the data but should not need SQL to do it. SeeKi connects to a PostgreSQL database and shows each table as a grid you can search, sort and filter. Nothing in it can write to the database.',
            'It is one Rust binary with the Svelte frontend built in, so there is nothing else to install. The grid scrolls through half a million rows, and a foreign key is a link to the row it points at.',
        ],
        links: [{ label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/seeKi' }],
    },
    'agenkic-orkistrator': {
        blurb: 'Coding agents as pixel-art wizards in a tower. A Go orchestrator runs them, and a Godot client draws them.',
        coverAlt: 'The architecture overview from the write-up of the Go orchestrator core.',
        gallery: [
            'The write-up of the terminal layer, which runs each agent in its own tmux session.',
            'The docs site, with the four epics.',
        ],
        note: 'The Godot client has no public screenshots yet, so these are the build write-ups.',
        body: [
            'OrKi is a desktop app in two processes. You summon a coding agent, such as Claude Code or Codex, from the Godot client. The Go orchestrator starts it in its own tmux session, gives it a task, and watches the pane until the agent settles.',
            'Each agent appears as a pixel character on a floor of the tower, and it animates through its states while it works. Panels show its terminal, its output as a scroll, and a quest board for small task graphs.',
        ],
        links: [{ label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/agenKic-orKistrator' }],
    },
    usaki: {
        blurb: 'A floating rabbit made of hexagons. It shows how much of each AI subscription I have used.',
        coverAlt: 'The usaKi bubble at five sizes, from one account to six, with two usage rings in each cell.',
        body: [
            'I use several AI subscriptions, and each one has a five hour window and a seven day window. usaKi puts them all in one small bubble on the desktop. Each account is a hex cell with two rings, and the cells form a rabbit.',
            'The rings go from emerald to blonde to ruby as an account fills up, and the ears fold as a warning near a limit. It is a Tauri app, and it runs on Hyprland today.',
        ],
        links: [{ label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/usaki' }],
    },
    'agenkic-hub': {
        blurb: 'My Claude Code skills and multi-agent workflows, with an installer that sets them up on your machine.',
        coverAlt: 'The home page of the agenKic-hub docs site.',
        gallery: ['The first slide of the workflow tour deck.'],
        body: [
            'agenKic-hub holds the way I work with coding agents: skills, multi-agent workflow scripts, harness setups and terminal configs. One setup script asks what you want, then links it all into place, so a git pull updates every harness.',
            'The skills come in four groups: a spec-first loop, an adversarial council that debates a change before it merges, a writing style with its own linter, and guard rails for repo work.',
        ],
        links: [
            { label: 'Visit the docs', href: 'https://kiriketsuki.github.io/agenKic-hub/' },
            { label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/agenKic-hub' },
        ],
    },
    chrysaki: {
        blurb: 'A jewel-toned theme for everything I use, and the Arch desktop it grew out of.',
        coverAlt: 'The Chrysaki texture explorer, with a circuit pattern behind a code editor.',
        gallery: [
            'The colour converter and the palette reference, with each token in hex and OKLCH.',
            'The guide for adding a service to the status centre of the desktop.',
        ],
        body: [
            'I cannot leave my desktop alone. It runs Arch with Hyprland, and every config lives in my dots repo. kilour, a small Go tool, pulls a palette out of the wallpaper, and kiex-status is the status bar I wrote.',
            'Chrysaki grew out of that. It is a dark theme with hard corners and three jewel accents: emerald, royal blue and amethyst, tuned in OKLCH so they sit at the same weight.',
            'One token file feeds twenty ports, from tmux and Neovim to VS Code, Firefox and the Claude Code status bar.',
        ],
        links: [
            { label: 'View Chrysaki', href: 'https://github.com/Kiriketsuki/chrysaki' },
            { label: 'View dots', href: 'https://github.com/Kiriketsuki/dots' },
        ],
    },
    statusline: {
        blurb: 'Chrysaki in Claude Code: model, usage, context and git on four lines.',
        body: [
            'I spend most of the day in Claude Code, so the status bar under the prompt is the screen I read most. Mine shows the model, how much of the five hour and seven day usage is left, how full the context is, and the git branch.',
            'It started in March as claude-statusKine, two lines in the Chrysaki colours. It grew to four lines in chrysaki-claude, with a gradient that shifts as usage runs out, and it got a port for the Gemini CLI.',
            'Later the same idea left the terminal and became usaKi, a widget on the desktop.',
        ],
        links: [{ label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/chrysaki-claude' }],
    },
    trkixel: {
        blurb: 'A pixel art editor where every pixel is a triangle.',
        body: [
            'TrKixel draws pixel art on a grid of triangles instead of squares. You can trace over a picture, split a triangle into smaller ones for detail, and export the result.',
            'It runs in the browser with Vue, and Tauri wraps it as a desktop app.',
        ],
        links: [
            { label: 'Open TrKixel', href: 'https://kiriketsuki.github.io/TrKixel/' },
            { label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/TrKixel' },
        ],
    },
    aerie: {
        blurb: 'This site: a night aerie built in Blender and drawn in Three.js.',
        coverAlt: 'The aerie at night: a tall house with a steel frame, red autumn trees and lit windows.',
        body: [
            'You are standing in it. The aerie is modelled in Blender and drawn in Three.js, with toon shading, a soft ink outline and a split tone, after the cozy look of Leaf it Alone.',
            'The first version of this site went up in 2022. I rebuilt it in 2025, and again in 2026 around this aerie: a workshop with this corkboard, a telescope that opens onto the skills, and a city of lights below.',
            'Every frame has a budget. The scene code stays under 200 kB, the extra views load only when you need them, and the aerie renders only when something moves.',
        ],
        links: [{ label: 'View on GitHub', href: 'https://github.com/Kiriketsuki/tetsuhiro_webpage' }],
    },
    'resonant-respite': {
        blurb: 'A floating world that moves with the music. The first of its kind here.',
        body: [
            'An audio-visual piece from 2024. A song plays, and the scene answers it: the water moves with the bass, the land and the stars with the chords, and the sun with the drums.',
            'Each part of the music runs its analysis in its own Web Worker, so the scene keeps its frame rate. It was the first floating world I built in Three.js, and this aerie grew out of it.',
        ],
    },
    'aetherial-verdancy': {
        blurb: 'Plants for space, raised on music. Each song grows a different plant.',
        coverAlt: 'The installation: the title projected on a wall, with two screens of plants in front.',
        gallery: [
            'Four plants grown from four songs, side by side.',
            'A visitor holds up a screen in front of the projected garden.',
            'The home page of the live site.',
        ],
        body: [
            'The question behind it: if we ever grow food in space, could music help the plants along? We ran with that. A song goes in, and its sound decides how a plant grows, from its shape to its leaves and flowers.',
            'Rykiel Goh and I built it together, as an installation and as a website you can still visit. It runs on Vue and Three.js, the plants come out of Blender, and Spotify brings the music.',
        ],
        links: [{ label: 'Visit the site', href: 'https://aetherialverdancy.tetsuhiro.dev' }],
    },
    medicasr: {
        blurb: 'Fill in medical forms by talking. My final year project at NTU.',
        coverAlt: 'A medical form filled in by speech, with a microphone button on each field.',
        gallery: [
            'The transcript list, with one transcript open.',
            'The hotwords page, which maps misheard words to drug names.',
            'The MedicASR title card.',
        ],
        note: 'Every patient and note in these screenshots is made up.',
        body: [
            'MedicASR is a desktop app for doctors and nurses. You talk, and the form fills itself in. It is an Electron and Vue app, with the speech engine running in Docker next to a small Flask server.',
            'Speech engines are bad at drug names. Metformin comes out as met form in. So I added hotwords: a list that maps what the engine heard to the word you actually said.',
        ],
    },
    lyricalysis: {
        blurb: 'Search songs by what the lyrics say and how they feel.',
        coverAlt: 'The Lyricalysis search page with filters for artist, genre and emotion.',
        gallery: ['The results list, with the emotion of each song.', 'The search screen while it loads.'],
        body: [
            'Lyricalysis crawls song lyrics, tags each song with an emotion, and puts it all in Solr. Then you can ask for something like hopeful indie songs, and turn the hope up or down.',
            'It was a team project for CZ4034, the information retrieval module at NTU.',
        ],
    },
    'tu-gucci': {
        blurb: 'A journal you write by a campfire, with daily goals and a mood chart.',
        coverAlt: 'A low-poly campfire in a snowy forest at night, with a journal by the fire.',
        gallery: [
            'The daily goals board.',
            'The journal, with a list of entries.',
            'The mood chart, with a sentiment score for each entry.',
        ],
        body: [
            'Tu Gucci? asks how you are doing, and means it. You sit by a 3D campfire in a snowy forest, write a journal entry, and tick off a few small goals for the day.',
            'Each entry gets a sentiment score, so a chart can show how your week actually went. We built it as a team.',
        ],
    },
    cyberquarium: {
        coverAlt: 'The CyberQuarium market, with eggs and sea creatures for sale.',
        gallery: ['The page for one sea otter.', 'An inventory of creatures, ready to breed.'],
        body: [
            'CyberQuarium is a small web game. You buy eggs, hatch them, and breed two creatures in the hope of a rarer one. Every creature earns coins by the hour, so you can buy more eggs.',
            'It never got past a prototype. It is built with SvelteKit and Firebase.',
        ],
    },
    fractals: {
        coverAlt: 'A deep zoom into the Mandelbrot set in blue and red.',
        gallery: ['A zoom into a spiral of the Mandelbrot set.', 'A Julia set with a smooth colour scheme.'],
        body: [
            'After my first Java module I wanted to make something pretty, and YouTube had just shown me the Mandelbrot set. So I wrote a Swing app that draws it and lets you zoom and pan, and then the Julia set too.',
            'The first version was slow and stripy. Most of my time went into fixing both: a faster escape time loop, then histogram colouring, then smooth colouring until the bands were gone.',
        ],
    },
    rrpss: {
        coverAlt: 'The UML class diagram of the restaurant system.',
        gallery: ['The main menu in the terminal.'],
        body: [
            'A console app for restaurant staff, built as a team for CZ2002, the object oriented design module at NTU.',
            'It covers the menu, set packages, tables, reservations, orders, invoices and a sales report. The cover is our class diagram, which got a little out of hand.',
        ],
    },
}

// Joins an index entry from projects.js with its words and pictures.
export function withPage(project) {
    const { gallery = [], links = [], ...page } = pages[project.id] ?? {}
    return {
        ...project,
        ...page,
        links,
        cover: shot(project.id, 'cover'),
        gallery: gallery.map((alt, i) => ({ src: shot(project.id, String(i + 1).padStart(2, '0')), alt })),
    }
}

// Older and smaller things, newest first. No pictures, one line each. to is a route and
// href is an outside link.
export const archive = [
    { title: 'CyberQuarium', year: '2023', note: 'Hatch, breed and trade sea creatures. A prototype web game.', to: '/projects/cyberquarium' },
    { title: 'Wyn Monde', year: '2022', note: 'Under NDA, so this line is all I can say.' },
    { title: 'Dancing Tables', year: '2022', note: 'My first freelance job. A 3D banquet hall for a table lifting robot.', to: '/projects/dancing_tables' },
    { title: 'Fractals in Java', year: '2021', note: 'The Mandelbrot and Julia sets in Swing, with zoom and smooth colour.', to: '/projects/fractals' },
    { title: 'Restaurant Reservation and POS', year: '2021', note: 'Reservations, orders and invoices for a restaurant, in Java. NTU CZ2002.', to: '/projects/rrpss' },
    { title: 'Find My HDB', year: '2021', note: 'Find a resale flat that fits, using public HDB data.', to: '/projects/placeholders' },
]

// Work that is not a user interface.
export const otherWork = [
    {
        title: 'SwimStrokes',
        year: '2022',
        note: 'Pose estimation with MediaPipe. It tracks joint angles and counts reps from a video.',
    },
    {
        title: 'T3104_ML',
        year: '2023',
        note: 'A neural network written by hand, with no framework, to see how one really works.',
    },
    {
        title: 'Auto-Connect tooling',
        year: '2025',
        note: 'Internal tools at Aurrigo: reports into Slack, a route viewer, and event detection in video.',
    },
]
