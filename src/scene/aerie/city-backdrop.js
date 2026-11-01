import * as THREE from 'three'
import manifest from '../../assets/city/city_layers.json'
import farUrl from '../../assets/city/city_far.webp?url'
import midUrl from '../../assets/city/city_mid.webp?url'
import nearUrl from '../../assets/city/city_near.webp?url'
import { HAZE_AT, hazeUniforms as skyHaze } from './sky.js'

// The city below the island, faked with no city geometry. Three painted layers lie on
// planes under the island: far, mid and near. Each is a pre-blurred top-down render from
// `export_island_b.py --city-layers`, and each farther layer has more blur. The planes sit
// at different heights, so the layers shift against each other as the camera moves.

const URLS = { far: farUrl, mid: midUrl, near: nearUrl }

// Radial fade per layer, as a fraction of the half size. A nearer layer fades out where
// the next layer down takes over, so the blur grows with distance from the island.
const FADE = { far: [0.55, 1.0], mid: [0.5, 0.96], near: [0.42, 0.94] }
const BRIGHTNESS = { far: 2.0, mid: 1.6, near: 1.2 }
// A mip bias per layer that softens the painted window lights. Without it the lights of the
// near layer read as a coarse grid of bright dots under the island.
const SOFTEN = { far: 1.0, mid: 1.6, near: 2.2 }
// A blur radius per layer, in UV. A mip bias alone left the block grid of the city and the
// edge of the river as a coarse mosaic of squares and a dark diagonal band. Up to thirteen
// taps over a disc blend each pixel with its neighbours over a few blocks, so the city reads as
// soft haze with warm points of light.
// Round 6 widens the mid and near blur, because the near window lights still read as dirty
// speckle under the island on a phone (S5 phone).
const BLUR = { far: 0.003, mid: 0.0085, near: 0.0105 }
// Spiral taps per layer. The far layer is already soft and sits in thick haze, so it takes
// few taps. The three layers overlap over most of the screen, so the count sets the cost.
const TAPS = { far: 4, mid: 8, near: 12 }
// Window twinkle on the near layer: about one cell per building block. The twinkle
// eases between cells, so the cells never show as a grid.
const TWINKLE_CELLS = 170
// The painted city sits on a regular block grid, so its blurred window lights read as even
// rows of soft dots, like a blurred LED panel. Each layer bends its UV by a smooth noise of
// up to half of WARP (in UV) either way, at about two blocks a cycle, which moves the
// lights off their rows by up to one block.
// A slow patch field then makes some districts brighter than others, and a haze field
// veils whole districts toward the layer mean.
const WARP = { far: 0.006, mid: 0.011, near: 0.014 }
// How far each layer melts into its own mean, from 0 (the painted city) to 1 (flat haze).
// Round 10 veils the painted lights further. Their blurred blocks read as orange smears in S5
// and S6, and the fine shimmer below now carries the street lights.
// Round 16 veils the mid and near layers almost fully. Their blurred districts read as large
// dark and light cloud blobs under the island in S6 and S7.
const VEIL = { far: 0.9, mid: 0.97, near: 0.98 }
// How far every layer mixes into the haze colour.
const CITY_HAZE = 0.8

// Round 10 drops the two mist veils. From the phone overview they drew a large purple smear at
// the lower left, and the haze along the view (sky.js hazeAt) already veils the city.

const layerVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Shared haze: a distance fog toward the horizon colour. The sky dome uses the same colour
// below the horizon, so the far edge of the city melts into it.
// Round 9 reads the haze along the view direction (sky.js HAZE_AT), so the city fades into the
// same mauve to plum gradient as the sky dome, not into one flat colour.
const HAZE_GLSL = /* glsl */ `
${HAZE_AT}
uniform float uHazeDensity;
vec3 applyHaze( vec3 color, vec3 world ) {
    vec3 toward = world - cameraPosition;
    float d = length( toward ) * uHazeDensity;
    return mix( color, hazeAt( toward / max( length( toward ), 1e-3 ) ), 1.0 - exp( -d * d ) );
}
`
// Warm city shimmer per layer: soft scattered points of street light, one jittered point to
// a SHIMMER_CELL metre cell in about half the cells, in districts from a slow noise. Each point
// is a soft round falloff of a few metres, so the shimmer never reads as blocks or a grid. The
// review read the round 8 space under the island as one flat purple with no city in it.
// Round 13 halves the points and doubles the soft district glow, so the review no longer reads
// a uniform orange dot speckle below the island, only a faint shimmer.
// Round 14 lifts the mid layer and lights the far layer, so the lower third of the overview
// (S6) shows a faint warm shimmer and not an empty dark violet. The points get brighter and the
// soft district glow a little stronger, so the lights read as scattered points in the haze.
// Round 16 halves the points again and spreads the lit cells evenly, so the shimmer reads as a
// faint even warm glow with sparse points, not as a uniform dot field or warm blobs.
// Round 17 lifts the points about two and a half times and the soft glow a little, because the
// review read the lower third of S6 as plain purple haze with no city in it.
const SHIMMER = { far: 0.55, mid: 0.65, near: 0.4 }
// Round 10 shrinks the cell from 22 m to 7 m and each point to about a metre, and evens out
// the districts, so the shimmer reads as a fine even scatter of tiny warm points. The round 9
// points spread about 10 m each and gathered in blotchy clusters.
// Round 11 turns the even glitter into soft out-of-focus clusters: a 16 m cell, each point a
// wide soft blur, lit cells gathered in districts from a 300 m noise, and a faint warm glow
// over the lit districts. The fine even scatter read as orange glitter dots in S6.
// Round 12 goes back to small crisp points, sparser than round 10: an 8 m cell, a lit point in
// about a third of the cells, each point about a metre across and never under one pixel. The
// round 11 blur read as smeared orange dabs below the island in S6 and S9.
const SHIMMER_CELL = 8

const layerFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uGain;
uniform float uBrightness;
uniform vec2 uFade;
uniform float uTwinkle;
uniform float uSoften;
uniform float uBlur;
uniform float uTaps;
uniform float uWarp;
uniform float uVeil;
uniform float uTime;
uniform float uShimmer;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}

vec3 decode( vec2 uv, float bias ) {
    vec3 encoded = min( texture2D( uMap, uv, bias ).rgb, vec3( 0.996 ) );
    return -log( 1.0 - encoded );
}

float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

float cityNoise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

