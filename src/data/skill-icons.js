import {
    siBlender,
    siC,
    siCplusplus,
    siDocker,
    siFastapi,
    siFirebase,
    siGo,
    siGsap,
    siJavascript,
    siMaplibre,
    siModelcontextprotocol,
    siMysql,
    siPostgresql,
    siPython,
    siRedis,
    siRust,
    siSvelte,
    siTailwindcss,
    siThreedotjs,
    siTypescript,
    siVuedotjs,
} from 'simple-icons'
import { branchOf, PALETTE } from './skills.js'

// The skill logos for the /skills tree. Only that route imports this file, so the
// logos stay out of the shell. Logos are simple-icons (CC0). simple-icons has no gRPC
// or agent logo, so those two skills show a plain four-point star.
const STAR = { path: 'M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9L1.5 12l7.9-2.6z', hex: 'e8c089' }

const ICONS = {
    javascript: siJavascript,
    typescript: siTypescript,
    vue: siVuedotjs,
    svelte: siSvelte,
    tailwind: siTailwindcss,
    maplibre: siMaplibre,
    blender: siBlender,
    threejs: siThreedotjs,
    gsap: siGsap,
    python: siPython,
    fastapi: siFastapi,
    firebase: siFirebase,
    mysql: siMysql,
    postgresql: siPostgresql,
    redis: siRedis,
    c: siC,
    cpp: siCplusplus,
    go: siGo,
    rust: siRust,
    docker: siDocker,
    mcp: siModelcontextprotocol,
}

export const iconOf = (skill) => ICONS[skill.id] ?? STAR

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
// branch colour: Three.js and Rust are black, and the darker blues go muddy at
// badge size. 4:1 sits above the 3:1 WCAG bar for graphics, because the logos are small.
const LOGO_CONTRAST = 4

export function logoColor(skill) {
    const brand = `#${iconOf(skill).hex}`
    if (contrast(brand, PALETTE.raised) >= LOGO_CONTRAST) return brand
    return PALETTE[branchOf(skill)?.color] ?? PALETTE.ink
}
