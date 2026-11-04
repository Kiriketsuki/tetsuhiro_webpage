import * as THREE from 'three'
import { Octree } from './octree.js'
import collideUrl from '../../assets/models/aerie_collide.glb?url'

// The walk's collision world: aerie_collide.glb from
// scenes/urban-aerie-studies/export_aerie_collision.py. Its Collide mesh goes into an Octree
// once. The proxy never joins the drawn scene.
//
// The empties keep their nodes. An empty's scale is the half size of its box, so a point that
// worldToLocal maps inside the unit cube lies inside the box, turned with the empty.
// - Zone_<name>: the walker stops there and a prompt opens the zone.
// - Hop_<n>: a low top the walker hops onto.
// - Spawn_Campfire: the spot by the fire where Kinako sleeps and wakes.

const scratch = new THREE.Vector3()

// True when the world point p lies inside the box of the empty node. flat ignores the height.
export function insideBox(node, p, flat = false) {
    node.worldToLocal(scratch.copy(p))
    return Math.abs(scratch.x) <= 1 && Math.abs(scratch.z) <= 1 && (flat || Math.abs(scratch.y) <= 1)
}

export async function loadWorld(loaders) {
    const gltf = await loaders.gltf.loadAsync(collideUrl)
    const root = gltf.scene
    root.updateMatrixWorld(true)
    const collide = root.getObjectByName('Collide')
    if (!collide) throw new Error('aerie_collide.glb has no Collide mesh.')
    const octree = new Octree().fromGraphNode(collide)
    const named = (prefix) => root.children.filter((node) => node.name.startsWith(prefix))
    const zones = named('Zone_').map((node) => ({ id: node.name.slice(5), node, centre: node.getWorldPosition(new THREE.Vector3()) }))
    const hops = named('Hop_').map((node) => ({ node, top: node.getWorldPosition(new THREE.Vector3()).y }))
    const spawn = root.getObjectByName('Spawn_Campfire')?.getWorldPosition(new THREE.Vector3())
    if (!spawn) throw new Error('aerie_collide.glb has no Spawn_Campfire.')
    collide.geometry.dispose()
    return { octree, zones, hops, spawn }
}
