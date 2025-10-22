import * as THREE from 'three'

const textureUrls = import.meta.glob('../assets/textures/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
})

// World space triplanar settings from the Blender file. tile is metres per
// repeat. rough is the range the rough map gets remapped onto.
const SETTINGS = {
    terrain_rock: { set: 'rock', tile: 4, normal: 1, rough: [0.72, 0.95], sharpness: 4 },
    terrain_volcanic: { set: 'volcanic', tile: 5, normal: 1, rough: [0.8, 1], sharpness: 4 },
    terrain_grass: { set: 'grass', tile: 2.5, normal: 0.7, rough: [0.78, 0.95], sharpness: 3 },
    terrain_snow: { set: 'snow', tile: 6, normal: 0.6, rough: [0.35, 0.65], sharpness: 3 },
    terrain_sand: { set: 'sand', tile: 4, normal: 0.6, rough: [0.75, 0.95], sharpness: 3 },
    terrain_sand_wet: { set: 'sand', tile: 4, normal: 0.3, rough: [0.22, 0.4], sharpness: 3 },
    bark: { set: 'bark', tile: 1.5, normal: 1, rough: [0.8, 0.95], sharpness: 5 },
}

// The rough maps were painted in this band. It gets stretched onto each range.
const ROUGH_LOW = 0.55
const ROUGH_HIGH = 1

const VERTEX_PARS = /* glsl */ `
varying vec3 vTriWorldPosition;
varying vec3 vTriWorldNormal;
`

// objectNormal is the exported split normal. It goes to world space untouched.
const VERTEX_MAIN = /* glsl */ `
vTriWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uTriAlbedo;
uniform sampler2D uTriNormal;
uniform sampler2D uTriRough;
uniform float uTriTile;
uniform float uTriNormalStrength;
uniform vec2 uTriRoughRange;
uniform float uTriSharpness;
varying vec3 vTriWorldPosition;
varying vec3 vTriWorldNormal;

vec3 triWeights(vec3 n) {
    vec3 w = pow(abs(n), vec3(uTriSharpness));
    return w / (w.x + w.y + w.z);
}

vec4 triSample(sampler2D map, vec2 uvX, vec2 uvY, vec2 uvZ, vec3 w) {
    return texture2D(map, uvX) * w.x + texture2D(map, uvY) * w.y + texture2D(map, uvZ) * w.z;
}

vec3 triTangent(sampler2D map, vec2 uv) {
    vec3 n = texture2D(map, uv).xyz * 2.0 - 1.0;
    n.xy *= uTriNormalStrength;
    return n;
}
`

// Albedo and roughness. The vertex colour still multiplies in after this.
const FRAGMENT_MAP = /* glsl */ `
vec3 triN = normalize(vTriWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
vec3 triW = triWeights(triN);
vec3 triSign = sign(triN);
vec3 triP = vTriWorldPosition / uTriTile;
// Flip U on the back faces so the texture is not mirrored there.
vec2 triUvX = vec2(triP.z * triSign.x, triP.y);
vec2 triUvY = vec2(triP.x * triSign.y, triP.z);
vec2 triUvZ = vec2(-triP.x * triSign.z, triP.y);
diffuseColor.rgb *= triSample(uTriAlbedo, triUvX, triUvY, triUvZ, triW).rgb;
`

const FRAGMENT_ROUGH = /* glsl */ `
float triRough = triSample(uTriRough, triUvX, triUvY, triUvZ, triW).g;
roughnessFactor = mix(uTriRoughRange.x, uTriRoughRange.y, clamp((triRough - ${ROUGH_LOW.toFixed(2)}) / ${(ROUGH_HIGH - ROUGH_LOW).toFixed(2)}, 0.0, 1.0));
`

// Whiteout blend (Ben Golus, "Normal Mapping for a Triplanar Shader"). Each
// projection's tangent normal gets added to the vertex normal swizzled into that
// plane, then the three are blended back into world space. It starts from the
// smooth vertex normal, never a derivative face normal, so the split normals hold.
const FRAGMENT_NORMAL = /* glsl */ `
{
    vec3 tX = triTangent(uTriNormal, triUvX);
    vec3 tY = triTangent(uTriNormal, triUvY);
    vec3 tZ = triTangent(uTriNormal, triUvZ);
    tX.x *= triSign.x;
    tY.x *= triSign.y;
    tZ.x *= -triSign.z;
    tX = vec3(tX.xy + triN.zy, abs(tX.z) * triN.x);
    tY = vec3(tY.xy + triN.xz, abs(tY.z) * triN.y);
    tZ = vec3(tZ.xy + triN.xy, abs(tZ.z) * triN.z);
    vec3 triWorld = normalize(tX.zyx * triW.x + tY.xzy * triW.y + tZ.xyz * triW.z);
    normal = normalize((viewMatrix * vec4(triWorld, 0.0)).xyz);
}
`

function loadSet(loader, set) {
    const load = (kind, colorSpace) => {
        const texture = loader.load(textureUrls[`../assets/textures/${set}_${kind}.webp`])
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.anisotropy = 8
        texture.colorSpace = colorSpace
        return texture
    }
    return {
        albedo: load('albedo', THREE.SRGBColorSpace),
        normal: load('normal', THREE.NoColorSpace),
        rough: load('rough', THREE.NoColorSpace),
    }
}

function applyTriplanar(material, maps, settings) {
    material.flatShading = false
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            uTriAlbedo: { value: maps.albedo },
            uTriNormal: { value: maps.normal },
            uTriRough: { value: maps.rough },
            uTriTile: { value: settings.tile },
            uTriNormalStrength: { value: settings.normal },
            uTriRoughRange: { value: new THREE.Vector2(...settings.rough) },
            uTriSharpness: { value: settings.sharpness },
        })
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
            .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_MAP}`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT_ROUGH}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`)
    }
    // Every triplanar material shares one program. The uniforms stay per material.
    material.customProgramCacheKey = () => 'triplanar-1'
    material.needsUpdate = true
}

// Finds the terrain and bark materials by name and gives them the tiled
// textures. Each texture set loads once, even when two materials share it.
export function applyTerrainMaterials(materials, loader) {
    const sets = new Map()
    const applied = []
    Object.entries(SETTINGS).forEach(([name, settings]) => {
        const material = materials.get(name)
        if (!material) return
        if (!sets.has(settings.set)) sets.set(settings.set, loadSet(loader, settings.set))
        applyTriplanar(material, sets.get(settings.set), settings)
        applied.push(material)
    })
    return { sets, applied }
}

export function disposeTerrainMaterials({ sets }) {
    sets.forEach((maps) => Object.values(maps).forEach((texture) => texture.dispose()))
}
