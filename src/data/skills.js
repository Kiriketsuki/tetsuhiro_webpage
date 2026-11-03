// What I use as of November 2026, and only things I have shipped or handed in. The
// evidence audit of 3 November 2026 confirmed each one against a repo or a job.
// parent is the skill this one grew out of. It draws the tree on /skills and the
// lines between the stars in the telescope's skill sky. showOff marks the skills
// that are in demand and that I can show shipped work for. They are the bright
// stars in the sky. The logos live in skill-icons.js, so only /skills loads them.
export const branches = [
    { id: 'web', label: 'Web', color: 'teal' },
    { id: '3d', label: '3D', color: 'violet' },
    { id: 'backend', label: 'Back end', color: 'amber' },
    { id: 'data', label: 'Data', color: 'rose' },
    { id: 'systems', label: 'Systems', color: 'moss' },
    { id: 'agents', label: 'Agents', color: 'sand' },
]

export const skills = [
    { id: 'javascript', name: 'JavaScript', branch: 'web', parent: null },
    { id: 'typescript', name: 'TypeScript', branch: 'web', parent: 'javascript', showOff: true },
    { id: 'vue', name: 'Vue', branch: 'web', parent: 'javascript', showOff: true },
    { id: 'svelte', name: 'Svelte', branch: 'web', parent: 'typescript' },
    { id: 'tailwind', name: 'Tailwind', branch: 'web', parent: 'vue' },
    { id: 'maplibre', name: 'MapLibre', branch: 'web', parent: 'vue' },

    { id: 'blender', name: 'Blender', branch: '3d', parent: null },
    { id: 'threejs', name: 'Three.js', branch: '3d', parent: 'javascript', showOff: true },
    { id: 'gsap', name: 'GSAP', branch: '3d', parent: 'threejs' },

    { id: 'python', name: 'Python', branch: 'backend', parent: null, showOff: true },
    { id: 'fastapi', name: 'FastAPI', branch: 'backend', parent: 'python', showOff: true },
    { id: 'grpc', name: 'gRPC', branch: 'backend', parent: 'fastapi', showOff: true },
    { id: 'firebase', name: 'Firebase', branch: 'backend', parent: 'javascript' },

    { id: 'mysql', name: 'MySQL', branch: 'data', parent: null },
    { id: 'postgresql', name: 'PostgreSQL', branch: 'data', parent: 'mysql', showOff: true },
    { id: 'redis', name: 'Redis', branch: 'data', parent: 'postgresql' },

    { id: 'c', name: 'C', branch: 'systems', parent: null },
    { id: 'cpp', name: 'C++', branch: 'systems', parent: 'c', showOff: true },
    { id: 'go', name: 'Go', branch: 'systems', parent: 'c', showOff: true },
    { id: 'rust', name: 'Rust', branch: 'systems', parent: 'cpp' },
    { id: 'docker', name: 'Docker', branch: 'systems', parent: 'python', showOff: true },

    { id: 'agents', name: 'Agent orchestration', branch: 'agents', parent: 'go', showOff: true },
    { id: 'mcp', name: 'MCP', branch: 'agents', parent: 'go' },
]

export const branchOf = (skill) => branches.find((branch) => branch.id === skill.branch)

// Same colours as tokens.css. The canvas cannot read CSS variables.
export const PALETTE = {
    teal: '#54bbd2',
    violet: '#a383e3',
    amber: '#f5c252',
    rose: '#ee8d9f',
    moss: '#66a983',
    sand: '#e8c089',
    ink: '#f6f1e9',
    raised: '#0b1a31',
    base: '#03111e',
    line: '#2d3e55',
}
