import * as THREE from 'three';
import { MapControls, OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

//? Set up
var parameters = {
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: 0,
}
const canvas = document.getElementById('webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, parameters.width / parameters.height, 0.1, 1000);
camera.position.set(40, 10, -40);
const camera_group = new THREE.Group();
camera_group.add(camera);
scene.add(camera_group);
// const controls = new OrbitControls(camera, canvas);


//? Renderer options
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x000000);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.setClearAlpha(0);

//? Resize
window.addEventListener('resize', () =>
{
    // Update parameters
    parameters.width = window.innerWidth
    parameters.height = window.innerHeight

    // Update camera
    camera.aspect = parameters.width / parameters.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(parameters.width, parameters.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

//? Environment
const cube_loader = new THREE.CubeTextureLoader();
// const pmrem_generator = new THREE.PMREMGenerator(renderer);
// pmrem_generator.compileEquirectangularShader();
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

// const environment = pmrem_generator.fromScene( new RoomEnvironment( ) ).texture;
// const environment = pmrem_generator.fromCubemap(env);
// console.log(environment)
scene.environment = env;

//? Light
const light = new THREE.AmbientLight(0xffffff, 0);
scene.add(light);

//? Models
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
const loading_manager = new THREE.LoadingManager();
loading_manager.onLoad = () => {
    loop();
}

const model_loader = new GLTFLoader(loading_manager);

import sceneURL from './assets/models/lake_mountain.glb?url';
var curve = null;
var curve_positions = []
var mixer;
var mixer2;
model_loader.load(sceneURL, (glb) => {
    mixer = new THREE.AnimationMixer(glb.scene);
    console.log(glb.animations)
    const animation = mixer.clipAction(glb.animations[0]);
    animation.play();
    scene.add(glb.scene)
});

import curveURL from './assets/models/curve_1.gltf?url';
model_loader.load(curveURL, (glb) => {
    glb.scene.traverse(children => {
        if (children.isMesh) {
            curve = children;
            curve_positions = curve.geometry.attributes.position.array;
        }
    });
});

// ?  Stars
const stars_counts = 10000;
const position = new Float32Array(stars_counts * 3);
for (var i = 0; i < stars_counts; i++) {
    position[i * 3] = Math.random() * 1000 - 500; // x
    position[i * 3 + 1] = Math.random() * 400 - 100; // y
    position[i * 3 + 2] = Math.random() * 1000 + 50; // z
}

const star_geo = new THREE.BufferGeometry();
star_geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
const star_material = new THREE.PointsMaterial({
    sizeAttenuation: true,
    size: 1,
});
const star_mesh = new THREE.Points(star_geo, star_material);
scene.add(star_mesh);

// ? Sea
import waveURL from './assets/models/wave_2.glb?url';
model_loader.load(waveURL, (glb) => {
    console.log(glb)
    mixer2 = new THREE.AnimationMixer(glb.scene);
    var animation = mixer2.clipAction(glb.animations[1]);
    glb.scene.position.y += 2;
    glb.scene.position.x -= 100;
    glb.scene.scale.set(0.75, 1, 0.75)
    animation.play();
    scene.add(glb.scene)
});

// ? Scrolling animation
var camera_target = new THREE.Vector3(0, 0, 0);
function updateCamera() {
    var ratio = (document.scrollingElement.scrollTop/document.scrollingElement.scrollHeight)/2;
    var index = Math.floor(ratio * (curve_positions.length / 3));
    gsap.to(camera.position, {x: curve_positions[index * 3] + 10, y:curve_positions[index * 3 + 1] + 10, z: curve_positions[index * 3 + 2] - 40, duration: 0.06, ease: "power4.inOut"});
    gsap.to(camera_target, {x: camera.position.x - 10 * Math.cos((4/3 * ratio * Math.PI)), y: camera.position.y -30 * Math.sin(0.5-ratio), z: 200 - 200 * Math.cos((0.5-ratio) * Math.PI), duration: 0.06, ease: "power4.inOut"});
    camera_group.position.x = -cursor.x * 5;
    camera_group.position.y = -cursor.y * 5;
    camera.lookAt(camera_target);
}

//? Parallax Movement
var cursor = {
    x: 0,
    y: 0
}
window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX / window.innerWidth * 2 - 1;
    cursor.y = e.clientY / window.innerHeight * 2 - 1;
});

//? Fog
const fog = new THREE.Fog(0x3C6E71, 0, 200);
scene.fog = fog;

function loop() {
    // controls.update();
    renderer.render(scene, camera);
    updateCamera();
    mixer.update(0.002)
    mixer2.update(0.0005);
    requestAnimationFrame(loop);
}