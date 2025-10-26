# Tetsuhiro Webpage

My portfolio, live at [tetsuhiro.dev](https://tetsuhiro.dev).

It is a small night island in Three.js. Scrolling moves the camera between five spots on the island: the portal, the campfire, the skill tree, the volcano and a wide shot for contact. Each spot has a panel with that part of the site. There are also pages for all my skills and projects.

This is the October 2025 version. The first one was from 2022, made while I was still at NTU. This time the island was remodelled in Blender, and most of the code was rewritten.

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

`npm run ship` builds the site and deploys it to Firebase Hosting. You need the Firebase CLI and access to the project for that.

## Where things are

- `src/three.js` starts the scene. The parts of the scene live in `src/scene/`, one file each for the island, sea, lights, campfire, skill badges, post processing and so on.
- `src/data/` has the projects, the skills and the dodecahedron faces, so the content is in one place.
- `src/assets/models/island.glb` is the island. The Draco decoder is in `public/draco/`, so it does not come from a CDN.
- `src/assets/textures/` has the tiled terrain textures. `src/scene/terrain-material.js` maps them onto the island in world space.
