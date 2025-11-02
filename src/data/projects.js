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
        blurb: 'The software that runs driverless vehicles at airports. I built it from the first diagram, as its only engineer.',
        stack: 'Flask, then FastAPI and uv, websockets',
        year: '2025',
        role: 'Software Engineer, Aurrigo',
        coverAlt: 'Layout sketch of the stand screen: a vehicle list, the map, a side list and a mission panel across the bottom.',
        gallery: [
            'Layout sketch of remote supervision: camera tiles, a minimap, alerts and a stop panel.',
            'Sketch of the interaction patterns: a panel that shrinks to a pill, an expanding row, slide to authorise, press and hold.',
        ],
        note: 'The real screens are not public, so I redrew these from scratch. Layout only, no real data.',
        body: [
            'Auto-Connect is the software Aurrigo uses to run driverless vehicles on the airside of an airport. I set it up from the first architecture diagram in May 2025, and I was its only engineer.',
            'I wrote the first backend in Flask with MySQL, then rebuilt it in FastAPI with uv that September. The four operator screens, for fleet, stand, baggage area and remote supervision, talk to it over websockets.',
            'The tricky part is keeping a busy screen calm, so the thing that needs you right now is the first thing you see.',
        ],
        links: [],
    },
    {
        id: 'aetherial-verdancy',
        title: 'Aetherial Verdancy',
        blurb: 'Plants for space, raised on music. Each song grows a different plant.',
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
            'The question behind it: if we ever grow food in space, could music help the plants along? We ran with that. A song goes in, and its sound decides how a plant grows, from its shape to its leaves and flowers.',
            'Rykiel Goh and I built it together, as an installation and as a website you can still visit. It runs on Vue and Three.js, the plants come out of Blender, and Spotify brings the music.',
        ],
        links: [{ label: 'Visit the site', href: 'https://aetherialverdancy.tetsuhiro.dev' }],
    },
    {
        id: 'medicasr',
        title: 'MedicASR',
        blurb: 'Fill in medical forms by talking. My final year project at NTU.',
        stack: 'Vue, Electron, Flask, Docker',
        year: '2024',
        role: 'Developer, final year project',
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
        links: [],
    },
    {
        id: 'tu-gucci',
        title: 'Tu Gucci?',
        blurb: 'A journal you write by a campfire, with daily goals and a mood chart.',
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
            'Tu Gucci? asks how you are doing, and means it. You sit by a 3D campfire in a snowy forest, write a journal entry, and tick off a few small goals for the day.',
            'Each entry gets a sentiment score, so a chart can show how your week actually went. We built it as a team.',
        ],
        links: [],
    },
    {
        id: 'lyricalysis',
        title: 'Lyricalysis',
        blurb: 'Search songs by what the lyrics say and how they feel.',
        stack: 'Vue, Solr, Python',
        year: '2024',
        role: 'Developer, team project',
        coverAlt: 'The Lyricalysis search page with filters for artist, genre and emotion.',
        gallery: ['The results list, with the emotion of each song.', 'The search screen while it loads.'],
        body: [
            'Lyricalysis crawls song lyrics, tags each song with an emotion, and puts it all in Solr. Then you can ask for something like hopeful indie songs, and turn the hope up or down.',
            'It was a team project for CZ4034, the information retrieval module at NTU.',
        ],
        links: [],
    },
    {
        id: 'cyberquarium',
        title: 'CyberQuarium',
        blurb: 'Hatch, breed and trade sea creatures that earn you coins while you are away.',
        stack: 'SvelteKit, Firebase',
        year: '2023',
        role: 'Developer',
        coverAlt: 'The CyberQuarium market, with eggs and sea creatures for sale.',
        gallery: ['The page for one sea otter.', 'An inventory of creatures, ready to breed.'],
        body: [
            'CyberQuarium is a small web game. You buy eggs, hatch them, and breed two creatures in the hope of a rarer one. Every creature earns coins by the hour, so you can buy more eggs.',
            'It never got past a prototype. It is built with SvelteKit and Firebase.',
        ],
        links: [],
    },
    {
        id: 'fractals',
        title: 'Fractals in Java',
        blurb: 'The Mandelbrot and Julia sets in Java, with zoom and a lot of colour schemes.',
        stack: 'Java, Swing',
        year: '2021',
        role: 'Solo',
        coverAlt: 'A deep zoom into the Mandelbrot set in blue and red.',
        gallery: ['A zoom into a spiral of the Mandelbrot set.', 'A Julia set with a smooth colour scheme.'],
        body: [
            'After my first Java module I wanted to make something pretty, and YouTube had just shown me the Mandelbrot set. So I wrote a Swing app that draws it and lets you zoom and pan, and then the Julia set too.',
            'The first version was slow and stripy. Most of my time went into fixing both: a faster escape time loop, then histogram colouring, then smooth colouring until the bands were gone.',
        ],
        links: [],
    },
    {
        id: 'rrpss',
        title: 'Restaurant Reservation and POS',
        blurb: 'Reservations, orders and invoices for a restaurant, in Java. NTU CZ2002.',
        stack: 'Java',
        year: '2021',
        role: 'Team, coursework',
        coverAlt: 'The UML class diagram of the restaurant system.',
        gallery: ['The main menu in the terminal.'],
        body: [
            'A console app for restaurant staff, built as a team for CZ2002, the object oriented design module at NTU.',
            'It covers the menu, set packages, tables, reservations, orders, invoices and a sales report. The cover is our class diagram, which got a little out of hand.',
        ],
        links: [],
    },
].map(withShots)

export const projects = [...featured]

// Older and smaller things. No pictures, one line each.
export const archive = [
    { title: 'Find My HDB', year: '2021', note: 'Find a resale flat that fits, using public HDB data.', to: '/projects/placeholders' },
    { title: 'Dancing Tables', year: '2022', note: 'My first freelance job. A 3D banquet hall for a table lifting robot.', to: '/projects/dancing_tables' },
    { title: 'Wyn Monde', year: '2022', note: 'Under NDA, so this line is all I can say.' },
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
