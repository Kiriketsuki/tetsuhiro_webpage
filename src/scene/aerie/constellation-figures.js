// One constellation per skill branch in the telescope's skill sky. Units are degrees of
// sky, x to the right and y up, around the figure's own centre.
// stars: a skill id or a letter (a figure star with no skill) to its point. A letter
// only names a skill when that skill is in the figure's own branch.
// edges: the figure lines between stars, as "a-b" pairs. constellation.js adds the
// parent links from src/data/skills.js on top.
// art: the faint figure drawing behind the stars, as polylines [x, y, x, y, ...]. A
// polyline that ends on its first point is closed and gets a soft fill.
// bands: thick soft strokes, as [width, x, y, x, y, ...], for a body or a tail.
// at and tall: the figure centre (azimuth, elevation) and scale on a wide and a tall screen.
// title: where the name sits, when the default spot under the figure is taken.

// A closed copy of a polygon, scaled toward the origin.
const ring = (points, k) => [...points, points[0], points[1]].map((v) => Math.round(v * k * 10) / 10)

// A closed flat-topped hexagon.
const hex = (cx, cy, r) =>
    [0, 1, 2, 3, 4, 5, 0].flatMap((i) => [cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3)].map((v) => Math.round(v * 100) / 100))

const WEB_RIM = [7.3, 6.1, -0.8, 9.2, -8.2, 4.8, -8.7, -2.3, -2.3, -8.7, 4.5, -7.8, 8.9, -2.3]

