import * as THREE from 'three'

// Soft glow sprites for windows, lanterns and pad lights. They stand in for bloom, which
// no tier uses. All sprites are one THREE.Points draw call with additive blending.

const vertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
uniform float uScale;
uniform float uTime;
uniform float uFlicker;
varying vec3 vColor;
void main() {
    vec4 view = modelViewMatrix * vec4( position, 1.0 );
    // Pull the sprite toward the camera, so the wall behind its light does not cut it in half.
    view.xyz += normalize( -view.xyz ) * aSize * 0.6;
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp( aSize * uScale / -view.z, 1.0, 256.0 );
    float flicker = 1.0 + uFlicker * ( sin( uTime * ( 2.1 + aSeed * 3.0 ) + aSeed * 30.0 ) * 0.06
        + sin( uTime * ( 5.3 + aSeed * 4.0 ) ) * 0.03 );
    vColor = aColor * flicker;
}
`

const fragmentShader = /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot( p, p );
    float glow = exp( -r2 * 5.0 ) * ( 1.0 - smoothstep( 0.7, 1.0, r2 ) );
    gl_FragColor = vec4( vColor * uIntensity, glow );
}
`

// spots: [{ position: Vector3, color: Color, size: metres }]
export function createGlowSprites(spots, { intensity = 1, reducedMotion = false } = {}) {
    const count = spots.length
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const seeds = new Float32Array(count)
    spots.forEach((spot, i) => {
        spot.position.toArray(positions, i * 3)
        spot.color.toArray(colors, i * 3)
        sizes[i] = spot.size
        seeds[i] = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.computeBoundingSphere()

    const uniforms = {
        uScale: { value: 1 },
        uTime: { value: 0 },
        uFlicker: { value: reducedMotion ? 0 : 1 },
        uIntensity: { value: intensity },
    }
    const material = new THREE.ShaderMaterial({
        name: 'aerie.glow',
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    points.name = 'GlowSprites'
    points.renderOrder = 5

    // uScale turns a size in metres into pixels: drawing buffer height over the view height
    // at one metre from the camera.
    const resize = (bufferHeight, camera) => {
        uniforms.uScale.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    }
    const update = (seconds) => {
        uniforms.uTime.value = seconds
    }
    const dispose = () => {
        geometry.dispose()
        material.dispose()
    }
    return { points, resize, update, dispose, count }
}
