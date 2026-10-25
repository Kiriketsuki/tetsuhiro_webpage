import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// The decoder is copied from three/examples/jsm/libs/draco into public/draco,
// so it ships with the site instead of coming from gstatic. The folder name is
// the three revision the copy came from. firebase.json caches it for a year,
// so a new decoder must go in a new folder, never over the old files.
const DRACO_VERSION = 'r180'
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/${DRACO_VERSION}/`

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
