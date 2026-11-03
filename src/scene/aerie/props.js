import * as THREE from 'three'
import { PROPS } from '../../data/props.js'

// The props on the home walk that open a page (src/data/props.js). This chunk loads after the
// aerie, so the scene chunk stays in its budget. It draws two layers over each prop, and only
// while they show:
//
// - The rim: a warm outline just outside the prop's silhouette. It is the prop pushed out
//   along its smooth normals by a few screen pixels and a little further from the camera, so
//   the prop hides its middle and only the band outside the edge shows. The ink pass still
//   draws its dark line on the edge, so the rim reads as warm light round the ink.
// - The lift: warm light added on the prop's own faces, strongest where they turn away from
//   the camera, and the glint, a faint band of that light that passes up the prop once.
//
// A prop glints once soon after the camera reaches its stop, then every so often while the
// visitor stays. Reduced motion has no glint and shows a faint steady rim instead.
//
// Neither layer changes the alpha of the scene target, which the ink pass reads as its mask.

// The values are a mutable object, so the owner can tune them live from the dev console.
export const PROP_LOOK = {
    // The width of the rim in CSS pixels.
    width: 1.6,
    // The warm brass of both layers, in linear light.
    color: [1.0, 0.62, 0.26],
    // The rim strength on hover.
    rim: 0.95,
    // The lift on hover: flat, and at the edges.
    lift: 0.04,
    edge: 0.2,
    // The glint: its strength, its length in seconds, the first one after the camera arrives,
    // and the time between the rest.
    glint: 0.26,
    // The rim that the glint brings up with it, so the outline of the prop shows for a moment.
    glintRim: 0.3,
    glintFor: 1.6,
    glintFirst: 1.2,
    glintEvery: 9,
    // The steady rim under reduced motion.
    still: 0.22,
    // The ease of the hover in seconds.
    ease: 0.12,
}

// The rim sits this share of its distance further from the camera than the prop. At 2.5 m from
// the board that is 1 cm, well under the 7 cm between the board and the wall behind it.
const RIM_PUSH = 0.004
// The quantum, in metres, that joins the corners of the faces for the smooth rim normals.
const WELD = 0.002

const rimVertex = /* glsl */ `
attribute vec3 aRim;
uniform vec2 uSize;
uniform float uWidth;
void main() {
    vec4 view = modelViewMatrix * vec4( position, 1.0 );
    view.xyz *= 1.0 + ${RIM_PUSH};
    vec4 clip = projectionMatrix * view;
    vec2 dir = ( projectionMatrix * vec4( normalize( normalMatrix * aRim ), 0.0 ) ).xy;
    float len = length( dir );
    clip.xy += ( len > 1e-5 ? dir / len : vec2( 0.0 ) ) * uWidth * 2.0 / uSize * clip.w;
    gl_Position = clip;
}
`

const rimFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOn;
void main() {
    gl_FragColor = vec4( uColor * uOn, min( 1.0, uOn ) );
}
`

const liftVertex = /* glsl */ `
uniform vec2 uSpan;
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
void main() {
    vec4 view = modelViewMatrix * vec4( position, 1.0 );
    vNormal = normalMatrix * normal;
    vView = -view.xyz;
    vHeight = ( position.y - uSpan.x ) / uSpan.y;
    gl_Position = projectionMatrix * view;
}
`

const liftFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOn;
uniform float uLift;
uniform float uEdge;
uniform float uGlint;
uniform float uSweep;
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
void main() {
    float edge = pow( 1.0 - abs( dot( normalize( vNormal ), normalize( vView ) ) ), 3.0 );
    float band = exp( -pow( ( vHeight - uSweep ) * 5.0, 2.0 ) );
    float light = uOn * ( uLift + uEdge * edge ) + uGlint * band * ( 0.6 + 0.4 * edge );
    gl_FragColor = vec4( uColor * light, 0.0 );
}
`

