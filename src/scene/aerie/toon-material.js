import * as THREE from 'three'
import { CARPET_TILE } from './leaf-carpet.js'

// One soft shading model for the whole urban aerie island, after the art style of Leaf it
// Alone, translated to a cozy night. Every opaque part shares one material, so the island
// compiles one program. The baked vertex colours carry the colour as smooth, large fields
// (palette.js and autumn.js), so no per-face jitter enters here.
//
// The light is a half-lambert wrap from the moon with a soft shadow, a hemisphere fill and
// warm spill from the lit windows and the campfire. It has no cel bands and no outline.
// Shadows keep the hue of the surface and turn darker and warmer, never grey.
//
// A painted detail texture (detail-texture.js) multiplies the albedo: boards with grain
// and seams on wood, soft mottle on plaster, paving stones in light mortar on the paths.
// The shader samples it in world space along the main axis of the flat normal, so it needs
// no UVs, and each surface family (the aSurface attribute) picks its channel, scale and
// strength. The roof reads as a smooth graphite membrane with a soft sky sheen, and metal
// reads through a small procedural matcap, so brass shows a sheen and never reads as plastic.
//
// The light blends each facet's flat normal with a creased smooth normal (soft-normals.js),
// so the low-poly facets still read while the tones ease across gentle bends.
//
// The patch replaces the light loop of MeshLambertMaterial with a fixed rig in uniforms.
// The scene needs no three.js lights, so a late light can never recompile the island.

const CACHE_KEY = 'aerie-toon-v3'
// The warm spill slots: the workshop window, the bedroom window and the campfire.
export const TOON_BOUNCES = 3
export const CAMPFIRE_BOUNCE = TOON_BOUNCES - 1

// The surface families. island-look.js writes one per mesh into the aSurface attribute.
export const SURFACE = {
    plain: 0,
    wood: 1,
    plaster: 2,
    stone: 3,
    roof: 4,
    foliage: 5,
    lawn: 6,
    metal: 7,
    fabric: 8,
    soil: 9,
    bark: 10,
    // Laid stones: the flagstone path, the steps and the stepping stones. The cliff under
    // the island stays in the stone family.
    paving: 11,
    // The outer plaster walls of the house: plaster panels in a dark timber frame over a stone
    // base, as on the cottages of Leaf it Alone (island-look.js tags them).
    timbered: 12,
}

// Night colours in linear light. The fill stays close to neutral and the moon is a pale
// silver, so the warm saturated albedo keeps its hue at night: honey wood reads honey and
// amber leaves read amber. A purple or deep blue fill would drown that colour. The sky
// side is a soft blue and the ground side a neutral mauve grey. A red-brown ground fill
// pushed every shaded face toward one orange-brown cast, turned the island underside
// maroon and gave the crown hollows a magenta tint. The lamps are a warm cream at about
// 3000 K. A deep orange lamp light turned every lit board, wall and floor the same orange.
// Round 6 drops the moon and the fill by about a third. At the round 5 level the lawn, the
// plaster and the decks read at almost daylight value, so the island read as a day scene
// under a night sky. The lamps keep their strength, so only lamps, windows and flames read
// bright.
const NIGHT = {
    sky: new THREE.Color(0xa3acc4),
    // Round 8 turns the ground fill from a mauve (#7d747c) to a near neutral warm grey. Under
    // the mauve fill the tan cliff of the island underside sampled hue 354, a maroon.
    ground: new THREE.Color(0x7a7774),
    moon: new THREE.Color(0xe8e4e4),
    warm: new THREE.Color(0xffc088),
    rim: new THREE.Color(0x9fb4dc),
}

// The leaf carpet tones, gold to rust, in sRGB. The carpet tile (leaf-carpet.js) picks one
// per leaf. Most leaves sit at amber and orange, as in the reference piles.
// Round 20 lifts the chroma of each tone, so the carpet reads as vivid gold, orange and rust
// leaves and not as brown mud (S5).
const CARPET_TONES = [0xf0b020, 0xe8860e, 0xd6540c, 0xb02c0a]

export function createToonUniforms({ moonDirection, bounces = [], warmStrength = 1.5, detail = null, carpet = null }) {
    const spots = Array.from({ length: TOON_BOUNCES }, (_, i) => {
        const spot = bounces[i]
        return spot ? new THREE.Vector4(spot.x, spot.y, spot.z, spot.radius) : new THREE.Vector4(0, -1e4, 0, 0)
    })
    return {
        uToonMoonDir: { value: moonDirection.clone().normalize() },
        // Round 9 drops the moon by about 35 percent and the fill by about 30 percent. The review
        // read the walls and the wood of S3 and S4 almost as bright as the lit windows, and asked
        // that only the windows, the lamps and the campfire read as the brightest values.
        uToonMoon: { value: NIGHT.moon.clone().multiplyScalar(0.33) },
        uToonSky: { value: NIGHT.sky.clone().multiplyScalar(0.29) },
        uToonGround: { value: NIGHT.ground.clone().multiplyScalar(0.31) },
        uToonWarm: { value: NIGHT.warm.clone().multiplyScalar(warmStrength) },
        uToonRim: { value: NIGHT.rim.clone().multiplyScalar(0.08) },
        uToonBounce: { value: spots },
        uToonSaturation: { value: 1.0 },
        // 0 keeps pure flat facets, 1 is fully smooth. At 0.9 the facets read only faintly.
        uToonSoftness: { value: 0.9 },
        // Look options, all off by default (the lab turns them on). uToonBands 1 steps the moon
        // light into three soft cel bands. uToonRimSpread 1 lets the rim reach the lit side too.
        uToonBands: { value: 0 },
        uToonRimSpread: { value: 0 },
        // uToonCel 1 is a hard two-tone cel: one lit tone, one shade tone in uToonShadeTint, and
        // the lamp pools in two steps.
        uToonCel: { value: 0 },
        uToonShadeTint: { value: new THREE.Color(0.78, 0.74, 1.0) },
        uToonDetail: { value: detail },
        uToonCarpet: { value: carpet?.texture ?? null },
        uToonCarpetShadow: { value: carpet?.shadow ?? null },
        uToonCarpetTones: { value: CARPET_TONES.map((hex) => new THREE.Color(hex)) },
    }
}

