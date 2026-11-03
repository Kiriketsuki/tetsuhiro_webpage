// The camera stops on the urban aerie island, keyed by id. Each stop names its Blender
// camera (matched by name, never by index) and the anchor of its room. `fallback` is the
// shot until the GLB arrives, or if the GLB lacks that camera. Positions are metres in the
// GLB frame (Y up).
//
// shift slides the subject on a wide screen, as a share of the screen: x right, y up.
// tall does the same on a portrait screen, where the text sits at the bottom. zoom widens
// the lens above 1, and tallZoom does the same on a portrait screen. focus names the anchor
// (or gives the point) that the lens keeps sharp. Without it the lens focuses on the target.
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
        focus: 'Anchor_Bedroom',
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
        focus: 'Anchor_Telescope',
        fallback: { position: [-12.0, 9.7, 0.8], target: [-7.6, 9.1, -4.6], fov: 34 },
        shift: [-0.12, 0],
        // A portrait phone takes a closer, higher view of the terrace. From the wide view, a
        // crown a few metres from the lens filled the lower third of a phone screen with
        // large flat leaf shapes.
        tallView: { position: [-10.4, 10.2, -0.4], target: [-7.6, 9.3, -4.6], fov: 44 },
        // The skills card covers the lower half of a phone screen, so the telescope rides
        // up into the top third, clear of the card's top edge.
        tall: [0, 0.24],
    },
    // The look through the telescope. The camera sits 0.22 m behind the eye lens on the optical
    // axis and looks along it, so the eyepiece sits at the frame centre, where the iris closes
    // (scene-manager.js). The eye lens and the axis come from round21_telescope.py (its report:
    // eye lens [-7.5688, 8.3739, -3.7655], axis [-0.1, 0.5001, -0.8602]). The target sits on the
    // axis 0.5 m past the eye lens, inside the tube. A target far up the axis made the move look
    // at empty sky half way in, and this one keeps the telescope in frame the whole way.
    eyepiece: {
        camera: null,
        anchor: 'Anchor_Telescope',
        fallback: { position: [-7.547, 8.264, -3.576], target: [-7.619, 8.624, -4.196], fov: 35 },
        shift: [0, 0],
        tall: [0, 0],
    },
    workshop: {
        camera: 'Cam_02_Workshop',
        anchor: 'Anchor_Workshop',
        focus: 'Anchor_Corkboard',
        fallback: { position: [-3.9, 2.4, 3.2], target: [-3.6, 2.5, -4.9], fov: 33 },
        shift: [0.12, 0],
        tall: [0, 0.18],
    },
    // Chapter 01 of the story: the sky-taxi lands on the pad. The camera stands east of the
    // pad and looks west along the whole walkway: the pad in front, then the ramp, the deck,
    // the bridge, the path and the house. A portrait phone keeps the tall view of `pad`.
    arrival: {
        camera: null,
        anchor: 'Anchor_Pad',
        focus: 'Anchor_Pad',
        fallback: { position: [37, 13.5, 5.2], target: [2, 2.2, 1.5], fov: 42 },
        shift: [0, 0],
        tallView: { position: [21, 13, 3.5], target: [6, -0.8, 2], fov: 62 },
        tall: [0, 0],
    },
    // Chapter 05, the closing shot: the fire on the north rim, with the city far below and
    // the night sky. The fire already sits about 2.4 m from the rim, and the city lies north
    // and far below it. The camera stands about 6 m above the lawn south of the fire and
    // looks north-north-east, about 20 degrees down. The fire sits in the lower left, clear
    // of the Contact card on the right, and the city fills the middle band of the frame. The
    // house and the glass stair tower stay out of the frame. The owner picked this framing
    // from three on 3 November 2026.
    campfire: {
        camera: null,
        anchor: 'Anchor_Campfire',
        focus: 'Anchor_Campfire',
        fallback: { position: [3.6, 6.2, -1.6], target: [4.5, 0.0, -18], fov: 46 },
        // The shift lifts the fire clear of the nav strip at the foot of the screen.
        shift: [0, 0.1],
        // On a portrait phone the Contact card covers the lower 60 percent of the screen. A
        // lower camera puts the fire, the rim, a band of city and the sky in the top 40
        // percent: the fire just above the card, the sky at the top.
        tallView: { position: [3.2, 3.6, -3.0], target: [2.0, 0.6, -17], fov: 50 },
        tall: [0, 0.36],
    },
    // Round 8 drops Cam_05_Pad for a higher view from the south-east, down across the pad,
    // the ramp, the deck and the path toward the house, so the island fills most of the frame.
    // From the Blender camera the pad sat at the island edge, and 60 to 70 percent of the
    // frame was empty sky. Here about a quarter of the frame is sky.
    pad: {
        camera: null,
        anchor: 'Anchor_Pad',
        focus: 'Anchor_Pad',
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
    if (name === 'About') return 'bedroom'
    if (['Projects', 'Project', 'DancingTables', 'Placeholders'].includes(name)) return 'workshop'
    if (name === 'Home') return null
    return 'overview'
}
