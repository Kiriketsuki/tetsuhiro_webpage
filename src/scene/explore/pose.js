// Kinako's poses and gaits (spec, Walker design), as plain angle arrays that body.js turns into
// part matrices.
//
// A pose holds, for each rig part, three angles in degrees in the order of the concept tuples in
// walker_concepts.py (x, y, z). A concept Y angle swings a leg back, pitches the head down and
// lifts the tail. A concept Z angle turns the head left and the tail right. Each angle adds to
// the stand pose that walker.glb holds. The tail holds a pitch and a yaw per joint, also on top
// of its rest angles. lift raises the whole body in metres, and blink closes the eyes from 0 to 1.

export const LEGS = ['FL', 'FR', 'BL', 'BR']

export function createPoses(parts) {
    const index = Object.fromEntries(parts.map((name, i) => [name, i]))
    const size = parts.length * 3
    const blank = () => ({ angles: new Float32Array(size), tail: new Float32Array(6), lift: 0, blink: 0 })

    // Maps a concept object key (leg_FL_u, paw_FL, neck) to its rig part (leg_u_FL).
    const partOf = (key) => {
        const leg = /^leg_(FL|FR|BL|BR)_(u|l)$/.exec(key)
        return index[leg ? `leg_${leg[2]}_${leg[1]}` : key]
    }
    // Builds a pose from a concept table: { key: [x, y, z] }, tail_<n> for the tail joints.
    const fromConcept = (table) => {
        const pose = blank()
        for (const [key, value] of Object.entries(table)) {
            const tail = /^tail_(\d)$/.exec(key)
            if (tail) {
                pose.tail[(tail[1] - 1) * 2] = value[1]
                pose.tail[(tail[1] - 1) * 2 + 1] = value[2]
                continue
            }
            const at = partOf(key)
            if (at === undefined) throw new Error(`The pose names an unknown part: ${key}.`)
            pose.angles.set(value, at * 3)
        }
        return pose
    }
    const set = (pose, key, x, y, z) => {
        const at = partOf(key) * 3
        pose.angles[at] = x
        pose.angles[at + 1] = y
        pose.angles[at + 2] = z
    }
    const add = (pose, key, x, y, z, w = 1) => {
        const at = partOf(key) * 3
        pose.angles[at] += x * w
        pose.angles[at + 1] += y * w
        pose.angles[at + 2] += z * w
    }
    // out = mix( out, other, w ), in place, angles and tail and lift and blink.
    const mix = (out, other, w) => {
        if (w <= 0) return out
        for (let i = 0; i < size; i += 1) out.angles[i] += (other.angles[i] - out.angles[i]) * w
        for (let i = 0; i < 6; i += 1) out.tail[i] += (other.tail[i] - out.tail[i]) * w
        out.lift += (other.lift - out.lift) * w
        out.blink += (other.blink - out.blink) * w
        return out
    }
    // out += other * w, in place: for a carriage that rides on top of a cycle.
    const addScaled = (out, other, w) => {
        if (w <= 0) return out
        for (let i = 0; i < size; i += 1) out.angles[i] += other.angles[i] * w
        for (let i = 0; i < 6; i += 1) out.tail[i] += other.tail[i] * w
        return out
    }
    const clear = (pose) => {
        pose.angles.fill(0)
        pose.tail.fill(0)
        pose.lift = 0
        pose.blink = 0
        return pose
    }
    return { index, blank, fromConcept, set, add, mix, addScaled, clear }
}

// The concept sit and sleep poses, from POSES in walker_concepts.py.
export const SIT = {
    body: [0, -40, 0],
    leg_FL_u: [0, 40, 0], leg_FR_u: [0, 40, 0],
    leg_BL_u: [0, -20, 0], leg_BR_u: [0, -20, 0],
    leg_BL_l: [0, 130, 0], leg_BR_l: [0, 130, 0],
    neck: [0, 20, 0], head: [0, 22, 0],
    tail_1: [0, -12, 50], tail_2: [0, -15, 60], tail_3: [0, 35, 55],
}
export const SLEEP = {
    body: [0, 4, 0],
    leg_FL_u: [0, -70, 0], leg_FL_l: [0, 120, 0],
    leg_FR_u: [0, -70, 0], leg_FR_l: [0, 120, 0],
    leg_BL_u: [0, -55, 0], leg_BL_l: [0, 115, 0],
    leg_BR_u: [0, -55, 0], leg_BR_l: [0, 115, 0],
    neck: [0, 45, -110], head: [0, 20, -30],
    ear_L: [0, -20, 0], ear_R: [0, -20, 0],
    tail_1: [0, -70, 50], tail_2: [0, 15, 80], tail_3: [0, 20, 80],
}
// A groom: Kinako sits, lifts the left fore paw to the mouth and turns the head to it.
export const GROOM = {
    ...SIT,
    leg_FL_u: [0, -85, 0], leg_FL_l: [0, 115, 0],
    neck: [0, 26, 8], head: [0, 34, 22],
}
// The hop: on the way up the fore legs tuck and the hind legs push out. On the way down the
// fore legs reach for the ledge and the hind legs tuck.
export const AIR_UP = {
    body: [0, -10, 0],
    leg_FL_u: [0, -45, 0], leg_FL_l: [0, 85, 0], leg_FR_u: [0, -45, 0], leg_FR_l: [0, 85, 0],
    leg_BL_u: [0, 55, 0], leg_BL_l: [0, -25, 0], leg_BR_u: [0, 55, 0], leg_BR_l: [0, -25, 0],
    neck: [0, -8, 0], ear_L: [0, -30, 0], ear_R: [0, -30, 0],
    tail_1: [0, -20, 0], tail_3: [0, 15, 0],
}
export const AIR_DOWN = {
    body: [0, 8, 0],
    leg_FL_u: [0, -55, 0], leg_FL_l: [0, 10, 0], leg_FR_u: [0, -50, 0], leg_FR_l: [0, 10, 0],
    leg_BL_u: [0, -15, 0], leg_BL_l: [0, 60, 0], leg_BR_u: [0, -15, 0], leg_BR_l: [0, 60, 0],
    neck: [0, 10, 0], tail_1: [0, 10, 0],
}

