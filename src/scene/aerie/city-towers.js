import * as THREE from 'three'
import { CITY_HAZE, HAZE_GLSL, NOISE_GLSL } from './city-glsl.js'
import { BOKEH } from './city-map.js'
import { GROUND, SHAPES, planSkyline } from './city-skyline.js'

// The towers and landmarks of the city (city-skyline.js), as one instanced mesh for each
// prism shape. From far above a tower shows its roof and its faces. The roof glows softly
// in the crown colour, the top of the top part carries a lit crown band, and the faces carry
// lit windows. Every edge fades out over about one bokeh disc, so a tower stays as soft as
// the out-of-focus lights round it and never shows a hard line.

// A prism of unit height and unit width across its faces, with sides faces and a top width
// of taper times the bottom width. aSide runs from -1 to 1 across each face and from 0 to 1
// out from the middle of the roof. aHalf is the half width of the face at that height.
function prism(sides, taper) {
    const r0 = 0.5 / Math.cos(Math.PI / sides)
    const r1 = r0 * taper
    const half = Math.sin(Math.PI / sides)
    const position = []
    const side = []
    const halfWidth = []
    const corner = (r, k, y) => {
        const a = Math.PI / sides + (k * 2 * Math.PI) / sides
        return [r * Math.cos(a), y, r * Math.sin(a)]
    }
    // Adds one triangle, turned so its normal points along out.
    const triangle = (points, s, hw, out) => {
        const [a, b, c] = points.map((p) => new THREE.Vector3(...p))
        const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
        const order = n.dot(out) < 0 ? [0, 2, 1] : [0, 1, 2]
        order.forEach((i) => {
            position.push(...points[i])
            side.push(s[i])
            halfWidth.push(hw[i])
        })
    }
    for (let k = 0; k < sides; k++) {
        const b0 = corner(r0, k, 0)
        const b1 = corner(r0, k + 1, 0)
        const t0 = corner(r1, k, 1)
        const t1 = corner(r1, k + 1, 1)
        const a = (k * 2 * Math.PI) / sides + (2 * Math.PI) / sides
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
        triangle([b0, b1, t1], [-1, 1, 1], [r0 * half, r0 * half, r1 * half], out)
        if (taper > 0) triangle([b0, t1, t0], [-1, 1, -1], [r0 * half, r1 * half, r1 * half], out)
        if (taper > 0) triangle([[0, 1, 0], t0, t1], [0, 1, 1], [0, 0, 0], new THREE.Vector3(0, 1, 0))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
    geometry.setAttribute('aHalf', new THREE.Float32BufferAttribute(halfWidth, 1))
    geometry.computeVertexNormals()
    return geometry
}

const vertexShader = /* glsl */ `
attribute vec3 aColour;
attribute vec4 aInfo;
attribute float aSide;
attribute float aHalf;
varying vec2 vFace;
varying vec3 vScale;
varying vec3 vWorld;
varying vec3 vColour;
varying vec4 vInfo;
varying float vSide;
varying float vRoof;
varying float vShade;
void main() {
    vScale = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
    vec3 local = position * vScale;
    vRoof = step( 0.9, normal.y );
    vFace = vRoof > 0.5 ? local.xz : vec2( aSide * aHalf * mix( vScale.z, vScale.x, abs( normal.z ) ), local.y );
    vSide = aSide;
    vShade = 0.8 + 0.2 * abs( normal.x );
    vColour = aColour;
    vInfo = aInfo;
    vec4 world = modelMatrix * instanceMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// The lit windows are out-of-focus lights like the ground lights: one jittered light to a
// cell of the face, each a bokeh disc of the same screen size. The pixel tests the four cells
// nearest it, two levels of cell size blend by distance, and the level choice keeps every
// disc under half a cell. vInfo holds the lit share, the kind (0 building, 1 light, 2 frame),
// a seed, and 1 on a top part, which carries the crown band.
const fragmentShader = /* glsl */ `
uniform float uDpr;
varying vec2 vFace;
varying vec3 vScale;
varying vec3 vWorld;
varying vec3 vColour;
varying vec4 vInfo;
varying float vSide;
varying float vRoof;
varying float vShade;
${HAZE_GLSL}
${NOISE_GLSL}

mat2 toPx;
float discPx;

float windows( vec2 f, float s, float seed, float lit ) {
    float sum = 0.0;
    vec2 c = floor( f / s - 0.5 );
    for ( int j = 0; j <= 1; j ++ ) {
        for ( int i = 0; i <= 1; i ++ ) {
            vec2 id = c + vec2( float( i ), float( j ) );
            float k = hash12( id + seed + 3.3 );
            if ( k > lit ) continue;
            vec2 q = ( id + hash22( id + seed ) ) * s;
            float d = length( toPx * ( q - f ) );
            if ( d >= discPx + 0.8 ) continue;
            sum += smoothstep( discPx + 0.8, discPx - 0.8, d ) * ( 0.5 + fract( k * 7.1 ) );
        }
    }
    return sum;
}

void main() {
    vec3 body = vec3( 0.014, 0.016, 0.034 );
    float lit = vInfo.x;
    float kind = vInfo.y;
    float seed = vInfo.z * 97.0;
    bool top = vInfo.w > 0.5;
    float dist = distance( vWorld, cameraPosition );
    discPx = uDpr * mix( ${BOKEH[0].toFixed(2)}, ${BOKEH[1].toFixed(2)}, smoothstep( 900.0, 3000.0, dist ) );
    vec2 f = vFace;
    vec2 dx = dFdx( f );
    vec2 dy = dFdy( f );
    float det = dx.x * dy.y - dy.x * dx.y;
    toPx = mat2( dy.y, -dx.y, -dy.x, dx.x ) / ( abs( det ) < 1e-6 ? 1e-6 : det );
    float blur = discPx * max( length( dx ), length( dy ) );
    // The distance to the nearest face edge in pixels, from aSide.
    float edgePx = ( 1.0 - ( vRoof > 0.5 ? vSide : abs( vSide ) ) ) / max( fwidth( vSide ), 1e-4 );
    float alpha = smoothstep( 0.0, 0.8 * discPx, edgePx );
    vec3 col;
    if ( kind > 0.5 && kind < 1.5 ) {
        col = vColour * 1.15;
    } else if ( vRoof > 0.5 ) {
        float glow = 1.0 - smoothstep( 0.0, 1.0, vSide );
        col = body * 1.3 + vColour * ( 0.15 + 1.1 * glow ) * ( top || kind > 1.5 ? 1.0 : 0.35 );
    } else {
        float reach = ( discPx + 0.8 ) * length( vec2( length( dx ), length( dy ) ) );
        float level = max( log2( 2.05 * reach / 4.0 ), 0.0 );
        float k = floor( level );
        float s1 = 4.0 * exp2( k );
        float gain = 1.0 / ( 3.1416 * discPx * discPx * abs( det ) + 1e-6 );
        float lights = mix( windows( f, s1, seed + k * 13.1, lit ) * s1 * s1, windows( f, 2.0 * s1, seed + k * 13.1 + 13.1, lit ) * 4.0 * s1 * s1, level - k ) * gain;
        if ( kind > 1.5 ) {
            col = body + vColour * ( 0.55 + 1.5 * lights );
        } else {
            vec3 glass = mix( vec3( 1.0, 0.74, 0.46 ), vec3( 0.78, 0.84, 1.0 ), step( 0.72, fract( seed * 0.37 ) ) );
            float h = vScale.y;
            float crown = top ? smoothstep( h - 0.1 * h - 3.0 - blur, h - 1.0, f.y ) : 0.0;
            col = body + glass * lights * 0.55 + vColour * crown * 0.9;
            if ( top ) alpha *= smoothstep( 0.0, blur, h - f.y );
        }
        col *= vShade;
    }
    vec3 view = normalize( vWorld - cameraPosition );
    col = mix( col, hazeAt( view ), ${CITY_HAZE.toFixed(2)} );
    gl_FragColor = vec4( applyHaze( col, vWorld ), alpha );
}
`

export function createCityTowers({ hazeUniforms, look, dpr }) {
    const parts = planSkyline(look)
    const material = new THREE.ShaderMaterial({
        name: 'city.towers',
        uniforms: { ...hazeUniforms, uDpr: dpr },
        vertexShader,
        fragmentShader,
        transparent: true,
    })
    const group = new THREE.Group()
    group.name = 'CityTowers'
    const geometries = []
    const matrix = new THREE.Matrix4()
    const turn = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (const [name, { sides, taper }] of Object.entries(SHAPES)) {
        const list = parts.filter((p) => p.shape === name)
        if (list.length === 0) continue
        const geometry = prism(sides, taper)
        geometries.push(geometry)
        const colours = new Float32Array(list.length * 3)
        const info = new Float32Array(list.length * 4)
        list.forEach((p, i) => {
            colours.set(p.colour, i * 3)
            info.set([p.lit, p.kind, p.seed, p.top ? 1 : 0], i * 4)
        })
        geometry.setAttribute('aColour', new THREE.InstancedBufferAttribute(colours, 3))
        geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4))
        const mesh = new THREE.InstancedMesh(geometry, material, list.length)
        list.forEach((p, i) => {
            turn.setFromAxisAngle(up, p.turn)
            matrix.compose(new THREE.Vector3(p.x, GROUND + p.y, p.z), turn, new THREE.Vector3(p.w, p.h, p.d))
            mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        mesh.renderOrder = -7.5
        mesh.name = `CityTowers_${name}`
        group.add(mesh)
    }
    const dispose = () => {
        geometries.forEach((g) => g.dispose())
        material.dispose()
    }
    return { mesh: group, dispose }
}
