import * as THREE from 'three'

// A smooth walk spline through a list of points, for the story legs (camera-rig.js). It is
// a Catmull-Rom spline with an arc-length table, so a share of the leg maps to a share of
// the distance. three's CatmullRomCurve3 does the same job, but with its Curve base it adds
// about 1.5 kB gzip to the scene chunk, which sits at its 200 kB budget.

// Samples in the arc-length table for each segment between two points. Fewer samples leave a
// ripple of a few percent in the camera speed.
const SAMPLES_PER_SEGMENT = 64
// The step for the tangent, as a share of the leg.
const TANGENT_STEP = 1e-3

// Writes the point at parameter p (0 to the number of segments) into target.
function evaluate(points, p, target) {
    const last = points.length - 1
    const i = Math.min(last - 1, Math.floor(p))
    const t = p - i
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(last, i + 2)]
    const t2 = t * t
    const t3 = t2 * t
    // The uniform Catmull-Rom basis.
    const a = -0.5 * t3 + t2 - 0.5 * t
    const b = 1.5 * t3 - 2.5 * t2 + 1
    const c = -1.5 * t3 + 2 * t2 + 0.5 * t
    const d = 0.5 * t3 - 0.5 * t2
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

// points: two or more THREE.Vector3.
export function createWalkCurve(points) {
    const segments = points.length - 1
    const count = segments * SAMPLES_PER_SEGMENT
    // lengths[k] is the distance along the spline at parameter k / SAMPLES_PER_SEGMENT.
    const lengths = new Float32Array(count + 1)
    const previous = points[0].clone()
    const current = new THREE.Vector3()
    for (let k = 1; k <= count; k += 1) {
        evaluate(points, k / SAMPLES_PER_SEGMENT, current)
        lengths[k] = lengths[k - 1] + current.distanceTo(previous)
        previous.copy(current)
    }
    const length = lengths[count]

    // The spline parameter at share u (0 to 1) of the distance along it.
    const parameterAt = (u) => tableIndex(lengths, u) / SAMPLES_PER_SEGMENT

    const behind = new THREE.Vector3()
    return {
        points,
        length,
        pointAt: (u, target) => evaluate(points, parameterAt(u), target),
        // The spline parameter at share u of the distance, and the point at a parameter. Two
        // splines with the same number of points share parameters point for point, so a camera
        // and its look point can run on one parameter.
        parameterAt,
        pointAtParameter: (p, target) => evaluate(points, p, target),
        // The unit direction of travel at share u.
        tangentAt: (u, target) => {
            const from = Math.max(0, u - TANGENT_STEP)
            const to = Math.min(1, u + TANGENT_STEP)
            evaluate(points, parameterAt(from), behind)
            return evaluate(points, parameterAt(to), target).sub(behind).normalize()
        },
    }
}
