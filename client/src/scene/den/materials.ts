import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { createDissolveMaterial } from '../materials/dissolveMaterial'

/**
 * Every standard material in the den, created once and shared.
 *
 * Two rules are load-bearing here:
 *
 * 1. All of them come from `createDissolveMaterial` with the SAME `reveal`
 *    uniform object. That is what makes the room materialize as one coherent
 *    world-space field. A material built any other way — or with its own
 *    uniform — would pop into existence while the walls are still dissolving.
 * 2. Anything meant to glow has to clear the bloom threshold (exactly 1.0) as
 *    an HDR value with `toneMapped: false`. Anything NOT meant to glow has to
 *    stay under it, or the whole frame blooms uniformly.
 *
 * Decoration is emissive rather than lit on purpose: three keys shader programs
 * on the visible light count, so a light mounted after t=0 recompiles every
 * standard material in the scene mid-scroll.
 */
export interface DenMaterials {
  /** Floor, walls, ceiling. */
  shell: THREE.MeshStandardMaterial
  /** Arasaka-red trim seams. HDR — this is what bloom is for. */
  neon: THREE.MeshStandardMaterial
  /** Desk slab and anything furniture-coloured. */
  desk: THREE.MeshStandardMaterial
  /** Matte ducting / brackets / rack metal. */
  metal: THREE.MeshStandardMaterial
  /** Screen fallback until the canvas feed lands. */
  screen: THREE.MeshStandardMaterial
  /** Keycaps — a shade lighter than the slab so the grid reads. */
  keycap: THREE.MeshStandardMaterial
  /** Hot red slivers: keyboard underglow, DPI dot, seams on props. */
  underglow: THREE.MeshStandardMaterial
  /** The one live cable run. Its emissiveIntensity is pulsed by the act. */
  cableHot: THREE.MeshStandardMaterial
  /** Prop metal — the Malorian's slide. Brighter and glossier than ducting. */
  gunmetal: THREE.MeshStandardMaterial
  /** The Malorian's gold accents (the wiki's black-and-gold finish). */
  brass: THREE.MeshStandardMaterial
  /** The airhypo's canister: the one cyan accent allowed on the desk. */
  vial: THREE.MeshStandardMaterial
  /** Mug ceramic, paper, plastic shards — matte and unremarkable on purpose. */
  matte: THREE.MeshStandardMaterial
}

export function useDenMaterials(reveal: THREE.IUniform<number>): DenMaterials {
  const materials = useMemo<DenMaterials>(
    () => ({
      shell: createDissolveMaterial(
        { color: '#0d0d0d', roughness: 0.85, metalness: 0.12 },
        reveal,
      ),
      neon: createDissolveMaterial(
        {
          color: '#0d0d0d',
          emissive: new THREE.Color('#c5003c'),
          emissiveIntensity: 2.5,
          roughness: 0.4,
          toneMapped: false,
        },
        reveal,
      ),
      desk: createDissolveMaterial({ color: '#080808', roughness: 0.6, metalness: 0.3 }, reveal),
      // A shade above the plan's #161616 for the same reason gunmetal is: the
      // ceiling ducts and wall cables live outside both lamps' reach, and at
      // #161616 they were black shapes on a black ceiling.
      metal: createDissolveMaterial({ color: '#26282c', roughness: 0.55, metalness: 0.5 }, reveal),
      keycap: createDissolveMaterial(
        { color: '#151515', roughness: 0.75, metalness: 0.1 },
        reveal,
      ),
      underglow: createDissolveMaterial(
        {
          color: '#0a0000',
          emissive: new THREE.Color('#ff003c'),
          emissiveIntensity: 1.4,
          roughness: 0.5,
          toneMapped: false,
        },
        reveal,
      ),
      // Lighter than a real gun's finish on purpose: the right half of the
      // desk is well outside the desk lamp's reach, and at #2a2c30 the prop
      // there was a black shape in a black room.
      cableHot: createDissolveMaterial(
        {
          color: '#120004',
          emissive: new THREE.Color('#ff003c'),
          emissiveIntensity: 1.3,
          roughness: 0.5,
          toneMapped: false,
        },
        reveal,
      ),
      gunmetal: createDissolveMaterial(
        { color: '#4a4e55', roughness: 0.32, metalness: 0.7 },
        reveal,
      ),
      brass: createDissolveMaterial(
        { color: '#8a6a2c', roughness: 0.32, metalness: 0.85 },
        reveal,
      ),
      vial: createDissolveMaterial(
        {
          color: '#04212a',
          emissive: new THREE.Color('#03d8f3'),
          // Deliberately under the bloom threshold: the vial is a glow, not a
          // light source, and the den's only non-red accent.
          emissiveIntensity: 0.6,
          roughness: 0.2,
          metalness: 0.1,
          transparent: true,
          opacity: 0.72,
          toneMapped: false,
        },
        reveal,
      ),
      matte: createDissolveMaterial({ color: '#20211f', roughness: 0.9, metalness: 0.05 }, reveal),
      screen: createDissolveMaterial(
        {
          color: '#050505',
          emissive: new THREE.Color('#c5003c'),
          emissiveIntensity: 1.05,
          // Matte on purpose — see the desk lamp's comment in Act5DenShell.
          roughness: 0.6,
          toneMapped: false,
        },
        reveal,
      ),
    }),
    [reveal],
  )

  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose()
    },
    [materials],
  )

  return materials
}
