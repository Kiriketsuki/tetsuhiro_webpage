// One constellation per skill branch in the telescope's skill sky. Units are degrees of
// sky, x to the right and y up, around the figure's own centre.
// stars: each skill of the branch, by id, to its point. Every star is a skill.
// edges: extra lines between skills, as "a-b" pairs. constellation.js draws the parent
// links from src/data/skills.js on its own.
// art: the faint figure drawing behind the stars, as polylines [x, y, x, y, ...]. A
// polyline that ends on its first point is closed and gets a soft fill.
// bands: thick soft strokes, as [width, x, y, x, y, ...], for a body or a tail.
// at and tall: the figure centre (azimuth, elevation) and scale on a wide and a tall screen.
// title: where the name sits, when the default spot under the figure is taken. tallTitle
// does the same on a tall screen.
// curve: a chain of stars whose lines follow one smooth curve instead of straight lines.

// A closed copy of a polygon, scaled toward the origin.
const ring = (points, k) => [...points, points[0], points[1]].map((v) => Math.round(v * k * 10) / 10)

// A closed flat-topped hexagon.
const hex = (cx, cy, r) =>
    [0, 1, 2, 3, 4, 5, 0].flatMap((i) => [cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3)].map((v) => Math.round(v * 100) / 100))

// A smooth curve through points [x, y, x, y, ...], as a dense polyline (Catmull-Rom).
export const smooth = (flat, steps = 6) => {
    const points = []
    for (let i = 0; i < flat.length; i += 2) points.push([flat[i], flat[i + 1]])
    const out = []
    points.slice(0, -1).forEach((p1, i) => {
        const p0 = points[i - 1] ?? p1
        const p2 = points[i + 1]
        const p3 = points[i + 2] ?? p2
        for (let s = 0; s < steps; s += 1) {
            const t = s / steps
            const at = (k) =>
                0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)
            out.push(Math.round(at(0) * 100) / 100, Math.round(at(1) * 100) / 100)
        }
    })
    return [...out, ...points[points.length - 1]]
}

// The five rim stars of the Weaver, in order round the web.
const WEB_RIM = [6.9, 4, -1.7, 8.2, -7.8, 0.8, -3.3, -7.5, 5.6, -5.1]

