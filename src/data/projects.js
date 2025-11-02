// Every screenshot lives in src/assets/projects/<id>/. cover.webp is the big
// one, thumb.webp is the small plate in the index, and 01.webp and up are the
// gallery on the detail page.
const files = import.meta.glob('../assets/projects/*/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
})

const shot = (id, name) => files[`../assets/projects/${id}/${name}.webp`] ?? null

// Fills in the picture fields from the folder, so each entry only lists its captions.
function withShots(project) {
    const { id, gallery = [] } = project
    return {
        ...project,
        image: shot(id, 'thumb'),
        cover: shot(id, 'cover'),
        gallery: gallery.map((alt, i) => ({ src: shot(id, String(i + 1).padStart(2, '0')), alt })),
        action: project.action ?? { label: 'Read more', to: `/projects/${id}` },
    }
}

// The featured projects, in order. Each one has a detail page at /projects/<id>.
// action is either { label, to } for a route or { label, href } for an outside link.
const featured = [
    {
        id: 'autoconnect',
        title: 'Auto-Connect operator interfaces',
        blurb: 'Interfaces that operators use to watch and command autonomous airside vehicles.',
        stack: 'Web front end',
        year: '2025',
        role: 'Software Engineer, Aurrigo',
        coverAlt: 'Layout sketch of the stand screen: a vehicle list, the map, a side list and a mission panel across the bottom.',
        gallery: [
            'Layout sketch of remote supervision: camera tiles, a minimap, alerts and a stop panel.',
            'Sketch of the interaction patterns: a panel that shrinks to a pill, an expanding row, slide to authorise, press and hold.',
        ],
        note: 'The real screens are not public. These wireframes are redrawn from scratch and show layout only.',
        body: [
            'Auto-Connect is the software Aurrigo uses to run autonomous vehicles on the airside of an airport. I work on the screens the operators use: where the vehicles are, what jobs they have, and what needs a person to step in.',
            'The work is mostly Vue and a map. Most of the effort goes into making a busy screen calm, so the one thing that needs attention stands out.',
        ],
        links: [],
    },
    {
        id: 'aetherial-verdancy',
        title: 'Aetherial Verdancy',
        blurb: 'Plants for space, grown on music. Each song shapes how its plant grows.',
        stack: 'Vue, Three.js, Blender, Firebase',
        year: '2024 to 2025',
        role: 'Developer, with Rykiel Goh',
        coverAlt: 'The installation: the title projected on a wall, with two screens of plants in front.',
        gallery: [
            'Four plants grown from four songs, side by side.',
            'A visitor holds up a screen in front of the projected garden.',
            'The home page of the live site.',
        ],
        body: [
            'Aetherial Verdancy imagines plants grown in space and raised on music. A song goes in, and its sound decides how the plant grows: its shape, its leaves and its flowers.',
            'Rykiel Goh and I built it as an installation and a website. It uses Vue and Three.js in the browser, models from Blender, and Spotify for the music.',
        ],
        links: [{ label: 'Visit the site', href: 'https://aetherialverdancy.tetsuhiro.dev' }],
    },
    {
        id: 'medicasr',
        title: 'MedicASR',
        blurb: 'Fill in medical forms by voice. My final year project.',
        stack: 'Vue, Electron, Flask, Docker',
        year: '2024',
        role: 'Developer, final year project',
        coverAlt: 'A medical form filled in by speech, with a microphone button on each field.',
        gallery: [
            'The transcript list, with one transcript open.',
            'The hotwords page, which maps misheard words to drug names.',
            'The MedicASR title card.',
        ],
        note: 'The patients and notes in these screenshots are made up.',
        body: [
            'MedicASR is a desktop app for doctors and nurses. You talk, and the form fills itself. The speech recognition engine runs in Docker next to a small Flask server.',
            'Medical words trip up speech recognition, so the app has hotwords: a list that maps what the engine hears to the drug name you meant.',
        ],
        links: [],
    },
    {
        id: 'tu-gucci',
        title: 'Tu Gucci?',
        blurb: 'A cosy journal by a campfire, with a daily goal list and a mood chart.',
        stack: 'Vue, Three.js, Firebase, Chart.js',
        year: '2022',
        role: 'Developer, team project',
        coverAlt: 'A low-poly campfire in a snowy forest at night, with a journal by the fire.',
        gallery: [
            'The daily goals board.',
            'The journal, with a list of entries.',
            'The mood chart, with a sentiment score for each entry.',
        ],
        body: [
            'Tu Gucci? is a small check-in app. You sit by a 3D campfire, write a journal entry, and tick off a few daily goals.',
            'Each entry gets a sentiment score, and a chart shows how the week went.',
        ],
        links: [],
    },
    {
        id: 'lyricalysis',
        title: 'Lyricalysis',
        blurb: 'Search song lyrics by what they say and how they feel.',
        stack: 'Vue, Solr, Python',
        year: '2024',
        role: 'Developer, team project',
        coverAlt: 'The Lyricalysis search page with filters for artist, genre and emotion.',
        gallery: ['The results list, with the emotion of each song.', 'The search screen while it loads.'],
        body: [
            'Lyricalysis crawls lyrics, tags each song with an emotion, and puts it all in Solr. You can then search by artist, genre, emotion and how strong that emotion is.',
            'It was a team project for CZ4034, the information retrieval module at NTU.',
        ],
        links: [],
    },
    {
        id: 'cyberquarium',
        title: 'CyberQuarium',
        blurb: 'Hatch, breed and trade sea creatures that earn coins while you are away.',
        stack: 'SvelteKit, Firebase',
        year: '2023',
        role: 'Developer',
        coverAlt: 'The CyberQuarium market, with eggs and sea creatures for sale.',
        gallery: ['The page for one sea otter.', 'An inventory of creatures, ready to breed.'],
        body: [
            'CyberQuarium is a web game. You buy eggs, hatch them, and breed two creatures to get a rarer one. Each creature earns coins by the hour.',
            'It is a prototype, built with SvelteKit and Firebase.',
        ],
        links: [],
    },
    {
        id: 'fractals',
        title: 'Fractals in Java',
        blurb: 'Draws the Mandelbrot and Julia sets with a few escape time algorithms and colour schemes.',
        stack: 'Java, Swing',
        year: '2021',
        role: 'Solo',
        coverAlt: 'A deep zoom into the Mandelbrot set in blue and red.',
        gallery: ['A zoom into a spiral of the Mandelbrot set.', 'A Julia set with a smooth colour scheme.'],
        body: [
            'A Swing app that draws the Mandelbrot set and lets you zoom and pan. It does the Julia set too.',
            'Most of the time went into speed and colour: an optimised escape time loop, then histogram and smooth colouring to get rid of the bands.',
        ],
        links: [],
    },
    {
        id: 'rrpss',
        title: 'Restaurant Reservation and POS',
        blurb: 'A restaurant system in Java: reservations, orders and invoices. NTU CZ2002.',
        stack: 'Java',
        year: '2021',
        role: 'Team, coursework',
        coverAlt: 'The UML class diagram of the restaurant system.',
        gallery: ['The main menu in the terminal.'],
        body: [
            'A console app for restaurant staff, built as a team for CZ2002, the object oriented design module at NTU.',
            'It handles the menu, set packages, tables, reservations, orders, invoices and a sales report.',
        ],
        links: [],
    },
].map(withShots)

export const projects = [...featured]

// Older and smaller things. No pictures, one line each.
export const archive = [
    { title: 'Find My HDB', year: '2021', note: 'Matches buyers to resale flats with public data.', to: '/projects/placeholders' },
    { title: 'Dancing Tables', year: '2022', note: 'A promo site with a 3D banquet hall.', to: '/projects/dancing_tables' },
    { title: 'Wyn Monde', year: '2022', note: 'Under NDA.' },
]

// Work that is not a user interface.
export const otherWork = [
    {
        title: 'SwimStrokes',
        year: '2022',
        note: 'Pose estimation with MediaPipe. It measures joint angles and counts reps.',
    },
    {
        title: 'T3104_ML',
        year: '2023',
        note: 'A neural network written by hand, no framework.',
    },
    {
        title: 'Auto-Connect tooling',
        year: '2025',
        note: 'Internal tools: Slack reports, a route viewer, and event detection in video.',
    },
]

export const findProject = (id) => projects.find((project) => project.id === id && project.body)

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
