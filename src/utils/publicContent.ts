import { mediaImageSrc } from '../components/ImageUpload';

export function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function publicImageSrc(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith('/uploads/')) return mediaImageSrc(value);
  if (/^\/(?!\/)[\w/.-]+$/.test(value)) return value;
  return safeHttpUrl(value);
}

export function publicationDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Yangon'
  }).format(date);
}
