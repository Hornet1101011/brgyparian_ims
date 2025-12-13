import React, { useState, useEffect } from 'react';
import { Button, List, Typography, Empty, Spin, Modal } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { contactAPI, getAbsoluteApiUrl } from '../services/api';

interface Announcement {
  _id: string;
  title?: string;
  text?: string;
  createdAt?: string;
  updatedAt?: string;
}

const AnnouncementsSidebar: React.FC = () => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      setLoading(true);
      try {
        const res = await contactAPI.getAnnouncements();
        const list = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
        // Show only first 5 announcements
        const sliced = list.slice(0, 5);
        setAnnouncements(sliced);

        try {
          const latestId = list && list.length ? list[0]._id : null;
          const storedLastSeenId = localStorage.getItem('announcements.lastSeenId');
          const storedHidden = localStorage.getItem('announcements.sidebar.hidden') === 'true';

          if (latestId) {
            // If a new announcement appeared since last seen, reveal the sidebar
            if (storedLastSeenId !== latestId) {
              setVisible(true);
              // Clear the explicit hidden flag so user closed state doesn't block the new announcement
              localStorage.removeItem('announcements.sidebar.hidden');
            } else {
              // No new announcement; honor user's hidden preference
              setVisible(!storedHidden);
            }
          } else {
            // No announcements; honor user's hidden preference
            setVisible(!storedHidden);
          }
        } catch (e) {
          // localStorage may throw in some environments; ignore errors and keep sidebar visible
          console.warn('Unable to read announcement visibility state', e);
        }
      } catch (err) {
        console.error('Failed to fetch announcements for sidebar:', err);
        setAnnouncements([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAnnouncements();
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  if (!visible) return null;

  // Responsive dimensions
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 640 && window.innerWidth < 1024;
  const sidebarWidth = isMobile ? 'min(90vw, 320px)' : isTablet ? '380px' : '450px';
  const sidebarRight = isMobile ? '10px' : '20px';
  const sidebarTop = isMobile ? '100px' : '140px';

  return (
    <div
      style={{
        position: 'fixed',
        right: sidebarRight,
        top: sidebarTop,
        width: sidebarWidth,
        maxHeight: 'calc(100vh - 160px)',
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 8px 32px rgba(16,24,40,0.08)',
        zIndex: 100,
        overflowY: 'auto',
        color: '#111',
        border: '1px solid rgba(16,24,40,0.04)',
        boxSizing: 'border-box'
      }}
    >
      <Button
        type="text"
        aria-label="Close announcements"
        onClick={() => {
          try {
            const latestId = announcements && announcements.length ? announcements[0]._id : '';
            localStorage.setItem('announcements.sidebar.hidden', 'true');
            // store the last seen announcement id so we can detect new ones later
            if (latestId) localStorage.setItem('announcements.lastSeenId', latestId);
          } catch (e) {
            // ignore storage errors
          }
          setVisible(false);
        }}
        icon={<CloseOutlined />}
        style={{ position: 'absolute', top: 8, right: 8, padding: 4 }}
      />

      <Typography.Title
        level={4}
        style={{
          color: '#111',
          marginBottom: 12,
          marginTop: 0,
          fontSize: 16,
          fontWeight: 700
        }}
      >
        📢 Latest Announcements
      </Typography.Title>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin />
        </div>
      ) : announcements.length === 0 ? (
        <Empty
          description="No announcements"
          style={{ color: '#666' }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
            <List
              dataSource={announcements}
              split={false}
              renderItem={(item) => (
                <div
                  key={item._id}
                  onClick={() => {
                    setSelected(item);
                    setModalVisible(true);
                  }}
                  style={{
                    padding: 12,
                    marginBottom: 10,
                    background: '#fafafa',
                    borderRadius: 8,
                    borderLeft: '4px solid #1890ff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'block'
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#f5f7fb';
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#fafafa';
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 6,
                      color: '#111',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {item.title || (item.text ? String(item.text).substring(0, 80) : 'Announcement')}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {formatDate(item.createdAt || item.updatedAt)}
                  </div>
                </div>
              )}
            />
      )}

      {/* View All button removed per request */}
      {/* Announcement detail modal */}
      <Modal
        title={selected?.title || 'Announcement'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setSelected(null); }}
        footer={null}
        centered
        width={isMobile ? '90vw' : isTablet ? '85vw' : 600}
        style={{ maxWidth: '90vw' }}
      >
        <div style={{ color: '#111' }}>
          <div style={{ marginBottom: 12 }}>{selected?.text || (selected as any)?.message}</div>
          {selected && (
            <img
              src={getAbsoluteApiUrl(`/announcements/${selected._id}/image`)}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              alt={selected?.title || 'announcement'}
              style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AnnouncementsSidebar;
