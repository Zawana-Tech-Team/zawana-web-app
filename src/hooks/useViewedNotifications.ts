import { useEffect, type RefObject } from 'react';
import { getToken } from '../api';
import { removeViewedNotifications } from '../services/notificationInbox';

/** Only rows actually visible for a second are cleared when the reading surface closes. */
export function useViewedNotifications(ref: RefObject<HTMLElement | null>, enabled: boolean, userId?: string) {
  useEffect(() => {
    const surface = ref.current;
    if (!enabled || !surface || !userId) return;
    const token = getToken(), viewed = new Set<string>(), timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const observed = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const pending = timers.get(entry.target);
        if (pending) { clearTimeout(pending); timers.delete(entry.target); }
        const id = entry.target.getAttribute('data-notification-id');
        if (!id || viewed.has(id) || !entry.isIntersecting || entry.intersectionRatio < .5 || document.hidden) continue;
        timers.set(entry.target, setTimeout(() => {
          timers.delete(entry.target);
          if (!document.hidden) viewed.add(id);
        }, 1000));
      }
    }, { threshold: [.5] });
    const observe = () => surface.querySelectorAll('[data-notification-id]').forEach(element => {
      if (!observed.has(element)) { observed.add(element); observer.observe(element); }
    });
    observe();
    const mutations = new MutationObserver(observe); mutations.observe(surface, { childList: true, subtree: true });
    const visibility = () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      if (!document.hidden) for (const element of observed) { observer.unobserve(element); observer.observe(element); }
    };
    const flush = () => {
      const ids = [...viewed]; viewed.clear();
      if (ids.length) void removeViewedNotifications(ids, token, true).catch(() => {
        window.dispatchEvent(new CustomEvent('zawana-toast', { detail: 'Viewed notifications could not be cleared. They will remain available.' }));
      });
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect(); mutations.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', flush);
      for (const timer of timers.values()) clearTimeout(timer);
      flush();
    };
  }, [ref, enabled, userId]);
}
