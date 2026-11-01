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
    // The welcome shot: the house front seen from the lawn, with a crown on each side, the
    // litter and the canopy against the sky. Round 8 drops the 92 degree lens, which leaned
    // the tower verticals hard (keystone), for a 60 degree lens from further back and higher
    // up. The camera tilts up under 5 degrees, so the verticals lean under 2 degrees at the
    // house edges. The whole house shows with sky above the canopy. With a level lens a 13 m
    // tower on an 8 m front fills its height before its width: the house with its glass stair
    // tower spans about 37 percent of a 16:9 frame, under the 45 percent the review asked for.
    // Round 9 moves in closer and higher with a 50 degree lens, so the house front spans about
    // half the frame width (780 of 1600 px) with sky above the roof canopy. The camera looks
    // almost level from the height of the middle floor, so the verticals stay upright. The
    // frame cuts the foot of the ground floor, which the workshop stop shows in full.
    // Round 10 steps back to the south-west, a three-quarter view. The house body comes to the
    // front and the steel frame falls behind it, the whole tower shows from the steps and the
    // door to the canopy, and clear sky shows above the canopy. On a 16:9 screen a 12 m tower
    // in full height holds about a third of the frame width, so the left crown and the path
    // fill the rest as the welcome setting.
    // Round 11 dollies in from the west-south-west and rises above the eave, so the shot looks a
    // little down onto the roof. Round 12 replaces the slate gable with a flat graphite roof. The house with its timber frame spans about half of
    // a 16:9 frame, clear sky shows above the roof, and the lit windows, a crown on each side
    // and the pad set the welcome scene. The frame cuts the foot of the ground floor, which the
    // workshop stop shows in full.
    // Round 13 comes down and in, in front of the entry side, a little west of square. The camera
    // looks almost level from the bedroom floor, so the cream front with its shutters and the
    // timber frame fill about half the frame width, the flat roof shows against the indigo sky,
    // and a crown stands on each side clear of the facade. The frame cuts the ground floor.
    // Round 14 steps back to a low three-quarter view from the south-west, about 34 degrees off
    // the front, where the front and the west side together read widest. The whole house shows,
    // from the entry steps and the workshop doorway to the roof, with sky above the roof, and the
    // pond, the bridge and the pad lead off to the right. A 13 m house in full height fills about
    // a third of a 16:9 frame from any angle, so the lens tilts up only a little and the
    // verticals lean only a little at the frame edges.
    // Round 16 steps far back to the south-south-west with a long 27 degree lens and a level
    // camera at the height of the middle floor, so no vertical leans. The house front spans
    // about 47 percent of the frame width (750 of 1600 px), with a band of sky above the roof.
    // The frame cuts the foot of the ground floor. The lens shift moves the house left of
    // centre, so the large rust crown on the left keeps to the frame edge.
    // Round 17 swings the camera to about 35 degrees west of the front and steps back with a
    // 24 degree lens. Seen across its corner, the house with its timber frame and its roof reads
    // widest, so the whole house shows from the entry steps and the workshop up to the roof
    // slab, with a band of sky above it, and the front spans about 42 to 45 percent of the frame
    // width. The camera looks down by under 3 degrees, so the verticals stay upright.
    // Round 18 dollies in on the same line to 32 m and rises by about a metre, so the house
    // with its timber frame spans about 48 percent of the frame width and a band of sky of
    // about a tenth of the frame height shows above the roof slab. The frame cuts the foot of
    // the workshop, which the workshop stop shows in full. The house now sits at the centre.
    // Round 19 swings round to the south-south-east and comes down to the middle floor, with a
    // 29.5 degree lens. The whole house shows, from the entry steps and the workshop up to the
    // roof, with sky above the roof, and the house with its timber frame and roof spans about 41
    // percent of the frame width. The large rust crown now stands beside the house on the left
    // and no longer covers its lower floors, and the campfire and the pond lead off to the right.
    // Round 20 searched the views round the house for the one that holds the house widest
    // against its height. Seen level across its south-west corner from far off, the house with
    // its timber frame spans 0.81 times its own height. With a band of sky of a tenth of the
    // frame above the roof and the entry steps inside the bottom edge, that is about 640 of 1600
    // px, 40 percent of the width. Wider than that, the frame must cut the steps or the sky. A
    // long 18 degree lens from about 50 m keeps the verticals upright, and the telescope
    // terrace, a rust crown and the lit walkway to the bridge fill the frame round the house.
    hero: {
        camera: null,
        anchor: null,
        fallback: { position: [-37.66, 10, 34.86], target: [-4.2, 7.12, -2.3], fov: 18.16 },
        shift: [0, 0],
        // A portrait phone cannot hold the 13 m tower from eye height above the text at the
        // bottom of the screen, so it takes its own view (tallView): further back and higher
        // on the same line to the house front, with the whole house in the top of the screen.
        tallView: { position: [-10.2, 8.2, 19.5], target: [-4.0, 6.2, -2.5], fov: 30 },
        tall: [0, 0.16],
        tallZoom: 1,
    },
    bedroom: {
        camera: 'Cam_04_Bedroom',
        anchor: 'Anchor_Bedroom',
        fallback: { position: [-1.2, 9.3, 4.6], target: [-5, 7.8, -3.3], fov: 33 },
        shift: [0.12, 0],
        tall: [0, 0.18],
    },
    // The telescope terrace. Cam_03_Telescope looks down at about 20 degrees, so its frame
    // holds no sky. This shot looks almost level from a little further back, so the night
    // sky and its stars show above the telescope.
    telescope: {
        camera: null,
        anchor: 'Anchor_Telescope',
        fallback: { position: [-12.0, 9.7, 0.8], target: [-7.6, 9.1, -4.6], fov: 34 },
        shift: [-0.12, 0],
        // A portrait phone takes a closer, higher view of the terrace. From the wide view, a
        // crown a few metres from the lens filled the lower third of a phone screen with
        // large flat leaf shapes.
        tallView: { position: [-10.4, 10.2, -0.4], target: [-7.6, 9.3, -4.6], fov: 44 },
        tall: [0, 0.08],
    },
    workshop: {
        camera: 'Cam_02_Workshop',
        anchor: 'Anchor_Workshop',
        fallback: { position: [-3.9, 2.4, 3.2], target: [-3.6, 2.5, -4.9], fov: 33 },
        shift: [0.12, 0],
        tall: [0, 0.18],
    },
    // Round 8 drops Cam_05_Pad for a higher view from the south-east, down across the pad,
    // the ramp, the deck and the path toward the house, so the island fills most of the frame.
    // From the Blender camera the pad sat at the island edge, and 60 to 70 percent of the
    // frame was empty sky. Here about a quarter of the frame is sky.
    pad: {
        camera: null,
        anchor: 'Anchor_Pad',
        fallback: { position: [19, 15, 14], target: [9, 0, 1.5], fov: 36 },
        shift: [0, 0],
        // A portrait phone looks west from beyond the pad, along the whole walkway: the pad at
        // the foot of the screen, then the ramp, the deck, the path, the bridge and the house.
        // From the landscape view the narrow screen held mostly the empty sky east of the pad.
        tallView: { position: [21, 13, 3.5], target: [6, -0.8, 2], fov: 62 },
        tall: [0, 0],
    },
}

// Which stop a route opens on. A direct visit to any route opens the scene at that room.
export function stopForRoute(name) {
    if (name === 'Skills') return 'telescope'
    if (['Projects', 'Project', 'DancingTables', 'Placeholders'].includes(name)) return 'workshop'
    if (name === 'Home') return null
    return 'overview'
}