const VERTEX_PARS = /* glsl */ `
attribute vec3 flatNormal;
attribute float aSurface;
attribute float aLitter;
varying float vToonLitter;
varying vec3 vToonWorld;
varying vec3 vToonFlat;
varying float vToonSurface;
#ifdef AERIE_AO
attribute float aoBake;
varying float vToonAo;
#endif
#ifdef AERIE_CARD
attribute vec3 aBent;
attribute vec2 aCell;
attribute vec4 aSprite;
varying vec3 vCardBent;
varying float vCardCrown;
varying float vCardSide;
varying vec4 vCardSphere;
#endif
`
const VERTEX_MAIN = /* glsl */ `
#include <project_vertex>
vec4 toonLocal = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
toonLocal = instanceMatrix * toonLocal;
#endif
vToonWorld = ( modelMatrix * toonLocal ).xyz;
vToonFlat = mat3( modelMatrix ) * flatNormal;
vToonSurface = aSurface;
vToonLitter = aLitter;
#ifdef AERIE_AO
vToonAo = aoBake;
#endif
#ifdef AERIE_CARD
vCardBent = aBent;
vCardCrown = aSprite.x;
// Across the card from 0 to 1. The leaf midrib runs down the middle (leaf-cards.js).
vCardSide = uv.x;
// The fraction of aCell is the atlas cell. Its whole part holds the crown radius in
// decimetres (leaf-cards.js).
vMapUv = uv * 0.5 + fract( aCell );
vCardSphere = vec4( 0.0 );
// A crown card (aSprite.x = 1) faces the camera: aSprite.y is its spin in the screen
// plane and aSprite.zw its width and height, the width negative to mirror it. A card that
// keeps a fixed facing shows a thin edge to some stop, and at the crown silhouette those
// edges read as slivers. The bent crown normal still shades it, so the crown keeps its form.
if ( aSprite.x > 0.5 ) {
    vec2 toonSpin = vec2( cos( aSprite.y ), sin( aSprite.y ) );
    vec2 toonCorner = position.xy * aSprite.zw;
    toonCorner = vec2( toonCorner.x * toonSpin.x - toonCorner.y * toonSpin.y, toonCorner.x * toonSpin.y + toonCorner.y * toonSpin.x );
    mvPosition = modelViewMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 );
    mvPosition.xy += toonCorner;
    gl_Position = projectionMatrix * mvPosition;
    vToonWorld = ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz;
    // Round 20: the crown as one sphere, its centre and its radius in metres.
    vCardSphere = vec4( vToonWorld - aBent, floor( aCell.x ) * 0.1 );
    // aBent is the line from the crown centre to the card centre, in metres (leaf-cards.js).
    // With the corner offset added, each corner takes the crown normal at its own point, so
    // the light runs across a card and on into the next card as one field.
    vec3 toonCornerWorld = ( vec4( toonCorner, 0.0, 0.0 ) * viewMatrix ).xyz;
    vCardBent = normalize( aBent + toonCornerWorld );
    // Round 13 moves the world point to each corner, so the colour bands of the crown run
    // across a card as one smooth field and no card shows as one flat tone.
    vToonWorld += toonCornerWorld;
}
#endif
`

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vToonWorld;
varying vec3 vToonFlat;
varying float vToonSurface;
varying float vToonLitter;
#ifdef AERIE_AO
varying float vToonAo;
#endif
#ifdef AERIE_CARD
varying vec3 vCardBent;
varying float vCardCrown;
varying float vCardSide;
varying vec4 vCardSphere;
#endif
uniform sampler2D uToonCarpet;
uniform sampler2D uToonCarpetShadow;
uniform vec3 uToonCarpetTones[ 4 ];
uniform vec3 uToonMoonDir;
uniform vec3 uToonMoon;
uniform vec3 uToonSky;
uniform vec3 uToonGround;
uniform vec3 uToonWarm;
uniform vec3 uToonRim;
uniform vec4 uToonBounce[ ${TOON_BOUNCES} ];
uniform float uToonSaturation;
uniform float uToonSoftness;
uniform float uToonBands;
uniform float uToonRimSpread;
uniform float uToonCel;
uniform vec3 uToonShadeTint;
uniform sampler2D uToonDetail;

// Per surface family, in SURFACE order: metres per detail tile along u (the board length)
// and v, the channel to read (R wood boards, G mottle, B paving, A leaf clumps) and the
// strength. The wood tile is three times longer than it is tall, so each board runs about
// 3 m with two staggered end joints, and the cladding reads as long planks, not tiles.
// The lawn reads the mottle at 5 m, so its painted patches span several facets.
const vec2 TOON_TILE[ 13 ] = vec2[]( vec2( 0.7 ), vec2( 3.2, 1.05 ), vec2( 2.2 ), vec2( 3.0 ), vec2( 3.0 ), vec2( 0.9 ),
    vec2( 5.0 ), vec2( 1.6 ), vec2( 1.6 ), vec2( 1.6 ), vec2( 0.8 ), vec2( 1.0 ), vec2( 2.2 ) );
const vec4 TOON_CHANNEL[ 13 ] = vec4[](
    vec4( 0, 1, 0, 0 ), vec4( 1, 0, 0, 0 ), vec4( 0, 1, 0, 0 ), vec4( 0, 1, 0, 0 ), vec4( 0, 1, 0, 0 ), vec4( 0, 0, 0, 1 ),
    vec4( 0, 1, 0, 0 ), vec4( 0, 1, 0, 0 ), vec4( 0, 1, 0, 0 ), vec4( 0, 1, 0, 0 ), vec4( 1, 0, 0, 0 ), vec4( 0, 0, 1, 0 ), vec4( 0, 1, 0, 0 ) );
// Foliage takes no detail. The leaf clump channel drew a pattern of round blotches on the
// crown lumps, which read as a repeated circle stamp in the close telescope shot.
// The plaster takes no plain detail multiply: its mottle has its own warm and cool patches
// below, because a stronger multiply drew dark stains on the walls.
// Round 9 gives the plain family a faint mottle and the fabric a stronger one, so a chair, a
// sofa or a desk top shows painted variation at a close crop, not one flat fill.
// Round 11 raises the wood to 0.75, so the plank grain and the knots read at a 300 px crop.
// The flat roof takes a faint 3 m weathering mottle only, so it reads as one smooth membrane.
// Round 14 drops the wood to 0.34. At 0.75 the boards read as high-contrast barcode stripes
// on the posts, beams and decks, and the review asked for a subtle grain at a 300 px crop.
// Round 19 lifts the wood to 0.46, so the frame timber shows painted grain and plank seams at a
// close crop (S1, S7), still well under the round 11 barcode level.
const float TOON_DETAIL[ 13 ] = float[]( 0.16, 0.46, 0.0, 0.5, 0.12, 0.0, 0.34, 0.05, 0.3, 0.26, 0.45, 0.55, 0.0 );
// How strongly the chamfer catch-light shows per family. Lawn and leaves get none, so the
// facet edges never draw a pattern there.
// Round 11 cuts the wood catch to 0.25. The lit lower lip of each lap board drew a hard light
// stripe under a darker board face, so the siding read as stepped bands.
// Round 14 cuts the outer cream walls to 0.1, so the lap boards of the telescope wall (S4) read
// as even, subtle bands and not as bright lines under each board.
const float TOON_CATCH[ 13 ] = float[]( 0.5, 0.25, 0.6, 0.6, 0.8, 0.0, 0.0, 3.0, 0.3, 0.0, 0.6, 1.0, 0.1 );

