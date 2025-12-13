import React, { useState, useEffect } from 'react';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { contactAPI } from '../services/api';
import { getAbsoluteApiUrl } from '../services/api';

interface Announcement {
  _id: string;
  text?: string;
  message?: string;
  title?: string;
  image?: string;
  createdAt?: string;
}

const AnnouncementsBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await contactAPI.getAnnouncements();
        const list = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
        setAnnouncements(list);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch announcements:', err);
        setLoading(false);
      }
    };
    fetchAnnouncements();
  }, []);

  // Auto-rotate announcements every 5 seconds
  useEffect(() => {
    if (!announcements.length || !isVisible) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % announcements.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [announcements.length, isVisible]);

  if (!isVisible || loading || !announcements.length) {
    return null;
  }

  const current = announcements[currentIndex];
  const messageText = current?.text || current?.message || 'No content';
  const imageUrl = current?.image ? getAbsoluteApiUrl(current.image) : null;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % announcements.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + announcements.length) % announcements.length);
  };

  const handleView = () => {
    const current = announcements[currentIndex];
    if (current) {
      navigate('/announcements');
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #e6f7ff 0%, #f3e8ff 100%)',
        color: '#102a43',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 6px 18px rgba(16,42,67,0.06)',
        position: 'relative',
        border: '1px solid rgba(16,42,67,0.04)',
        margin: '0 0 24px 0',
        borderRadius: '8px'
      }}
    >
      {/* Image (left) */}
      {imageUrl && (
        <div
          style={{
            flexShrink: 0,
            width: 100,
            height: 100,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.1)',
          }}
        >
          <img
            src={imageUrl}
            alt="announcement"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content (center) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          fontSize: 12, 
          fontWeight: 700, 
          marginBottom: 8, 
          color: '#0066cc',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#ff6b6b',
            animation: 'pulse 2s infinite'
          }}></span>
          Announcement {currentIndex + 1} of {announcements.length}
        </div>
        <div style={{ 
          fontSize: 16, 
          fontWeight: 700, 
          lineHeight: 1.6, 
          display: '-webkit-box', 
          WebkitLineClamp: 2, 
          WebkitBoxOrient: 'vertical', 
          overflow: 'hidden', 
          background: 'linear-gradient(135deg, #0b2747 0%, #1a5490 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: 'none',
          letterSpacing: 0.3
        }}>
          {messageText}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Navigation & Close (right) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button
          type="primary"
          size="small"
          onClick={handleView}
          style={{ borderRadius: 20, padding: '4px 16px', background: '#0066cc', border: 'none' }}
        >
          View
        </Button>
        <Button
          type="default"
          size="small"
          onClick={handlePrev}
          style={{ color: '#102a43', borderRadius: 20, padding: '4px 10px', borderColor: 'rgba(16,42,67,0.08)' }}
        >
          ← Prev
        </Button>
        <Button
          type="default"
          size="small"
          onClick={handleNext}
          style={{ color: '#102a43', borderRadius: 20, padding: '4px 10px', borderColor: 'rgba(16,42,67,0.08)' }}
        >
          Next →
        </Button>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined style={{ color: '#102a43' }} />}
          onClick={() => setIsVisible(false)}
          style={{ color: '#102a43' }}
        />
      </div>
    </div>
  );
};

export default AnnouncementsBanner;
