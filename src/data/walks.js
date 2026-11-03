// The story walks that a camera move follows, keyed `<from>><to>` by stop id. Each walk is a
// chain of guide frames between the two stop shots: a camera point, the point it looks at, and
// slow, how many times slower than its cruise the camera runs there. The planner
// (src/scene/aerie/path-plan.js) flies from frame to frame clear of the aerie, so the frames
// steer the flight but cannot push it into a wall. A move the other way plays the frames
// backward, so the camera backs away along the walk and keeps the subject in view.
//
// Points are metres in the GLB frame (Y up). The walk of a leg is in the story order of
// docs/island-story-and-explore-spec.md. This file loads with the move code, not the scene.
export const walks = {
    // Chapter 02, over the bridge to the workshop. From the hero shot the camera comes down
    // behind the pad, then tracks west along the walkway at about 3 m above it, on its south
    // side: off the pad, along the deck, over the stream beside the bridge, along the path, and
    // round to the workshop door. It slows to a third of its cruise on the walkway, as a dolly that
    // keeps pace with the visitor.
    'arrival>workshop': [
        { position: [27, 6.8, 14], look: [15.4, 0.5, 3], slow: 1.6 },
        { position: [21, 5.2, 8.6], look: [12, 0.8, 4], slow: 3 },
        { position: [13, 4.2, 8.5], look: [5.5, 1.3, 5.2], slow: 3 },
        { position: [6, 3.8, 8.8], look: [-1, 1.2, 4.6], slow: 3 },
        { position: [0, 3.4, 7.2], look: [-4.8, 2.0, 0.5], slow: 3 },
    ],
}
