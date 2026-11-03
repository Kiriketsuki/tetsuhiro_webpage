import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { DRACO_PATH } from './assets.js'

// One loading manager and one set of loaders for the whole scene, so the
// loading screen can count everything in one place.
export function createLoaders(manager = new THREE.LoadingManager()) {
    const draco = new DRACOLoader()
    draco.setDecoderPath(DRACO_PATH)
    draco.setDecoderConfig({ type: 'wasm' })
    draco.preload()

    const gltf = new GLTFLoader(manager)
    gltf.setDRACOLoader(draco)

    const texture = new THREE.TextureLoader(manager)

    return { manager, gltf, draco, texture }
}

export function disposeLoaders({ draco }) {
    draco.dispose()
}