`

// The normal is in view space. Multiplying by viewMatrix from the left side applies the
// transpose, which turns a view-space direction back into world space.
//
// The moon casts the only shadow. The scene holds one DirectionalLight for it, so three.js
// sets up the shadow map, and this block reads that map directly.
//
// A mesh without a flatNormal attribute reads zeros there, so it falls back to the smooth
// normal alone. A mesh without aSurface reads 0, the plain family with no detail.
const FRAGMENT_LIGHT = /* glsl */ `
vec3 toonSmooth = ( vec4( normal, 0.0 ) * viewMatrix ).xyz;
#ifdef AERIE_CARD
toonSmooth = vCardBent;
// Round 20 shades every crown card with the normal of one sphere round its crown, where the view
// ray through this pixel meets that sphere. Overlapping cards on one pixel then take one normal,
// so the light runs across the crown as one smooth field. The normal of each card corner gave
// every card its own light top and dark rim, and the crowns read as dabs of pigment (S4).
// Outside the sphere the ray takes its closest point, the normal of the crown outline.
if ( vCardSphere.w > 0.0 ) {
    vec3 toonRay = normalize( vToonWorld - cameraPosition );
    vec3 toonOc = cameraPosition - vCardSphere.xyz;
    float toonB = dot( toonOc, toonRay );
    float toonH = toonB * toonB - dot( toonOc, toonOc ) + vCardSphere.w * vCardSphere.w;
    toonSmooth = toonOc + toonRay * ( -toonB - sqrt( max( toonH, 0.0 ) ) );
}
#endif
vec3 toonFlat = vToonFlat;
float toonFlatLength = length( toonFlat );
// A degenerate triangle can carry a zero normal. It falls back to the other normal, or to
// straight up, so no NaN reaches the half-float target and the glow blur.
float toonSmoothLength = length( toonSmooth );
toonSmooth = toonSmoothLength > 1e-4 ? toonSmooth / toonSmoothLength : ( toonFlatLength > 0.5 ? toonFlat / toonFlatLength : vec3( 0.0, 1.0, 0.0 ) );
toonFlat = toonFlatLength > 0.5 ? toonFlat / toonFlatLength : toonSmooth;
int toonSurface = int( vToonSurface + 0.5 );
// The ink mask for the outline in grade-pass.js. The house, the trees, the bridge, the pad and
// the props take ink. The ground does not. The scene target alpha holds 1 - toonInk, so a
// blended layer such as the waterfall can only raise the alpha and turn ink off, never on.
// The leaf cards keep their own alpha, because alpha to coverage turns it into the MSAA
// coverage: a zero alpha made the crowns vanish. So the crowns take no ink.
float toonInk = toonSurface == ${SURFACE.stone} || toonSurface == ${SURFACE.lawn} || toonSurface == ${SURFACE.soil} || toonSurface == ${SURFACE.paving} ? 0.0 : 1.0;
// Round 10: a crown leaf or lump on the far side of its crown, seen through a gap between the
// near leaves, takes the normal of the near side mirrored through the view plane. Its own
// normal turned it to the shade side, and the far side showed through the gaps as dark
// patches with leafy edges inside the lit crown.
#ifdef AERIE_CARD
bool toonCrownSide = vCardCrown > 0.5;
#else
bool toonCrownSide = toonSurface == ${SURFACE.foliage};
#endif
if ( toonCrownSide ) {
    vec3 toonToEye = normalize( cameraPosition - vToonWorld );
    toonSmooth -= 2.0 * min( dot( toonSmooth, toonToEye ), 0.0 ) * toonToEye;
}
toonFlat *= sign( dot( toonFlat, toonSmooth ) + 1e-4 );
// Round 9 shades the cliff on the smooth normal alone. Its flat facets alternated light and
// dark from one face to the next under the island (S7, S9), and read as flat plastic.
// Round 17 shades the lawn, the soil and the outer walls on the smooth normal alone too. The
// large lawn-edge triangles (S7, S9) and the lap boards of the tower wall (S4) drew hard light
// steps from one flat face to the next.
bool toonSmoothOnly = toonSurface == ${SURFACE.stone} || toonSurface == ${SURFACE.lawn} || toonSurface == ${SURFACE.soil} || toonSurface == ${SURFACE.timbered};
vec3 toonN = normalize( mix( toonFlat, toonSmooth, toonSmoothOnly ? 1.0 : uToonSoftness ) );
// The thin top and bottom lips of the lap boards take the light of a wall that faces the eye,
// so each lip reads in the tone of the boards around it and draws no light or dark line.
if ( toonSurface == ${SURFACE.timbered} && abs( toonFlat.y ) > 0.5 ) {
    vec3 toonEyeFlat = cameraPosition - vToonWorld;
    toonEyeFlat.y = 0.0;
    toonN = normalize( toonEyeFlat + vec3( 1e-4, 0.0, 0.0 ) );
}
// A grass blade seen from its back gets a flipped normal from the double-sided pass. The
// lawn always faces up, so the blade turns back up and shades as the lawn does.
if ( toonSurface == ${SURFACE.lawn} && toonN.y < 0.0 ) {
    toonN = -toonN;
    toonSmooth = -toonSmooth;
}
// Round 20: below the lawn lip, a cliff ledge that faces up shades as the cliff side round it.
// The rock cleft between the island and the pad lobe caught the moon and the sky as a pale
// lilac shard (S5, S6) and a purple smear (S9).
if ( toonSurface == ${SURFACE.stone} ) {
    toonSmooth.y = mix( toonSmooth.y, min( toonSmooth.y, -0.6 ), smoothstep( -0.2, -0.7, vToonWorld.y ) );
    toonSmooth = normalize( toonSmooth );
    toonN = toonSmooth;
}

float toonShadow = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow toonMoonShadow = directionalLightShadows[ 0 ];
    toonShadow = getShadow( directionalShadowMap[ 0 ], toonMoonShadow.shadowMapSize, toonMoonShadow.shadowIntensity,
        toonMoonShadow.shadowBias, toonMoonShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] );
    // A face that turns almost edge-on to the moon gets little moon light, but there the
    // shadow map draws stair-step bands, as the slats did on the telescope wall. The
    // shadow fades out toward the edge-on angle, so the wall shades evenly.
    toonShadow = mix( 1.0, toonShadow, smoothstep( 0.02, 0.2, dot( toonSmooth, uToonMoonDir ) ) );
#endif
// A crown shades as one soft mass. The lumps under the cards throw small hard shadows onto
// the cards and onto each other, and those read as dark maroon patches in a close-up, so
// the leaves keep only a faint share of the moon shadow.
#ifdef AERIE_CARD
toonShadow = mix( 1.0, toonShadow, 0.15 );
#endif
// Round 7 cuts the lump share further: each lump threw a hard edge onto its neighbour, and
// the crown read as stacked flat polygons in the close telescope shot on a phone.
if ( toonSurface == ${SURFACE.foliage} ) toonShadow = mix( 1.0, toonShadow, 0.15 );
// Round 14 halves the moon shadow on the outer cream walls, where each lap board cast a hard
// dark band onto the board below it (S4).
// Round 17 cuts it to a quarter, because the bands still read as hard steps.
if ( toonSurface == ${SURFACE.timbered} ) toonShadow = mix( 1.0, toonShadow, 0.25 );

// The painted detail: one fetch, projected along the main axis of the flat normal. A change
// of axis falls on a geometry edge, so no seam crosses a face. The plane keeps the
// horizontal axis in u, so wood grain runs along the boards. Bark turns it upright.
vec3 toonAxis = abs( toonFlat );
vec2 toonPlane = toonAxis.y >= max( toonAxis.x, toonAxis.z ) ? vToonWorld.xz : ( toonAxis.x >= toonAxis.z ? vToonWorld.zy : vToonWorld.xy );
if ( toonSurface == ${SURFACE.bark} || ( toonSurface == ${SURFACE.wood} && toonAxis.y >= max( toonAxis.x, toonAxis.z ) ) ) toonPlane = toonPlane.yx;
vec4 toonTexel = texture2D( uToonDetail, toonPlane / TOON_TILE[ toonSurface ] );
float toonDetail = dot( toonTexel, TOON_CHANNEL[ toonSurface ] );
// Round 11: the side of a laid stone or a step riser takes the soft mottle, not the paving
// pattern, so the joints of the path never run down over the step faces.
if ( toonSurface == ${SURFACE.paving} && toonAxis.y < max( toonAxis.x, toonAxis.z ) ) toonDetail = toonTexel.g;

