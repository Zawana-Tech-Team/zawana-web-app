import { useEffect, useState } from 'react';

type PerformanceNavigator = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
function preferences() {
  const device = navigator as PerformanceNavigator;
  return {
    assessed: false,
    compact: matchMedia('(max-width: 767px)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lowPower: Boolean(device.connection?.saveData || (device.deviceMemory && device.deviceMemory <= 2) || (device.hardwareConcurrency && device.hardwareConcurrency <= 2)),
  };
}
/** Cap graphics quality without replacing the cinematic scene or changing its camera path. */
export function useDevicePerformance() {
  const [device, setDevice] = useState(preferences);
  useEffect(() => {
    const mobile = matchMedia('(max-width: 767px)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setDevice({ ...preferences(), assessed: true });
    sync();
    mobile.addEventListener('change', sync); motion.addEventListener('change', sync);
    return () => { mobile.removeEventListener('change', sync); motion.removeEventListener('change', sync); };
  }, []);
  return device;
}
