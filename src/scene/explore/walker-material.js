import * as THREE from 'three'

// The Kinako material (spec, Walker design): the aerie toon material with a rig in its vertex
// shader. walker.glb (scenes/urban-aerie-studies/export_walker.py) keeps one mesh in the stand
// pose with a straight tail. Each vertex holds its part index in _part, and each tail vertex its
// distance along the tail in _tail.
//
// - The tail bends over three joints. Each joint spreads its bend over BLEND metres of tail, as
//   tail_spine in walker_kit_geometry.py does, so the tail curves and never kinks.
// - Each part then takes its matrix from uKinakoPart: a turn about its pivot, after the turns
//   of its parents. body.js writes the matrices each frame.
// - The light is the two-band toon of the concept sheet (walker_concepts.py, toon_material):
//   one flat tone on the faces the moon reaches, and one cool shade band on the faces turned
//   away. The aerie light shades each rigid part as its own rounded tube, so the legs, the neck
//   and the haunches read as separate blocks. The flat tone lets the parts read as one body.
//   A flat warm glow from the windows and the fire rides on top (body.js sets it from the spill
//   at Kinako's feet), so it never shades one part apart from the next.
// - A warm rim lights the edge that faces the nearest lamp or the fire.
// - The ink mask is the silhouette value 0.5 of toon-material.js, so the outline draws round
//   Kinako and not a dark ring at each joint.
//
// The patch wraps the toon onBeforeCompile of a clone, so the aerie program stays as it was
// and the walker builds one program of its own.

// The warm lamp colour of the concept sheet (walker_concepts.py, LAMP).
const RIM_COLOUR = 0xffbf75
// The night level of the lit tone, and the shade band tone, after the concept ramp (a cool grey
// at 0.5 to 0.58). The band edge sits where the wrapped moon light reaches EDGE.
const LIT = 0.5
const SHADE = [0.6, 0.6, 0.72]
const EDGE = [0.3, 0.36]

const VERTEX_PARS = (parts, tail) => /* glsl */ `
attribute float _part;
attribute float _tail;
uniform mat4 uKinakoPart[ ${parts} ];
// Each tail joint: the pitch and the yaw in radians, the rest angles included.
uniform vec2 uKinakoTail[ 3 ];
const vec3 KINAKO_PIVOT[ 3 ] = vec3[]( ${tail.joints.map((j) => `vec3( ${j.pivot.map((c) => c.toFixed(4)).join(', ')} )`).join(', ')} );
const float KINAKO_JOINT[ 3 ] = float[]( ${tail.joints.map((j) => j.s.toFixed(4)).join(', ')} );
mat3 kinakoTurn( vec2 angles ) {
    float cp = cos( angles.x );
    float sp = sin( angles.x );
    float cy = cos( angles.y );
    float sy = sin( angles.y );
    return mat3( cy, 0.0, - sy, 0.0, 1.0, 0.0, sy, 0.0, cy ) * mat3( 1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, - sp, cp );
}
void kinakoPose( inout vec3 p, inout vec3 n ) {
    // From the tip joint back to the root, so each joint carries the joints past it.
    for ( int j = 2; j >= 0; j -- ) {
        float w = smoothstep( 0.0, 1.0, ( _tail - KINAKO_JOINT[ j ] ) / ${tail.blend.toFixed(3)} + 0.3 );
        if ( _tail <= 0.0 || w <= 0.0 ) continue;
        mat3 r = kinakoTurn( uKinakoTail[ j ] * w );
        p = KINAKO_PIVOT[ j ] + r * ( p - KINAKO_PIVOT[ j ] );
        n = r * n;
    }
    mat4 m = uKinakoPart[ int( _part + 0.5 ) ];
    p = ( m * vec4( p, 1.0 ) ).xyz;
    n = mat3( m ) * n;
}
`

const FRAGMENT_PARS = /* glsl */ `
// xyz: the nearest lamp in the world. w: the rim strength there, 0 out of its reach.
uniform vec4 uKinakoRim;
uniform vec3 uKinakoRimColour;
uniform vec3 uKinakoWarm;
`

const FRAGMENT_RIM = /* glsl */ `
{
    vec3 kinakoN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    float kinakoKey = dot( kinakoN, uToonMoonDir ) * 0.5 + 0.5;
    float kinakoBand = smoothstep( ${EDGE[0].toFixed(2)}, ${EDGE[1].toFixed(2)}, kinakoKey );
    vec3 kinakoTone = mix( vec3( ${SHADE.map((c) => c.toFixed(2)).join(', ')} ), vec3( 1.0 ), kinakoBand ) * ${LIT.toFixed(2)};
    outgoingLight = diffuseColor.rgb * ( kinakoTone + uKinakoWarm );
    vec3 kinakoView = normalize( cameraPosition - vToonWorld );
    vec3 kinakoLamp = normalize( uKinakoRim.xyz - vToonWorld );
    float kinakoEdge = pow( 1.0 - clamp( dot( kinakoN, kinakoView ), 0.0, 1.0 ), 2.5 );
    float kinakoFace = smoothstep( -0.1, 0.5, dot( kinakoN, kinakoLamp ) );
    outgoingLight += uKinakoRimColour * kinakoEdge * kinakoFace * uKinakoRim.w;
}
`

// toon: the aerie toon material (manager.parts.look.materials[0]). rig: the rig of walker.glb.
export function createWalkerMaterial(toon, rig) {
    const uniforms = {
        uKinakoPart: { value: rig.parts.map(() => new THREE.Matrix4()) },
        uKinakoTail: { value: rig.tail.joints.map(() => new THREE.Vector2()) },
        uKinakoRim: { value: new THREE.Vector4(0, -1e4, 0, 0) },
        uKinakoRimColour: { value: new THREE.Color(RIM_COLOUR) },
        uKinakoWarm: { value: new THREE.Color(0, 0, 0) },
    }
    const material = toon.clone()
    material.name = 'aerie.walker'
    delete material.userData.walkWrapped
    const original = toon.onBeforeCompile
    const key = toon.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
        original.call(material, shader, renderer)
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_PARS(rig.parts.length, rig.tail)}`)
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 kinakoPosition = position;\nkinakoPose( kinakoPosition, objectNormal );')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = kinakoPosition;')
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace(/float toonInk = [^;]*;/, 'float toonInk = 0.5;')
            .replace('#include <opaque_fragment>', `${FRAGMENT_RIM}\n#include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => `${key}-kinako-2`
    return { material, uniforms }
}
