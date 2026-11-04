// The bedroom on the top floor, the About view (/about). The camera comes in through the glass
// balcony door and walks the visitor round the room, one thing and one note at a time, and
// ends on a call to action. The owner approved every line here on 4 November 2026.
//
// Each stop: `thing` names what the camera frames, `label` sits over the title, `next` names the
// next stop on its button, and `camera` is the shot. Camera points are metres in the GLB frame
// (Y up): `from` is the lens, `at` is the point it looks at and the lens keeps sharp, and `fov`
// is the vertical field of view in degrees. The room is the bedroom kit
// (scenes/urban-aerie-studies/aerie_bedroom_kit.py): x -6.93 to -3.5, z -5.23 (back, over the
// city) to -1.62 (front, the balcony door), floor y 7.41. Every lens stands in the aisle, never
// over the bed. The door is in route.js (bedroomDoor), because the scene chunk reads it.
export const stops = [
    {
        id: 'window',
        thing: 'The window over the city',
        label: 'Hello',
        title: 'Jovian Lim',
        body: [
            'Hello! I am a Software Engineer in Singapore.',
            'This is my corner of the aerie: a small room up high, with the whole city lit up outside the window. I like a quiet spot where I can see everything.',
            'Come in and have a look around. I will walk you through the things I care about.',
        ],
        next: 'the desk',
        camera: { from: [-4.33, 9.0, -2.45], at: [-5.43, 8.95, -5.2], fov: 60 },
    },
    {
        id: 'desk',
        thing: 'The desk',
        label: 'Now',
        title: 'Software Engineer, Aurrigo',
        body: [
            'I joined Aurrigo in February 2025. There I build the screens people use to run driverless vehicles at airports.',
            'I lean toward the frontend. I care most about screens that stay clear when someone relies on them.',
        ],
        next: 'the notebook',
        camera: { from: [-4.78, 8.95, -3.05], at: [-3.75, 8.38, -3.6], fov: 50 },
    },
    {
        id: 'notebook',
        thing: 'The notebook',
        label: 'Teaching',
        title: 'Database Systems, Ngee Ann Poly',
        body: [
            'Since January 2026 I also teach Database Systems to adult learners at Ngee Ann Polytechnic. I enjoy it a lot.',
            'My rule in class is directness over fluff: explain the why, then take it step by step. My students give up their evenings to learn, so I try to make every hour count.',
        ],
        next: 'the computer',
        camera: { from: [-4.45, 8.72, -2.72], at: [-3.96, 8.17, -3.0], fov: 42 },
    },
    {
        id: 'computer',
        thing: 'The computer',
        label: 'Also',
        title: 'Things I build',
        body: [
            'Outside work I build full-stack side projects. Some are tools I use every day, like my agentic workflows. Others are just for fun, like Kinopy, a daily word puzzle.',
            'I built this PC too. It is Kiraext, an all-white build from 2023, and my second named build after Kireizen in 2019. For that one I waited a whole month for Zen 2 to launch.',
            'Right now I am learning Godot. One day I want to make a factory game where the machines are AI agents.',
        ],
        links: 'projects',
        next: 'the gym corner',
        camera: { from: [-4.62, 8.85, -3.25], at: [-3.76, 8.42, -4.2], fov: 50 },
    },
    {
        id: 'gym',
        thing: 'The gym corner',
        label: 'For fun',
        title: 'The gym',
        body: [
            'I train early in the morning, before work, for about 50 minutes. My program rotates through five days: push, pull, legs, upper and lower.',
            'I log every set. I like how plain the deal is: do the work, and the numbers move. I am still early in it, so for now the goal is simple: turn up.',
        ],
        next: 'the window seat',
        camera: { from: [-4.55, 8.95, -3.45], at: [-4.05, 8.15, -5.0], fov: 56 },
    },
    {
        id: 'seat',
        thing: 'The window seat',
        label: 'For fun',
        title: 'Manhwa, manhua and anime',
        body: [
            'I read manhwa and manhua most nights, often up here by the window. Two favourites: The Greatest Estate Developer, and God of Blackfield, which I binged up to chapter 305. Very fun, and greatly recommended.',
            'I used to watch a lot of anime too. I went to Akihabara five years in a row, and to my first Comiket in 2019.',
        ],
        next: 'the shelf',
        camera: { from: [-4.85, 8.95, -3.7], at: [-5.43, 8.2, -5.0], fov: 56 },
    },
    {
        id: 'shelf',
        thing: 'The keepsake shelf',
        label: 'For fun',
        title: 'Games',
        body: [
            'I have been on Steam for more than ten years: level 63, 4,717 achievements and 14 games completed all the way.',
            'Elden Ring is my favourite, at 208 hours. I also lose whole weekends to strategy and city builders like Anno 1800, Victoria 3 and Manor Lords, and to roguelikes like Warm Snow.',
            'These days I am playing Where Winds Meet. The Steam Deck and the Switch on this shelf still get plenty of use.',
        ],
        links: 'steam',
        next: 'the photo wall',
        camera: { from: [-4.8, 8.9, -4.35], at: [-6.55, 8.45, -5.05], fov: 42 },
    },
    {
        id: 'photos',
        thing: 'The photo wall and the camera',
        label: 'For fun',
        title: 'Photos and video',
        body: [
            'I have loved taking photos and making videos since school. I was treasurer of the videography club in secondary school, and vice president of the media club in junior college.',
            'I took most of the photos on this wall while travelling: half a year in Europe in 2023, from the Swiss Alps to the aurora in Lapland, then Seoul, Busan and Japan in 2024. I always end up shooting night lights and busy streets, which might explain the view from this room.',
        ],
        next: 'the graduation photo',
        camera: { from: [-4.75, 8.75, -2.3], at: [-6.8, 8.45, -2.85], fov: 62 },
    },
    {
        id: 'graduation',
        thing: 'The graduation photo',
        label: 'Before',
        title: 'NTU, Computer Science',
        body: ['I finished Computer Science at NTU in December 2024.'],
        next: 'say hello',
        camera: { from: [-5.85, 8.85, -2.45], at: [-6.9, 8.88, -2.1], fov: 44 },
    },
    {
        id: 'hello',
        thing: 'The window over the city',
        label: 'Say hello',
        title: 'Thanks for coming up.',
        body: ['If you want to build something together, or talk about games or cameras, I would love to hear from you.'],
        cta: true,
        camera: { from: [-4.3, 9.0, -2.4], at: [-5.43, 9.0, -5.2], fov: 62 },
    },
]

// The short facts from the home card, for the plain page without the scene.
export const facts = [
    ['Now', 'Software Engineer, Aurrigo'],
    ['Since', 'February 2025'],
    ['Teaching', 'Database Systems, Ngee Ann Poly'],
    ['Before', 'NTU, Computer Science'],
    ['Also', 'Full-stack side projects'],
]

export const socials = [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/jovian-lim-tetsuhiro' },
    { label: 'GitHub', href: 'https://github.com/Kiriketsuki' },
]

export const steam = { label: 'Steam profile', href: 'https://steamcommunity.com/id/Kiriketsuki/' }
