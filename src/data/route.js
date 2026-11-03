// The story legs: one walk spline for each pair of neighbouring story stops
// (docs/island-story-and-explore-spec.md, "Moves between stops"). The key is
// `<from>><to>`, and the rig plays a leg backward for a move the other way.
//
// Points are metres in the GLB frame (Y up), along the real path at walk height, from the
// first stop to the second. The camera rides behind and above the spline (camera-rig.js),
// 5 m back and 4 m up unless a leg sets `back` and `up`.
// Blender empties named `Route_<from>_<to>_NN` replace a leg's points when the GLB has
// them, so these points are the fallback until the GLB arrives or if it lacks the empties.
// The workshop doorway. Every move into the board view, the Projects wall in the workshop,
// comes in through it, and every move out of the board view leaves through it. The doorway
// is 1.2 m wide (x -5.5 to -4.3) in the front wall at z -0.5, with its sill at y 1.0 and its
// head frame at y 3.15. The camera passes near its centre line at eye height, about 0.6 m
// clear of each post and 0.75 m under the head. Three points on that line keep the path straight
// through the door: one out in front, where an arc from a far stop comes down clear of the
// house, one on the porch, and one just in the room.
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

export const route = {
    // The ramp, the deck, the bridge, the path and the workshop porch.
    'arrival>workshop': {
        points: [
            [15.4, 0.7, 3.0],
            [12.5, 0.7, 3.6],
            [9.0, 0.6, 4.2],
            [5.5, 1.3, 5.2],
            [0.6, 0.6, 5.3],
            [-2.0, 0.5, 4.8],
            [-4.0, 0.5, 2.6],
        ],
    },
    // From the path in front of the porch, up and round the outside of the stair tower on its east face, then
    // west to the top floor. The last point heads the way the bedroom shot looks, so the
    // camera arrives behind the walker and never swings across the glass.
    'workshop>bedroom': {
        points: [
            [-4.4, 0.5, 5.0],
            [-1.6, 1.0, 5.0],
            [1.4, 3.2, 4.0],
            [2.4, 6.2, 2.4],
            [0.8, 8.4, 1.0],
            [-0.6, 8.9, -0.2],
        ],
    },
    // Out of the bedroom onto the front of the terrace, then west and round the corner to
    // the telescope.
    'bedroom>telescope': {
        points: [
            [-3.0, 8.9, 3.4],
            [-6.5, 8.9, 3.6],
            [-9.6, 8.8, 0.6],
            [-9.4, 8.7, -3.2],
        ],
    },
    // Back over the north edge of the roof past the tower, down to the lawn behind the
    // house, across behind the fire (its south side, over the pond edge), then a slow turn
    // north over the rim to the city. The spline passes close to the tower corner, so the
    // camera rides closer and higher than on the other legs.
    'telescope>campfire': {
        back: 2.5,
        up: 8,
        points: [
            [-7.7, 8.6, -4.6],
            [-6.8, 10.4, -8.4],
            [-3.5, 5.0, -9.4],
            [-0.4, 1.6, -9.0],
            [1.6, 1.0, -6.2],
            [3.6, 1.0, -5.2],
            [4.4, 1.2, -6.6],
            [4.6, 1.6, -8.2],
        ],
    },
}