export const figures = {
    web: {
        name: 'The Weaver',
        at: [0, 15, 0.85],
        tall: [-2, 19, 0.8],
        stars: {
            javascript: [0, 0],
            typescript: [3.4, 2.9],
            svelte: [7.3, 6.1],
            vue: [-3.9, 2.3],
            tailwind: [-8.2, 4.8],
            maplibre: [-8.7, -2.3],
            a: [-0.8, 9.2],
            b: [-2.3, -8.7],
            c: [4.5, -7.8],
            d: [8.9, -2.3],
        },
        edges: 'javascript-a javascript-b javascript-c javascript-d svelte-a a-tailwind tailwind-maplibre maplibre-b b-c c-d d-svelte',
        art: [
            ring(WEB_RIM, 0.3),
            ring(WEB_RIM, 0.55),
            ring(WEB_RIM, 0.8),
            [4.5, -7.8, 5.6, -10.6],
            [5.6, -10.6, 6.3, -11, 6.3, -11.8, 5.6, -12.2, 4.9, -11.8, 4.9, -11, 5.6, -10.6],
            [5.6, -12.2, 6.6, -12.8, 6.6, -14.2, 5.6, -15, 4.6, -14.2, 4.6, -12.8, 5.6, -12.2],
            [4.9, -11.2, 3.4, -10.2, 2.8, -11],
            [4.8, -11.9, 3.2, -12.2, 2.6, -13.4],
            [6.3, -11.2, 7.8, -10.2, 8.4, -11],
            [6.4, -11.9, 8, -12.2, 8.6, -13.4],
        ],
        title: [-8, -10],
    },
    '3d': {
        name: 'The Paper Crane',
        at: [-31, 33, 0.85],
        tall: [-18, 59, 0.68],
        stars: {
            blender: [0, -1.5],
            threejs: [-5.5, 3.1],
            gsap: [-11.5, 3.6],
            a: [-8.8, 5.6],
            b: [9.5, 3.5],
            c: [-2.5, 10.5],
            d: [0.5, 2],
            e: [3.2, 6.5],
            f: [6.5, 11.5],
        },
        edges: 'blender-threejs threejs-a a-gsap blender-b b-d d-threejs d-c d-e e-f',
        art: [
            [-2, 0.5, 0.5, 2, 3, 0.5, 0, -1.5, -2, 0.5],
            [-2, 0.5, -8.8, 5.6, -11.5, 3.6, -8.6, 4.6, -1.2, -0.6],
            [3, 0.5, 9.5, 3.5, 1.6, -0.8],
            [-1.2, 1.4, -2.5, 10.5, 1.4, 2, -1.2, 1.4],
            [0.2, 1.9, 6.5, 11.5, 2.8, 1.2, 0.2, 1.9],
            [1.5, 1.5, 3.2, 6.5],
            [0.5, 2, 0, -1.5],
        ],
    },
    backend: {
        name: 'The Serpent',
        at: [31, 31, 0.85],
        tall: [5.5, 40, 0.72],
        stars: {
            python: [7, 8.5],
            fastapi: [2.5, 6.5],
            grpc: [0, 2],
            firebase: [-7.5, -5],
            a: [10.2, 9.6],
            b: [10, 7.4],
            g: [3.5, -2.5],
            h: [1.5, -6.5],
            t: [-3.5, -7.5],
        },
        edges: 'python-a a-b b-python grpc-g g-h h-t t-firebase',
        art: [
            [10.2, 8.5, 12, 8.5, 12.8, 9.3],
            [12, 8.5, 12.8, 7.7],
            [7.6, 9.4, 8.2, 9.4, 8.2, 8.8, 7.6, 8.8, 7.6, 9.4],
        ],
        bands: [[1.8, 10.2, 8.5, 7, 8.5, 2.5, 6.5, 0, 2, 3.5, -2.5, 1.5, -6.5, -3.5, -7.5, -7.5, -5]],
        title: [-5, 7],
    },
    data: {
        name: 'The Squirrel',
        at: [-30, 10, 0.9],
        tall: [-11, 0, 0.68],
        stars: {
            mysql: [-3, -5.5],
            postgresql: [2.2, 5.8],
            redis: [5.5, -0.6],
            e: [3, 7.6],
            f: [2, -6],
            n: [5.8, 4.2],
            t: [-8, 1],
            u: [-5, 8.4],
            v: [-1.2, 7.6],
        },
        edges: 'mysql-f mysql-t t-u u-v postgresql-e e-n',
        art: [
            [-3, -5.5, 2, -6, 3.8, -3.5, 4, -0.5, 3.2, 1.8, 5.8, 4.2, 4.2, 6.2, 3, 7.6, 2.2, 5.8, 0.4, 4.8, -1.5, 1.5, -3, -5.5],
            [4.6, 0.6, 6.4, 0.6, 6.2, -0.2, 4.8, -0.2, 4.6, 0.6],
            [4.8, -0.2, 5.5, -1.8, 6.2, -0.2],
            [5.5, 0.6, 5.5, 1.3],
        ],
        bands: [[2.2, -3, -4.5, -6.5, -3, -8, 1, -7.2, 5.5, -5, 8.4, -2.4, 9, -1.2, 7.6]],
    },
    systems: {
        name: 'The Forge',
        at: [30, 9, 0.9],
        tall: [11, -1, 0.66],
        stars: {
            c: [0.5, 4.2],
            cpp: [-3, 4.2],
            rust: [-7.5, 3.4],
            go: [-4.5, 9.5],
            docker: [0.5, -4.4],
            j: [5.5, 4.2],
            e: [5.5, 2],
            f: [2.6, 0],
            g: [-1.6, 0],
            h: [-4.6, -4.4],
            i: [5.6, -4.4],
            k: [1, 13.5],
        },
        edges: 'c-j j-e e-f f-i i-docker docker-h h-g g-rust go-k',
        art: [
            [-7.5, 3.4, -3, 4.2, 5.5, 4.2, 5.5, 2, 2.6, 0, 2.6, -2, 5.6, -4.4, -4.6, -4.4, -1.6, -2, -1.6, 0, -3.5, 1.2, -7.5, 3.4],
            [-6.4, 9.4, -4.8, 11.4, -2.8, 9.8, -4.4, 7.8, -6.4, 9.4],
            [-3.8, 10.6, 1, 13.5],
            [0.5, 5.6, 0.5, 7.6],
            [1.9, 5.4, 3.6, 7],
            [2.6, 5, 5, 5.8],
        ],
    },
    agents: {
        name: 'The Hive',
        at: [0, 38, 0.75],
        tall: [17, 60, 0.66],
        stars: {
            agents: [0.4, 2.9],
            h: [-2.7, 3.2],
            s: [3.4, 2.4],
            w: [-2.2, 7],
            x: [2.6, 7.4],
            mcp: [-1.1, -1.5],
            n: [1.1, -1.5],
            o: [-5.5, -5.3],
            p: [5.5, -5.3],
            q: [-1.1, -9.1],
            r: [1.1, -9.1],
        },
        edges: 'h-agents agents-s agents-w agents-x mcp-n n-p p-r r-q q-o o-mcp',
        art: [
            [-1.6, 2.9, -1, 3.9, 0.4, 4.2, 1.8, 3.9, 2.8, 3.2, 3.4, 2.4, 2.6, 1.9, 0.4, 1.6, -1, 1.9, -1.6, 2.9],
            [-0.3, 4.1, -0.3, 1.7],
            [1, 4.1, 1, 1.7],
            [-0.2, 4, -2.2, 7, -0.8, 6.8, 0.4, 4.2],
            [0.8, 4.1, 2.6, 7.4, 3.2, 6, 1.8, 3.9],
            hex(-2.6, 3.1, 0.9),
            [-3, 3.9, -3.8, 5.2],
            [-2.4, 4, -2.2, 5.4],
            hex(0, -3.4, 2.2),
            hex(-3.3, -5.3, 2.2),
            hex(3.3, -5.3, 2.2),
            hex(0, -7.2, 2.2),
        ],
    },
}
