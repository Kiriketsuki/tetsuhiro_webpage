import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

//? Set up
var parameters = {
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: 0,
}
const canvas = document.getElementById('webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, parameters.width / parameters.height, 0.1, 1000);
const controls = new OrbitControls(camera, canvas);



//? Renderer options
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x000000);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.setClearColor(0xcccccc);

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

//? Camera
camera.position.set(40, 3, -40);
camera.lookAt(camera.position.x + 10, camera.position.y, camera.position.z);

//? Light
const light = new THREE.AmbientLight(0xffffff, 0);
scene.add(light);

//? Models
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const model_loader = new GLTFLoader();

import sceneURL from './assets/models/lake_mountain.gltf?url';
var meshes = [];
model_loader.load(sceneURL, (glb) => {
    scene.add(glb.scene);
})

// for (var mesh of meshes) {
//     scene.add(mesh);
// }

//? Scene

function loop() {
    requestAnimationFrame(loop);
    renderer.render(scene, camera);
    controls.update();
    // camera.position.x -= 0.1
    // camera.lookAt(camera.position.x, 2, camera.position.z + 10);
}

loop();