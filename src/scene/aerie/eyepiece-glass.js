import * as THREE from 'three'

// The eye lens of the telescope. In the model it is a flat disc of the warm screen material,
// so the look through the telescope ended on a plain brown circle under the iris. This disc
// sits on the eye lens and draws coated glass with the eyepiece behind it: a dark barrel with
// baffle rings, a six-blade field stop, and the night sky through the stop. The barrel and
// the stop are a ray cast against a cylinder and a plane in the lens frame, so they shift
// with the camera like real depth. The stop has six blades, like the iris in grade-pass.js,
// so the iris reads as the stop of the telescope closing.
// The eye lens and the optical axis come from round21_telescope.py (its report: eye lens
// [-7.5688, 8.3739, -3.7655], axis [-0.1, 0.5001, -0.8602]), the same values as the
// eyepiece stop in src/data/stops.js. The model lens has a radius of 0.022 m.
// The disc is a square a little wider than the lens, cut round in the shader. CircleGeometry
// would add its class to the three chunk, which counts against the scene budget. The rubber
// eyecup around the lens hides the cut edge, so the edge the eye sees is the model.

const EYE = new THREE.Vector3(-7.5688, 8.3739, -3.7655)
const AXIS = new THREE.Vector3(-0.1, 0.5001, -0.8602).normalize()
const RADIUS = 0.022
const SIZE = 0.046
// The disc sits this far in front of the model lens, so the two never fight for depth.
const LIFT = 0.0006

const vertexShader = /* glsl */ `
varying vec2 vP;
void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

// Lengths are metres in the lens frame: +z points out of the lens toward the eye, so the
// inside of the eyepiece is -z. uEye is the camera in that frame.
const fragmentShader = /* glsl */ `
uniform vec3 uEye;
varying vec2 vP;
const float BARREL = 0.0212;
const float DEPTH = 0.045;
const float STOP = 0.0105;
const float LENS = ${RADIUS};
float hash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
vec2 dir( float a ) {
    return vec2( cos( a ), sin( a ) );
}
// The sky through the stop, magnified. Each star sits in its own cell and fades to zero
// well inside it.
vec3 sky( vec3 d ) {
    vec2 q = d.xy / -d.z * 90.0;
    vec3 c = vec3( 0.008, 0.012, 0.045 ) + vec3( 0.03, 0.03, 0.08 ) * exp( -dot( q, q ) * 0.03 );
    vec2 cell = floor( q );
    vec2 f = fract( q ) - 0.5 - ( vec2( hash( cell ), hash( cell + 3.1 ) ) - 0.5 ) * 0.5;
    float seed = hash( cell + 7.3 );
    float star = step( 0.5, seed ) * exp( -dot( f, f ) * 70.0 ) * ( 0.6 + 3.0 * pow( seed, 6.0 ) );
    return c + star * mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.85, 0.65 ), hash( cell + 9.1 ) );
}
// The six stop blades, stacked like the iris blades in grade-pass.js. -1 inside the opening.
float blade( vec2 q, out float edge, out float under ) {
    edge = 1.0;
    under = 1.0;
    float found = -1.0;
    for ( int i = 0; i < 6; i ++ ) {
        float a = float( i ) * 1.0472 + 0.35;
        float s = dot( q, dir( a ) ) - STOP;
        float next = dot( q, dir( a + 1.0472 ) ) - STOP;
        if ( s > 0.0 && next <= 0.0 ) {
            found = float( i );
            edge = s;
            under = -next;
        }
    }
    return found;
}
void main() {
    if ( length( vP ) > LENS * 1.04 ) discard;
    vec3 p = vec3( vP, 0.0 );
    vec3 d = normalize( p - uEye );
    d.z = min( d.z, -1e-4 );
    // The barrel wall: |p.xy + t d.xy| = BARREL. The plane of the stop: z = -DEPTH.
    float a = max( dot( d.xy, d.xy ), 1e-8 );
    float b = dot( p.xy, d.xy );
    float c = dot( p.xy, p.xy ) - BARREL * BARREL;
    float wall = ( -b + sqrt( max( b * b - a * c, 0.0 ) ) ) / a;
    float plane = DEPTH / -d.z;
    vec3 color;
    if ( plane < wall ) {
        vec2 q = p.xy + plane * d.xy;
        float edge, under;
        float i = blade( q, edge, under );
        if ( i < 0.0 ) {
            color = sky( d );
        } else {
            // Graphite blades, the blade under each seam in a soft shadow, and a thin rim
            // where the sky light catches the inner edge.
            color = vec3( 0.016, 0.015, 0.02 ) * ( 0.8 + 0.25 * mod( i, 2.0 ) ) * ( 0.45 + 0.55 * smoothstep( 0.0, 0.0012, under ) );
            color += vec3( 0.1, 0.12, 0.22 ) * ( 1.0 - smoothstep( 0.0, 0.00035, edge ) );
        }
    } else {
        // The barrel: matte black baffle rings that fade into the dark, and pick up a little
        // blue from the sky near the stop.
        float z = wall * -d.z;
        float ring = smoothstep( 0.3, 0.5, abs( fract( z / 0.006 ) - 0.5 ) );
        color = vec3( 0.014, 0.012, 0.014 ) * ( 0.6 + 1.6 * ring ) * exp( -z * 30.0 );
        color += vec3( 0.012, 0.016, 0.04 ) * ring * smoothstep( DEPTH * 0.3, DEPTH, z );
    }
    // The glass: a violet coating that grows toward the rim, a soft window reflection up and
    // to the left that slides a little with the view, a warm glint of the terrace lantern
    // low on the right, and a lit rim along the top edge.
    vec2 u = vP / LENS;
    float r = length( u );
    vec2 slide = uEye.xy / max( uEye.z, 0.05 ) * 0.25;
    vec2 h = u - vec2( -0.34, 0.4 ) + slide;
    vec2 g = u - vec2( 0.42, -0.36 ) + slide;
    color += vec3( 0.02, 0.008, 0.03 ) * r * r;
    color += vec3( 0.75, 0.82, 1.0 ) * exp( -dot( h * vec2( 1.0, 1.8 ), h * vec2( 1.0, 1.8 ) ) * 40.0 ) * 0.55;
    color += vec3( 1.0, 0.6, 0.3 ) * exp( -dot( g, g ) * 220.0 ) * 0.35;
    color += vec3( 0.6, 0.65, 0.8 ) * smoothstep( 0.8, 0.97, r ) * ( 1.0 - smoothstep( 0.97, 1.0, r ) ) * max( dot( u / max( r, 1e-4 ), vec2( -0.6, 0.8 ) ), 0.0 ) * 0.35;
    gl_FragColor = vec4( color, 1.0 );
}
`

// Returns the disc. It adds itself to `parent`, in the glTF frame of the island.
export function eyepieceGlass(parent) {
    const uniforms = { uEye: { value: new THREE.Vector3() } }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.ShaderMaterial({ name: 'scope.glass', uniforms, vertexShader, fragmentShader }))
    mesh.name = 'EyepieceGlass'
    mesh.position.copy(EYE).addScaledVector(AXIS, -LIFT)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), AXIS.clone().negate())
    mesh.onBeforeRender = (renderer, scene, camera) => {
        mesh.worldToLocal(uniforms.uEye.value.setFromMatrixPosition(camera.matrixWorld))
    }
    parent.add(mesh)
    return mesh
}
