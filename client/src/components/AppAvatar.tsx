import React from 'react';
import AvatarImage from './AvatarImage';
import './AppAvatar.css';

type Size = number | 'small' | 'default' | 'large';

type Props = {
  src?: string | null;
  user?: any;
  profileImageId?: string | null;
  size?: Size;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  // background and text color for initials/icon badge
  background?: string;
  color?: string;
};

const mapSize = (s: Size): number => {
  if (typeof s === 'number') return s;
  switch (s) {
    case 'small':
      return 24;
    case 'large':
      return 56;
    default:
      return 36;
  }
};

const AppAvatar: React.FC<Props> = ({ src, user, profileImageId, size = 'default', alt, className, style, children, icon, background = '#1890ff', color = '#fff' }) => {
  const s = mapSize(size);

  // If we have an image source or a user with an image id, render AvatarImage
  const hasImage = Boolean(src || profileImageId || (user && (user.profileImage || user.profileImageId || user.profilePicture || user.avatar)));
  const baseClass = 'app-avatar';
  const sizeClass = typeof size === 'string' ? `app-avatar--${size}` : '';
  const classes = [baseClass, sizeClass, className].filter(Boolean).join(' ');

  if (hasImage) {
    const img = <AvatarImage src={src} user={user} profileImageId={profileImageId} size={s} alt={alt} className="app-avatar__img" />;
    if (typeof size === 'number') {
      const numericStyle: React.CSSProperties = {
        width: s,
        height: s,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'inline-block',
        ...style,
      };
      return (
        <div className={classes} style={numericStyle} aria-hidden>
          {img}
        </div>
      );
    }
    return (
      <div className={classes} style={style} aria-hidden>
        {img}
      </div>
    );
  }

  // Render icon or initials inside a rounded-rectangle div
  const content = icon ? (
    <span className="app-avatar__content">{icon}</span>
  ) : (
    <span className="app-avatar__content">{children || (user && (user.fullName || user.username || user.email) ? String((user.fullName || user.username || user.email)[0]).toUpperCase() : 'U')}</span>
  );

  if (typeof size === 'number') {
    const numericStyle: React.CSSProperties = {
      width: s,
      height: s,
      borderRadius: 10,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: background,
      color: color,
      fontSize: Math.max(12, Math.floor(s / 2.8)),
      ...style,
    };
    return (
      <div className={classes} style={numericStyle} aria-hidden>
        {content}
      </div>
    );
  }

  return (
    <div className={classes} style={style} aria-hidden>
      {content}
    </div>
  );
};

export default AppAvatar;
