import { getAbsoluteApiUrl, axiosPublic } from '../services/api';

export interface OfficialLite {
  _id?: string;
  photo?: any;
  photoFileId?: any;
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
 * 2. photoFileId (GridFS stored photo)
 * 3. photo (legacy embedded buffer)
 * 4. photoUrl (legacy full URL)
 * 5. photoPath (legacy disk path)
 * 6. hasPhoto flag (public endpoint check)
 * 7. default avatar
 */

export function getOfficialPhotoSrc(off: OfficialLite) {
  // Small embedded PNG data-URI as a safe default (1x1 neutral placeholder)
  const DEFAULT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  if (!off) return DEFAULT_PNG;
  if (off.previewUrl) return off.previewUrl;
  // New GridFS storage method - preferred
  if ((off as any).photoFileId && off._id) return getAbsoluteApiUrl(`/admin/officials/${off._id}/photo`);
  // Legacy embedded photo in document
  if ((off as any).photo && off._id) return getAbsoluteApiUrl(`/admin/officials/${off._id}/photo`);
  // Legacy photoUrl
  if (off.photoUrl) return off.photoUrl;
  // Legacy photoPath on disk
  if (off.photoPath) return getAbsoluteApiUrl(`/${off.photoPath.replace(/^\//, '')}`);
  // If we're dealing with a public official object that only exposes a flag, use the public photo route
  if ((off as any).hasPhoto && off._id) return getAbsoluteApiUrl(`/officials/${off._id}/photo`);
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
