// The five stops on the home page, in camera order. One place for the section
// class name, the side the text sits on, and how far the camera slides the
// subject away from that text.
//
// shift is a share of the screen: x moves the subject right, y moves it up.
// Wide screens use shift. Portrait phones stack the text at the bottom, so they
// use tall instead.
//
// shot replaces the camera from island.glb for that stop. Skills has one: from
// the old angle the badges stacked up behind each other.
export const waypoints = [
    {
        section: 'dodecahedron',
        side: 'none',
        shift: [0, 0],
        tall: [0, 0.04],
    },
    {
        section: 'about',
        side: 'left',
        shift: [0.2, 0],
        tall: [0, 0.2],
    },
    {
        section: 'skills',
        side: 'right',
        shift: [-0.17, 0.02],
        tall: [0, 0.2],
        shot: { position: [179.6, 44.2, -18.9], target: [143.9, 24.5, -25.2], lens: 28 },
    },
    {
        section: 'projects',
        side: 'left',
        shift: [0.2, 0],
        tall: [0, 0.22],
    },
    {
        section: 'contact',
        side: 'right',
        shift: [-0.2, 0.04],
        tall: [-0.1, 0.24],
        zoom: 1.4,
    },
]
