import * as THREE from 'three'

// E3 of explore on foot (spec, Camera and Leaf it Alone touches), from the explore chunk alone.
//
// The cutaway: while Kinako walks, the aerie toon materials open a soft round hole round Kinako
// on screen. A fragment opens when it lies nearer the camera than Kinako by MARGIN metres or
// more, inside a cone from the camera to Kinako that is RADIUS metres wide at Kinako. So a crown,
// the stair canopy, the tower frame or a roof between the camera and Kinako opens, and Kinako
// stays in view. The ground never opens: the lawn, soil, paving and stone families stay, and so
// do the litter cards, which lie on the ground.
//
// The leaf scatter: the loose litter cards near Kinako's feet lift and slide aside while Kinako
// walks, and settle again as Kinako walks on. One uniform carries the feet and the speed.
//
// Both patches wrap the onBeforeCompile of the materials that toon-material.js builds. They sit
// behind the WALK_CUT define, so the materials build a second program for the walk only. The
// define goes on during the move down to Kinako, which compiles that program, and comes off
// when the walk ends, which brings back the program the aerie already had.

const RADIUS = 0.95
const MARGIN = 0.45
// The look point of the hole sits this high over the feet.
const LIFT = 0.25
// The material names from toon-material.js callers: the aerie and its leaf cards.
const TOON = /^aerie\.(toon|leaf)$/
// SURFACE in toon-material.js: stone 3, lawn 6, soil 9, paving 11.
const GROUND = 'toonSurface == 3 || toonSurface == 6 || toonSurface == 9 || toonSurface == 11'

const FRAGMENT_PARS = /* glsl */ `
#ifdef WALK_CUT
uniform vec4 uWalkCut;
#endif
`

const FRAGMENT_CUT = /* glsl */ `
#ifdef WALK_CUT
{
    vec3 walkView = - vViewPosition;
    bool walkKeep = ${GROUND};
    #ifdef AERIE_CARD
    walkKeep = vCardCrown < 0.5;
    #endif
    float walkCos = dot( normalize( walkView ), normalize( uWalkCut.xyz ) );
    // A little noise on the rim, so the hole reads soft and never as a hard disc.
    float walkNoise = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    float walkRim = uWalkCut.w - ( 1.0 - uWalkCut.w ) * 0.35 * walkNoise;
    if ( ! walkKeep && - walkView.z < - uWalkCut.z - ${MARGIN.toFixed(2)} && walkCos > walkRim ) discard;
}
#endif
`

const VERTEX_PARS = /* glsl */ `
#ifdef WALK_CUT
uniform vec4 uWalkFoot;
#endif
`

// For a loose card only (aSprite.x below 0.5). uWalkFoot.w runs from 0 at rest to 1 at a walk.
const VERTEX_SCATTER = /* glsl */ `
#ifdef WALK_CUT
if ( aSprite.x < 0.5 ) {
    vec3 walkLeaf = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    vec2 walkAway = walkLeaf.xz - uWalkFoot.xz;
    float walkNear = 1.0 - smoothstep( 0.15, 0.9, length( walkAway ) );
    float walkLift = walkNear * walkNear * uWalkFoot.w * step( abs( walkLeaf.y - uWalkFoot.y ), 0.6 );
    vec2 walkSide = normalize( walkAway + vec2( 1e-4 ) ) * 0.12;
    vec3 walkMove = vec3( walkSide.x, 0.14, walkSide.y ) * walkLift;
    mvPosition.xyz += mat3( viewMatrix ) * walkMove;
    gl_Position = projectionMatrix * mvPosition;
    vToonWorld += walkMove;
}
#endif
`

// One set of uniforms for every wrapped material. A material wraps once, so a second cutaway
// must drive the same uniforms the first one wrapped in.
const uniforms = { uWalkCut: { value: new THREE.Vector4(0, 0, -1, 1) }, uWalkFoot: { value: new THREE.Vector4() } }

const wrap = (material) => {
    if (material.userData.walkWrapped) return
    material.userData.walkWrapped = true
    const original = material.onBeforeCompile
    const card = 'AERIE_CARD' in (material.defines ?? {})
    material.onBeforeCompile = (shader, renderer) => {
        original.call(material, shader, renderer)
        Object.assign(shader.uniforms, uniforms)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace('#include <opaque_fragment>', `${FRAGMENT_CUT}\n#include <opaque_fragment>`)
        if (!card) return
        const vertex = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        const end = vertex.lastIndexOf('}')
        shader.vertexShader = `${vertex.slice(0, end)}${VERTEX_SCATTER}\n${vertex.slice(end)}`
    }
}

export function createCutaway(manager) {
    const { scene, camera, renderer } = manager
    const materials = new Set()
    scene.traverse((node) => {
        if (!node.isMesh) return
        for (const material of [].concat(node.material)) if (TOON.test(material.name)) materials.add(material)
    })
    materials.forEach(wrap)
    const look = new THREE.Vector3()

    // Turns the walk programs on or off. On compiles them, so the first walk frame does not stall.
    const enable = async (on) => {
        for (const material of materials) {
            if (on) material.defines.WALK_CUT = ''
            else delete material.defines.WALK_CUT
            material.needsUpdate = true
        }
        if (on) await renderer.compileAsync(scene, camera)
    }

    // feet: the ground point under Kinako. pace: 0 at rest to 1 at a walk or faster.
    const update = (feet, pace) => {
        look.copy(feet).y += LIFT
        look.applyMatrix4(camera.matrixWorldInverse)
        const cos = Math.cos(Math.atan(RADIUS / Math.max(look.length(), 0.5)))
        uniforms.uWalkCut.value.set(look.x, look.y, look.z, cos)
        uniforms.uWalkFoot.value.set(feet.x, feet.y, feet.z, pace)
    }

    return { enable, update }
}