vec3 toonAlbedo = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, uToonSaturation );
toonAlbedo *= mix( 1.0, toonDetail * 2.0, TOON_DETAIL[ toonSurface ] );
// The lawn takes painted hue patches from the same 5 m mottle: olive where the mottle is
// low and gold where it is high. The change spans several metres, never one facet.
if ( toonSurface == ${SURFACE.lawn} ) {
    // Round 6 takes the green out of both ends, so the patches run olive-gold to gold and the
    // lawn never reads as an olive-green field.
    // Round 10 warms both ends again, toward olive-gold, because the blue sky fill still read
    // the bare lawn as olive green.
    // Round 11 drops the value and the blue of both ends, so the lawn reads a saturated
    // olive-gold at night and not a khaki grey.
    // Round 14 turns both ends a step toward warm brown-olive, so the open lawn mid-tones sit
    // under the lamps, the windows and the flame.
    // Round 16 turns both ends a step toward gold, so the lawn reads as a lit olive-gold lawn
    // at night and not as a muddy olive-brown (S9, S10).
    // Round 18 turns both ends a little further toward olive-gold.
    // Round 19 takes some blue out of both ends, so the lawn reads a saturated olive-gold and
    // not a murky brown-olive (S5, S9, S10).
    toonAlbedo *= mix( vec3( 0.97, 0.87, 0.28 ), vec3( 1.1, 0.94, 0.24 ), smoothstep( 0.32, 0.68, toonDetail ) );
    // A second, finer mottle at 1.7 m moves the value, so no stretch of open lawn reads
    // as one flat fill between the 5 m patches.
    // Round 18 widens it, and adds a faint grass grain at 0.4 m, so a 300 px crop of bare lawn
    // shows painted texture (S7, S10).
    // Round 19 narrows the 1.7 m mottle and drops the 1 m hue mottle. Together they drew a
    // cellular wash on the lawn (S5, S9, S2 phone). A fine grass grain takes their place: short
    // strokes about 0.1 m wide and 0.4 m long, in two crossed layers, so the lawn reads as
    // painted grass at a close crop and no cell pattern shows.
    toonAlbedo *= 0.9 + 0.2 * texture2D( uToonDetail, vToonWorld.xz / 1.7 + 0.53 ).g;
    float toonGrain = texture2D( uToonDetail, vToonWorld.xz / vec2( 0.1, 0.4 ) + 0.71 ).g + texture2D( uToonDetail, vToonWorld.zx / vec2( 0.13, 0.5 ) + 0.29 ).g;
    toonAlbedo *= 0.86 + 0.14 * toonGrain;
    // The leaf carpet (leaf-carpet.js). vToonLitter is the litter amount of the lawn, from
    // autumn.js: about 1 under a crown and lower out on the open lawn. A leaf shows where the
    // amount passes its rank, so the carpet thins out leaf by leaf, never as a fading decal.
    // The ground between the leaves turns a dark umber, as the soil between the leaves of the
    // reference does.
    vec4 toonLeaf = texture2D( uToonCarpet, vToonWorld.xz / ${CARPET_TILE.toFixed(2)} );
    vec4 toonLeafShadow = texture2D( uToonCarpetShadow, vToonWorld.xz / ${CARPET_TILE.toFixed(2)} );
    float toonAmount = vToonLitter * ( 0.85 + 0.3 * toonDetail );
    float toonCover = toonLeaf.a * smoothstep( toonLeaf.b - 0.04, toonLeaf.b + 0.04, toonAmount );
    // The contact shadow of a leaf shows only while that leaf shows.
    float toonLeafShade = toonLeafShadow.r * smoothstep( toonLeafShadow.g - 0.04, toonLeafShadow.g + 0.04, toonAmount );
    // Round 17 turns the ground between the leaves from a dark umber to a warm olive-gold, so
    // the lawn under the litter no longer reads as murky brown (S9, S10).
    toonAlbedo = mix( toonAlbedo, toonAlbedo * vec3( 0.9, 0.8, 0.5 ), smoothstep( 0.3, 0.8, vToonLitter ) * 0.5 );
    float toonTone = clamp( toonLeaf.r + ( toonDetail - 0.5 ) * 0.5, 0.0, 1.0 ) * 3.0;
    vec3 toonLeafColor = mix( uToonCarpetTones[ 0 ], uToonCarpetTones[ 1 ], clamp( toonTone, 0.0, 1.0 ) );
    toonLeafColor = mix( toonLeafColor, uToonCarpetTones[ 2 ], clamp( toonTone - 1.0, 0.0, 1.0 ) );
    toonLeafColor = mix( toonLeafColor, uToonCarpetTones[ 3 ], clamp( toonTone - 2.0, 0.0, 1.0 ) );
    toonLeafColor *= 0.4 + 0.58 * toonLeaf.g;
    toonAlbedo = mix( toonAlbedo, toonLeafColor, toonCover );
    toonAlbedo *= 1.0 - 0.6 * toonLeafShade;
    // Round 11 turns the steep turf banks, such as the side of the pad lobe, to a darker warm
    // soil brown, so the cliff side reads apart from the olive lawn on top.
    // Round 17 reads the smooth normal, so the bank tint eases over the lawn edge and no
    // single large facet turns brown on its own (S7, S9).
    float toonBank = smoothstep( 0.6, 0.3, toonSmooth.y );
    toonAlbedo = mix( toonAlbedo, dot( toonAlbedo, vec3( 0.3333 ) ) * vec3( 1.05, 0.78, 0.6 ), toonBank * 0.75 );
    // Round 12 drops the lawn and its litter by about a quarter, so away from the lamps the
    // ground falls into the night and only the lamps, windows and campfire read bright.
    // Round 13 drops it again, so the lawn and the litter sit clearly under the lamp spill.
    // Round 14 drops it a little more, so only the lamps, the windows and the flame read bright.
    // Round 17 lifts it a step, with the olive-gold ground above, so the lawn reads olive-gold.
    // Round 20 drops it again and lifts the litter chroma (CARPET_TONES), so the ground sits
    // clearly under the lamps, the windows and the flame, and the leaves still read vivid.
    toonAlbedo *= 0.56;
}
// The blue sky fill turned the cream plaster a cool grey-white. A small warm tint keeps it
// cream (about #e6dccb where the moon lights it) without a change to the shared light rig.
bool toonTimbered = toonSurface == ${SURFACE.timbered};
if ( toonSurface == ${SURFACE.plaster} || toonTimbered ) {
    // Round 10 darkens and warms the cream, so the walls read clearly darker than the lit
    // windows. The pale grey-white plaster read almost as bright as the window glow.
    toonAlbedo *= vec3( 0.86, 0.79, 0.68 );
    // Round 8 paints the plaster in broad patches about a metre across: a warm, lighter cream
    // where the mottle is high and a cooler, darker cream where it is low, a value spread of
    // about 12 percent. The review found the round 7 mottle too faint, and a plain multiply
    // strong enough to show read as dark stains.
    // Round 16 narrows the patches to a value spread of about 5 percent with no hue shift. The
    // review read the wider patches as brown stains and dirt (S4, S3).
    toonAlbedo *= mix( 0.97, 1.02, smoothstep( 0.3, 0.7, toonDetail ) );
    // Round 11 adds a finer trowel mottle at 0.6 m, so the plaster shows soft painted patches
    // at a 300 px crop and does not read as one flat fill. Round 16 turns it into a faint even
    // grain at 0.25 m.
    // Round 19 doubles the grain and adds soft vertical brush strokes, about 0.1 m wide, so a
    // 300 px crop of the wall shows painted variation (S1, S4).
    toonAlbedo *= 0.94 + 0.12 * texture2D( uToonDetail, toonPlane / 0.25 + 0.29 ).g;
    toonAlbedo *= 0.93 + 0.14 * texture2D( uToonDetail, toonPlane / vec2( 0.12, 0.9 ) + 0.47 ).g;
    // Round 20 drops the round 17 value mottle at 1.4 m and the umber wear patches. The review
    // read them as a large dirty wash stain on the wall (S4). The even grain and the strokes stay.
}
// The outer walls read as the warm cream plaster of the store page cottages. Round 13 drops
// the painted timber posts and braces: under the cladding boards they read as hard dark
// diagonal and vertical streaks across the wall (S4). The real window frames, corner posts
// and boards carry the honey trim. Below 1.7 m the wall turns to a stone base in light mortar.
if ( toonTimbered ) {
    // The outer walls take back some of the yellow of the indoor plaster cut, so they read
    // as a warm cream and not as mustard.
    toonAlbedo *= vec3( 1.08, 1.1, 1.2 );
    float stoneBase = 1.0 - smoothstep( 1.66, 1.7, vToonWorld.y );
    // Round 13 darkens and warms the base, which read as a milky grey plinth through the S2 glass.
    // Round 19 paints the base as chunky warm grey-tan blocks about 0.4 m across under a darker
    // capping course, so the plinth reads as a stone band at the foot of the wall (S1, S7).
    vec3 stone = vec3( 0.4, 0.34, 0.28 ) * ( 0.55 + 0.9 * texture2D( uToonDetail, toonPlane / 0.8 + 0.4 ).b );
    stone *= 1.0 - 0.3 * smoothstep( 1.5, 1.56, vToonWorld.y );
    toonAlbedo = mix( toonAlbedo, stone, stoneBase );
}
// Laid stones and boulders take a broad painted mottle, seen from above, at about 4 m:
// mossy olive where the mottle is low and warm tan where it is high. A boulder of one or
// two metres then shows a soft change across it and does not read as a flat fill.
if ( toonSurface == ${SURFACE.paving} ) {
    float toonBroad = texture2D( uToonDetail, vToonWorld.xz / 4.0 + 0.21 ).g;
    // Round 7 takes the green out of the low end. It read as a cool grey-green on the pad
    // curb and the bridge abutment, and the review asked for a warm grey-tan.
    toonAlbedo *= mix( vec3( 0.84, 0.8, 0.72 ), vec3( 1.1, 1.03, 0.93 ), smoothstep( 0.3, 0.7, toonBroad ) );
    toonAlbedo *= 0.88 + 0.24 * texture2D( uToonDetail, toonPlane / 0.8 + 0.71 ).g;
    // Round 8 adds a top-lit tint, as the painted stones of the reference show: the faces that
    // look up take a warm sunlit tan, and the sides turn to a darker olive moss. A stone of a
    // metre or two then shows two hue zones across several faces, not one flat grey fill.
    float toonTop = smoothstep( 0.35, 0.85, toonFlat.y );
    // Round 11 warms the sides from olive moss to a darker grey-tan, so a step riser reads as
    // the same stone in shade and not as a green band.
    toonAlbedo *= mix( vec3( 0.8, 0.74, 0.64 ), vec3( 1.1, 1.0, 0.86 ), toonTop );
    // Round 17 paints a soft value mottle at about 0.35 m across each stone, so a stepping stone
    // shows a painted surface at a close crop and not one flat fill (S5, S10).
    // Round 18 widens that mottle and adds a fine speckle at 0.12 m, because the stepping stones
    // still read as clean plastic in S5.
    toonAlbedo *= 0.84 + 0.32 * texture2D( uToonDetail, toonPlane / 0.35 + 0.53 ).g;
    toonAlbedo *= 0.93 + 0.14 * texture2D( uToonDetail, toonPlane / 0.12 + 0.19 ).g;
    // Round 20 adds a soft warm and cool hue drift at about 1.2 m, so a grey stepping stone shows
    // painted variation across its face (S5, S10).
    toonAlbedo *= mix( vec3( 0.94, 0.97, 1.03 ), vec3( 1.07, 1.0, 0.9 ), texture2D( uToonDetail, toonPlane / 1.2 + 0.07 ).g );
}
// The cliff shows soft strata: wide bands along the height, bent by the mottle, a little
// lighter and warmer in one band, cooler in the next.
if ( toonSurface == ${SURFACE.stone} ) {
    // A second, finer mottle, so a boulder of a metre or two shows painted variation too.
    // The 3 m mottle alone left the boulders on top of the island as flat fills.
    float toonFine = texture2D( uToonDetail, toonPlane / 0.9 + 0.37 ).g;
    // Round 18 strengthens it, so the large cliff faces show painted rock at a 300 px crop (S5).
    toonAlbedo *= mix( 1.0, toonFine * 2.0, 0.5 );
    float toonStrata = sin( ( vToonWorld.y + toonDetail * 1.6 ) * 4.2 );
    toonAlbedo *= mix( vec3( 0.9, 0.9, 0.94 ), vec3( 1.08, 1.04, 0.98 ), toonStrata * 0.5 + 0.5 );
    // Round 9 paints rock detail on the cliff: short streaks stretched along the strata, darker
    // in the cracks and lighter on the ledges, a value spread of about a fifth.
    float toonRock = texture2D( uToonDetail, vec2( toonPlane.x / 1.4, vToonWorld.y / 0.38 ) + 0.13 ).g;
    toonAlbedo *= 0.84 + 0.32 * smoothstep( 0.2, 0.8, toonRock );
    // Round 11 turns the steep sides and the underside to a warm brown with a trace of mauve,
    // darker toward the underside, so the cliff reads as earth and rock, apart from the olive
    // lawn on top, and the underside reads warm brown-indigo, not olive.
    // Only the cliff below the lawn lip turns, so the steps and boulders on top keep their tan.
    float toonSide = smoothstep( 0.55, -0.6, toonSmooth.y ) * smoothstep( 0.5, -0.3, vToonWorld.y );
    float toonGrey = dot( toonAlbedo, vec3( 0.3333 ) );
    toonAlbedo = mix( toonAlbedo, toonGrey * vec3( 1.18, 0.86, 0.84 ), toonSide * 0.75 );
    // Round 20 drops the round 19 ledge tint. The ledges below the lawn lip now take the
    // normal of the cliff side (above), so they shade as the cliff does.
    toonAlbedo *= 1.0 - 0.3 * smoothstep( 0.0, -0.8, toonSmooth.y );
}
// Round 10 paints the flat soil faces, which are the pad deck, as worn asphalt: a broad wear
// mottle, fine scuffs and faint panel seams on a 1.8 m grid. The round 9 deck read as one
// flat dark fill at a close crop.
if ( toonSurface == ${SURFACE.soil} && toonFlat.y > 0.8 ) {
    float toonWear = texture2D( uToonDetail, vToonWorld.xz / 3.2 + 0.41 ).g;
    float toonScuff = texture2D( uToonDetail, vToonWorld.xz / 0.45 + 0.17 ).g;
    vec2 toonPanel = abs( fract( vToonWorld.xz / 1.8 ) - 0.5 );
    float toonSeam = 1.0 - smoothstep( 0.47, 0.495, max( toonPanel.x, toonPanel.y ) ) * 0.22;
    // Round 19 strengthens the scuffs and adds a fine concrete speckle at about 0.12 m, so the
    // pad top shows worn concrete at a 300 px crop and not only a faint grid (S5, S9).
    float toonSpeck = texture2D( uToonDetail, vToonWorld.xz / 0.12 + 0.63 ).g;
    toonAlbedo *= ( 0.8 + 0.42 * smoothstep( 0.25, 0.75, toonWear ) ) * ( 0.84 + 0.32 * toonScuff ) * ( 0.88 + 0.24 * toonSpeck ) * toonSeam;
}
// The flat modern roof: a smooth graphite membrane with no shingle, slate or tile pattern,
// after the user asked for a flat modern look in place of the slate gable. A fine faint mottle
// keeps a close crop from one flat fill, and the faces that look up take a soft cool sheen of
// the sky toward the grazing angle, so the roof plane eases from dark near the eye to a lighter
// graphite toward its far edge, as a metal membrane does.
if ( toonSurface == ${SURFACE.roof} ) {
    toonAlbedo *= 0.94 + 0.12 * texture2D( uToonDetail, toonPlane / 0.9 + 0.47 ).g;
    float toonGraze = 1.0 - max( dot( toonSmooth, normalize( cameraPosition - vToonWorld ) ), 0.0 );
    // Round 14 paints the soffit as well as the top, so the roof reads as metal from the
    // welcome shot too, which looks up at the underside.
    float toonDeck = smoothstep( 0.5, 0.9, abs( toonFlat.y ) );
    // Round 20 halves the grazing sheen, so the far edge of the roof stays a dark charcoal and
    // never turns a pale steel grey (S1, S6, S7).
    toonAlbedo = mix( toonAlbedo, vec3( 0.3, 0.29, 0.28 ), toonGraze * toonGraze * 0.3 * smoothstep( 0.5, 0.9, toonFlat.y ) );
    // Round 14: a gentle value falloff across the plane from a 6 m mottle, so the slab never
    // reads as one flat cutout.
    toonAlbedo *= mix( 1.0, mix( 0.8, 1.14, smoothstep( 0.25, 0.75, texture2D( uToonDetail, vToonWorld.xz / 6.0 + 0.19 ).g ) ), toonDeck );
    // Round 13: faint standing seams every 0.5 m across the deck, each a thin lit rib with a
    // soft shade on its far side, so the membrane reads as a metal roof and not as a tabletop.
    // Round 18 fades the ribs out where one rib spacing covers less than about four pixels.
    // There the thin ribs aliased into random light scratches (S1, S7). Only the top face
    // carries the ribs. The soffit stays one plain dark tone.
    float toonSeamU = vToonWorld.x / 0.5;
    float toonSeamW = max( fwidth( toonSeamU ), 0.01 );
    float toonSeamD = fract( toonSeamU ) - 0.5;
    float toonRib = 1.0 - smoothstep( toonSeamW, toonSeamW * 2.5, abs( toonSeamD - 0.46 ) );
    float toonRibShade = 1.0 - smoothstep( toonSeamW, toonSeamW * 4.0, abs( toonSeamD - 0.42 ) );
    float toonRibFade = 1.0 - smoothstep( 0.12, 0.25, toonSeamW );
    // Round 19 puts the ribs on the soffit as well and makes them a little stronger, so the
    // roof reads as standing-seam metal from below in the welcome shot (S1, S7). The soffit
    // turns a neutral charcoal, not a cool blue-grey.
    toonAlbedo *= 1.0 + smoothstep( 0.5, 0.9, abs( toonFlat.y ) ) * toonRibFade * ( 0.4 * toonRib - 0.16 * toonRibShade );
    toonAlbedo = mix( toonAlbedo, vec3( 0.23, 0.215, 0.2 ), smoothstep( -0.5, -0.9, toonFlat.y ) * 0.5 );
}

