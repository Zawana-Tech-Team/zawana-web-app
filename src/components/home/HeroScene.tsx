import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion } from 'framer-motion';
import HeroFallback from './HeroFallback';

const FEATHER_COLORS = ['#f8f8f4', '#f2f3ef', '#fbfbf8', '#f4f5f1'];

function createFeatherVane() {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = 20;
  const columns = 4;

  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const y = -0.24 + t * 1.12;
    const radius = 0.13 + t * 0.56;
    const halfWidth = 0.012 + 0.112 * Math.pow(t, 0.8);

    for (let column = 0; column <= columns; column += 1) {
      const u = (column / columns) * 2 - 1;
      const x = u * halfWidth;
      const z = radius + (1 - u * u) * 0.014 + Math.sin(t * Math.PI) * 0.012;
      positions.push(x, y, z);

      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFeatherRibs() {
  const positions: number[] = [];
  for (let row = 3; row <= 17; row += 2) {
    const t = row / 20;
    const y = -0.24 + t * 1.12;
    const radius = 0.13 + t * 0.56;
    const halfWidth = (0.012 + 0.112 * Math.pow(t, 0.8)) * 0.92;
    for (const side of [-1, 1]) {
      positions.push(0, y, radius + 0.021, side * halfWidth, y - 0.027, radius + 0.014);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function Feather({ angle, color }: { angle: number; color: string }) {
  const vane = useMemo(createFeatherVane, []);
  const ribs = useMemo(createFeatherRibs, []);
  const rachis = useMemo(() => new THREE.CylinderGeometry(0.0055, 0.003, 1.24, 5), []);
  const rachisRotation = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 1.12, 0.56).normalize(),
    ),
    [],
  );

  return (
    <group rotation={[0, angle, 0]}>
      <mesh geometry={vane} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial color={color} roughness={0.62} metalness={0.015} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rachis} position={[0, 0.32, 0.41]} quaternion={rachisRotation}>
        <meshStandardMaterial color="#c8cbc5" roughness={0.72} />
      </mesh>
      <lineSegments geometry={ribs}>
        <lineBasicMaterial color="#c2c5be" transparent opacity={0.72} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function createCorkSpeckles() {
  const positions: number[] = [];
  const count = 34;
  for (let i = 0; i < count; i += 1) {
    const y = -0.73 + (i % 17) * 0.028;
    const radius = y < -0.55 ? 0.12 + (y + 0.73) * 0.37 : 0.19 - (y + 0.55) * 0.10;
    const angle = i * 2.399963;
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function Shuttlecock({ compact, reducedMotion }: { compact: boolean; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const featherCount = compact ? 12 : 16;
  const corkProfile = useMemo(() => [
    new THREE.Vector2(0, -0.82),
    new THREE.Vector2(0.085, -0.79),
    new THREE.Vector2(0.15, -0.70),
    new THREE.Vector2(0.19, -0.53),
    new THREE.Vector2(0.185, -0.35),
    new THREE.Vector2(0.145, -0.23),
    new THREE.Vector2(0.105, -0.19),
    new THREE.Vector2(0, -0.19),
  ], []);
  const corkSpeckles = useMemo(createCorkSpeckles, []);

  useFrame((state: RootState, delta) => {
    if (!group.current || reducedMotion) return;
    const { pointer } = state;
    const targetX = 0.12 + pointer.y * 0.11;
    const targetZ = -0.12 + pointer.x * 0.2;
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, targetX, 2.2, delta);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, targetZ, 2.2, delta);
    group.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={group} rotation={[0.12, -0.32, -0.12]}>
      {Array.from({ length: featherCount }, (_, index) => (
        <Feather
          key={index}
          angle={(index / featherCount) * Math.PI * 2}
          color={FEATHER_COLORS[index % FEATHER_COLORS.length]}
        />
      ))}

      <mesh castShadow={false} receiveShadow={false}>
        <latheGeometry args={[corkProfile, 32]} />
        <meshStandardMaterial color="#c48e5f" roughness={0.84} />
      </mesh>
      <points geometry={corkSpeckles} position={[0, 0, 0]}>
        <pointsMaterial color="#80583b" size={0.014} sizeAttenuation transparent opacity={0.48} />
      </points>
      <mesh position={[0, -0.205, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.108, 0.007, 6, 32]} />
        <meshStandardMaterial color="#e1d4bd" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Scene({ compact, reducedMotion }: { compact: boolean; reducedMotion: boolean }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[-2.5, 3.5, 4]} intensity={2.1} />
      <directionalLight position={[2.5, 1.2, -2.5]} intensity={0.8} color="#f2e5c8" />
      <pointLight position={[1.5, -0.4, 2.2]} intensity={0.35} color="#ffffff" />
      <mesh position={[0, -0.91, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.24, 1]}>
        <circleGeometry args={[0.72, 48]} />
        <meshBasicMaterial color="#71664d" transparent opacity={0.13} depthWrite={false} />
      </mesh>
      {reducedMotion ? (
        <Shuttlecock compact={compact} reducedMotion />
      ) : (
        <Float speed={0.65} floatIntensity={0.13} rotationIntensity={0.035} floatingRange={[-0.04, 0.04]}>
          <Shuttlecock compact={compact} reducedMotion={false} />
        </Float>
      )}
    </>
  );
}

export default function HeroScene() {
  const wrapper = useRef<HTMLDivElement>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const [supportsWebGL, setSupportsWebGL] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isInView, setIsInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2') || probe.getContext('webgl');
    const loseContext = context?.getExtension('WEBGL_lose_context');
    loseContext?.loseContext();
    setSupportsWebGL(Boolean(context));
  }, []);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(document.visibilityState === 'visible');
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const syncCompact = () => setCompact(media.matches);
    syncCompact();
    media.addEventListener('change', syncCompact);
    return () => media.removeEventListener('change', syncCompact);
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const onLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    canvas.addEventListener('webglcontextlost', onLost, { once: true });
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [canvas]);

  const onCreated = useCallback(({ gl }: RootState) => {
    setCanvas(gl.domElement);
    setSceneReady(true);
  }, []);

  const active = isInView && pageVisible && !reducedMotion;
  const pixelRatio = compact ? 1.15 : Math.min(window.devicePixelRatio || 1, 1.5);

  return (
    <div ref={wrapper} aria-hidden="true" className="relative isolate h-[350px] w-full overflow-hidden rounded-[30px] sm:h-[430px] lg:h-[540px]">
      <HeroFallback />
      {supportsWebGL && !contextLost && (
        <Canvas
          camera={{ position: [0, 0, 4.25], fov: 39, near: 0.1, far: 50 }}
          dpr={pixelRatio}
          frameloop={active ? 'always' : 'demand'}
          gl={{ alpha: true, antialias: !compact, powerPreference: 'low-power' }}
          onCreated={onCreated}
          fallback={<HeroFallback />}
          className={`absolute inset-0 transition-opacity duration-700 ${sceneReady ? 'opacity-100' : 'opacity-0'}`}
        >
          <Scene compact={compact} reducedMotion={reducedMotion} />
        </Canvas>
      )}
    </div>
  );
}
