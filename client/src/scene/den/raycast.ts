import { useEffect } from 'react'
import type { Group, Object3D } from 'three'

/**
 * Turns the whole den into scenery, then lets the handful of objects that opted
 * in stay hittable.
 *
 * The den is dense (a keyboard alone is dozens of primitives) and pointer events
 * fire during the flythrough too, so the two screens are the only things that
 * should ever cost a triangle test. Marking meshes one prop at a time doesn't
 * survive contact with a room this size — this walks the group once instead and
 * respects `userData.interactive`, which `MonitorScreens` sets on its screens.
 *
 * Runs as a parent effect, which React fires *after* every child effect, so it
 * cannot be undone by a child mounting later in the same commit.
 */
export function useSceneryRaycast(group: React.RefObject<Group | null>, deps: unknown[] = []): void {
  useEffect(() => {
    const root = group.current
    if (!root) return
    root.traverse((o: Object3D) => {
      if (o === root) return
      if (o.userData.interactive) return
      o.raycast = noHit
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const noHit = (): void => {}