// The gaits. Each leg runs the same cycle, offset by its share of the stride. In stance the
// leg swings from forward (-reach) to back (+reach) on the ground. In swing it flexes and comes
// forward again. stride: metres per cycle. duty: the stance share of the cycle. carriage: the
// head, ears and tail of the concept walk and run poses (walker_concepts.py), held through the
// cycle.
// The walk is a four-beat lateral walk: left hind, left fore, right hind, right fore. The
// gallop is a transverse gallop: the hinds land as a pair, then the fores, then a flight.
export const GAITS = {
    walk: {
        stride: 0.42,
        duty: 0.62,
        offset: { BL: 0, FL: 0.25, BR: 0.5, FR: 0.75 },
        reach: { F: 30, B: 26 },
        flex: { F: 58, B: 34 },
        flight: null,
        pitch: 0,
        carriage: { neck: [0, 6, 0], head: [0, -4, 0], tail_1: [0, -15, 0], tail_3: [0, 10, 0] },
    },
    gallop: {
        stride: 0.95,
        duty: 0.3,
        offset: { BL: 0, BR: 0.08, FL: 0.42, FR: 0.5 },
        reach: { F: 52, B: 50 },
        flex: { F: 85, B: 62 },
        // The flight window of the cycle, and the lift at its peak in metres.
        flight: { from: 0.8, to: 1.0, lift: 0.05 },
        // The body rocks nose up as the fores land and nose down as the hinds land.
        pitch: 6,
        carriage: {
            body: [0, 4, 0], neck: [0, 30, 0], head: [0, -20, 0], ear_L: [0, -40, 0], ear_R: [0, -40, 0],
            tail_1: [0, -50, 0], tail_2: [0, -10, 0], tail_3: [0, 30, 0],
        },
    },
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

// Writes one gait at cycle phase `phase` (0 to 1) into pose, scaled by w, on top of what pose
// holds.
export function addGait(poses, pose, gait, phase, w) {
    if (w <= 0) return
    for (const leg of LEGS) {
        const end = leg[0]
        const t = (phase + gait.offset[leg]) % 1
        const reach = gait.reach[end]
        let swing
        let flex
        if (t < gait.duty) {
            swing = -reach + 2 * reach * (t / gait.duty)
            flex = 0
        } else {
            const q = (t - gait.duty) / (1 - gait.duty)
            swing = reach - 2 * reach * smooth(q)
            flex = gait.flex[end] * Math.sin(Math.PI * q)
        }
        poses.add(pose, `leg_${leg}_u`, 0, swing, 0, w)
        poses.add(pose, `leg_${leg}_l`, 0, flex, 0, w)
    }
    const beat = Math.sin(phase * Math.PI * 4)
    poses.add(pose, 'neck', 0, 3 * beat, 0, w)
    poses.add(pose, 'head', 0, -2 * beat, 0, w)
    poses.add(pose, 'body', 0, gait.pitch * Math.sin(phase * Math.PI * 2), 0, w)
    const sway = Math.sin(phase * Math.PI * 2)
    pose.tail[1] += 8 * sway * w
    pose.tail[3] += 10 * sway * w
    pose.tail[5] += 12 * sway * w
    if (gait.flight && phase >= gait.flight.from && phase <= gait.flight.to) {
        const q = (phase - gait.flight.from) / (gait.flight.to - gait.flight.from)
        pose.lift += gait.flight.lift * Math.sin(Math.PI * q) * w
    }
}

export const smoothstep = (a, b, x) => smooth((x - a) / (b - a))
