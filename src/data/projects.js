// The project index. The shell loads this file through the router, so it keeps only what
// the home card, the corkboard and the router need. The words and the big pictures for
// each project live in project-pages.js, which only the project pages load.

// thumb.webp is the small plate in the index. Every screenshot lives in
// src/assets/projects/<id>/.
const thumbs = import.meta.glob('../assets/projects/*/thumb.webp', {
    eager: true,
    query: '?url',
    import: 'default',
})

const withThumb = (project) => ({
    ...project,
    image: thumbs[`../assets/projects/${project.id}/thumb.webp`] ?? null,
    action: project.action ?? { label: 'Read more', to: `/projects/${project.id}` },
})

// The index, in order. group picks the band on /projects: work, then this year, then school.
// Each project has a detail page at /projects/<id>.
export const projects = [
    {
        id: 'autoconnect',
        title: 'Auto-Connect operator interfaces',
        stack: 'Flask, then FastAPI and uv, websockets',
        year: '2025 to 2026',
        role: 'Software Engineer, Aurrigo',
        group: 'work',
    },
    {
        id: 'teaching',
        title: 'Teaching at Ngee Ann Polytechnic',
        stack: 'SQL, PostgreSQL, MongoDB, testing',
        year: '2026',
        role: 'Teaching, School of ICT',
        group: 'work',
    },
    {
        id: 'kinopy',
        title: 'Kinopy',
        stack: 'Svelte, TypeScript, Vite',
        year: '2026',
        role: 'Solo, Tetsuhiro Development',
        group: 'recent',
    },
    {
        id: 'seeki',
        title: 'SeeKi',
        stack: 'Rust, Svelte, PostgreSQL',
        year: '2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'agenkic-orkistrator',
        title: 'agenKic-orKistrator',
        stack: 'Go, gRPC, tmux, Godot 4',
        year: '2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'usaki',
        title: 'usaKi',
        stack: 'Rust, Tauri, TypeScript',
        year: '2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'agenkic-hub',
        title: 'agenKic-hub',
        stack: 'Claude Code, shell, JavaScript',
        year: '2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'chrysaki',
        title: 'Chrysaki and the desktop',
        stack: 'OKLCH tokens, Hyprland, AGS, Go',
        year: '2025 to 2026',
        role: 'Solo, chrysaki, dots, kilour and kiex-status',
        group: 'recent',
    },
    {
        id: 'statusline',
        title: 'The status bar',
        stack: 'Shell, JavaScript',
        year: '2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'tokin',
        title: 'toKin',
        stack: 'TypeScript, Bun, Claude Code mods',
        year: '2026',
        role: 'Solo, Tetsuhiro Development',
        group: 'recent',
    },
    {
        id: 'trkixel',
        title: 'TrKixel',
        stack: 'Vue, Rust, Tauri',
        year: '2025 to 2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'island',
        title: 'This island',
        stack: 'Three.js, GLSL, Blender, Vue',
        year: '2022 to 2026',
        role: 'Solo, open source',
        group: 'recent',
    },
    {
        id: 'aetherial-verdancy',
        title: 'Aetherial Verdancy',
        stack: 'Vue, Three.js, Blender, Firebase',
        year: '2024 to 2025',
        role: 'Developer, with Rykiel Goh',
        group: 'school',
    },
    {
        id: 'resonant-respite',
        title: 'Resonant Respite',
        stack: 'Three.js, Web Audio, Blender',
        year: '2024',
        role: 'Solo, coursework',
        group: 'school',
    },
    {
        id: 'medicasr',
        title: 'MedicASR',
        stack: 'Vue, Electron, Flask, Docker',
        year: '2024',
        role: 'Developer, final year project',
        group: 'school',
    },
    {
        id: 'lyricalysis',
        title: 'Lyricalysis',
        stack: 'Vue, Solr, Python',
        year: '2024',
        role: 'Developer, team project',
        group: 'school',
    },
    {
        id: 'tu-gucci',
        title: 'Tu Gucci?',
        stack: 'Vue, Three.js, Firebase, Chart.js',
        year: '2022',
        role: 'Developer, team project',
        group: 'school',
    },
].map(withThumb)

// Older projects that keep their detail page. The archive on /projects links to them.
const retired = [
    { id: 'cyberquarium', title: 'CyberQuarium', stack: 'SvelteKit, Firebase', year: '2023', role: 'Developer' },
    { id: 'fractals', title: 'Fractals in Java', stack: 'Java, Swing', year: '2021', role: 'Solo' },
    { id: 'rrpss', title: 'Restaurant Reservation and POS', stack: 'Java', year: '2021', role: 'Team, coursework' },
]

// The home card and the workshop corkboard show these, in this order.
const HOME = ['autoconnect', 'kinopy', 'seeki', 'agenkic-orkistrator', 'usaki', 'aetherial-verdancy']
export const homeProjects = HOME.map((id) => projects.find((project) => project.id === id))

export const findProject = (id) => [...projects, ...retired].find((project) => project.id === id)

// Initials for the projects without a screenshot. A one word name in camel
// case, like SeeKi, gives its capitals.
export const monogram = (title) => {
    const words = title.split(' ').filter((word) => /^[A-Z0-9]/.test(word))
    if (words.length === 1) return words[0].replace(/[^A-Z0-9]/g, '').slice(0, 3)
    return words.map((word) => word[0]).join('').slice(0, 3)
}