// A crown reads as one rounded mass: a lit, lighter top and a darker, warmer underside,
// from the bent crown normal (crowns.js), which the lumps and the cards share. Leaf it
// Alone paints its crowns the same way. The moon light alone left the crowns one flat tone.
#ifdef AERIE_CARD
float toonCrownCard = vCardCrown;
#else
float toonCrownCard = 0.0;
#endif
if ( toonSurface == ${SURFACE.foliage} || toonCrownCard > 0.5 ) {
    // Round 20 paints one coherent band across each crown, from a deep rust on the shade side
    // and the underside to a warm gold-amber on the lit top and the moon side, over the whole
    // crown. The band follows the crown normal, which is one smooth sphere for the cards, so the
    // hue never changes from one card to the next. The round 13 to 19 world-space hue patches at
    // about 2 m drew small per-dab hue changes, so they go.
    float toonSun = dot( toonSmooth, normalize( uToonMoonDir + vec3( 0.0, 0.8, 0.0 ) ) ) * 0.5 + 0.5;
    float toonUp = smoothstep( -0.75, 0.9, toonSmooth.y ) * 0.55 + toonSun * 0.45;
    toonAlbedo *= mix( vec3( 0.66, 0.42, 0.27 ), vec3( 1.34, 1.26, 0.8 ), smoothstep( 0.12, 0.95, toonUp ) );
    // The crown darkens a little toward its outline, where the crown normal turns away from
    // the eye, so it reads as one rounded volume and not as a flat cutout.
    float toonFacing = dot( toonSmooth, normalize( cameraPosition - vToonWorld ) );
    toonAlbedo *= mix( 0.84, 1.0, smoothstep( -0.1, 0.7, toonFacing ) );
    // Round 20 lifts the chroma, so the rust, orange and gold read as vivid as the leaf piles
    // of the reference, while the night light keeps their value low.
    toonAlbedo = max( mix( vec3( dot( toonAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) ) ), toonAlbedo, 1.2 ), 0.0 );
}
#ifdef AERIE_CARD
// A loose leaf on the lawn folds along its midrib (leaf-cards.js): one half faces the light
// and the other half sits in its own shade, as the curled leaves of the reference do.
if ( toonCrownCard < 0.5 ) {
    float toonFold = smoothstep( 0.44, 0.56, vCardSide );
    toonAlbedo *= mix( 0.7, 1.06, toonFold );
}
#endif

