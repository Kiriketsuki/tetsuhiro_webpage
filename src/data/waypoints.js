// The five stops on the home page, in camera order. One place for the section
// class name, the side the text sits on, and how far the camera slides the
// subject away from that text.
//
// shift is a share of the screen: x moves the subject right, y moves it up.
// Wide screens use shift. Portrait phones stack the text at the bottom, so they
// use tall instead.
//
// zoom widens the lens (above 1) or narrows it (below 1). tallZoom does the
// same on a phone, and falls back to zoom.
//
// shot replaces the camera from island.glb for that stop. Skills has one: from
// the old angle the badges stacked up behind each other. A long lens from the
// east keeps all 13 apart and about the same size.
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
        shift: [-0.15, -0.05],
        tall: [0, 0.22],
        tallZoom: 0.62,
        shot: { position: [199.4, 47.8, -15.4], target: [143.9, 23.5, -25.2], lens: 70 },
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
