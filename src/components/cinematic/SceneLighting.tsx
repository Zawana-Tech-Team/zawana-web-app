import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';
import { smoothstep } from './choreography';

export function SceneLighting({ progress, compact }: { progress: MotionValue<number>; compact: boolean }) {
  const key = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (key.current) key.current.intensity = 2.8 + smoothstep(progress.get() / .18) * 1.3;
  });
  return <>
    <color attach="background" args={['#08110f']} />
    <fog attach="fog" args={['#08110f', 19, 54]} />
    <hemisphereLight args={['#d7ede4', '#102a20', 1.1]} />
    <directionalLight ref={key} position={[4, 12, 8]} intensity={3} color="#fff1d6" castShadow={!compact}
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={45} shadow-normalBias={.035} />
    <directionalLight position={[-8, 6, -5]} intensity={2.6} color="#71c6a8" />
    {!compact && <spotLight position={[0, 7, -7]} angle={.65} penumbra={.9} intensity={100} color="#e7f8ed" distance={30} />}
  </>;
}
