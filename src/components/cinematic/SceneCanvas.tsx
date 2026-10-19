import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';
import { ArenaEnvironment } from './ArenaEnvironment';
import { CameraRig, type PointerPosition } from './CameraRig';
import { ShuttlecockModel } from './ShuttlecockModel';
import { SceneLighting } from './SceneLighting';

function RenderController({ progress, active }: { progress: MotionValue<number>; active: boolean }) {
  const { invalidate, gl, setDpr } = useThree();
  const samples = useRef({ slow: 0, total: 0, lowered: false });
  useEffect(() => {
    if (!active) return;
    invalidate();
    return progress.on('change', () => invalidate());
  }, [progress, invalidate, active]);
  useFrame((_state, delta) => {
    gl.domElement.dataset.frames = String(Number(gl.domElement.dataset.frames || 0) + 1);
    // Sparse demand frames are idle, not slow. Only profile consecutive rendered frames.
    if (delta < .08 && delta > 0 && !samples.current.lowered) {
      samples.current.total++;
      if (delta > .035) samples.current.slow++;
      if (samples.current.total >= 45 && samples.current.slow / samples.current.total > .45) {
        setDpr(Math.max(.85, gl.getPixelRatio() * .75)); samples.current.lowered = true;
      }
    }
    gl.domElement.dataset.dpr = String(gl.getPixelRatio());
  });
  return null;
}

export default function SceneCanvas({ progress, compact, active, stage, onReady, onFailure }: {
  progress: MotionValue<number>; compact: boolean; active: boolean; stage: RefObject<HTMLDivElement | null>;
  onReady: () => void; onFailure: () => void;
}) {
  const pointer = useRef<PointerPosition>({ x: 0, y: 0 });
  const invalidator = useRef<(() => void) | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const element = stage.current;
    if (!element || compact) return;
    const move = (event: PointerEvent) => {
      if (!active || event.pointerType !== 'mouse') return;
      const bounds = element.getBoundingClientRect();
      pointer.current = { x: ((event.clientX - bounds.left) / bounds.width - .5) * 2, y: -((event.clientY - bounds.top) / bounds.height - .5) * 2 };
      invalidator.current?.();
    };
    const reset = () => { pointer.current = { x: 0, y: 0 }; if (active) invalidator.current?.(); };
    element.addEventListener('pointermove', move, { passive: true }); element.addEventListener('pointerleave', reset);
    return () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', reset); };
  }, [stage, compact, active]);
  useEffect(() => {
    if (!canvas) return;
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [canvas, onFailure]);
  const created = useCallback(({ gl, invalidate }: RootState) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = .95;
    invalidator.current = invalidate; setCanvas(gl.domElement); onReady();
  }, [onReady]);
  return <Canvas aria-hidden="true" camera={{ position: [11, 6, 18], fov: 42, near: .08, far: 120 }}
    dpr={compact ? Math.min(devicePixelRatio, 1.1) : Math.min(devicePixelRatio, 1.5)}
    shadows={compact ? false : 'soft'} frameloop={active ? 'demand' : 'never'}
    gl={{ alpha: false, antialias: !compact, powerPreference: 'low-power' }} onCreated={created} fallback={null}>
    <RenderController progress={progress} active={active} />
    <CameraRig progress={progress} compact={compact} pointer={pointer} />
    <SceneLighting progress={progress} compact={compact} />
    <ArenaEnvironment progress={progress} compact={compact} />
    <Suspense fallback={null}><ShuttlecockModel progress={progress} compact={compact} /></Suspense>
  </Canvas>;
}
