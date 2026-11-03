// What I have done with each skill, in my own words, for the card that opens on a star in
// the skill sky and for the screen-reader list on /skills. Every claim comes from the
// evidence audit of 3 November 2026: a repo, a pull request or a job. Keep it to shipped work.
export const notes = {
    javascript: 'I use JavaScript for the Auto-Connect Vue dashboards at Aurrigo, and for this island you are flying over.',
    typescript: 'Kinopy, my daily word puzzle, is about 71,000 lines of TypeScript. At that size I rely on the type checker to catch mistakes before a player does.',
    vue: 'At Aurrigo I built four Auto-Connect operator dashboards in Vue 3, for fleet, stand, baggage handling and remote supervision. This site runs on Vue too.',
    svelte: 'Kinopy is a Svelte 5 app, live at kinopy.day since October 2026. A Web Worker handles puzzle generation off the main thread, and seeKi’s interface is Svelte too.',
    tailwind: 'Tailwind 4 styles this site and trKip-planner. The styles live right in the markup, so I do not name CSS classes by hand.',
    maplibre: 'Airport operators need to see their driverless vehicles on a map. The vehicle maps in my Auto-Connect dashboards at Aurrigo run on MapLibre.',
    blender: 'This island started in Blender. My bpy scripts build and refine the scene, then export it for the web.',
    threejs: 'Three.js draws the island and the sky you are looking at now. The island model is Draco compressed, and the scene loads when the browser is idle.',
    gsap: 'On desktop, GSAP snaps the scroll from section to section and fades the sections in and out. It also runs the scrambled text effects on this site.',
    python: 'Python runs the Auto-Connect backend at Aurrigo. I also built AutoMinutes, which turns meeting recordings into minutes with Whisper and Qwen.',
    fastapi: 'The first Auto-Connect backend was Flask. I rebuilt it in FastAPI with async SQLAlchemy, and it now runs on Postgres.',
    grpc: 'Auto-Connect polled the fleet manager over REST until I moved it to gRPC server streaming. The platform now has 23 gRPC servicers and about 380 RPC definitions behind Envoy.',
    firebase: 'Kinopy keeps its accounts in Firebase Auth and Firestore. Guest progress stays on your device and merges when you sign in, and emulator tests cover the Firestore rules.',
    mysql: 'MySQL held the first Auto-Connect data layer, back when I was the only engineer on it. I later moved the data to Postgres.',
    postgresql: 'I wrote the spec that moved Auto-Connect from MySQL to Postgres 18 with PostGIS, and moving route finding to pgRouting let me retire Neo4j. In early 2026 I taught Database Systems at Ngee Ann Polytechnic.',
    redis: 'Redis is the Auto-Connect event bus and its dedup cache. It also holds state for my agent orchestrator, agenKic-orKistrator.',
    c: 'C is the lowest level I work at. I wrote STM32 firmware in 2024, and at Aurrigo my work on the vehicle firmware repo is mostly build and release.',
    cpp: 'I own the C++ ROS Noetic bridge between the Auto-Connect relays and the vehicles. It fences cancelled commands and keeps commands idempotent, so a vehicle does not run a command twice.',
    go: 'Two of my own tools are Go: agenKic-orKistrator, my multi-agent orchestrator, and tetsudev, my local-first business management tool.',
    rust: 'seeKi is a read-only database viewer for Postgres and SQLite. It is Rust with axum and sqlx, and it ships as a single binary that serves its own Svelte interface.',
    docker: 'Docker packages the Auto-Connect deploy repo, which supports per-site deploys. I also publish seeKi as a Docker image.',
    agents: 'agenKic-orKistrator is my multi-agent orchestrator, written in Go with gRPC and Redis, and it even has a Godot client. agenKic-hub holds my 23 agent skills.',
    mcp: 'When someone asks if I have built an MCP server, tetsudev is my answer. It serves one on the Go MCP SDK, so an AI agent can query my business data.',
}
