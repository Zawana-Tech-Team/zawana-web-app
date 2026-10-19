import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';
import { segmentAt, shuttleKeyframes, smoothstep } from './choreography';

export function ShuttlecockModel({ progress, compact }: { progress: MotionValue<number>; compact: boolean }) {
  const asset = useGLTF('/models/shuttlecock.glb');
  const group = useRef<THREE.Group>(null);
  const trail = useRef<THREE.LineSegments>(null);
  const path = useMemo(() => new THREE.CatmullRomCurve3(shuttleKeyframes.map(frame => new THREE.Vector3(...frame.position)), false, 'catmullrom', .15), []);
  const sample = useMemo(() => new THREE.Vector3(), []);
  const owned = useMemo(() => {
    const clone = asset.scene.clone(true);
    clone.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry = node.geometry.clone();
      node.material = Array.isArray(node.material) ? node.material.map(material => material.clone()) : node.material.clone();
    });
    return clone;
  }, [asset.scene]);
  useEffect(() => () => {
    owned.traverse(node => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose());
      }
    });
  }, [owned]);
  const trailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 6), 3));
    return geometry;
  }, []);
  useEffect(() => () => trailGeometry.dispose(), [trailGeometry]);
  useFrame(() => {
    if (!group.current) return;
    const p = progress.get();
    const { index, mix, from, to } = segmentAt(shuttleKeyframes, p);
    const t = (index + mix) / (shuttleKeyframes.length - 1);
    path.getPoint(t, sample);
    group.current.position.copy(sample);
    if (compact) { group.current.position.x *= .55; group.current.position.y -= .6; }
    group.current.scale.setScalar(THREE.MathUtils.lerp(from.scale, to.scale, smoothstep(mix)) * (compact ? .7 : 1));
    group.current.rotation.set(.3 + p * 2, -.5 + p * 8, -.6 - p * 3);
    group.current.visible = p > .12 && p < .45;
    if (!trail.current) return;
    trail.current.visible = p > .22 && p < .39 && !compact;
    const positions = trailGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 32; i++) {
      path.getPoint(Math.max(0, t - i * .0018), sample); positions.setXYZ(i * 2, sample.x, sample.y, sample.z);
      path.getPoint(Math.max(0, t - (i + 1) * .0018), sample); positions.setXYZ(i * 2 + 1, sample.x, sample.y, sample.z);
    }
    positions.needsUpdate = true;
  });
  return <>
    <group ref={group}><primitive object={owned} dispose={null} /></group>
    <lineSegments ref={trail} geometry={trailGeometry} frustumCulled={false}><lineBasicMaterial color="#d2c782" transparent opacity={.22} depthWrite={false} /></lineSegments>
  </>;
}
