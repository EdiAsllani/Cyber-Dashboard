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
      metal: createDissolveMaterial({ color: '#161616', roughness: 0.6, metalness: 0.5 }, reveal),
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
