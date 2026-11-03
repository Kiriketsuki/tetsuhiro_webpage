import { HAZE_AT } from './sky.js'

// GLSL that the city and its cloud layers share.

// The plane vertex shader. It passes the plane UV and the world position.
export const PLANE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// A distance fog toward the haze colour along the view (sky.js HAZE_AT), so the far city
// and its clouds melt into the same gradient as the sky dome.
export const HAZE_GLSL = /* glsl */ `
${HAZE_AT}
uniform float uHazeDensity;
vec3 applyHaze( vec3 color, vec3 world ) {
    vec3 toward = world - cameraPosition;
    float d = length( toward ) * uHazeDensity;
    return mix( color, hazeAt( toward / max( length( toward ), 1e-3 ) ), 1.0 - exp( -d * d ) );
}
`

// A hash and a smooth value noise in the range 0 to 1.
export const NOISE_GLSL = /* glsl */ `
float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}
float noise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`
