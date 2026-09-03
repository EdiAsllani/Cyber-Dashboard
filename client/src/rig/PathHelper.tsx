import { Line } from '@react-three/drei'
import { ACTS } from './acts'
import { LOOK, PATH } from './CameraRig'

const BOUNDARIES = [0, ...ACTS.map((a) => a.end)]

/**
 * Debug-only visualization of the camera rig: the position curve in hot red,
 * the look-at curve in netrunner cyan, and a marker cube at every act
 * boundary so the fly-through order can be eyeballed.
 */
export function PathHelper() {
  return (
    <group>
      <Line points={PATH.getPoints(160)} color="#ff003c" lineWidth={1} />
      <Line points={LOOK.getPoints(160)} color="#03d8f3" lineWidth={1} dashed dashSize={0.4} gapSize={0.4} />
      {BOUNDARIES.map((t) => {
        const p = PATH.getPoint(t)
        return (
          <group key={t} position={[p.x, p.y, p.z]}>
            <mesh position={[1.6, 0, 0]}>
              <boxGeometry args={[0.5, 0.5, 0.5]} />
              <meshBasicMaterial color={t === 1 ? '#03d8f3' : '#c5003c'} wireframe />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
