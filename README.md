# Tetsuhiro Webpage

My portfolio, live at [tetsuhiro.dev](https://tetsuhiro.dev).

It is a small island at night, built in Three.js. As you scroll, the camera moves between five spots: the portal, the campfire, the skill tree, the volcano, and a wide shot for contact. Each spot has a panel for that part of the site, and there are separate pages for my skills and projects.

This is the October 2025 version. I made the first one in 2022, while I was still at NTU. This time I remodelled the island in Blender and rewrote most of the code. I also gave the skill tree actual leaves.

## Stack

- Vue 3 with `<script setup>`, Vue Router and Vite
- Three.js for the scene, with bloom from the postprocessing examples
- GSAP for the camera moves, ScrollTrigger and the text scramble
- Tailwind 4, with the colours and fonts in `src/styles/tokens.css`
- Blender for the island, exported as a Draco compressed glb
- Firebase Hosting

## Running it

```
npm install
npm run dev
```

`npm run ship` builds the site and deploys it to Firebase Hosting. You need the Firebase CLI and access to the project for that one.

## Where things are

- `src/three.js` starts the scene. Each part of the scene has its own file in `src/scene/`: the island, the sea, the lights, the campfire, the skill pods, the post processing and so on.
- `src/data/` holds the projects, the skills and the dodecahedron faces, so all the content sits in one place.
- `src/assets/models/island.glb` is the island, leaves included. The Draco decoder is in `public/draco/`, so it does not come from a CDN.
- `src/assets/textures/` has the tiled terrain textures. `src/scene/terrain-material.js` maps them onto the island in world space.
- `src/assets/projects/` has the project screenshots as WebP, one folder per project.
