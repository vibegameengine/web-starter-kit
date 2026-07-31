import * as THREE from 'three'

/**
 * The stage's own geometry/material singletons.
 *
 * See the `threejs-instancing-materials` skill: created ONCE at module scope and
 * reused by every lab, so mounting the stage never adds a material or a program
 * to the frame — whichever lab is open, these are the same two objects.
 */

/**
 * A neutral mid-grey floor, deliberately unopinionated.
 *
 * ~0.18 linear albedo is the classic reference grey: a pale subject reads
 * against it and a dark one still separates, and it tints nothing. A coloured
 * or textured lab floor is a bounce light nobody asked for — a material tuned
 * over it comes out wrong in the game.
 */
export const labStageGroundMaterial = new THREE.MeshStandardMaterial({
  color: '#55595d',
  metalness: 0,
  roughness: 0.96,
})

/** 1x1 plane, scaled per lab — one geometry whatever ground size a lab asks for. */
export const labStageGroundGeometry = new THREE.PlaneGeometry(1, 1)
