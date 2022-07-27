import * as THREE from 'three';

//? Set up
const canvas = document.getElementById('webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

//? Renderer options
const renderer = new THREE.WebGLRenderer({ canvas });

//? Camera
camera.position.set(0, 0, 5);

//? Models
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';



//? Scene

function loop() {
    requestAnimationFrame(loop);
    renderer.render(scene, camera);
}

loop();