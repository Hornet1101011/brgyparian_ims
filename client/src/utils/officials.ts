import { getAbsoluteApiUrl, axiosPublic } from '../services/api';

export interface OfficialLite {
  _id?: string;
  photo?: any;
  photoUrl?: string;
  photoPath?: string;
  previewUrl?: string;
}

export interface PublicOfficial {
  _id: string;
  name?: string;
  title?: string;
  term?: string;
  hasPhoto?: boolean;
}

/**
 * Return a URL string to display for an official's photo.
 * Priority:
 * 1. previewUrl (object URL for immediate client preview)
 * 2. DB photo bytes served at /api/admin/officials/:id/photo when `photo` is present
 * 3. photoUrl (legacy full URL)
 * 4. photoPath (legacy disk path)
 * 5. default avatar
 */

export function getOfficialPhotoSrc(off: OfficialLite) {
  // Small embedded PNG data-URI as a safe default (1x1 neutral placeholder)
  const DEFAULT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  if (!off) return DEFAULT_PNG;
  if (off.previewUrl) return off.previewUrl;
  // If the document has raw photo bytes (admin view) prefer admin photo endpoint
  if ((off as any).photo && off._id) return getAbsoluteApiUrl(`/admin/officials/${off._id}/photo`);
  // If we're dealing with a public official object that only exposes a flag, use the public photo route
  if ((off as any).hasPhoto && off._id) return getAbsoluteApiUrl(`/officials/${off._id}/photo`);
  if (off.photoUrl) return off.photoUrl;
  if (off.photoPath) return getAbsoluteApiUrl(`/${off.photoPath.replace(/^\//, '')}`);
  return DEFAULT_PNG;
}

export default getOfficialPhotoSrc;

/**
 * Fetch public barangay officials for display on unauthenticated pages.
 * Calls server public route GET /api/officials which returns minimal fields.
*/

export async function fetchPublicOfficials(): Promise<PublicOfficial[]> {
  try {
    // Prefer the public axios instance which respects runtime API_BASE
    const res = await axiosPublic.get('/officials');
    let data: any = res.data;
    // handle wrapped payloads like { data: [...] } or { officials: [...] }
    if (data && Array.isArray(data.data)) data = data.data;
    if (data && Array.isArray(data.officials)) data = data.officials;
    if (!Array.isArray(data)) {
      console.warn('fetchPublicOfficials: unexpected payload shape', data);
      return [];
    }
    if (data.length === 0) console.info('fetchPublicOfficials: server returned empty list');
    return data as PublicOfficial[];
  } catch (err) {
    console.error('fetchPublicOfficials error', err);
    return [];
  }
}
