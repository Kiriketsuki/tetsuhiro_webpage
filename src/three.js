import * as THREE from 'three';
import gsap from 'gsap';

//? Set up
var parameters = {
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: 0,
}
const canvas = document.getElementById('webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, parameters.width / parameters.height, 0.1, 500);
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
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
loading_manager.onLoad = () => {
    loop();
}

const model_loader = new GLTFLoader(loading_manager);
const draco_loader = new DRACOLoader();
draco_loader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.3/');
model_loader.setDRACOLoader(draco_loader);

import sceneURL from './assets/models/lake_mountain.glb?url';
var curve = null;
var curve_positions = []
var mixer;
var mixer2;
model_loader.load(sceneURL, (glb) => {
    mixer = new THREE.AnimationMixer(glb.scene);
    const animation = mixer.clipAction(glb.animations[0]);
    animation.play();
    scene.add(glb.scene);
    update_materials();
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

//? Light
var light_1_pos, light_2_pos, light_3_pos;
import lightURL from './assets/models/lights.glb?url';
model_loader.load(lightURL, (glb) => {
    light_1_pos = glb.scene.children[0].position;
    light_2_pos = glb.scene.children[1].position;
    light_3_pos = glb.scene.children[2].position;

    const light_1 = new THREE.PointLight(0xFFF9B0, 0.420, 0);
    light_1.position.set(light_1_pos.x, light_1_pos.y, light_1_pos.z);
    light_1.castShadow = true;
    light_1.shadow.camera.far = 100;
    light_1.shadow.bias = -0.1;
    light_1.shadow.mapSize.width = 1024;
    light_1.shadow.mapSize.height = 1024;
    scene.add(light_1);

    const light_2 = new THREE.PointLight(0xFFF49C, 0.2, 0);
    light_2.position.set(light_2_pos.x, light_2_pos.y, light_2_pos.z);
    light_2.castShadow = true;
    light_2.shadow.camera.far = 100;
    light_2.shadow.bias = -0.1;
    scene.add(light_2);

    const light_3 = new THREE.PointLight(0x8080CF, 1.4, 0);
    light_3.position.set(light_3_pos.x, light_3_pos.y, light_3_pos.z);
    light_3.castShadow = true;
    light_3.shadow.camera.far = 400;
    light_3.shadow.radius = 10;
    light_3.shadow.bias = -0.1;
    scene.add(light_3);
});
// ?  Stars
const stars_counts = 2000;
const position = new Float32Array(stars_counts * 3);
const star_color = new Float32Array(stars_counts * 3);
for (var i = 0; i < stars_counts; i++) {
    position[i * 3] = Math.random() * 1000 - 500; // x
    position[i * 3 + 1] = (Math.random() * 300) - 30; // y
    position[i * 3 + 2] = Math.random() * 1000 + 200; // z
    star_color[i * 3] = 202/255;
    star_color[i * 3 + 1] = 144/255;
    star_color[i * 3 + 2] = 126/255;
}

import star_png from './assets/star.png?url';
const star_texture = new THREE.TextureLoader().load(star_png);
const star_geo = new THREE.BufferGeometry();
star_geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
star_geo.setAttribute('color', new THREE.BufferAttribute(star_color, 3));
const star_material = new THREE.PointsMaterial({
    vertexColors: true,
    alphaMap: star_texture,
    sizeAttenuation: true,
    size: 10,
    depthWrite: false,
    transparent: true,
    fog: false,
});
const star_mesh = new THREE.Points(star_geo, star_material);
console.log(star_mesh)
scene.add(star_mesh);

// ? Sea
import waveURL from './assets/models/wave.glb?url';
model_loader.load(waveURL, (glb) => {
    mixer2 = new THREE.AnimationMixer(glb.scene);
    console.log(glb)
    var animation = mixer2.clipAction(glb.animations[3]);
    animation.loop = THREE.LoopPingPong;
    glb.scene.position.y += 2.5;
    glb.scene.position.x -= 100;
    glb.scene.scale.set(0.75, 1, 0.75)
    animation.play();
    scene.add(glb.scene)
});

// ? Scrolling animation
var camera_target = new THREE.Vector3(0, 0, 0);
function updateCamera() {
    var ratio = (document.scrollingElement.scrollTop/document.scrollingElement.scrollHeight);
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
const fog = new THREE.Fog(0x051b45, 50, 200);
scene.fog = fog;
function loop() {
    // controls.update();
    renderer.render(scene, camera);
    updateCamera();
    // console.log(star_geo.attributes.position.array)
    mixer.update(0.002)
    mixer2.update(0.0002);
    requestAnimationFrame(loop);
}