// A light catch on chamfered edges, where the flat and the smooth normal part ways.
float toonCatch = smoothstep( 0.02, 0.12, 1.0 - dot( toonFlat, toonSmooth ) ) * TOON_CATCH[ toonSurface ];
toonAlbedo += toonCatch * 0.1 * mix( toonAlbedo, vec3( 0.86, 0.74, 0.55 ), 0.5 );

#ifdef AERIE_AO
// Baked crease darkening from the _AO bake in export_island_b.py. The albedo takes
// mix( 1, aoBake, 0.4 ), and the occluded part goes a soft warm umber (#423328) instead of
// grey. A redder brown (#3a2620) pulled the honey wood toward red-brown in every crease.
// The crown lumps skip it: the bake darkened every seam where two lumps meet, and those
// seams drew the outline of each lump inside the crown.
toonAlbedo *= mix( vec3( 1.0 ), mix( vec3( 0.259, 0.2, 0.157 ), vec3( 1.0 ), vToonAo ), toonSurface == ${SURFACE.foliage} ? 0.0 : 0.4 );
#endif

// Half-lambert wrap from the moon, so the light falls off smoothly with no band steps.
float toonWrap = dot( toonN, uToonMoonDir ) * 0.5 + 0.5;
float toonDiffuse = toonWrap * toonWrap * toonShadow;
// Soft cel bands: three steps, each with a short soft edge, so no band edge aliases.
float toonBand = ( floor( toonDiffuse * 3.0 ) + smoothstep( 0.4, 0.6, fract( toonDiffuse * 3.0 ) ) ) / 3.0;
toonDiffuse = mix( toonDiffuse, toonBand, uToonBands );
// The two-tone edge spans about one pixel, so the cel line stays crisp but does not alias.
float toonCelEdge = fwidth( toonDiffuse ) + 0.015;
float toonCel = smoothstep( 0.3 - toonCelEdge, 0.3 + toonCelEdge, toonDiffuse );
toonDiffuse = mix( toonDiffuse, mix( 0.12, 0.78, toonCel ), uToonCel );
toonAlbedo = mix( toonAlbedo, toonAlbedo * uToonShadeTint, uToonCel * ( 1.0 - toonCel ) );
// The shade side keeps its hue: darker values get richer and warmer instead of grey.
toonAlbedo = max( toonAlbedo, vec3( 0.0 ) );
// A power of 1.2 pushed every shaded honey board to red-brown, so the shade side keeps a
// smaller power.
toonAlbedo = mix( toonAlbedo, pow( toonAlbedo, vec3( 1.1 ) ) * 0.92, 1.0 - toonDiffuse );
vec3 toonLight = mix( uToonGround, uToonSky, toonN.y * 0.5 + 0.5 ) + uToonMoon * toonDiffuse;
// Round 10 lowers the fill and the moon on the house: wood, plaster and roof. Away from the
// windows the tower and its decks fall into a warm brown-indigo shade, and only the windows,
// the lamps and the campfire read bright.
// Round 13 eases the cut on the outer cream walls, so the cottage front reads as a light warm
// plaster beside its honey trim, still well under the lit windows.
// Round 14 lifts that cut toward a warm brown-indigo, so the stair undersides and the lower
// floors read warm brown-indigo and not muddy grey-brown or near black.
if ( toonSurface == ${SURFACE.wood} || toonSurface == ${SURFACE.plaster} ) toonLight *= vec3( 0.76, 0.68, 0.8 );
// Round 16 lowers the outer walls a step, so only the windows, the lamps and the flame read
// as the brightest values (S3, S4, S7).
// Round 17 lowers them again by about a tenth, so the cream and tan walls sit clearly under
// the windows, the lanterns and the flames (S1, S4, S7).
// Round 19 lowers them a little more, so the lit plaster stays clearly under the window glow (S4).
if ( toonTimbered ) toonLight *= vec3( 0.86, 0.8, 0.74 );
// Round 16 warms the light on the lawn a little, so the cool sky fill does not turn the
// olive-gold albedo to a muddy olive-brown.
// Round 19 splits that warm cut by the moon light: the lit lawn takes a warm cut and the lawn in
// shade a brown-indigo, so the shade never reads as murky olive (S7, S9).
// Round 20 turns the shade cut further toward a warm brown-indigo.
if ( toonSurface == ${SURFACE.lawn} ) toonLight *= mix( vec3( 0.9, 0.78, 1.0 ), vec3( 1.14, 1.06, 0.84 ), smoothstep( 0.1, 0.5, toonDiffuse ) );
// Round 17 warms the light on the laid stones the same way, so the cool sky fill no longer
// turns the grey-tan stones a flat cool grey (S5, S10).
if ( toonSurface == ${SURFACE.paving} ) toonLight *= vec3( 1.1, 1.0, 0.84 );
// The roof takes a warm cut, so the graphite stays a charcoal grey and does not turn blue-slate.
// Round 14 turns the cut into a cool lift, because the roof read as a black-navy cutout, and
// then as a dark mauve once the mauve haze laid over it. The roof now reads graphite. Only the
// broad faces take the lift. The vertical fascia bands of the deck slabs read teal under it, so
// they keep a near neutral cut.
// Round 16 lifts the fascia to a neutral graphite, because the review read the thin roof edge as
// brown wood in S1 and S7. The lift leans warm, so the cool sky fill does not turn it teal.
// Round 17 turns the broad-face lift neutral and lower, so the canopy reads dark graphite and
// not slate blue (S1, S6).
// Round 18 turns the fascia lift neutral, because the review read the warm lift as a plum-brown
// edge. The fascia now reads charcoal like the membrane (S1, S7).
// Round 19 takes the blue of the sky fill out of the lift, so the membrane and its soffit read
// as dark charcoal metal and not as a cool blue-grey sheet (S1, S7). The top takes the sky fill,
// so it takes the strongest warm cut. The soffit takes the near neutral ground fill.
if ( toonSurface == ${SURFACE.roof} ) toonLight *= toonFlat.y > 0.5 ? vec3( 1.58, 1.36, 0.98 ) : toonFlat.y < -0.5 ? vec3( 1.3, 1.22, 1.12 ) : vec3( 1.42, 1.28, 1.08 );
// The city lights glow up from below onto the cliff under the island, a dim warm mauve,
// so the underside shows its moss and its strata instead of one dark brown mass.
// Round 8 turns this glow from a mauve to a warm tan, because the mauve turned the tan cliff
// maroon.
// Round 10 turns it to a dim brown-indigo, so the underside reads warm brown-indigo and not
// olive-brown.
// Round 14 lifts the glow by half, so the underside reads warm brown-indigo, not near black.
// Round 12 keeps the tint off the stones above the lawn lip, so the stepping stones and the
// bridge-end steps read warm grey-tan and not cool mauve (S9, S10).
float toonUnder = smoothstep( 0.4, -1.2, vToonWorld.y );
if ( toonSurface == ${SURFACE.stone} ) toonLight = toonLight * mix( vec3( 1.0, 0.95, 0.9 ), vec3( 0.86, 0.8, 0.9 ), toonUnder ) + vec3( 0.2, 0.13, 0.17 ) * max( -toonN.y, 0.0 ) * toonUnder;
// The roof overhang seen from below gets a little more fill, so the soffit reads as metal and
// not as one black board.
// Round 14 doubles that fill, so the soffit reads as graphite metal (about #2e3036).
if ( toonSurface == ${SURFACE.roof} ) toonLight += uToonGround * 1.5 * max( -toonN.y, 0.0 );

