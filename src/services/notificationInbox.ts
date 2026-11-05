import { api, getToken } from '../api';
export const INBOX_CHANGED = 'zawana-notifications-changed';
export const INBOX_REFRESH = 'zawana-notifications-refresh';
export async function removeViewedNotifications(ids: string[], accessToken?: string, keepalive = false) {
  const originalToken = accessToken || getToken();
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 100) {
    const batch = unique.slice(start, start + 100);
    await api('/notifications/read', { method: 'POST', keepalive, body: JSON.stringify({ ids: batch }), ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}) });
    if (getToken() === originalToken) window.dispatchEvent(new CustomEvent(INBOX_CHANGED, { detail: { ids: batch } }));
  }
}