export const figures = {
    // The web is its stars: JavaScript is the hub, the spokes run out to the five rim
    // skills, and the rim lines close the web. Faint threads spiral between the spokes.
    web: {
        name: 'The Weaver',
        at: [0, 15, 0.85],
        tall: [-2, 19, 0.8],
        stars: {
            javascript: [0, 0],
            typescript: [6.9, 4],
            svelte: [-1.7, 8.2],
            tailwind: [-7.8, 0.8],
            vue: [-3.3, -7.5],
            maplibre: [5.6, -5.1],
        },
        edges: 'javascript-svelte javascript-tailwind javascript-maplibre svelte-tailwind maplibre-typescript',
        art: [ring(WEB_RIM, 0.28), ring(WEB_RIM, 0.5), ring(WEB_RIM, 0.72)],
        title: [1, -12],
    },
    '3d': {
        name: 'The Paper Crane',
        at: [-30, 26, 0.78],
        tall: [-15, 53, 0.62],
        stars: {
            blender: [0, -1.5],
            threejs: [-5.5, 3.1],
            gsap: [-11.5, 3.6],
        },
        edges: 'blender-threejs',
        art: [
            [-2, 0.5, 0.5, 2, 3, 0.5, 0, -1.5, -2, 0.5],
            [-2, 0.5, -8.8, 5.6, -11.5, 3.6, -8.6, 4.6, -1.2, -0.6],
            [3, 0.5, 9.5, 3.5, 1.6, -0.8],
            [-1.2, 1.4, -2.5, 10.5, 1.4, 2, -1.2, 1.4],
            [0.2, 1.9, 6.5, 11.5, 2.8, 1.2, 0.2, 1.9],
            [1.5, 1.5, 3.2, 6.5],
            [0.5, 2, 0, -1.5],
        ],
        title: [11, -1.5],
    },
    // An S of four stars from the head to the tail, with a smooth body drawn through them.
    backend: {
        name: 'The Serpent',
        at: [31, 30, 0.85],
        tall: [5.5, 37, 0.72],
        stars: {
            python: [6, 8],
            fastapi: [-1.5, 5.5],
            grpc: [2.5, -0.5],
            firebase: [-6, -6],
        },
        edges: 'grpc-firebase',
        curve: ['python', 'fastapi', 'grpc', 'firebase'],
        art: [
            [10.2, 8.6, 8.4, 10, 6.2, 9.4, 6.2, 6.8, 8.4, 7.2, 10.2, 8.6],
            [8.3, 9, 8.8, 9, 8.8, 8.5, 8.3, 8.5, 8.3, 9],
            [10.2, 8.6, 11.8, 8.6, 12.6, 9.4],
            [11.8, 8.6, 12.6, 7.8],
        ],
        bands: [
            [1.7, ...smooth([6, 8, -1.5, 5.5, 2.5, -0.5, -6, -6])],
            [1.1, ...smooth([-6, -6, -7.6, -5.2, -9, -3.6])],
        ],
        title: [-8, 9],
    },
    data: {
        name: 'The Squirrel',
        at: [-28, 13, 0.85],
        tall: [-11, 2, 0.68],
        stars: {
            mysql: [-3, -5.5],
            postgresql: [2.2, 5.8],
            redis: [5.5, -0.6],
        },
        art: [
            [-3, -5.5, 2, -6, 3.8, -3.5, 4, -0.5, 3.2, 1.8, 5.8, 4.2, 4.2, 6.2, 3, 7.6, 2.2, 5.8, 0.4, 4.8, -1.5, 1.5, -3, -5.5],
            [4.6, 0.6, 6.4, 0.6, 6.2, -0.2, 4.8, -0.2, 4.6, 0.6],
            [4.8, -0.2, 5.5, -1.8, 6.2, -0.2],
            [5.5, 0.6, 5.5, 1.3],
        ],
        bands: [[2.2, -3, -4.5, -6.5, -3, -8, 1, -7.2, 5.5, -5, 8.4, -2.4, 9, -1.2, 7.6]],
        title: [8, -5],
    },
    systems: {
        name: 'The Forge',
        at: [30, 9, 0.9],
        tall: [11, 1, 0.66],
        stars: {
            c: [0.5, 4.2],
            cpp: [-3, 4.2],
            rust: [-7.5, 3.4],
            go: [-4.5, 9.5],
            docker: [0.5, -4.4],
        },
        edges: 'c-docker',
        art: [
            [-7.5, 3.4, -3, 4.2, 5.5, 4.2, 5.5, 2, 2.6, 0, 2.6, -2, 5.6, -4.4, -4.6, -4.4, -1.6, -2, -1.6, 0, -3.5, 1.2, -7.5, 3.4],
            [-6.4, 9.4, -4.8, 11.4, -2.8, 9.8, -4.4, 7.8, -6.4, 9.4],
            [-3.8, 10.6, 1, 13.5],
            [0.5, 5.6, 0.5, 7.6],
            [1.9, 5.4, 3.6, 7],
            [2.6, 5, 5, 5.8],
        ],
    },
    // A kite on its string. Agent orchestration is the kite, and MCP is the reel on the
    // ground that steers it. The line between the two stars is the string.
    agents: {
        name: 'The Kite',
        at: [0, 37, 0.75],
        tall: [13.6, 52, 0.6],
        stars: {
            agents: [0, 4.5],
            mcp: [4, -10.5],
        },
        edges: 'agents-mcp',
        art: [
            [0, 10.5, 4.5, 4.5, 0, -1.5, -4.5, 4.5, 0, 10.5],
            [0, 10.5, 0, -1.5],
            [-4.5, 4.5, 4.5, 4.5],
            smooth([0, -1.5, -1.2, -3.4, 0.6, -5.4, -0.8, -7.4, 0.2, -9]),
            [-1.2, -3.4, -2.2, -2.8, -2, -4, -1.2, -3.4],
            [-1.2, -3.4, -0.2, -4.2, -0.6, -2.8, -1.2, -3.4],
            [-0.8, -7.4, -1.8, -6.8, -1.6, -8, -0.8, -7.4],
            [-0.8, -7.4, 0.2, -8.2, -0.2, -6.8, -0.8, -7.4],
            hex(4, -10.5, 0.9),
        ],
        title: [-9, 7],
        tallTitle: [8, 2],
    },
}
