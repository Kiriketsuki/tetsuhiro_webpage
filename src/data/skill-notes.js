// What I have done with each skill, for the card that opens on a star in the skill sky and
// for the screen-reader list on /skills. Every line comes from the evidence audit of
// 3 November 2026: a repo, a pull request or a job. Keep it to shipped work.
export const notes = {
    javascript: 'The base of everything I build for the web: the Auto-Connect dashboards at Aurrigo, this site and my agent tools.',
    typescript: 'Kinopy, my daily word puzzle, is about 71,000 lines of TypeScript. The seeKi front end and my planner tools use it too.',
    vue: 'Four production dashboards for Auto-Connect at Aurrigo: fleet, stand, baggage handling and remote supervision. This site is Vue as well.',
    svelte: 'Kinopy at kinopy.day is a Svelte 5 app with a Web Worker that grows each daily puzzle. The seeKi interface is Svelte too.',
    tailwind: 'This site and Kinopy are styled with Tailwind.',
    maplibre: 'The vehicle maps in the Auto-Connect operator dashboards, and the map on this site.',
    blender: 'I built this island in Blender, with bpy scripts that build, refine and export the scene for the web.',
    threejs: 'This site: the island, the sky you are looking at now, and a size budget that keeps the 3D code under 200 kB.',
    gsap: 'The camera moves, the scroll snapping and the text effects on this site.',
    python: 'The Auto-Connect backend at Aurrigo, AutoMinutes (meeting transcripts to minutes) and MedicASR, my final-year project.',
    fastapi: 'I moved the Auto-Connect backend from Flask to FastAPI, with async SQLAlchemy over Postgres.',
    grpc: 'I moved the Auto-Connect fleet manager from REST polling to gRPC streaming. It now runs 23 gRPC services behind Envoy.',
    firebase: 'Kinopy runs its accounts and offline-first sync on Firebase Auth and Firestore, with emulator-tested rules.',
    mysql: 'The first Auto-Connect data layer. I later moved it to Postgres.',
    postgresql: 'I wrote the spec and moved Auto-Connect from MySQL to Postgres 18 with PostGIS, then moved route finding onto pgRouting. I also teach databases at Ngee Ann Polytechnic.',
    redis: 'The Auto-Connect event bus and dedup cache, and the state store of my agent orchestrator.',
    c: 'STM32 firmware in C, and build and release work on Aurrigo’s vehicle firmware.',
    cpp: 'I own the C++ ROS Noetic bridge between the Auto-Connect relays and the vehicles: command fencing, idempotency and the field spec.',
    go: 'agenKic-orKistrator, my multi-agent orchestrator, and tetsudev, my business tool, are both written in Go.',
    rust: 'seeKi is a Rust app (axum and sqlx) that ships as one binary and serves its own Svelte interface.',
    docker: 'The containerised Auto-Connect deploy repo, and the published seeKi image.',
    agents: 'agenKic-orKistrator routes work between AI agents, in Go with gRPC and Redis. agenKic-hub holds my 23 agent skills.',
    mcp: 'tetsudev serves an MCP server, so AI agents can use its tools.',
}