// Warm spill from the windows and the campfire. It favours walls, railings and the
// undersides of eaves over the ground, and it ends inside its radius with no edge.
vec3 toonWarm = vec3( 0.0 );
vec3 toonWarmDir = vec3( 0.0, 1.0, 0.0 );
float toonWarmBest = 0.0;
for ( int i = 0; i < ${TOON_BOUNCES}; i ++ ) {
    vec3 toLight = uToonBounce[ i ].xyz - vToonWorld;
    float d = length( toLight );
    float r = max( uToonBounce[ i ].w, 1e-3 );
    float near = r * r / ( r * r + d * d );
    float reach = ( 1.0 - smoothstep( 0.0, 1.0, d / r ) ) * near;
    vec3 dir = toLight / max( d, 1e-3 );
    // Only faces that turn toward the lamp take its light, so the spill never leaks
    // through a wall onto the outside of the house as a round pool. Floors and ceilings take
    // about a third of it. Round 6 cut the ceilings too: the full spill put a strong orange
    // wash on the workshop ceiling above the right window (S2).
    // Round 10 wraps the facing term a little, so a face edge-on to the lamp still takes about
    // a quarter of the light. A narrow wall reveal that faced the lamp drew a hard bright stripe
    // beside a dark wall that met it edge-on (S2).
    // Round 11 lets the campfire light the ground around it at nearly full strength, and the
    // window spill reach a little further onto the floors, decks and steps below.
    float floors = i == ${CAMPFIRE_BOUNCE} ? 0.85 : 0.5;
    float facing = ( floors + ( 1.0 - floors ) * ( 1.0 - abs( toonN.y ) ) ) * max( dot( toonN, dir ) * 0.75 + 0.25, 0.0 );
    // Round 14: the top and the bottom faces of the outer wall boards take no window spill. The
    // bedroom lamp lit the top of one board through the wall, a thin orange line in S4.
    if ( toonTimbered && abs( toonFlat.y ) > 0.5 ) facing = 0.0;
    toonWarm += reach * facing;
    if ( reach > toonWarmBest ) {
        toonWarmBest = reach;
        toonWarmDir = dir;
    }
}
// The spill eases off where it is strong, so a wall edge close to a lamp shows a soft
// gradient, not a hard bright stripe.
// Round 11 breaks the spill on the ground into soft irregular patches with the 1.7 m
// mottle, so no round disc shows on the lawn, the deck or the steps.
toonWarm *= mix( 1.0, 0.45 + 1.1 * texture2D( uToonDetail, vToonWorld.xz / 1.7 + 0.83 ).g, smoothstep( 0.5, 0.9, toonN.y ) );
toonWarm = mix( toonWarm, 0.45 * smoothstep( 0.12, 0.16, toonWarm ) + 0.55 * smoothstep( 0.42, 0.48, toonWarm ), uToonCel );
toonLight += uToonWarm * toonWarm * 1.25 / ( 1.0 + toonWarm );

