import * as THREE from 'three';
import gsap from 'gsap';
import { useWaypoints } from './composables/useWaypoints.js';
import { createRenderer } from './scene/renderer.js';
import { createLights } from './scene/lights.js';
import { createStars } from './scene/stars.js';
import { createWaypoints } from './scene/waypoints.js';
import { createDodecahedron } from './scene/dodecahedron.js';

const { active, ready, reducedMotion } = useWaypoints();

// Seconds of animation per real second. These match the old per frame steps at 60fps.
const FIRE_SPEED = 0.12;
const SEA_SPEED = 0.012;

//? Set up
const canvas = document.getElementById('webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
history.scrollRestoration = 'manual';

const { renderer } = createRenderer({ canvas, scene, camera });
createLights(scene);
const stars = createStars(scene, renderer.getPixelRatio());
const rig = createWaypoints({ scene, camera, active, reducedMotion });

//? Environment
const cube_loader = new THREE.CubeTextureLoader();
import env_url_0 from './assets/models/envMaps/px.png?url';
import env_url_1 from './assets/models/envMaps/nx.png?url';
import env_url_2 from './assets/models/envMaps/py.png?url';
import env_url_3 from './assets/models/envMaps/ny.png?url';
import env_url_4 from './assets/models/envMaps/pz.png?url';
import env_url_5 from './assets/models/envMaps/nz.png?url';

const env = cube_loader.load([
    env_url_0,
    env_url_1,
    env_url_2,
    env_url_3,
    env_url_4,
    env_url_5
])

scene.environment = env;

function update_materials() {
    scene.traverse((child)=>{
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.envMap = env;
            child.material.envMapIntensity = 2;
            child.receiveShadow = true;
            child.castShadow = true;
            child.material.minFilter = THREE.NearestFilter;
            child.material.magFilter = THREE.NearestFilter;
        }
    });
}


//? Models
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
const loading_manager = new THREE.LoadingManager();
const model_loader = new GLTFLoader(loading_manager);
const draco_loader = new DRACOLoader();
draco_loader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.3/');
model_loader.setDRACOLoader(draco_loader);

import sceneURL from './assets/models/lake_mountain.glb?url';
var mixer;
var mixer2;
model_loader.load(sceneURL, (glb) => {
    mixer = new THREE.AnimationMixer(glb.scene);
    const animation = mixer.clipAction(glb.animations[0]);
    animation.play();
    scene.add(glb.scene);
    update_materials();
});

const dodeca = createDodecahedron({ scene, loadingManager: loading_manager });

// ? Sea
import waveURL from './assets/models/wave.glb?url';
model_loader.load(waveURL, (glb) => {
    mixer2 = new THREE.AnimationMixer(glb.scene);
    var animation = mixer2.clipAction(glb.animations[3]);
    animation.loop = THREE.LoopPingPong;
    glb.scene.position.y += 2.5;
    glb.scene.position.x -= 50;
    glb.scene.scale.set(1, 1, 0.75)
    animation.play();
    scene.add(glb.scene)
});

//? Animation
const clock = new THREE.Clock();

function loop() {
    const delta = Math.min(clock.getDelta(), 0.1);
    const uTime = clock.elapsedTime;
    stars.update(uTime);

    dodeca.update(delta, uTime);

    renderer.render(scene, camera);

    // ? sea and fire animation
    mixer.update(delta * FIRE_SPEED);
    mixer2.update(delta * SEA_SPEED);

    camera.lookAt(rig.target.position);
    requestAnimationFrame(loop);
}

//? Onload
loading_manager.onLoad = () => {
    renderer.compile(scene, camera);
    ready.value = true;
    loop();

    const tl = gsap.timeline({defaults: {ease: 'power2.inOut'}});
    if (reducedMotion.value) tl.timeScale(20);
    tl.to('#spinner', {opacity: 0, duration: 0.6})
        .to('#ready', {opacity: 1, duration: 0.6}, '<')
        .add(() => rig.move(active.value, 2), '>')
        .to('.name', {opacity: 0, duration: 1}, '+=0.4')
        .set('.name', {visibility: 'hidden'})
        .to('#home', {autoAlpha: 1, duration: 1}, '<')
        .to('.nav_stagger', {autoAlpha: 1, duration: 0.8}, '>-0.4');
}
