import * as THREE from 'three'

// A smooth walk spline through a list of points, for the story legs (camera-rig.js). It is a
// centripetal Catmull-Rom spline with an arc-length table, so a share of the leg maps to a
// share of the distance. three's CatmullRomCurve3 does the same job, but with its Curve base it adds
// about 1.5 kB gzip to the scene chunk, which sits at its 200 kB budget.

// Samples in the arc-length table for each segment between two points. Fewer samples leave a
// ripple of a few percent in the camera speed.
const SAMPLES_PER_SEGMENT = 64
// The step for the tangent, as a share of the leg.
const TANGENT_STEP = 1e-3

// The knot gap of each segment of a centripetal Catmull-Rom spline: the square root of its
// length. The uniform spline gave every segment the same gap, so a short segment beside a long
// one overshot. Out of the doorway, a 3.2 m segment beside a 24.8 m one bulged 1.5 m off the
// door axis, and the corners of short arcs looped back.
export function knotGaps(points) {
    return points.slice(1).map((point, i) => Math.max(1e-4, Math.sqrt(point.distanceTo(points[i]))))
}

// The point before the first one or after the last one, mirrored, so the end segments curve
// like the others.
const end = (a, b, target) => target.copy(a).multiplyScalar(2).sub(b)
const before = new THREE.Vector3()
const after = new THREE.Vector3()

// Writes the point at parameter p (0 to the number of segments) into target. gaps are the knot
// gaps (knotGaps). Two splines with the same gaps share their parameter point for point.
function evaluateAt(points, gaps, p, target) {
    const last = points.length - 1
    const i = Math.min(last - 1, Math.floor(p))
    const u = p - i
    const p0 = i > 0 ? points[i - 1] : end(points[0], points[1], before)
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i + 2 <= last ? points[i + 2] : end(points[last], points[last - 1], after)
    // The Barry and Goldman form, with knots t0 = 0 to t3 and t between t1 and t2.
    const t1 = gaps[Math.max(0, i - 1)]
    const t2 = t1 + gaps[i]
    const t3 = t2 + gaps[Math.min(gaps.length - 1, i + 1)]
    const t = t1 + u * gaps[i]
    const w10 = (t1 - t) / t1
    const w11 = t / t1
    const w21 = (t2 - t) / (t2 - t1)
    const w22 = (t - t1) / (t2 - t1)
    const w32 = (t3 - t) / (t3 - t2)
    const w33 = (t - t2) / (t3 - t2)
    const b1a = (t2 - t) / t2
    const b1b = t / t2
    const b2a = (t3 - t) / (t3 - t1)
    const b2b = (t - t1) / (t3 - t1)
    const a = w21 * b1a * w10
    const b = w21 * (b1a * w11 + b1b * w21) + w22 * b2a * w21
    const c = w21 * b1b * w22 + w22 * (b2a * w22 + b2b * w32)
    const d = w22 * b2b * w33
    return target.set(
        a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        a * p0.y + b * p1.y + c * p2.y + d * p3.y,
        a * p0.z + b * p1.z + c * p2.z + d * p3.z
    )
}

// The fractional index at which a rising table of running totals reaches share u of its last
// value. A table of running lengths maps a share of the distance to a sample index.
export function tableIndex(totals, u) {
    const last = totals.length - 1
    const value = THREE.MathUtils.clamp(u, 0, 1) * totals[last]
    let low = 0
    let high = last
    while (high - low > 1) {
        const middle = (low + high) >> 1
        if (totals[middle] < value) low = middle
        else high = middle
    }
    const span = totals[high] - totals[low]
    return low + (span > 0 ? (value - totals[low]) / span : 0)
}

// points: two or more THREE.Vector3. gaps: the knot gaps, by default the spline's own. A look
// spline takes the gaps of its camera spline, so the two keep one parameter.
export function createWalkCurve(points, gaps = knotGaps(points)) {
    const evaluate = (p, target) => evaluateAt(points, gaps, p, target)
    const segments = points.length - 1
    const count = segments * SAMPLES_PER_SEGMENT
    // lengths[k] is the distance along the spline at parameter k / SAMPLES_PER_SEGMENT.
    const lengths = new Float32Array(count + 1)
    const previous = points[0].clone()
    const current = new THREE.Vector3()
    for (let k = 1; k <= count; k += 1) {
        evaluate(k / SAMPLES_PER_SEGMENT, current)
        lengths[k] = lengths[k - 1] + current.distanceTo(previous)
        previous.copy(current)
    }
    const length = lengths[count]

    // The spline parameter at share u (0 to 1) of the distance along it.
    const parameterAt = (u) => tableIndex(lengths, u) / SAMPLES_PER_SEGMENT

    const behind = new THREE.Vector3()
    return {
        points,
        gaps,
        length,
        pointAt: (u, target) => evaluate(parameterAt(u), target),
        // The spline parameter at share u of the distance, and the point at a parameter. Two
        // splines with the same number of points and the same gaps share parameters point for
        // point, so a camera and its look point can run on one parameter.
        parameterAt,
        pointAtParameter: evaluate,
        // The unit direction of travel at share u.
        tangentAt: (u, target) => {
            const from = Math.max(0, u - TANGENT_STEP)
            const to = Math.min(1, u + TANGENT_STEP)
            evaluate(parameterAt(from), behind)
            return evaluate(parameterAt(to), target).sub(behind).normalize()
        },
    }
}
