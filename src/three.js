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
const camera = new THREE.PerspectiveCamera(50, parameters.width / parameters.height, 1, 400);
const camera_group = new THREE.Group();
camera.position.set(-100, 200, 200);
camera_group.add(camera);
scene.add(camera_group);
window.onload = () => {
    document.scrollingElement.scrollTop = 0;
    document.body.style.overflowY = "hidden";
}


//? Renderer options
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x000000);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.needsUpdate = true;
renderer.shadowMap.autoUpdate = false;
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

import dodecaURL from './assets/models/dodecahedron.glb?url';
var dodeca_mesh = null;
model_loader.load(dodecaURL, (glb) => {
    dodeca_mesh = glb.scene.children[0]
    scene.add(dodeca_mesh);
    dodeca_mesh.position.y -= 4;
    update_materials();
})

//? Light
var light_1_pos, light_2_pos, light_3_pos;
light_1_pos = {
    x: 24.67058753967285,
    y: 30.510108947753906,
    z: 27.250045776367188
}

light_2_pos = {
    x: 41.705875396728516,
    y: 25.02428436279297,
    z: 0
}

light_3_pos = {
    x: 12.767450332641602,
    y: 26.301376342773438,
    z: -63.92277908325195
}
const light_1 = new THREE.PointLight(0xFFF9B0, 0.420, 0);
light_1.position.set(light_1_pos.x, light_1_pos.y, light_1_pos.z);
light_1.castShadow = true;
light_1.shadow.camera.far = 1000;
light_1.shadow.camera.near = 0.1;
light_1.shadow.bias = -0.1;
light_1.shadow.mapSize.width = 1024;
light_1.shadow.mapSize.height = 1024;
scene.add(light_1);

const light_2 = new THREE.PointLight(0xFFF49C, 0.2, 0);
light_2.position.set(light_2_pos.x, light_2_pos.y, light_2_pos.z);
light_2.castShadow = true;
light_2.shadow.camera.far = 100;
light_2.shadow.camera.near = 0.1;
light_2.shadow.bias = -0.1;
scene.add(light_2);

const light_3 = new THREE.PointLight(0x8080CF, 1.4, 0);
light_3.position.set(light_3_pos.x, light_3_pos.y, light_3_pos.z);
light_3.castShadow = true;
light_3.shadow.camera.far = 400;
light_3.shadow.radius = 10;
light_3.shadow.bias = -0.1;
scene.add(light_3);

// ?  Stars
const stars_counts = 5000;
const position = new Float32Array(stars_counts * 3);
const star_color = new Float32Array(stars_counts * 3);
const star_scale = new Float32Array(stars_counts);
for (var i = 0; i < stars_counts; i++) {
    position[i * 3] = Math.random() * 1000 - 500; // x
    position[i * 3 + 1] = (Math.random() * 300) - 30; // y
    position[i * 3 + 2] = Math.random() * 1000 + 200; // z
    star_scale[i] = Math.random() * 0.5 + 0.5;
    star_color[i * 3] = 202/255;
    star_color[i * 3 + 1] = 144/255;
    star_color[i * 3 + 2] = 126/255;
}

import star_vertex from './assets/shaders/stars/vertex.glsl?raw';
import star_fragment from './assets/shaders/stars/fragment.glsl?raw';
const star_geo = new THREE.BufferGeometry();
star_geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
star_geo.setAttribute('color', new THREE.BufferAttribute(star_color, 3));
star_geo.setAttribute('aScale', new THREE.BufferAttribute(star_scale, 1));
const star_material = new THREE.ShaderMaterial({
    vertexShader: star_vertex,
    fragmentShader: star_fragment,
    uniforms: {
        uSize: { value: 20 * renderer.getPixelRatio()},
        uTime: { value: 0 },
    },
    vertexColors: true,
    depthTest: true,
    transparent: true,
    // blending: THREE.AdditiveBlending,
    fog: false,
});

const star_mesh = new THREE.Points(star_geo, star_material);
scene.add(star_mesh);

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

