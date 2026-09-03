import { Act1Blackwall } from './acts/Act1Blackwall'

/**
 * Mounts every act for the whole journey and leaves them mounted. Acts own
 * their own visibility window (driven from progress inside useFrame) so no
 * material is ever recompiled mid-scroll.
 */
export function JourneyScene() {
  return (
    <>
      <Act1Blackwall />
    </>
  )
}
