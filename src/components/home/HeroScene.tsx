import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
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
    const tipTaper = t > 0.85 ? Math.sqrt(Math.max(0.03, 1 - ((t - 0.85) / 0.17) ** 2)) : 1;
    const halfWidth = (0.012 + 0.112 * Math.pow(t, 0.8)) * tipTaper;

    for (let column = 0; column <= columns; column += 1) {
      const u = (column / columns) * 2 - 1;
      const x = u * halfWidth;
      const z = radius + (1 - u * u) * 0.014 + Math.sin(t * Math.PI) * 0.012;
      positions.push(x, y - Math.max(0, t - 0.7) * u * u * 0.07, z);

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

function Feather({
  angle,
  color,
  geometry
}: {
  angle: number;
  color: string;
  geometry: {
    vane: THREE.BufferGeometry;
    ribs: THREE.BufferGeometry;
    rachis: THREE.CylinderGeometry;
  };
}) {
  const { vane, ribs, rachis } = geometry;
  const rachisRotation = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 1.12, 0.56).normalize()
      ),
    []
  );

  return (
    <group rotation={[0, angle, 0]}>
      <mesh geometry={vane} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial
          color={color}
          roughness={0.62}
          metalness={0.015}
          side={THREE.DoubleSide}
        />
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
    const radius = y < -0.55 ? 0.12 + (y + 0.73) * 0.37 : 0.19 - (y + 0.55) * 0.1;
    const angle = i * 2.399963;
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function Shuttlecock({
  compact,
  reducedMotion,
  pointer
}: {
  compact: boolean;
  reducedMotion: boolean;
  pointer: React.RefObject<{ x: number; y: number }>;
}) {
  const group = useRef<THREE.Group>(null);
  const featherCount = compact ? 12 : 16;
  const featherGeometry = useMemo(
    () => ({
      vane: createFeatherVane(),
      ribs: createFeatherRibs(),
      rachis: new THREE.CylinderGeometry(0.0055, 0.003, 1.24, 5)
    }),
    []
  );
  const corkProfile = useMemo(
    () => [
      new THREE.Vector2(0, -0.82),
      new THREE.Vector2(0.085, -0.79),
      new THREE.Vector2(0.15, -0.7),
      new THREE.Vector2(0.19, -0.53),
      new THREE.Vector2(0.185, -0.35),
      new THREE.Vector2(0.145, -0.23),
      new THREE.Vector2(0.105, -0.19),
      new THREE.Vector2(0, -0.19)
    ],
    []
  );
  const corkSpeckles = useMemo(createCorkSpeckles, []);

  useFrame((state: RootState, delta) => {
    if (!group.current || reducedMotion) return;
    const targetX = 0.2 + pointer.current.y * 0.13;
    const targetZ = -0.58 + pointer.current.x * 0.13;
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, targetX, 2.2, delta);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, targetZ, 2.2, delta);
    group.current.rotation.y = -0.4 + Math.sin(state.clock.elapsedTime * 0.23) * 0.16;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.07;
  });

  return (
    <group ref={group} rotation={[0.2, -0.4, -0.58]}>
      {Array.from({ length: featherCount }, (_, index) => (
        <Feather
          key={index}
          angle={(index / featherCount) * Math.PI * 2}
          color={FEATHER_COLORS[index % FEATHER_COLORS.length]}
          geometry={featherGeometry}
        />
      ))}

      <mesh castShadow={false} receiveShadow={false}>
        <latheGeometry args={[corkProfile, 32]} />
        <meshStandardMaterial color="#e6ddd0" roughness={0.84} />
      </mesh>
      <points geometry={corkSpeckles} position={[0, 0, 0]}>
        <pointsMaterial color="#80583b" size={0.014} sizeAttenuation transparent opacity={0.48} />
      </points>
      <mesh position={[0, -0.205, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.108, 0.013, 8, 32]} />
        <meshStandardMaterial color="#c4af49" metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.26, 0]}>
        <cylinderGeometry args={[0.123, 0.14, 0.105, 32]} />
        <meshStandardMaterial color="#161442" roughness={0.48} />
      </mesh>
    </group>
  );
}

