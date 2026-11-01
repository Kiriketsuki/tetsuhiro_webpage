import * as THREE from 'three'

// Night sky for the urban aerie. A gradient dome follows the camera. Below the horizon it
// is the haze colour, so the painted city fades into it. A faint warm band sits low in the
// sky over the city, as light from the streets would. The zenith is a deep blue, not black
// and not purple. The haze below is a dim warm mauve-grey, as the spec asks: the distant
// city reads as warm haze, not as a cold blue-indigo. It stays dark and grey, because a
// bright warm mauve mixed with the blue sky into a purple cast. The orange crowns stand
// out against the cool sky above the horizon.

export const NIGHT_SKY = {
    // Round 10 leans the zenith a step toward indigo. Round 13 turns the upper sky to a deep
    // indigo, because the review read the sky above the roof in S1 and S6 as plum and magenta.
    zenith: new THREE.Color(0x0f1440),
    // Round 17 lifts the horizon a step toward mauve, so the sky shows a clear soft gradient
    // from the horizon to the deep indigo zenith and never reads as one flat colour (S3, S6).
    horizon: new THREE.Color(0x342f60),
    // Round 6 lifts the haze toward the warm mauve (#4a3a4a) the review asks for in S6. At
    // #2c2630 the distance read brown-indigo.
    // Round 8 turns the haze from a violet (#46364a, hue 288) to a warm mauve (#4c3848, hue
    // 312), because the review read the far haze over the city as violet-indigo and asked for
    // hue 300 to 340. city-backdrop.js veils the city in this colour.
    // Round 13 cools it to a soft mauve (#4a3c58), so the haze under the indigo sky reads mauve, not magenta.
    // Round 17 warms it slightly toward mauve (#513d56), as the review asked for the distance.
    // Round 20 pulls the haze, the city glow and the horizon band from a pink-magenta toward a
    // warm mauve. The zenith keeps its indigo.
    haze: new THREE.Color(0x4e3f4c),
    // Round 6 turns the low city band from a brown toward a warm mauve rose, because the
    // review read the horizon band in S6 as muddy brown.
    cityGlow: new THREE.Color(0x66545c),
    // Round 9 turns the space under the horizon into a gradient (see HAZE_AT): a warm mauve band
    // at the horizon, the mauve haze below it, and a darker plum far down. The review read the
    // round 8 lower sky as one flat purple field.
    hazeBand: new THREE.Color(0x6e5c64),
    hazeDeep: new THREE.Color(0x18152e),
}

// The haze colour seen along a view direction. The sky dome, the city layers and the mist share
// it, so the city melts into the same gradient as the sky around it.
export const HAZE_AT = /* glsl */ `
uniform vec3 uHaze;
uniform vec3 uHazeBand;
uniform vec3 uHazeDeep;
// Round 10 widens the warm band from 0.07 to about 0.1 and halves its strength. The narrow band read
// as a hard horizontal mauve stripe with a top and a bottom edge in S1, S4 and S6.
float hazeGlow( float y ) {
    return exp( -pow( ( y + 0.02 ) / ( y > -0.02 ? 0.09 : 0.1 ), 2.0 ) ) * 0.4;
}
vec3 hazeAt( vec3 d ) {
    // Round 17 narrows the ramp, so the haze below the island darkens visibly toward the
    // bottom of the overview frame (S6) and does not read as one flat purple.
    vec3 base = mix( uHazeDeep, uHaze, smoothstep( -0.36, 0.0, d.y ) );
    return mix( base, uHazeBand, hazeGlow( d.y ) );
}
`
export const hazeUniforms = () => ({
    uHaze: { value: NIGHT_SKY.haze },
    uHazeBand: { value: NIGHT_SKY.hazeBand },
    uHazeDeep: { value: NIGHT_SKY.hazeDeep },
})

// The island haze: an exponential squared fog in the haze colour. At this density the far
// rim of the island, about 60 m from the overview camera, loses about a tenth of its colour.
// A thicker haze washed the warm albedo toward the haze colour and flattened the island.
// Round 6 thins it a little more, so the island in S6 keeps the saturation of its lawn and
// crowns against the lighter mauve haze.
export const ISLAND_HAZE_DENSITY = 0.0038

const RADIUS = 9000

const vertexShader = /* glsl */ `
varying vec3 vDirection;
void main() {
    vDirection = normalize( position );
    vec4 world = modelMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uCityGlow;
${HAZE_AT}
uniform vec3 uCityDirection;
varying vec3 vDirection;
void main() {
    vec3 d = normalize( vDirection );
    float up = max( d.y, 0.0 );
    // Round 10 runs the sky from the indigo zenith down to the warm mauve haze at the horizon,
    // so the haze below and the sky above meet in one colour with no edge.
    // Round 18 reaches the deep indigo within about nine degrees of the horizon. The overview
    // looks down, so the top of its frame sits only about six degrees up, and the slow round 17
    // ramp left that whole band one flat mauve (S6). The ramp now runs from warm mauve at the
    // horizon to deep indigo at the top of the S6 frame.
    vec3 sky = mix( mix( uHaze, uHorizon, smoothstep( 0.0, 0.04, up ) ), uZenith, pow( smoothstep( 0.0, 0.12, up ), 0.8 ) );
    float towardCity = max( dot( normalize( d.xz ), uCityDirection.xz ), 0.0 );
    sky = mix( sky, uCityGlow, exp( -up * 7.0 ) * ( 0.08 + 0.2 * towardCity ) );
    sky = mix( sky, uHazeBand, hazeGlow( d.y ) );
    // Below the horizon the dome blends into the haze over a few degrees.
    vec3 color = mix( hazeAt( d ), sky, smoothstep( -0.06, 0.06, d.y ) );
    gl_FragColor = vec4( color, 1.0 );
}
`

export function createSky({ cityDirection = new THREE.Vector3(0, 0, -1) } = {}) {
    const material = new THREE.ShaderMaterial({
        name: 'aerie.sky',
        uniforms: {
            uZenith: { value: NIGHT_SKY.zenith },
            uHorizon: { value: NIGHT_SKY.horizon },
            ...hazeUniforms(),
            uCityGlow: { value: NIGHT_SKY.cityGlow },
            uCityDirection: { value: cityDirection.clone().normalize() },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 32, 16), material)
    mesh.name = 'Sky'
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    // The dome follows the camera, so it never clips at the far plane.
    mesh.onBeforeRender = (renderer, scene, camera) => {
        mesh.position.copy(camera.position)
        mesh.updateMatrixWorld()
    }
    const dispose = () => {
        mesh.geometry.dispose()
        material.dispose()
    }
    return { mesh, dispose }
}