// Both layers add colour and keep the alpha of the scene target as it is.
const keepAlpha = (material, dst) =>
    Object.assign(material, {
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: dst,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        depthWrite: false,
        fog: false,
    })

const boxOf = (pair) => (pair ? new THREE.Box3(new THREE.Vector3(...pair[0]), new THREE.Vector3(...pair[1])) : null)

// Copies the triangles of `meshes` that `keep` accepts into one geometry in world space, with
// flat normals for the lift and smooth normals (aRim) for the rim. A prop that sits apart from
// its neighbours in a joined mesh comes out on its own this way.
function bake(meshes, keep) {
    const positions = []
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const centre = new THREE.Vector3()
    for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false)
        const { position } = mesh.geometry.attributes
        const index = mesh.geometry.index
        const count = index ? index.count : position.count
        const at = (i) => (index ? index.getX(i) : i)
        for (let i = 0; i + 2 < count; i += 3) {
            a.fromBufferAttribute(position, at(i)).applyMatrix4(mesh.matrixWorld)
            b.fromBufferAttribute(position, at(i + 1)).applyMatrix4(mesh.matrixWorld)
            c.fromBufferAttribute(position, at(i + 2)).applyMatrix4(mesh.matrixWorld)
            centre.copy(a).add(b).add(c).divideScalar(3)
            if (keep(centre)) positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        }
    }
    if (!positions.length) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    // The smooth normal of a corner is the sum of the area weighted normals of the faces that
    // meet there. A flat normal would split the rim at every corner of a low-poly prop.
    const sums = new Map()
    const keys = []
    const face = new THREE.Vector3()
    for (let i = 0; i < positions.length; i += 9) {
        a.fromArray(positions, i)
        b.fromArray(positions, i + 3)
        c.fromArray(positions, i + 6)
        face.subVectors(c, b).cross(a.clone().sub(b))
        for (let k = 0; k < 9; k += 3) {
            const key = `${Math.round(positions[i + k] / WELD)},${Math.round(positions[i + k + 1] / WELD)},${Math.round(positions[i + k + 2] / WELD)}`
            if (!sums.has(key)) sums.set(key, new THREE.Vector3())
            sums.get(key).add(face)
            keys.push(key)
        }
    }
    const rim = new Float32Array(positions.length)
    keys.forEach((key, i) => sums.get(key).clone().normalize().toArray(rim, i * 3))
    geometry.setAttribute('aRim', new THREE.BufferAttribute(rim, 3))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
}

// The opaque meshes of a part of the scene manager: its flames and glows stay out.
const solidMeshes = (group) => {
    const meshes = []
    group?.traverse((node) => node.isMesh && !node.material.transparent && meshes.push(node))
    return meshes
}