// ? Scrolling animation 
// ! Need to make less laggy
var camera_target = new THREE.Mesh( new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.PointsMaterial());
camera_target.position.set(0, 0, 0);
scene.add(camera_target);
//! Trying new method, having an array of positions for the camera to move to.
var positions_array = [
    new THREE.Vector3(18.1, 6.8, -35), // dodecahedron
    new THREE.Vector3(-27.6, 12.178, -40), // about
    new THREE.Vector3(-57, 23.7, -60), // skill tree
    new THREE.Vector3(-129, 34, -100), // projects
    new THREE.Vector3(-126, 94.3, -100) // contact
]

var previous_section = 0;
var curr_section = 0;

var camera_positions = {
    x: positions_array[0].x,
    y: positions_array[0].y,
    z: positions_array[0].z
}

var camera_target_positions = {
    x: camera_positions.x,
    y: camera_positions.y - 30,
    z: 200
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
const fog = new THREE.Fog(0x001220, 50, 200);
scene.fog = fog;

//? Animation
const clock = new THREE.Clock();

function loop() {
    const uTime = clock.getElapsedTime();
    // ? star animation
    star_material.uniforms.uTime.value = uTime;

    //? Dodecahedron
    dodeca_mesh.position.y += Math.sin(uTime * 0.5) * 0.005;
    dodeca_mesh.rotation.y -= 0.001;
    dodeca_mesh.rotation.x -= 0.002;

    // ? renderer
    renderer.render(scene, camera);

    // ? sea and fire animation
    mixer.update(0.002)
    mixer2.update(0.0002);

    //? camera
    // parallax
    gsap.to(camera_group.position, {x: -cursor.x * 4, y: -cursor.y * 4, duration: 0.06, ease: "power4.inOut"});

    // scroll
    if (curr_section != previous_section) {
        // gsap to new section
        gsap.to(camera.position, {x: camera_positions.x, y: camera_positions.y, z: camera_positions.z, duration: 1, ease: "sine.inOut"});
        gsap.to(camera_target.position, {x: camera_target_positions.x, y: camera_target_positions.y, z: camera_target_positions.z, duration: 1, ease: "sine.inOut"});
    }
    camera.lookAt(camera_target.position);
    requestAnimationFrame(loop);
}

//? Onload
loading_manager.onLoad = () => {
    renderer.compile(scene, camera);
    setTimeout(()=>{
        before_scroll_load();
        scroll_load();
        gsap.to(camera.position, {x: positions_array[0].x, y: positions_array[0].y, z: positions_array[0].z, duration: 1, ease: "power4.inOut"});
        gsap.to(camera_target.position, {x: camera_target_positions.x, y: camera_target_positions.y, z: camera_target_positions.z, duration: 1, ease: "power4.inOut"});
        camera.lookAt(camera_target.position);
        gsap.to(".name", {opacity: 0, duration: 1, delay: 1});
        gsap.to(home.style, {visibility: "visible", duration: 1, delay: 1});
        gsap.to(".nav_stagger", {visibility: "visible", duration: 1, delay: 2, stagger: 0.3});
    }, 3000);
    loop();
}

import {ScrollTrigger} from 'gsap/ScrollTrigger';
function before_scroll_load() {
    canvas.style.visibility = "visible";
    var spinner = document.getElementById("spinner");
    var ready = document.getElementById("ready");
    document.body.style.overflowY = "auto";
    gsap.to(canvas.style, {opacity: 1, duration: 0.5});
    gsap.to(spinner.style, {opacity: 0, duration: 1});
    gsap.to(ready.style, {opacity: 1, duration: 1});
}

function scroll_load() {

    ScrollTrigger.create({
        trigger: document.querySelector('.webgl'),
        onUpdate: (self) => {
            var ratio = self.progress;
            previous_section = curr_section;

            
            // ? out of all 5 positions in array, check which section, then move
            var section = ratio * positions_array.length; // from 0 to 1 becomes 0 to 5
            var section = Math.floor(section) // clamps down to nearest integer
            section == 5 ? section = 4 : section = section; // prevent out of index
            curr_section = section;
            
            // ? modify array of camera positions and camera target positions
            camera_positions.x = positions_array[section].x;
            camera_positions.y = positions_array[section].y;
            camera_positions.z = positions_array[section].z;

            var cam_x_offset = Math.cos(ratio * Math.PI) * 20;
            camera_target_positions.x = camera_positions.x + cam_x_offset;
            camera_target_positions.y = camera_positions.y - 30;
            camera_target_positions.z = 300;
        },
    });
}