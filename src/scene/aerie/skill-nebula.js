import * as THREE from 'three'

// The deep sky behind the skill constellations: a domain-warped noise nebula in three
// colours, a band of the galaxy across the view with dark dust in it, and two layers of
// fine stars, all from one shader on a dome that follows the camera. It has no texture.
// The stars come from a 3D cell grid. Each cell holds one point, and the dome only shows
// the points that lie near its surface, so their size and brightness vary for free.

const RADIUS = 9000

const vertexShader = /* glsl */ `
varying vec3 vDirection;
void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position.z = gl_Position.w;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uCloudA;
uniform vec3 uCloudB;
uniform vec3 uCloudC;
uniform vec3 uBand;
uniform float uClouds;
uniform float uGrid;
uniform vec3 uGridColor;
uniform float uTime;
varying vec3 vDirection;
float hash( vec3 p ) {
    p = fract( p * 0.3183099 + 0.1 ) * 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float noise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    vec2 e = vec2( 1.0, 0.0 );
    return mix(
        mix( mix( hash( i ), hash( i + e.xyy ), f.x ), mix( hash( i + e.yxy ), hash( i + e.xxy ), f.x ), f.y ),
        mix( mix( hash( i + e.yyx ), hash( i + e.xyx ), f.x ), mix( hash( i + e.yxx ), hash( i + e.xxx ), f.x ), f.y ),
        f.z );
}
float fbm( vec3 p ) {
    float sum = 0.0;
    float amp = 0.5;
    for ( int i = 0; i < OCTAVES; i++ ) {
        sum += amp * noise( p );
        p = p * 2.03 + 1.7;
        amp *= 0.5;
    }
    return sum;
}
// One star per grid cell, lit where the dome passes close to it.
// pixel is the size of one screen pixel on the unit dome.
float starLayer( vec3 d, float pixel, float scale, float share ) {
    vec3 p = d * scale;
    vec3 cell = floor( p );
    vec3 point = cell + 0.5 + ( vec3( hash( cell + 1.3 ), hash( cell + 2.7 ), hash( cell + 4.1 ) ) - 0.5 ) * 0.7;
    float r = length( p - point ) / ( pixel * scale );
    float lit = step( hash( cell ), share );
    float seed = hash( cell + 7.7 );
    float twinkle = 0.8 + 0.2 * sin( uTime * ( 0.7 + seed * 2.0 ) + seed * 40.0 );
    return lit * exp( -r * r * 0.9 ) * ( 0.25 + pow( seed, 4.0 ) * 2.2 ) * twinkle;
}
void main() {
    vec3 d = normalize( vDirection );
    float band = exp( -pow( dot( d, uBand ) / 0.3, 2.0 ) );
    float warp = fbm( d * 2.1 );
    float cloud = fbm( d * 3.6 + warp * 1.8 + 7.0 );
    float detail = fbm( d * 9.0 + cloud * 2.0 );
    vec3 color = uDeep * ( 0.8 + 0.4 * band );
    color += uCloudA * smoothstep( 0.3, 0.8, cloud ) * ( 0.35 + band );
    color += uCloudB * smoothstep( 0.45, 0.85, warp * 0.5 + detail * 0.6 ) * ( 0.25 + 0.75 * band );
    color += uCloudC * pow( smoothstep( 0.5, 0.95, cloud * 0.7 + detail * 0.45 ), 2.0 ) * ( 0.2 + band );
    // The clouds stay faint and grey-leaning, so the constellations carry the frame.
    color = mix( uDeep, mix( vec3( dot( color, vec3( 0.3, 0.5, 0.2 ) ) ), color, 0.6 ), uClouds );
    // Dark dust lanes cut through the bright band.
    color *= 1.0 - smoothstep( 0.52, 0.72, detail ) * band * 0.55;
    float glow = band * smoothstep( 0.35, 0.9, cloud );
    float pixel = length( fwidth( d ) );
    color += vec3( 0.75, 0.8, 1.0 ) * ( starLayer( d, pixel, 300.0, 0.015 + 0.1 * glow ) * 0.3 + starLayer( d, pixel, 110.0, 0.03 + 0.04 * band ) * 0.5 + starLayer( d, pixel, 40.0, 0.045 ) * 0.7 );
    if ( uGrid > 0.0 ) {
        // A star chart's lines of right ascension and declination, every 15 degrees.
        vec2 g = vec2( atan( d.x, -d.z ), asin( d.y ) ) * 12.0 / 3.14159;
        vec2 w = fwidth( g );
        vec2 l = 1.0 - smoothstep( vec2( 0.0 ), w * 1.2, abs( fract( g - 0.5 ) - 0.5 ) );
        color += uGridColor * max( l.x, l.y ) * uGrid;
    }
    // Dither, so the dark gradients do not band in 8 bits.
    color += ( hash( vec3( gl_FragCoord.xy, 3.0 ) ) - 0.5 ) / 255.0;
    gl_FragColor = vec4( color, 1.0 );
}
`

export function createNebula({ look, small = false, time = { value: 0 } }) {
    const color = (hex) => new THREE.Color(hex)
    const material = new THREE.ShaderMaterial({
        name: 'sky.nebula',
        defines: { OCTAVES: small ? 3 : 5 },
        uniforms: {
            uDeep: { value: color(look.deep) },
            uCloudA: { value: color(look.clouds[0]) },
            uCloudB: { value: color(look.clouds[1]) },
            uCloudC: { value: color(look.clouds[2]) },
            // The galaxy band is the great circle with this normal. It crosses the default
            // view from the lower left to the upper right.
            uBand: { value: new THREE.Vector3(0.5, -0.8, -0.34).normalize() },
            uClouds: { value: look.cloudAmount },
            uGrid: { value: look.grid },
            uGridColor: { value: color(look.gold) },
            uTime: time,
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 48, 24), material)
    mesh.name = 'Nebula'
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    mesh.onBeforeRender = (renderer, scene, camera) => {
        mesh.position.copy(camera.position)
        mesh.updateMatrixWorld()
    }
    return {
        mesh,
        dispose: () => {
            mesh.geometry.dispose()
            material.dispose()
        },
    }
}