// Metal takes less diffuse light, so its highlights carry the form, as on real brass.
// Round 17 gives dark iron more of the diffuse light, so the mullions and the thin frame
// members read warm brown-indigo and not near black (S2).
float toonMetalLuma = dot( toonAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
reflectedLight.indirectDiffuse += toonAlbedo * toonLight * ( toonSurface == ${SURFACE.metal} ? mix( 0.7, 0.25, smoothstep( 0.04, 0.12, toonMetalLuma ) ) : 1.0 );

vec3 toonView = normalize( cameraPosition - vToonWorld );
// A faint cool rim, only on the side the moon leaves in shade.
float toonRim = pow( 1.0 - clamp( dot( toonSmooth, toonView ), 0.0, 1.0 ), 3.0 ) * mix( smoothstep( 0.5, 0.7, 1.0 - toonWrap ), 1.0, uToonRimSpread );
reflectedLight.indirectDiffuse += uToonRim * toonRim * ( 0.4 + 0.6 * toonAlbedo );

// Metal reads through a small procedural matcap in view space, so the brass shows the
// same sheen from every stop. The matcap is a dim reflection of the ground and the sky,
// with a broad soft ring light about 35 degrees off the view axis, stronger at the top. The
// normals of a tube sweep a line through the matcap centre, so a tube at any angle shows a
// soft sheen along its length, as brushed brass does. The moon and the nearest warm
// spill add their own soft highlights. Dark iron shines less than brass, so it stays dark.
if ( toonSurface == ${SURFACE.metal} ) {
    vec3 toonViewNormal = normalize( normal );
    vec2 toonCap = toonViewNormal.xy;
    float toonCapRadius = length( toonCap );
    float toonTop = 0.3 + 0.7 * smoothstep( -0.5, 0.6, toonCap.y );
    // Round 9 widens the ring and dims the core, so brass shows one soft broad highlight along a
    // tube, not a hard glint on a flat saturated yellow.
    // Round 10 tightens the ring and brightens its core, and darkens the reflected tone below,
    // so the tube shows one bright band on dark brass and reads as metal, not yellow plastic.
    // Round 12 widens the ring into one broad soft sheen and drops the narrow core. The review
    // read the two hard parallel stripes on the tube as glossy gold plastic, not brushed brass.
    // Round 13 narrows the ring again, so the sheen reads as one soft brushed line on darker
    // brass and the broad even highlight of round 12 no longer reads as mustard plastic.
    // Round 20 narrows the ring again and sharpens the moon highlight, so the tube, the yoke and
    // the eyepiece read as polished brass with a crisp sheen and not as matte plastic (S4).
    float toonRing = exp( -pow( ( toonCapRadius - 0.6 ) / 0.11, 2.0 ) ) * toonTop;
    float toonLuma = dot( toonAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
    float toonShine = clamp( toonLuma * 4.0, 0.35, 1.0 );
    vec3 toonEnv = mix( uToonGround, uToonSky, smoothstep( -0.7, 0.7, toonCap.y ) );
    float moonSpec = pow( max( dot( toonSmooth, normalize( uToonMoonDir + toonView ) ), 0.0 ), 36.0 ) * 1.1 * toonShadow;
    float warmSpec = pow( max( dot( toonSmooth, normalize( toonWarmDir + toonView ) ), 0.0 ), 16.0 ) * 0.6 * min( toonWarmBest * 2.0, 1.0 );
    vec3 toonSheen = vec3( 1.0, 0.9, 0.72 ) * toonRing * 0.85;
    vec3 toonSpec = toonEnv * 0.45 * smoothstep( 0.95, 0.2, toonCapRadius ) + toonSheen + uToonMoon * moonSpec + uToonWarm * warmSpec;
    reflectedLight.indirectDiffuse += mix( toonAlbedo, vec3( 1.0 ), 0.12 ) * toonSpec * toonShine;
}
`

// A leaf card at a distance samples a soft mip, where the alpha of a small leaf falls
// below the cut and the leaf would vanish or fray. This sharpens the alpha over one pixel,
// so the cut keeps the leaf shape at every distance.
// Round 20 reads the alpha a mip finer than the colour. At a distance the coarse mip drew the
// leaf outline as square texel steps along the crown edge (S6).
const CARD_ALPHA = /* glsl */ `
#ifdef AERIE_CARD
diffuseColor.a = texture2D( map, vMapUv, -1.5 ).a;
diffuseColor.a = clamp( ( diffuseColor.a - 0.5 ) / max( fwidth( diffuseColor.a ), 1e-4 ) + 0.5, 0.0, 1.0 );
#endif
#include <alphatest_fragment>
`

function patch(uniforms) {
    return (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
            .replace('#include <project_vertex>', VERTEX_MAIN)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace('#include <lights_fragment_begin>', FRAGMENT_LIGHT)
            .replace('#include <lights_fragment_maps>', '')
            .replace('#include <lights_fragment_end>', '')
            .replace('#include <alphatest_fragment>', CARD_ALPHA)
            .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n#ifndef AERIE_CARD\ngl_FragColor.a = 1.0 - toonInk;\n#endif')
    }
}

// Builds a toon material. All opaque island parts share one, so they share one program.
// `defines` turns on the AO bake (AERIE_AO) or the leaf-card variant (AERIE_CARD).
export function createToonMaterial(uniforms, options = {}, { key = CACHE_KEY, defines = {} } = {}) {
    const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        ...options,
    })
    material.defines = { ...defines }
    material.onBeforeCompile = patch(uniforms)
    material.customProgramCacheKey = () => key
    return material
}
