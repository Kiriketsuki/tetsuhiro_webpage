import fractals from '../assets/project_gallery/fractals.jpg'
import dancingTables from '../assets/project_gallery/dancing_table.jpg'
import rrpss from '../assets/project_gallery/sixma.jpg'
import placeholders from '../assets/project_gallery/placeholders.jpg'

// action is either { label, to } for a route or { label, href } for an outside link
export const projects = [
    {
        id: 'autoconnect',
        title: 'AutoConnect operator UIs',
        blurb: 'Interfaces that operators use to watch and command autonomous airside vehicles.',
        image: null,
        stack: 'Web front end',
        year: '2025',
        role: 'Software Engineer, Aurrigo',
        action: null,
    },
    {
        id: 'aetherial-verdancy',
        title: 'Aetherial Verdancy',
        blurb: 'plants_in_space. A shared 3D garden in the browser, built with Rykiel Goh.',
        image: null,
        stack: 'Vue, Three.js, Blender, socket.io',
        year: '2024-25',
        role: 'Developer, with Rykiel Goh',
        action: { label: 'Visit site', href: 'https://aetherialverdancy.tetsuhiro.dev' },
    },
    {
        id: 'resonant-respite',
        title: 'Resonant Respite',
        blurb: 'Low-poly islands that move to the music. Made for DM3009.',
        image: null,
        stack: 'Three.js, p5.sound',
        year: '2024',
        role: 'Solo, coursework',
        action: null,
    },
    {
        id: 'medicasr',
        title: 'MedicASR',
        blurb: 'Speech recognition for medical conversations. My final year project.',
        image: null,
        stack: 'Vue, Electron',
        year: '2024',
        role: 'Developer, FYP',
        action: null,
    },
    {
        id: 'lyricalysis',
        title: 'Lyricalysis',
        blurb: 'Search song lyrics by what they say.',
        image: null,
        stack: 'Vue, Solr',
        year: '2024',
        role: 'Developer',
        action: null,
    },
    {
        id: 'cyberquarium',
        title: 'CyberQuarium',
        blurb: 'A web app built with SvelteKit and Firebase.',
        image: null,
        stack: 'SvelteKit, Firebase',
        year: '2023',
        role: 'Developer',
        action: null,
    },
    {
        id: 'fractals',
        title: 'Fractals in Java',
        blurb: 'Draws the Mandelbrot set with a few escape time algorithms and colour schemes.',
        image: fractals,
        stack: 'Java',
        year: 'Earlier',
        role: 'Solo',
        action: { label: 'Read more', to: '/projects/fractals' },
    },
    {
        id: 'dancing-tables',
        title: 'Dancing Tables',
        blurb: 'A promo site with a 3D banquet hall for a table lifting robot.',
        image: dancingTables,
        stack: 'Three.js',
        year: '2022',
        role: 'Freelance web developer',
        action: { label: 'Read more', to: '/projects/dancing_tables' },
    },
    {
        id: 'rrpss',
        title: 'Restaurant Reservation and POS',
        blurb: 'A school assignment. A restaurant system in Java, built as a team.',
        image: rrpss,
        stack: 'Java',
        year: 'Earlier',
        role: 'Team, coursework',
        action: { label: 'Read more', to: '/projects/rrpss' },
    },
    {
        id: 'placeholders',
        title: 'Find My HDB',
        blurb: 'A school assignment. Matches buyers to resale flats using public data.',
        image: placeholders,
        stack: 'Web app',
        year: 'Earlier',
        role: 'Team, coursework',
        action: { label: 'Read more', to: '/projects/placeholders' },
    },
]

// The home index shows the first few. /projects shows all of them.
export const FEATURED = 6

// Initials for the projects without a screenshot.
export const monogram = (title) =>
    title
        .split(' ')
        .filter((word) => /^[A-Z0-9]/.test(word))
        .map((word) => word[0])
        .join('')
        .slice(0, 3)
