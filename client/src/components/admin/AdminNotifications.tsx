// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Spin, Empty, Typography, message, Space, Button } from 'antd';
import AppAvatar from '../AppAvatar';
import { BellOutlined, TeamOutlined, CheckOutlined } from '@ant-design/icons';
import { notificationAPI } from '../../services/api';
import { Notification as NotificationType } from '../../types/notification';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

const AdminNotifications: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [notifs, setNotifs] = useState<NotificationType[]>([]);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const list = await notificationAPI.getNotifications();
      setNotifs(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load notifications', err);
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (n: NotificationType) => {
    if (!n._id) return;
    setLoading(true);
    try {
      // For staff-related notifications, call approveStaff
      if ((n.type || '').toString().toLowerCase().includes('staff') && n.data?.userId) {
        await notificationAPI.approveStaff(n.data.userId, n._id);
        message.success('Staff applicant approved');
      } else {
        // Default: mark as read and refresh
        await notificationAPI.markAsRead(n._id);
      }
      await load();
    } catch (err) {
      console.error('Approve failed', err);
      message.error('Action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (n: NotificationType) => {
    if (!n._id) return;
    setLoading(true);
    try {
      if ((n.type || '').toString().toLowerCase().includes('staff')) {
        await notificationAPI.rejectStaff(n._id, 'Rejected by admin');
        message.info('Staff applicant rejected');
      } else {
        await notificationAPI.markAsRead(n._id);
      }
      await load();
    } catch (err) {
      console.error('Reject failed', err);
      message.error('Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
        border: '1.5px solid rgba(102, 126, 234, 0.2)',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 40px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)',
        padding: '24px',
        minHeight: '240px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1.5px solid rgba(102, 126, 234, 0.1)',
        }}
      >
        <div
          style={{
            width: '4px',
            height: '24px',
            background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '2px',
          }}
        />
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#0f172a',
            letterSpacing: '-0.3px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <BellOutlined style={{ fontSize: '14px' }} />
          Notifications
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin />
        </div>
      ) : notifs && notifs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notifs.map((n, idx) => {
            const isStaffNotification = (n.type || '').toString().toLowerCase().includes('staff');
            return (
              <div
                key={idx}
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)',
                  border: '1.5px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  gap: '12px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 255, 0.7) 100%)';
                  el.style.borderColor = '#667eea';
                  el.style.boxShadow = '0 12px 28px rgba(102, 126, 234, 0.25)';
                  el.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)';
                  el.style.borderColor = 'rgba(102, 126, 234, 0.2)';
                  el.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.08)';
                  el.style.transform = 'translateY(0)';
                }}
              >
                {/* Avatar */}
                <div style={{ flexShrink: 0 }}>
                  <AppAvatar
                    icon={isStaffNotification ? <TeamOutlined /> : <BellOutlined />}
                    style={{
                      background: isStaffNotification
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      width: '42px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      color: '#fff',
                      border: '2px solid rgba(102, 126, 234, 0.2)',
                    }}
                  />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#0f172a',
                      marginBottom: '4px',
                      letterSpacing: '-0.3px',
                    }}
                  >
                    {n.title || n.message}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#64748b',
                      marginBottom: '8px',
                      fontWeight: 500,
                    }}
                  >
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#475569',
                      lineHeight: '1.5',
                      marginBottom: n.data ? '8px' : '0',
                    }}
                  >
                    {n.message}
                  </div>
                  {n.data && (
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#64748b',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ID: {n.data.userId || n.data.requestId || 'N/A'}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'flex-start' }}>
                  {isStaffNotification && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      onClick={() => handleApprove(n)}
                      style={{
                        height: '32px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      Approve
                    </Button>
                  )}
                  <Button
                    size="small"
                    onClick={() => handleReject(n)}
                    style={{
                      height: '32px',
                      background: 'rgba(102, 126, 234, 0.1)',
                      border: '1.5px solid #667eea',
                      color: '#667eea',
                      fontSize: '11px',
                      fontWeight: 700,
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#667eea';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                      e.currentTarget.style.color = '#667eea';
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Empty
            description={
              <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 500 }}>
                No notifications
              </span>
            }
          />
        </div>
      )}

      {/* Footer */}
      {notifs && notifs.length > 0 && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1.5px solid rgba(102, 126, 234, 0.1)', textAlign: 'right' }}>
          <Button
            type="link"
            onClick={() => navigate('/admin/notifications')}
            style={{
              color: '#667eea',
              fontSize: '11px',
              fontWeight: 600,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#764ba2';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#667eea';
            }}
          >
            View all →
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
