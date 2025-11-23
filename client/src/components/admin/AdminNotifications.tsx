import React, { useEffect, useState } from 'react';
import { Card, List, Button, Space, Empty, Spin, Typography, message } from 'antd';
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
    <Card title={<Space><BellOutlined /> Notifications</Space>} style={{ minHeight: 240 }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (notifs && notifs.length > 0) ? (
        <List
          dataSource={notifs}
          renderItem={(n) => (
            <List.Item
              actions={[
                (n.type || '').toString().toLowerCase().includes('staff') && (
                  <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(n)}>Approve</Button>
                ),
                <Button size="small" onClick={() => handleReject(n)}>Dismiss</Button>
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={<AppAvatar icon={(n.type || '').toString().toLowerCase().includes('staff') ? <TeamOutlined /> : <BellOutlined />} />}
                title={<Text strong>{n.title || n.message}</Text>}
                description={
                  <div>
                    <div style={{ color: '#888', marginBottom: 6 }}>{new Date(n.createdAt).toLocaleString()}</div>
                    <div>{n.message}</div>
                    {n.data && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">{JSON.stringify(n.data)}</Text>
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty description="No notifications" />
      )}

      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <Button type="link" onClick={() => navigate('/admin/notifications')}>View all</Button>
      </div>
    </Card>
  );
};

export default AdminNotifications;