void main() {
    // The bent UV moves each window light off its block row (see WARP).
    vec2 uv = vUv + ( vec2( cityNoise( vUv * 85.0 ), cityNoise( vUv * 85.0 + 17.3 ) ) - 0.5 ) * uWarp;
    // A centre tap and up to twelve taps on a golden-angle spiral that fills a disc, decoded
    // before the blend, so each window light spreads into a soft round glow. Taps on a
    // single ring drew every light as a ring of dots when the camera came close.
    vec3 sum = decode( uv, uSoften ) * 2.0;
    for ( int i = 0; i < 12; i ++ ) {
        if ( float( i ) >= uTaps ) break;
        float a = float( i ) * 2.3999632;
        float r = sqrt( ( float( i ) + 0.5 ) / uTaps );
        sum += decode( uv + vec2( cos( a ), sin( a ) ) * r * uBlur, uSoften );
    }
    // The smallest mip holds the mean of the whole layer. It fills the dark gaps, such as
    // the river through the mid layer, so a gap reads as a slightly darker haze, not as a
    // dark band across the city.
    vec3 mean = decode( vUv, 12.0 );
    vec3 radiance = max( sum / ( uTaps + 2.0 ), mean * 0.85 );
    // Round 8 drops the district patches. Their dim districts read as dark blotches under the
    // island in S5 and S6. The city now melts most of the way into its own mean, so it reads as
    // one smooth haze with a soft trace of the street lights in it.
    radiance = mix( radiance, mean, uVeil );
    radiance = radiance / uGain * uBrightness;

    if ( uTwinkle > 0.0 ) {
        // Warm windows have far more red than blue. The night ground is the other way round.
        float window = smoothstep( 0.0, 0.06, radiance.r - radiance.b );
        vec2 cell = vUv * ${TWINKLE_CELLS.toFixed(1)};
        vec2 corner = floor( cell );
        vec2 f = smoothstep( 0.0, 1.0, fract( cell ) );
        float seed = mix( mix( hash12( corner ), hash12( corner + vec2( 1.0, 0.0 ) ), f.x ),
            mix( hash12( corner + vec2( 0.0, 1.0 ) ), hash12( corner + vec2( 1.0, 1.0 ) ), f.x ), f.y );
        float wave = 0.78 + 0.4 * sin( uTime * ( 0.5 + seed * 1.6 ) + seed * 40.0 );
        radiance *= mix( 1.0, wave, window * uTwinkle );
    }

    float r = length( vUv - 0.5 ) * 2.0;
    float alpha = 1.0 - smoothstep( uFade.x, uFade.y, r );
    // Round 8 veils the city in the warm mauve haze. The distance fog barely reaches a layer
    // 400 m down, so the blue-violet mean of the painted city set the colour of the far haze
    // (hue 262 in S6), where the review asks for a warm mauve (hue 300 to 340).
    radiance = mix( radiance, hazeAt( normalize( vWorld - cameraPosition ) ), ${CITY_HAZE.toFixed(2)} );
    if ( uShimmer > 0.0 ) {
        vec2 g = vWorld.xz / ${SHIMMER_CELL.toFixed(1)};
        vec2 c = floor( g );
        // The point radius in cells. It never drops under about one pixel, and a point blurred
        // to the pixel keeps its energy, so a far point fades and does not flicker.
        float pixel = max( fwidth( g.x ), fwidth( g.y ) );
        // Round 20 drops the districts and their cluster haze, which read as blotchy cloud patches
        // with glitter in them (S6, S6 phone). An even warm glow lies under the haze, and a sparse
        // scatter of faint points, about one cell in a hundred, fades out smoothly with distance.
        float radius = max( 0.08, pixel * 0.9 );
        float energy = 0.012 / ( radius * radius );
        float shimmer = 0.0;
        for ( int j = -1; j <= 1; j ++ ) {
            for ( int i = -1; i <= 1; i ++ ) {
                vec2 cell = c + vec2( float( i ), float( j ) );
                vec2 offset = g - cell - vec2( hash12( cell + 7.1 ), hash12( cell + 3.7 ) );
                shimmer += step( 0.985, hash12( cell ) ) * exp( -dot( offset, offset ) / ( radius * radius ) );
            }
        }
        float near = exp( -distance( vWorld, cameraPosition ) / 1400.0 );
        radiance += vec3( 1.0, 0.62, 0.32 ) * ( min( shimmer * energy, 1.0 ) * 0.7 * near + 0.1 ) * uShimmer;
    }
    gl_FragColor = vec4( applyHaze( radiance, vWorld ), alpha );
}
`

function flatPlane(size) {
    const geometry = new THREE.PlaneGeometry(size, size)
    geometry.rotateX(-Math.PI / 2)
    return geometry
}

export function createCityBackdrop({ textureLoader, haze, hazeDensity = 1 / 4200, maxAnisotropy = 1 }) {
    const group = new THREE.Group()
    group.name = 'CityBackdrop'
    const time = { value: 0 }
    const hazeUniforms = { ...skyHaze(), uHaze: { value: haze }, uHazeDensity: { value: hazeDensity } }
    const textures = []

    const load = (url, colorSpace) => {
        const texture = textureLoader.load(url)
        texture.colorSpace = colorSpace
        texture.anisotropy = maxAnisotropy
        textures.push(texture)
        return texture
    }

    manifest.layers.forEach((layer, index) => {
        const material = new THREE.ShaderMaterial({
            name: `city.${layer.name}`,
            uniforms: {
                ...hazeUniforms,
                uMap: { value: load(URLS[layer.name], THREE.SRGBColorSpace) },
                uGain: { value: layer.gain },
                uBrightness: { value: BRIGHTNESS[layer.name] },
                uFade: { value: new THREE.Vector2(...FADE[layer.name]) },
                uTwinkle: { value: layer.name === 'near' ? 1 : 0 },
                uSoften: { value: SOFTEN[layer.name] },
                uBlur: { value: BLUR[layer.name] },
                uTaps: { value: TAPS[layer.name] },
                uWarp: { value: WARP[layer.name] },
                uVeil: { value: VEIL[layer.name] },
                uShimmer: { value: SHIMMER[layer.name] ?? 0 },
                uTime: time,
            },
            vertexShader: layerVertex,
            fragmentShader: layerFragment,
            transparent: true,
            depthWrite: false,
        })
        const mesh = new THREE.Mesh(flatPlane(layer.size), material)
        mesh.position.fromArray(layer.centre)
        mesh.renderOrder = -8 + index
        mesh.name = `City_${layer.name}`
        group.add(mesh)
    })

    const update = (seconds) => {
        time.value = seconds
    }

    const dispose = () => {
        textures.forEach((texture) => texture.dispose())
        group.traverse((child) => {
            if (!child.isMesh) return
            child.geometry.dispose()
            child.material.dispose()
        })
    }

    return { group, update, dispose, bytes: manifest.total_bytes }
}
