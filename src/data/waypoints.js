// The five stops on the home page, in camera order. One place for the section class
// name, the side the text sits on, and the camera stop in src/data/stops.js. The stop
// holds the framing, so the subject sits away from the text.
//
// The order is the walk across the aerie (docs/island-story-and-explore-spec.md): the
// sky-taxi lands on the pad, the visitor crosses the bridge to the workshop, climbs the
// stair tower to the bedroom, steps out to the telescope, and ends at the fire on the rim.
export const waypoints = [
    { section: 'welcome', side: 'none', stop: 'arrival' },
    { section: 'projects', side: 'left', stop: 'workshop' },
    { section: 'about', side: 'left', stop: 'bedroom' },
    { section: 'skills', side: 'right', stop: 'telescope' },
    { section: 'contact', side: 'right', stop: 'campfire' },
]
