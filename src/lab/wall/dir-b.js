// Stub b until the direction lands.
export function createWall({ layer, pins }) {
    layer.textContent = `${pins.length} pins`
    return { ready: Promise.resolve(), highlight() {}, focus() {}, unfocus() {}, pan() {}, zoom() {}, tap: () => null, resize() {}, dispose() {} }
}
