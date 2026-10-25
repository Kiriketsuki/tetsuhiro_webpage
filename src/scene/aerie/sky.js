import * as THREE from 'three'

// Night sky for the urban aerie. A gradient dome follows the camera. Below the horizon it
// is the haze colour, so the painted city fades into it. A faint warm band sits low in the
// sky over the city, as light from the streets would.

export const NIGHT_SKY = {
    zenith: new THREE.Color(0x060d1d),
    horizon: new THREE.Color(0x1d2c47),
    haze: new THREE.Color(0x16243b),
    cityGlow: new THREE.Color(0x2c2633),
}

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
uniform vec3 uHaze;
uniform vec3 uCityGlow;
uniform vec3 uCityDirection;
varying vec3 vDirection;
void main() {
    vec3 d = normalize( vDirection );
    float up = max( d.y, 0.0 );
    vec3 sky = mix( uHorizon, uZenith, pow( up, 0.45 ) );
    float towardCity = max( dot( normalize( d.xz ), uCityDirection.xz ), 0.0 );
    sky += uCityGlow * exp( -up * 9.0 ) * ( 0.35 + 0.65 * towardCity );
    // Below the horizon the dome blends into the haze over a few degrees.
    vec3 color = mix( uHaze, sky, smoothstep( -0.06, 0.02, d.y ) );
    gl_FragColor = vec4( color, 1.0 );
}
`

export function createSky({ cityDirection = new THREE.Vector3(0, 0, -1) } = {}) {
    const material = new THREE.ShaderMaterial({
        name: 'aerie.sky',
        uniforms: {
            uZenith: { value: NIGHT_SKY.zenith },
            uHorizon: { value: NIGHT_SKY.horizon },
            uHaze: { value: NIGHT_SKY.haze },
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
