import React, { useEffect, useState } from 'react';
import { getAbsoluteApiUrl } from '../services/api';

type AvatarSource = {
  profileImage?: string | null;
  profileImageId?: string | null;
  profilePicture?: string | null; // legacy
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
};

type Props = {
  user?: AvatarSource | null;
  src?: string | null;
  profileImageId?: string | null;
  size?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  cacheBust?: boolean;
  cacheToken?: string | number;
};

const AvatarImage: React.FC<Props> = ({ user, src, profileImageId, size = 40, alt = '', className, style, cacheBust = false, cacheToken }) => {
  const u = user as any;
  const id = profileImageId || u?.profileImageId || null;
  const [errored, setErrored] = useState(false);
  let imageSrc = src || u?.profileImage || u?.profilePicture || null;
  // Normalize relative image paths to absolute API URLs so GridFS or server-hosted
  // images are fetched from the configured API origin rather than the current origin.
  try {
    if (imageSrc && typeof imageSrc === 'string' && !imageSrc.startsWith('http')) {
      // If it's an API path (starts with /resident or /api) or a root-relative path,
      // convert it to an absolute API URL.
      imageSrc = getAbsoluteApiUrl(imageSrc);
    }
  } catch (e) {
    // ignore and keep original imageSrc
  }

  // Compute effective source URLs deterministically before using hooks
  let base: string | null = null;
  let srcUrl: string | null = null;
  let finalSrc: string | null = null;
  try {
    if (id) {
      base = getAbsoluteApiUrl(`/resident/personal-info/avatar/${id}`);
      srcUrl = cacheBust ? `${base}${base.includes('?') ? '&' : '?'}t=${cacheToken ?? Date.now()}` : base;
    }
  } catch (e) {
    // ignore
  }

  try {
    if (!srcUrl && imageSrc && typeof imageSrc === 'string' && !imageSrc.startsWith('http')) {
      finalSrc = getAbsoluteApiUrl(imageSrc);
    } else if (!srcUrl && imageSrc) {
      finalSrc = imageSrc as string;
    }
  } catch (e) {
    // ignore
  }

  const currentSrc = srcUrl || finalSrc || null;

  // Reset errored flag whenever the effective source changes
  useEffect(() => {
    setErrored(false);
  }, [currentSrc]);

  if (currentSrc && !errored) {
    return (
      <img
        src={currentSrc}
        alt={alt || u?.fullName || u?.username || u?.email || 'avatar'}
        width={size}
        height={size}
        onError={() => setErrored(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', ...style }}
        className={className}
      />
    );
  }

  // Fallback to ui-avatars (use a sensible default if no name available).
  const rawName = (u?.fullName || u?.username || u?.email || '').toString().trim();
  const name = rawName || 'User';
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2196F3&color=fff&size=${Math.max(Math.min(size, 256), 32)}`;
  return (
    <img
      src={avatarUrl}
      alt={alt || name || 'avatar'}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', ...style }}
      className={className}
    />
  );
};

export default AvatarImage;
