// What I use as of October 2025. The order matches SkillSlot_01 to _13 on the
// tree in island.glb, so the first skill hangs on the first slot.
// parent is the skill this one grew out of, for the tree on /skills.
export const branches = [
    { id: 'web', label: 'Web', color: 'teal' },
    { id: '3d', label: '3D', color: 'violet' },
    { id: 'backend', label: 'Back end', color: 'amber' },
    { id: 'data', label: 'Data', color: 'rose' },
    { id: 'tools', label: 'Tools', color: 'moss' },
]

export const skills = [
    { id: 'vue', name: 'Vue', branch: 'web', parent: 'javascript' },
    { id: 'threejs', name: 'Three.js', branch: '3d', parent: 'javascript' },
    { id: 'blender', name: 'Blender', branch: '3d', parent: null },
    { id: 'python', name: 'Python', branch: 'backend', parent: null },
    { id: 'fastapi', name: 'FastAPI', branch: 'backend', parent: 'python' },
    { id: 'tailwind', name: 'Tailwind', branch: 'web', parent: 'vue' },
    { id: 'gsap', name: 'GSAP', branch: 'web', parent: 'javascript' },
    { id: 'maplibre', name: 'MapLibre', branch: 'web', parent: 'javascript' },
    { id: 'firebase', name: 'Firebase', branch: 'backend', parent: null },
    { id: 'docker', name: 'Docker', branch: 'tools', parent: null },
    { id: 'javascript', name: 'JavaScript', branch: 'web', parent: null },
    { id: 'computer-vision', name: 'Computer Vision', branch: 'data', parent: 'python' },
    { id: 'figma', name: 'Figma', branch: 'tools', parent: null },
]

export const branchOf = (skill) => branches.find((branch) => branch.id === skill.branch)
