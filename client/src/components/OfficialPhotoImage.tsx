import React, { useEffect, useState } from 'react';
import { getAbsoluteApiUrl } from '../services/api';

type OfficialSource = {
  _id?: string;
  name?: string;
  photoUrl?: string;
  photoFileId?: string;
  photo?: any;
};

type Props = {
  official?: OfficialSource | null;
  size?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
};

const OfficialPhotoImage: React.FC<Props> = ({ official, size = 48, alt = '', className, style }) => {
  const off = official as any;
  const [errored, setErrored] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  // Compute the image source URL
  useEffect(() => {
    try {
      let src: string | null = null;

      // Priority order (same as getOfficialPhotoSrc):
      // 1. photoUrl (public endpoint - preferred for display)
      if (off?.photoUrl && typeof off.photoUrl === 'string') {
        src = off.photoUrl;
      }
      // 2. If it has photoFileId or photo, use the public endpoint
      else if (off?._id && (off?.photoFileId || off?.photo)) {
        src = getAbsoluteApiUrl(`/officials/${off._id}/photo`);
      }

      // Normalize relative paths to absolute API URLs
      if (src && typeof src === 'string' && !src.startsWith('http')) {
        src = getAbsoluteApiUrl(src);
      }

      setImageSrc(src);
      setErrored(false);
    } catch (e) {
      console.warn('Failed to compute official photo source', e);
      setImageSrc(null);
    }
  }, [off]);

  if (imageSrc && !errored) {
    return (
      <img
        src={imageSrc}
        alt={alt || off?.name || 'official'}
        width={size}
        height={size}
        loading="eager"
        onError={() => setErrored(true)}
        style={{ 
          width: size, 
          height: size, 
          borderRadius: '50%', 
          objectFit: 'cover',
          display: 'block',
          ...style 
        }}
        className={className}
      />
    );
  }

  // Fallback to ui-avatars
  const name = (off?.name || 'Official').toString().trim();
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff&size=${Math.max(Math.min(size, 256), 32)}`;
  
  return (
    <img
      src={avatarUrl}
      alt={alt || name || 'official'}
      width={size}
      height={size}
      loading="eager"
      style={{ 
        width: size, 
        height: size, 
        borderRadius: '50%', 
        objectFit: 'cover',
        display: 'block',
        ...style 
      }}
      className={className}
    />
  );
};

export default OfficialPhotoImage;
