import * as THREE from 'three'

// The waterfall off the island rim, rebuilt here instead of exported. A low ribbon arcs out
// from the stream spill and falls to Anchor_Waterfall_Base. Streaks scroll down it, and it
// thins out into a mist cloud, so the water never lands. The city haze takes it from there.

const SEGMENTS = 14
const ACROSS = 2
const TOP_WIDTH = 1.15
const BOTTOM_WIDTH = 3.2
// How far the arc pushes out past the straight line from the top to the base, in metres.
const ARC = 1.6
const MIST_PUFFS = 26

const ribbonVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Streaks come from a smooth noise along the ribbon. The noise scrolls down over time.
const ribbonFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec3 vWorld;

float hash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float noise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
}

void main() {
    float fall = vUv.y;
    vec2 p = vec2( vUv.x * 7.0, fall * 9.0 + uTime * 1.6 );
    float streak = noise( p ) * 0.65 + noise( p * vec2( 2.0, 2.7 ) + 3.1 ) * 0.35;
    float edge = smoothstep( 0.0, 0.22, vUv.x ) * smoothstep( 1.0, 0.78, vUv.x );
    // Solid at the lip, thinning out over the lower half into mist.
    float body = 1.0 - smoothstep( 0.35, 0.95, fall );
    float alpha = edge * body * ( 0.45 + 0.55 * streak );
    vec3 color = mix( uColor, uFoam, smoothstep( 0.55, 0.9, streak ) * ( 1.0 - fall * 0.6 ) );
    gl_FragColor = vec4( color, alpha );
}
`

const mistVertex = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uScale;
uniform float uTime;
varying float vAlpha;
void main() {
    float phase = fract( uTime * ( 0.035 + aSeed * 0.03 ) + aSeed );
    vec3 p = position;
    p.y += phase * 6.0;
    p.xz += vec2( sin( aSeed * 40.0 ), cos( aSeed * 23.0 ) ) * phase * 4.0;
    vec4 view = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp( aSize * ( 0.7 + phase * 0.8 ) * uScale / -view.z, 1.0, 320.0 );
    vAlpha = sin( phase * 3.14159 );
}
`

const mistFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot( p, p );
    float puff = exp( -r2 * 3.2 ) * ( 1.0 - smoothstep( 0.75, 1.0, r2 ) );
    gl_FragColor = vec4( uColor, puff * vAlpha * uOpacity );
}
`

function ribbonGeometry(top, base) {
    const down = base.clone().sub(top)
    const out = new THREE.Vector3(down.x, 0, down.z)
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1)
    out.normalize()
    const side = new THREE.Vector3().crossVectors(out, new THREE.Vector3(0, 1, 0)).normalize()
    const positions = []
    const uvs = []
    for (let j = 0; j <= SEGMENTS; j += 1) {
        const t = j / SEGMENTS
        // The arc leaves the lip fast and then drops almost straight.
        const centre = top.clone().lerp(base, t * t).addScaledVector(out, ARC * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5))
        const width = THREE.MathUtils.lerp(TOP_WIDTH, BOTTOM_WIDTH, t)
        for (let i = 0; i <= ACROSS; i += 1) {
            const u = i / ACROSS
            const p = centre.clone().addScaledVector(side, (u - 0.5) * width)
            positions.push(p.x, p.y, p.z)
            uvs.push(u, t)
        }
    }
    const index = []
    const row = ACROSS + 1
    for (let j = 0; j < SEGMENTS; j += 1) {
        for (let i = 0; i < ACROSS; i += 1) {
            const a = j * row + i
            index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
        }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    geometry.computeBoundingSphere()
    return { geometry, out }
}

function mistGeometry(base, out) {
    const positions = new Float32Array(MIST_PUFFS * 3)
    const sizes = new Float32Array(MIST_PUFFS)
    const seeds = new Float32Array(MIST_PUFFS)
    for (let i = 0; i < MIST_PUFFS; i += 1) {
        const seed = (i * 0.61803398875) % 1
        const spread = 2 + seed * 6
        const angle = i * 2.399963
        positions[i * 3] = base.x + Math.cos(angle) * spread + out.x * 2
        positions[i * 3 + 1] = base.y + 4 - seed * 10
        positions[i * 3 + 2] = base.z + Math.sin(angle) * spread + out.z * 2
        sizes[i] = 7 + seed * 9
        seeds[i] = seed
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.computeBoundingSphere()
    return geometry
}

export function createWaterfall({ top, base, haze }) {
    const group = new THREE.Group()
    group.name = 'Waterfall'
    const time = { value: 0 }
    const { geometry, out } = ribbonGeometry(top, base)
    const ribbon = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
            name: 'aerie.waterfall',
            uniforms: {
                uTime: time,
                uColor: { value: new THREE.Color(0x3d6f9a) },
                uFoam: { value: new THREE.Color(0xa9c8e4) },
            },
            vertexShader: ribbonVertex,
            fragmentShader: ribbonFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    )
    ribbon.renderOrder = 2
    const scale = { value: 1 }
    const mist = new THREE.Points(
        mistGeometry(base, out),
        new THREE.ShaderMaterial({
            name: 'aerie.waterfall.mist',
            uniforms: { uTime: time, uScale: scale, uColor: { value: haze.clone().multiplyScalar(2.6) }, uOpacity: { value: 0.2 } },
            vertexShader: mistVertex,
            fragmentShader: mistFragment,
            transparent: true,
            depthWrite: false,
        })
    )
    mist.renderOrder = 3
    group.add(ribbon, mist)

    const update = (seconds) => {
        time.value = seconds
    }
    const resize = (bufferHeight, camera) => {
        scale.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    }
    const dispose = () => {
        group.traverse((node) => {
            node.geometry?.dispose()
            node.material?.dispose()
        })
    }
    return { group, update, resize, dispose }
}
