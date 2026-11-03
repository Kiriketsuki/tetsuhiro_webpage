// The props on the home walk that open a page: the workshop corkboard, the telescope and the
// bedroom door. Each one is live only at its own stop, where the camera sees it whole and
// nothing stands in front of it. The hit test then needs no occlusion test.
//
// pick: 'box' tests the pointer against the prop's bounding box, not its triangles. The
// board is a flat box anyway, and the doorway is mostly the open gap inside its frame.
//
// name and verb make the label: "Corkboard" and "open the projects". to is the route the
// prop opens, the same route as the nav, so Back behaves as it does from the nav.
//
// The aerie GLB joins every prop of one material into one mesh, so a prop that comes from the
// GLB names its meshes (by a name pattern) and a box in metres in the GLB frame. The prop is
// every triangle of those meshes whose centre lies in the box and outside `cut`. The
// corkboard is the wall's room copy and the campfire is its own group, so they name a part of
// the scene manager instead.
export const PROPS = [
    {
        id: 'board',
        name: 'Corkboard',
        verb: 'open the projects',
        to: '/projects',
        stop: 'workshop',
        part: 'roomBoard',
        pick: 'box',
    },
    {
        id: 'telescope',
        name: 'Telescope',
        verb: 'look at the stars',
        to: '/skills',
        stop: 'telescope',
        // The tube, the finder and the tripod. The phone island (LOD1) keeps the telescope in
        // its own Scope_Lod1 meshes. The stool beside the tripod and the small table further out
        // sit in the Props meshes, so `cut` drops the stool. The cut stops just short of the
        // tripod foot at z -4.13.
        meshes: /^(Props|Scope_Lod1)_/,
        box: [
            [-8.1, 7.4, -5.45],
            [-7.25, 9.45, -3.7],
        ],
        cut: [
            [-7.8, 7.4, -4.125],
            [-7.35, 8.1, -3.7],
        ],
    },
    {
        id: 'door',
        name: 'Balcony door',
        verb: 'step into the room',
        to: '/about',
        stop: 'bedroom',
        // The frame of the glass door, 0.8 m wide (x -4.7 to -3.9) in the front wall at z -1.62.
        // The glass writes no depth, so a rim of the glass covered the whole doorway.
        meshes: /^House_/,
        pick: 'box',
        box: [
            [-4.8, 7.38, -1.75],
            [-3.8, 9.5, -1.45],
        ],
    },
]