// manager: the scene manager. root: the aerie GLB scene. reduced: a function that returns true
// under reduced motion. Returns the hit test, the mark, the label point and dispose.
export function createProps(manager, root, reduced) {
    const { scene, camera, rig, parts } = manager
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight)
    const color = new THREE.Color()
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const list = PROPS.map((def) => ({ def, geometry: undefined, rim: null, lift: null, on: 0, aim: 0, liveAt: null, settled: false }))
    let last = performance.now()
    let marked = null
    let onLive = null
    let enabled = false

    const build = (prop) => {
        const { def } = prop
        if (def.part) {
            // The room copy of the board joins the scene only once the wall has built.
            if (!parts[def.part]) return null
            prop.geometry = bake(solidMeshes(parts[def.part].group), () => true)
        } else {
            const box = boxOf(def.box)
            const cut = boxOf(def.cut)
            const meshes = []
            root.traverse((node) => node.isMesh && def.meshes.test(node.name) && meshes.push(node))
            prop.geometry = bake(meshes, (p) => box.containsPoint(p) && !cut?.containsPoint(p))
        }
        const geometry = prop.geometry
        if (!geometry) return null
        const { min, max } = geometry.boundingBox
        prop.rim = new THREE.Mesh(
            geometry,
            keepAlpha(new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Vector3() }, uOn: { value: 0 }, uSize: { value: size }, uWidth: { value: 2 } }, vertexShader: rimVertex, fragmentShader: rimFragment, side: THREE.DoubleSide }), THREE.OneMinusSrcAlphaFactor),
        )
        prop.lift = new THREE.Mesh(
            geometry,
            keepAlpha(
                new THREE.ShaderMaterial({
                    uniforms: { uColor: { value: new THREE.Vector3() }, uOn: { value: 0 }, uLift: { value: 0 }, uEdge: { value: 0 }, uGlint: { value: 0 }, uSweep: { value: -1 }, uSpan: { value: new THREE.Vector2(min.y, Math.max(0.01, max.y - min.y)) } },
                    vertexShader: liftVertex,
                    fragmentShader: liftFragment,
                    depthFunc: THREE.LessEqualDepth,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -4,
                }),
                THREE.OneFactor,
            ),
        )
        prop.rim.name = `PropRim_${def.id}`
        prop.lift.name = `PropLift_${def.id}`
        // The rim draws behind the scene's opaque layers, the lift after them.
        prop.rim.renderOrder = 1
        prop.lift.renderOrder = 2
        prop.rim.frustumCulled = prop.lift.frustumCulled = false
        prop.rim.visible = prop.lift.visible = false
        scene.add(prop.rim, prop.lift)
        // The two programs compile now, off the first hover. compileAsync skips hidden objects.
        prop.rim.visible = prop.lift.visible = true
        manager.renderer.compileAsync(prop.rim, camera, scene).catch(() => {})
        manager.renderer.compileAsync(prop.lift, camera, scene).catch(() => {})
        prop.rim.visible = prop.lift.visible = false
        return geometry
    }
    // A prop builds on its first use. A part that has not joined the scene yet stays unbuilt.
    const ready = (prop) => (prop.geometry === undefined ? build(prop) : prop.geometry)

    // rig.moving is also true while the camera drifts after the pointer, so a prop is live once
    // the flight between stops has all but ended.
    // The shell turns the props on only on Home past the gate, so a prop never glints behind a
    // text page or inside the About room.
    const live = (prop) => enabled && manager.view === 'island' && rig.travel < 0.02 && rig.current === prop.def.stop

    // Steps the hover ease and the glint once a frame, from the scene's own render.
    const step = () => {
        const now = performance.now()
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        const still = reduced()
        let easing = false
        let arrived = false
        color.setRGB(...PROP_LOOK.color)
        for (const prop of list) {
            const on = live(prop)
            // A prop that is not built yet, such as the board before the wall is in, builds
            // after this render, not inside it.
            if (!prop.rim) {
                if (on) setTimeout(() => ready(prop))
                continue
            }
            if (on && prop.liveAt === null) prop.liveAt = now
            // The flight has fully ended once its travel reads 0, a few frames after the prop
            // turned live. A hit test before then misses by the last few pixels of the move.
            if (on && !prop.settled && rig.travel === 0) {
                prop.settled = true
                arrived = true
            }
            if (!on) {
                prop.liveAt = null
                prop.settled = false
            }
            prop.aim = on && marked === prop.def.id ? 1 : 0
            prop.on = still ? prop.aim : prop.on + (prop.aim - prop.on) * (1 - Math.exp(-dt / PROP_LOOK.ease))
            if (Math.abs(prop.aim - prop.on) > 0.002) easing = true
            else prop.on = prop.aim
            // The glint runs from glintFirst after the arrival, then every glintEvery seconds.
            const since = prop.liveAt === null || still ? -1 : (now - prop.liveAt) / 1000 - PROP_LOOK.glintFirst
            const phase = since < 0 ? -1 : (since % PROP_LOOK.glintEvery) / PROP_LOOK.glintFor
            const glint = phase >= 0 && phase <= 1 ? Math.sin(phase * Math.PI) : 0
            const rim = Math.max(PROP_LOOK.rim * prop.on, PROP_LOOK.glintRim * glint, still && on ? PROP_LOOK.still : 0)
            const lift = prop.lift.material.uniforms
            lift.uColor.value.set(color.r, color.g, color.b)
            lift.uOn.value = prop.on
            lift.uLift.value = PROP_LOOK.lift
            lift.uEdge.value = PROP_LOOK.edge
            lift.uGlint.value = PROP_LOOK.glint * glint
            // The band starts under the prop and ends over it.
            lift.uSweep.value = phase * 1.6 - 0.3
            const outline = prop.rim.material.uniforms
            outline.uColor.value.set(color.r, color.g, color.b)
            outline.uOn.value = rim
            outline.uWidth.value = PROP_LOOK.width
            prop.rim.visible = rim > 0.002
            prop.lift.visible = prop.on > 0.002 || glint > 0
        }
        size.set(window.innerWidth, window.innerHeight)
        // The hover ease needs frames of its own where the scene draws on demand.
        if (easing) requestAnimationFrame(() => manager.requestRender())
        // A pointer that came to rest during the flight finds the prop once it is live.
        if (arrived) setTimeout(() => onLive?.())
    }
    const previous = scene.onBeforeRender
    scene.onBeforeRender = (...args) => {
        previous.apply(scene, args)
        step()
    }
    // The board joins later, so a later frame builds it.
    list.forEach(ready)

    // The live prop under a client point, or null.
    const hitPoint = new THREE.Vector3()
    const distanceTo = (prop) => {
        if (prop.def.pick === 'box') return raycaster.ray.intersectBox(prop.geometry.boundingBox, hitPoint) ? hitPoint.distanceTo(raycaster.ray.origin) : Infinity
        return raycaster.intersectObject(prop.lift, false)[0]?.distance ?? Infinity
    }
    const at = (x, y) => {
        const targets = list.filter((prop) => live(prop) && ready(prop))
        if (!targets.length) return null
        pointer.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2)
        raycaster.setFromCamera(pointer, camera)
        let best = null
        let nearest = Infinity
        for (const prop of targets) {
            const distance = distanceTo(prop)
            if (distance < nearest) [best, nearest] = [prop, distance]
        }
        return best?.def.id ?? null
    }

    // Lights one prop as hovered, or none.
    const mark = (id) => {
        if (id === marked) return
        marked = id
        manager.requestRender()
    }

    // The client point just over the top of a prop, for its label, or null while it is not live.
    const point = new THREE.Vector3()
    const screenOf = (id) => {
        const prop = list.find((p) => p.def.id === id)
        if (!prop || !live(prop) || !ready(prop)) return null
        const { min, max } = prop.geometry.boundingBox
        point.set((min.x + max.x) / 2, max.y, (min.z + max.z) / 2).project(camera)
        if (point.z > 1) return null
        return { x: ((point.x + 1) / 2) * window.innerWidth, y: ((1 - point.y) / 2) * window.innerHeight }
    }

    const dispose = () => {
        scene.onBeforeRender = previous
        for (const prop of list) {
            if (!prop.rim) continue
            scene.remove(prop.rim, prop.lift)
            prop.rim.material.dispose()
            prop.lift.material.dispose()
            prop.geometry.dispose()
        }
    }

    // Handy in the console while tuning the look. Not in the build.
    if (import.meta.env.DEV) window.__props = { list, PROP_LOOK, at, mark }
    return {
        at,
        mark,
        screenOf,
        // on: true while the visitor is on Home, past the gate and not looking around.
        enable: (on) => {
            enabled = on
            manager.requestRender()
        },
        // callback runs once each time the camera comes to rest at the stop of a prop.
        onLive: (callback) => (onLive = callback),
        dispose,
    }
}
