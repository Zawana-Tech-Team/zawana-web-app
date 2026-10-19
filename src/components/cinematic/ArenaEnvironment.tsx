import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';
import { smoothstep } from './choreography';

type Box = { position: [number, number, number]; scale: [number, number, number] };
function RepeatedBoxes({ boxes, color, emissive = false }: { boxes: Box[]; color: string; emissive?: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    boxes.forEach((box, index) => {
      object.position.set(...box.position); object.scale.set(...box.scale); object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [boxes]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, boxes.length]}>
    <boxGeometry args={[1, 1, 1]} />
    {emissive ? <meshBasicMaterial color={color} toneMapped={false} /> : <meshStandardMaterial color={color} roughness={.5} metalness={.65} />}
  </instancedMesh>;
}

function courtGeometry() {
  const vertices: number[] = [];
  const rectangle = (x: number, z: number, width: number, depth: number) => {
    const a = x - width / 2, b = x + width / 2, c = z - depth / 2, d = z + depth / 2;
    vertices.push(a,.015,c, a,.015,d, b,.015,c, b,.015,c, a,.015,d, b,.015,d);
  };
  // Doubles: 6.10 × 13.40m, singles: 5.18m wide. Painted lines are 40mm.
  [-3.03, 3.03, -2.57, 2.57].forEach(x => rectangle(x, 0, .04, 13.4));
  [-6.68, 6.68, -5.92, 5.92, -1.98, 1.98].forEach(z => rectangle(0, z, 6.1, .04));
  [-1, 1].forEach(side => rectangle(0, side * 4.33, .04, 4.7));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function netGeometry(compact: boolean) {
  const points: number[] = [];
  const step = compact ? .13 : .075;
  for (let x = -3.05; x <= 3.05; x += step) points.push(x,.79,0, x,1.55,0);
  for (let y = .79; y <= 1.55; y += step) points.push(-3.05,y,0, 3.05,y,0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function surfaceNormal() {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 2022;
  for (let i = 0; i < data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = 124 + seed % 9; data[i + 1] = 124 + (seed >>> 8) % 9; data[i + 2] = 255; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 36); texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function ArenaEnvironment({ progress, compact }: { progress: MotionValue<number>; compact: boolean }) {
  const roof = useRef<THREE.Group>(null);
  const lineGeometry = useMemo(courtGeometry, []);
  const net = useMemo(() => netGeometry(compact), [compact]);
  const surface = useMemo(surfaceNormal, []);
  useEffect(() => () => { lineGeometry.dispose(); net.dispose(); }, [lineGeometry, net]);
  useEffect(() => () => surface.dispose(), [surface]);
  const { structure, fixtures, accents } = useMemo(() => {
    const structure: Box[] = [], fixtures: Box[] = [], accents: Box[] = [];
    for (const side of [-1, 1]) {
      for (const z of [-9, -3, 3, 9]) {
        if (z < 9) structure.push({ position: [side * 6.8, 3.6, z], scale: [.18, 7.2, .22] });
        fixtures.push({ position: [side * 4.5, 6.7, z], scale: [.7, .04, .18] });
      }
      structure.push({ position: [side * 6.8, 6.8, 0], scale: [.2, .24, 23] });
      accents.push({ position: [side * 6.68, 2.2, 0], scale: [.035, .035, 23] });
    }
    for (const z of [-10.5, -6, 0, 6, 10.5]) structure.push({ position: [0, 7, z], scale: [13.8, .14, .16] });
    return { structure, fixtures, accents };
  }, []);
  useFrame(() => {
    if (!roof.current) return;
    roof.current.position.y = smoothstep((progress.get() - .57) / .2) * 10;
    roof.current.visible = progress.get() < .81;
  });
  return <group name="Concept_Arena">
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.18, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} /><meshStandardMaterial color="#0b1211" metalness={.3} roughness={.5} />
    </mesh>
    <mesh position={[0, -.12, 0]} receiveShadow><boxGeometry args={[9.2, .2, 17.5]} /><meshStandardMaterial color="#1d302b" roughness={.5} metalness={.35} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[6.1, 13.4]} /><meshStandardMaterial color="#16785e" roughness={.78} metalness={.08} normalMap={surface} normalScale={new THREE.Vector2(.32, .32)} /></mesh>
    <mesh geometry={lineGeometry}><meshStandardMaterial color="#ecece2" roughness={.7} emissive="#ecece2" emissiveIntensity={.12} /></mesh>
    <lineSegments geometry={net}><lineBasicMaterial color="#e0e5dd" transparent opacity={.28} /></lineSegments>
    <mesh position={[0, 1.54, 0]}><boxGeometry args={[6.1,.04,.028]} /><meshStandardMaterial color="#f2eedb" /></mesh>
    {[-3.08, 3.08].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0,.775,0]} castShadow={!compact}><cylinderGeometry args={[.035,.045,1.55,8]} /><meshStandardMaterial color="#c6a34a" metalness={.6} roughness={.3} /></mesh>
      <mesh position={[0,.04,0]}><boxGeometry args={[.35,.08,.4]} /><meshStandardMaterial color="#1d2321" /></mesh>
    </group>)}
    <group ref={roof}>
      <RepeatedBoxes boxes={structure} color="#27332f" />
      <RepeatedBoxes boxes={fixtures} color="#e2f6e9" emissive />
      <RepeatedBoxes boxes={accents} color="#b7a14d" emissive />
      <mesh position={[0, 3.5, -12]}><boxGeometry args={[16, 7,.25]} /><meshStandardMaterial color="#121e1a" roughness={.75} /></mesh>
    </group>
  </group>;
}
