import React, { useState, useEffect } from 'react';
import { Button, List, Typography, Empty, Spin, Modal } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getAbsoluteApiUrl, contactAPI } from '../services/api';

interface EventItem {
  _id: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

const EventsSidebar: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await contactAPI.getEvents();
        const list = Array.isArray(res) ? res : (res && (res as any).data) ? (res as any).data : [];
        const sliced = list.slice(0, 5);
        setEvents(sliced);

        try {
          const latestId = list && list.length ? list[0]._id : null;
          const storedLastSeenId = localStorage.getItem('events.lastSeenId');
          const storedHidden = localStorage.getItem('events.sidebar.hidden') === 'true';

          if (latestId) {
            if (storedLastSeenId !== latestId) {
              setVisible(true);
              localStorage.removeItem('events.sidebar.hidden');
            } else {
              setVisible(!storedHidden);
            }
          } else {
            setVisible(!storedHidden);
          }
        } catch (e) {
          console.warn('Unable to read event visibility state', e);
        }
      } catch (err) {
        console.error('Failed to fetch events for sidebar:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const formatDate = (d?: string) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
        aria-label="Close events"
        onClick={() => {
          try {
            const latestId = events && events.length ? events[0]._id : '';
            localStorage.setItem('events.sidebar.hidden', 'true');
            if (latestId) localStorage.setItem('events.lastSeenId', latestId);
          } catch (e) {}
          setVisible(false);
        }}
        icon={<CloseOutlined />}
        style={{ position: 'absolute', top: 8, right: 8, padding: 4 }}
      />

      <Typography.Title
        level={4}
        style={{ color: '#111', marginBottom: 12, marginTop: 0, fontSize: 16, fontWeight: 700 }}
      >
        📅 Upcoming Events
      </Typography.Title>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin />
        </div>
      ) : events.length === 0 ? (
        <Empty description="No upcoming events" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={events}
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
                borderLeft: '4px solid #13c2c2',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#111' }}>
                {item.title || (item.description ? String(item.description).substring(0, 80) : 'Event')}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>{formatDate(item.startDate)}</div>
            </div>
          )}
        />
      )}

      <Modal
        title={selected?.title || 'Event'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSelected(null);
        }}
        footer={null}
        centered
        width={isMobile ? '90vw' : isTablet ? '85vw' : 600}
        style={{ maxWidth: '90vw' }}
      >
        <div style={{ color: '#111' }}>
          <div style={{ marginBottom: 12 }}>{selected?.description}</div>
          {selected && (
            <img
              src={getAbsoluteApiUrl(`/events/${selected._id}/image`)}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
              alt={selected?.title || 'event'}
              style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default EventsSidebar;
