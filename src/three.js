import * as THREE from 'three';

const canvas = document.getElementById('webgl');
console.log(canvas)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ canvas });

function loop() {
    requestAnimationFrame(loop);
    renderer.render(scene, camera);
}

loop();