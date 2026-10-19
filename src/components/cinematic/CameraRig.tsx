import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';
import { cameraKeyframes, segmentAt, smoothstep } from './choreography';

export type PointerPosition = { x: number; y: number };
export function CameraRig({ progress, compact, pointer }: { progress: MotionValue<number>; compact: boolean; pointer: React.RefObject<PointerPosition> }) {
  const { camera, invalidate, size } = useThree();
  const parallax = useRef({ x: 0, y: 0 });
  const path = useMemo(() => ({
    position: new THREE.CatmullRomCurve3(cameraKeyframes.map(frame => new THREE.Vector3(...frame.position)), false, 'catmullrom', .18),
    target: new THREE.CatmullRomCurve3(cameraKeyframes.map(frame => new THREE.Vector3(...frame.target)), false, 'catmullrom', .18),
    positionSample: new THREE.Vector3(), targetSample: new THREE.Vector3(),
  }), []);
  useFrame((_state, delta) => {
    const { index, mix, from, to } = segmentAt(cameraKeyframes, progress.get());
    const t = (index + mix) / (cameraKeyframes.length - 1);
    path.position.getPoint(t, path.positionSample);
    path.target.getPoint(t, path.targetSample);
    const response = Math.min(delta, .05);
    parallax.current.x = THREE.MathUtils.damp(parallax.current.x, pointer.current.x, 7, response);
    parallax.current.y = THREE.MathUtils.damp(parallax.current.y, pointer.current.y, 7, response);
    const overhead = progress.get() > .85;
    const portrait = compact || size.width / size.height < .95;
    if (portrait) {
      path.positionSample.multiplyScalar(1.14);
      path.targetSample.x *= .1;
      const settle = smoothstep((progress.get() - .7) / .3);
      path.positionSample.x = THREE.MathUtils.lerp(path.positionSample.x, 0, settle);
      path.targetSample.x = THREE.MathUtils.lerp(path.targetSample.x, 0, settle);
      if (overhead) path.targetSample.z -= 2.4;
      else path.targetSample.y += 1.8;
    }
    camera.position.copy(path.positionSample);
    camera.position.x += parallax.current.x * .22;
    camera.position.y += parallax.current.y * .12;
    camera.lookAt(path.targetSample);
    const perspective = camera as THREE.PerspectiveCamera;
    const fov = THREE.MathUtils.lerp(from.fov, to.fov, mix) + (portrait ? 8 : 0);
    if (Math.abs(perspective.fov - fov) > .001) { perspective.fov = fov; perspective.updateProjectionMatrix(); }
    if (Math.abs(pointer.current.x - parallax.current.x) + Math.abs(pointer.current.y - parallax.current.y) > .001) invalidate();
  });
  return null;
}