function Racket() {
  const strings = useMemo(() => {
    const points: number[] = [];
    for (let i = -8; i <= 8; i++) {
      const x = i * 0.095;
      const span = Math.sqrt(1 - (x / 0.82) ** 2) * 1.07;
      points.push(x, -span, 0, x, span, 0);
      const y = i * 0.125;
      const width = Math.sqrt(1 - (y / 1.07) ** 2) * 0.82;
      points.push(-width, y, 0, width, y, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);
  return (
    <group position={[-0.8, -0.2, -1]} rotation={[0.15, -0.5, 0.55]} scale={1.25}>
      <mesh scale={[0.82, 1.07, 1]}>
        <torusGeometry args={[1, 0.028, 8, 80]} />
        <meshStandardMaterial color="#c4af49" metalness={0.75} roughness={0.28} />
      </mesh>
      <lineSegments geometry={strings}>
        <lineBasicMaterial color="#b4b8ad" transparent opacity={0.38} />
      </lineSegments>
      <mesh position={[0, -1.72, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 1.4, 10]} />
        <meshStandardMaterial color="#656a61" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, -2.5, 0]}>
        <cylinderGeometry args={[0.07, 0.073, 0.62, 12]} />
        <meshStandardMaterial color="#161442" roughness={0.9} />
      </mesh>
    </group>
  );
}

function CourtStage() {
  const lines = useMemo(() => {
    const p: number[] = [];
    const horizontal = [-3.5, -3.1, -1, 0, 1, 3.1, 3.5];
    horizontal.forEach((z) => p.push(-1.6, 0.016, z, 1.6, 0.016, z));
    [-1.6, -1.4, 0, 1.4, 1.6].forEach((x) => p.push(x, 0.016, -3.5, x, 0.016, 3.5));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return geometry;
  }, []);
  return (
    <group position={[0, -2.35, -0.4]} rotation={[0, -0.35, 0]}>
      <mesh position={[0, -0.09, 0]}>
        <boxGeometry args={[4.8, 0.18, 8]} />
        <meshStandardMaterial color="#30332d" metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.6, 7.8]} />
        <meshStandardMaterial color="#17392f" roughness={0.9} />
      </mesh>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#c4af49" transparent opacity={0.48} />
      </lineSegments>
    </group>
  );
}

function Scene({
  compact,
  reducedMotion,
  pointer
}: {
  compact: boolean;
  reducedMotion: boolean;
  pointer: React.RefObject<{ x: number; y: number }>;
}) {
  const viewport = useThree((state) => state.viewport);
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[-3, 5, 5]} intensity={3.2} color="#f7f5e9" />
      <directionalLight position={[5, 1, -3]} intensity={2.5} color="#c4af49" />
      <directionalLight position={[0, -2, 3]} intensity={0.7} color="#b8c9c2" />
      <group
        position={compact ? [0.3, -0.2, 0] : [viewport.width * 0.21, 0.15, 0]}
        scale={compact ? 0.95 : Math.min(1, viewport.width / 10)}
      >
        <CourtStage />
        <Racket />
        <group position={[0.5, 0.2, 0]} scale={1.85}>
          <Shuttlecock compact={compact} reducedMotion={reducedMotion} pointer={pointer} />
        </group>
      </group>
    </>
  );
}

export default function HeroScene({ paused = false }: { paused?: boolean }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const reducedMotion = Boolean(useReducedMotion());
  const [sceneReady, setSceneReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isInView, setIsInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 767px)').matches);

  useEffect(() => {
    const hero = wrapper.current?.closest('section');
    if (!hero) return;
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const bounds = hero.getBoundingClientRect();
      pointer.current = {
        x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
      };
    };
    const reset = () => {
      pointer.current = { x: 0, y: 0 };
    };
    hero.addEventListener('pointermove', onPointer, { passive: true });
    hero.addEventListener('pointerleave', reset);
    return () => {
      hero.removeEventListener('pointermove', onPointer);
      hero.removeEventListener('pointerleave', reset);
    };
  }, []);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), {
      threshold: 0.05
    });
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
    const media = window.matchMedia('(max-width: 767px)');
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
    const onRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [canvas]);

  const onCreated = useCallback(({ gl }: RootState) => {
    setCanvas(gl.domElement);
    gl.setClearColor('#111715', 1);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    setSceneReady(true);
  }, []);

  const active = isInView && pageVisible && !reducedMotion && !paused;
  const pixelRatio = compact ? 1.15 : Math.min(window.devicePixelRatio || 1, 1.5);

  return (
    <div
      ref={wrapper}
      aria-hidden="true"
      className="hero-three-scene"
      data-renderer={sceneReady && !contextLost ? 'webgl' : 'fallback'}
      data-active={active}
    >
      <HeroFallback />
      <Canvas
        camera={{ position: [0, 1.3, 10], fov: compact ? 42 : 38, near: 0.1, far: 50 }}
        dpr={pixelRatio}
        frameloop={active ? 'always' : 'demand'}
        gl={{ alpha: true, antialias: !compact, powerPreference: 'low-power' }}
        onCreated={onCreated}
        fallback={<HeroFallback />}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: sceneReady && !contextLost ? 1 : 0,
          transition: 'opacity 700ms'
        }}
      >
        <Scene compact={compact} reducedMotion={reducedMotion || !active} pointer={pointer} />
      </Canvas>
    </div>
  );
}
