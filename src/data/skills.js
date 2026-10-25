import {
    siBlender,
    siC,
    siFastapi,
    siFirebase,
    siGsap,
    siJavascript,
    siMaplibre,
    siMysql,
    siOpencv,
    siPython,
    siTailwindcss,
    siThreedotjs,
    siVuedotjs,
} from 'simple-icons'

// What I use as of October 2025, and only things I have shipped or handed in.
// parent is the skill this one grew out of. It draws the tree on /skills and the
// lines between the stars in the telescope's skill sky.
// Logos are simple-icons (CC0).
export const branches = [
    { id: 'web', label: 'Web', color: 'teal' },
    { id: '3d', label: '3D', color: 'violet' },
    { id: 'backend', label: 'Back end', color: 'amber' },
    { id: 'vision', label: 'Vision', color: 'rose' },
    { id: 'systems', label: 'Systems', color: 'moss' },
]

export const skills = [
    { id: 'threejs', name: 'Three.js', branch: '3d', parent: 'javascript', icon: siThreedotjs },
    { id: 'blender', name: 'Blender', branch: '3d', parent: null, icon: siBlender },
    { id: 'firebase', name: 'Firebase', branch: 'backend', parent: 'javascript', icon: siFirebase },
    { id: 'c', name: 'C', branch: 'systems', parent: null, icon: siC },

    { id: 'javascript', name: 'JavaScript', branch: 'web', parent: null, icon: siJavascript },
    { id: 'vue', name: 'Vue', branch: 'web', parent: 'javascript', icon: siVuedotjs },
    { id: 'tailwind', name: 'Tailwind', branch: 'web', parent: 'vue', icon: siTailwindcss },
    { id: 'gsap', name: 'GSAP', branch: 'web', parent: 'javascript', icon: siGsap },
    { id: 'maplibre', name: 'MapLibre', branch: 'web', parent: 'javascript', icon: siMaplibre },

    { id: 'python', name: 'Python', branch: 'backend', parent: null, icon: siPython },
    { id: 'fastapi', name: 'FastAPI', branch: 'backend', parent: 'python', icon: siFastapi },
    { id: 'mysql', name: 'MySQL', branch: 'backend', parent: 'fastapi', icon: siMysql },
    { id: 'opencv', name: 'OpenCV', branch: 'vision', parent: 'python', icon: siOpencv },
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

const channel = (hex, i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
const contrast = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
}

// The brand colour when it reads well on the night-blue plate. Otherwise the
// branch colour: Three.js is black and the MySQL, Python, MapLibre and OpenCV
// blues go muddy at badge size. 4:1 sits above the 3:1 WCAG bar for graphics,
// because the logos are small.
const LOGO_CONTRAST = 4

export function logoColor(skill) {
    const brand = `#${skill.icon.hex}`
    if (contrast(brand, PALETTE.raised) >= LOGO_CONTRAST) return brand
    return PALETTE[branchOf(skill)?.color] ?? PALETTE.ink
}
