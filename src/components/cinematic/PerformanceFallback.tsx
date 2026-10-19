import OptimizedImage from '../OptimizedImage';
import { SceneTypography } from './SceneTypography';

export function PerformanceBackdrop() {
  return <div className="journey-photo-backdrop" aria-hidden="true">
    <OptimizedImage src="/facilities/responsive/court-1280.webp" srcSet="/facilities/responsive/court-640.webp 640w, /facilities/responsive/court-1280.webp 1280w, /facilities/responsive/court-1920.webp 1920w" sizes="100vw" alt="" width={1920} height={1440} loading="eager" fetchPriority="high" />
  </div>;
}

export function PerformanceFallback({ reason, onEnable }: { reason: string; onEnable?: () => void }) {
  return <div className="journey-still" data-experience="still" data-reason={reason}>
    <PerformanceBackdrop />
    <div className="journey-still__note"><span>THE ZAWANA / ACTUAL FACILITY</span>{onEnable && <button type="button" onClick={onEnable}>Enable 3D experience</button>}</div>
    <SceneTypography active={0} still />
  </div>;
}
