import { useEffect, useState } from 'react';

type Device = { assessed: boolean; compact: boolean; shortViewport: boolean; lowPower: boolean; reducedMotion: boolean; webgl: boolean };
type PerformanceNavigator = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
const SHORT_VIEWPORT_QUERY = '(max-height: 600px), (min-width: 480px) and (max-height: 700px)';

function preferences(): Device {
  const device = navigator as PerformanceNavigator;
  return {
    assessed: false,
    compact: matchMedia('(max-width: 767px)').matches,
    shortViewport: matchMedia(SHORT_VIEWPORT_QUERY).matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lowPower: Boolean(device.connection?.saveData || (device.deviceMemory && device.deviceMemory <= 2) || (device.hardwareConcurrency && device.hardwareConcurrency <= 2)),
    webgl: false,
  };
}

export function useDevicePerformance() {
  const [device, setDevice] = useState(preferences);
  useEffect(() => {
    const mobile = matchMedia('(max-width: 767px)');
    const shortViewport = matchMedia(SHORT_VIEWPORT_QUERY);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      const next = preferences();
      let webgl = false;
      if (!next.reducedMotion && !next.lowPower && !next.shortViewport) {
        try {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
          webgl = Boolean(context);
          context?.getExtension('WEBGL_lose_context')?.loseContext();
        } catch { /* Photographic story remains fully functional. */ }
      }
      setDevice({ ...next, assessed: true, webgl });
    };
    sync();
    mobile.addEventListener('change', sync);
    shortViewport.addEventListener('change', sync);
    motion.addEventListener('change', sync);
    return () => { mobile.removeEventListener('change', sync); shortViewport.removeEventListener('change', sync); motion.removeEventListener('change', sync); };
  }, []);
  return device;
}
