import desktopUrl from '../assets/models/island_b.glb?url'
import mobileUrl from '../assets/models/island_b_lod1.glb?url'

// The files the scene downloads before its first frame. The shell imports this module too,
// so it can start those downloads before the scene chunk arrives (preloadScene). The module
// holds only URLs, so it adds well under 1 kB to the shell. It must not import three.

// A screen under this width takes the LOD1 island and the phone settings.
export const MOBILE = '(max-width: 767px)'

// The decoder is copied from three/examples/jsm/libs/draco into public/draco, so it ships
// with the site instead of coming from gstatic. The folder name is the three revision the
// copy came from. firebase.json caches it for a year, so a new decoder must go in a new
// folder, never over the old files.
export const DRACO_PATH = `${import.meta.env.BASE_URL}draco/r180/`
const DRACO_FILES = ['draco_wasm_wrapper.js', 'draco_decoder.wasm']

// lod: 1 for the phone island, 0 for the desktop island.
export const islandUrl = (lod) => (lod === 1 ? mobileUrl : desktopUrl)

export const isSmallScreen = () => window.matchMedia(MOBILE).matches

// Adds a preload link for the island and the Draco decoder. GLTFLoader and DRACOLoader fetch
// them with fetch(), in cors mode with same-origin credentials, and a preload with
// as="fetch" and crossorigin="anonymous" matches that request, so the loaders take the
// preloaded response and do not download the files again.
export function preloadScene() {
    const urls = [islandUrl(isSmallScreen() ? 1 : 0), ...DRACO_FILES.map((file) => DRACO_PATH + file)]
    urls.forEach((href) => {
        const link = document.createElement('link')
        link.rel = 'preload'
        link.as = 'fetch'
        link.crossOrigin = 'anonymous'
        link.href = href
        document.head.append(link)
    })
}
