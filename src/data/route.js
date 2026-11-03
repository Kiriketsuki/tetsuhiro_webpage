// The camera moves between the stops fly planned paths (src/scene/aerie/path-plan.js). The
// walk splines that the camera once followed, up the stair flights of the tower, are gone.
// The workshop doorway. Every move into the board view, the Projects wall in the workshop,
// comes in through it, and every move out of the board view leaves through it. The doorway
// is 1.2 m wide (x -5.5 to -4.3) in the front wall at z -0.5, with its sill at y 1.0 and its
// head frame at y 3.15. The camera passes near its centre line at eye height, about 0.6 m
// clear of each post and 0.75 m under the head. Three points on that line keep the path straight
// through the door: one out in front, where a planned flight (path-plan.js) hands over, one
// on the porch, and one just in the room.
export const doorway = {
    outside: [-4.82, 2.4, 4.2],
    porch: [-4.82, 2.4, 1.0],
    inside: [-4.82, 2.4, -1.3],
    // The workshop room and the porch, as the corners of a box. A move that starts in it, such
    // as one that takes over on the way out, leaves through the doorway too.
    room: [
        [-8.6, 0.5, -6.3],
        [0.1, 3.4, 1.0],
    ],
}
