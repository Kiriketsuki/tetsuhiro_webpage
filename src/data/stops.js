// The camera stops on the urban aerie island, keyed by id. Each stop names its Blender
// camera (matched by name, never by index) and the anchor of its room. `fallback` is the
// shot until the GLB arrives, or if the GLB lacks that camera. Positions are metres in the
// GLB frame (Y up).
//
// shift slides the subject on a wide screen, as a share of the screen: x right, y up.
// tall does the same on a portrait screen, where the text sits at the bottom. zoom widens
// the lens above 1, and tallZoom does the same on a portrait screen.
export const stops = {
    // The arrival view from island_b_rolling_rim.blend (NA_Arrival_ThreeQuarter). It looks
    // down far enough to show the painted city.
    overview: {
        camera: null,
        anchor: null,
        fallback: { position: [34, 12, 36], target: [4.2, -2.9, -1.25], fov: 46 },
        shift: [0, 0],
        tall: [0, 0.04],
    },
    hero: {
        camera: 'Cam_01_Hero',
        anchor: null,
        fallback: { position: [62, 22, 70], target: [0, 2, 0], fov: 33 },
        shift: [0, 0],
        tall: [0, 0.04],
        // The 16:9 width leaves the island small on a portrait phone, so the lens closes in.
        tallZoom: 0.72,
    },
    bedroom: {
        camera: 'Cam_04_Bedroom',
        anchor: 'Anchor_Bedroom',
        fallback: { position: [-1.2, 9.3, 4.6], target: [-5, 7.8, -3.3], fov: 33 },
        shift: [0.12, 0],
        tall: [0, 0.18],
    },
    telescope: {
        camera: 'Cam_03_Telescope',
        anchor: 'Anchor_Telescope',
        fallback: { position: [-10.8, 10.3, -0.6], target: [-7.7, 8.4, -4.8], fov: 27 },
        shift: [-0.12, 0],
        tall: [0, 0.2],
    },
    workshop: {
        camera: 'Cam_02_Workshop',
        anchor: 'Anchor_Workshop',
        fallback: { position: [-3.9, 2.4, 3.2], target: [-3.6, 2.5, -4.9], fov: 33 },
        shift: [0.12, 0],
        tall: [0, 0.18],
    },
    pad: {
        camera: 'Cam_05_Pad',
        anchor: 'Anchor_Pad',
        fallback: { position: [25, 7, 14], target: [14.2, 1.8, 3.4], fov: 38 },
        shift: [-0.15, 0.03],
        tall: [0, 0.22],
        zoom: 1.15,
        tallZoom: 1.3,
    },
}

// Which stop a route opens on. A direct visit to any route opens the scene at that room.
export function stopForRoute(name) {
    if (name === 'Skills') return 'telescope'
    if (['Projects', 'Project', 'DancingTables', 'Placeholders'].includes(name)) return 'workshop'
    if (name === 'Home') return null
    return 'overview'
}
