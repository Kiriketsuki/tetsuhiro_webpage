// The bedroom on the top floor, the About view (/about). The camera comes in through the
// glass balcony door and stands just inside it. Each story point is a thing in the room that
// opens one short note. Positions are metres in the GLB frame (Y up).
//
// The room box comes from the cozy interiors report (island_b_cozy_interiors_report.json):
// inner walls x -6.93 to -3.5 and z -1.62 (front, the balcony side) to -5.23 (back), floor
// y 7.41, ceiling y 10.36. The balcony door is in route.js (bedroomDoor), beside the workshop
// doorway, because the scene chunk reads it and this file stays out of that chunk.

// Where the visitor stands to look round the room, and the first view: toward the back left,
// where the bed, the keepsake shelf and the window over the city are. yaw is in degrees from
// straight back (-z), positive to the left. pitch is in degrees, positive up.
export const stand = { position: [-4.3, 9.0, -2.2], yaw: 38, pitch: -12, fov: 64 }

// How far the view turns from the stand, in degrees. It covers both side walls, never the door.
export const LOOK_LIMIT = { yaw: [-100, 100], pitch: [-40, 20] }

// The story points, in the order Tab and Next take them. `at` is the point that the tag marks
// and the lens keeps sharp. `from` is where the camera moves to when the note opens, and it
// looks at `at`. The words are the owner's own (About.vue and the owner on 3 November 2026).
export const points = [
    {
        id: 'window',
        thing: 'Window over the city',
        label: 'Hello',
        title: 'Jovian Lim',
        body: ['Hello! I am a Software Engineer in Singapore.'],
        links: 'socials',
        at: [-5.35, 8.95, -5.2],
        from: [-5.05, 9.05, -3.2],
    },
    {
        id: 'desk',
        thing: 'Desk',
        label: 'Now',
        title: 'Software Engineer, Aurrigo',
        body: ['I joined Aurrigo in February 2025. There I build the screens people use to run driverless vehicles at airports.'],
        at: [-3.62, 8.45, -3.6],
        from: [-4.95, 9.05, -3.2],
    },
    {
        id: 'laptop',
        thing: 'Laptop',
        label: 'Also',
        title: 'Full-stack side projects',
        body: [
            'Outside work I build full-stack side projects. Some are tools I use every day, like my agentic workflows. Others are just for fun, like Kinopy, a daily word puzzle.',
        ],
        links: 'projects',
        at: [-3.84, 8.26, -3.02],
        from: [-4.9, 9.0, -2.65],
    },
    {
        id: 'notebook',
        thing: 'Teaching notebook',
        label: 'Teaching',
        title: 'Database Systems, Ngee Ann Poly',
        body: ['Since January 2026 I also teach Database Systems to adult learners at Ngee Ann Polytechnic. I enjoy it a lot.'],
        at: [-3.9, 8.18, -3.88],
        from: [-4.85, 8.95, -3.55],
    },
    {
        id: 'photo',
        thing: 'Graduation photo',
        label: 'Before',
        title: 'NTU, Computer Science',
        body: ['I finished Computer Science at NTU in December 2024.'],
        at: [-6.9, 8.85, -2.2],
        from: [-5.45, 8.95, -2.35],
    },
    {
        id: 'shelf',
        thing: 'Keepsake shelf',
        label: 'For fun',
        title: 'Games',
        body: ['I like playing games.'],
        at: [-6.55, 8.75, -5.06],
        from: [-5.55, 9.05, -3.55],
    },
    {
        id: 'seat',
        thing: 'Window seat',
        label: 'For fun',
        title: 'Manhwa and manhua',
        body: ['I like reading manhwa and manhua.'],
        at: [-5.35, 7.92, -5.0],
        from: [-5.2, 8.8, -3.55],
    },
    {
        id: 'cloak',
        thing: 'Cloak on the wall',
        label: 'For fun',
        title: 'Pop culture',
        body: ['I like watching pop culture, and I used to watch a lot of anime.'],
        at: [-3.58, 8.85, -4.57],
        from: [-4.85, 9.05, -3.75],
    },
    {
        id: 'gym',
        thing: 'Dumbbells',
        label: 'For fun',
        title: 'The gym',
        body: ['I go to the gym.'],
        at: [-4.79, 7.48, -4.5],
        from: [-4.55, 8.65, -3.3],
    },
]

// The short facts from the home card. "All facts" opens them in the room.
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
