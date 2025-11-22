

import React, { useState, useEffect } from 'react';
import { Dropdown, Badge, List, Button, Tabs, Typography, Space, Empty, message } from 'antd';
import AppAvatar from './AppAvatar';
import { BellOutlined } from '@ant-design/icons';
import { Notification, notificationService } from '../services/notificationService';
import { useNavigate } from 'react-router-dom';
const { Text } = Typography;

const tabCategories = [
  { key: 'all', label: 'All' },
  { key: 'documents', label: 'Documents' },
  { key: 'inquiries', label: 'Inquiries' },
  { key: 'system', label: 'System' },
];

const NotificationDropdown: React.FC = () => {

  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();


  // Connect to socket.io server once on mount

  // Helper: filtered notifications for active tab
  const filtered = activeTab === 'all' ? notifications : notifications.filter(n => n.category === activeTab);

  // Helper: unread count
  const unreadCount = notifications.filter(n => !n.read).length;

  // Handler: mark all as read (stub)
  const handleMarkAllRead = () => {
    (async () => {
      try {
        setLoading(true);
        await notificationService.markAllAsRead();
        // Optimistically mark local notifications as read
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        message.success('All notifications marked as read');
      } catch (err) {
        console.error('Mark all read failed', err);
        message.error('Failed to mark notifications as read');
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // fetch initial notifications
        const data = await notificationService.getNotifications();
        if (!mounted) return;
        setNotifications(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load notifications', err);
      } finally {
        setLoading(false);
      }
    })();

    // init socket and listen for incoming notification events
    try {
      notificationService.initNotificationSocket();
      const handleNew = (notif: Notification) => {
        setNotifications(prev => [notif, ...prev]);
      };
      const handleUpdated = ({ ids }: { ids: string[] }) => {
        setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
      };
      const handleDeleted = ({ ids }: { ids: string[] }) => {
        setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
      };
      notificationService.onNotificationEvent('new-notification', handleNew);
      notificationService.onNotificationEvent('notifications-updated', handleUpdated);
      notificationService.onNotificationEvent('notifications-deleted', handleDeleted);

      return () => {
        mounted = false;
        notificationService.offNotificationEvent('new-notification', handleNew);
        notificationService.offNotificationEvent('notifications-updated', handleUpdated);
        notificationService.offNotificationEvent('notifications-deleted', handleDeleted);
      };
    } catch (e) {
      // ignore socket init errors
    }
  }, []);

  const renderItem = (item: Notification) => (
    <List.Item
      style={{
        background: item.read ? undefined : '#f6faff',
        cursor: 'pointer',
        borderRadius: 8,
        marginBottom: 2,
        paddingLeft: 8,
        paddingRight: 8,
        transition: 'background 0.2s',
      }}
      onClick={async () => {
        try {
          // Mark as read on click
          await notificationService.markAsRead(String(item.id));
        } catch (e) {
          // ignore
        }
        // if it's a verification request, navigate to admin verification page
        const isVerification = (item.type && item.type === 'verification_request') || (item.title && /verification request/i.test(item.title));
        if (isVerification) {
          navigate('/admin/verification-requests');
          setVisible(false);
          return;
        }
        // default: navigate to notifications page
        navigate('/notifications');
        setVisible(false);
      }}
    >
      <List.Item.Meta
        avatar={<AppAvatar icon={<BellOutlined />} style={{ background: item.read ? '#d9d9d9' : '#1890ff' }} />}
        title={
          <Space>
            {!item.read && <Badge status="processing" size="default" style={{ marginRight: 4 }} />}
            <Text strong={!item.read} style={{ fontWeight: item.read ? 400 : 700 }}>{item.title}</Text>
          </Space>
        }
        description={
          <>
            <Text type={item.read ? undefined : 'secondary'}>{item.message}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 10 }}>{new Date(item.createdAt).toLocaleString()}</Text>
          </>
        }
      />
    </List.Item>
  );

  return (
    <Dropdown
      popupRender={() => (
        <div style={{ width: 350, maxHeight: 420, overflow: 'auto', padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px 0 rgba(0,0,0,0.10)' }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            tabBarGutter={16}
            style={{ marginBottom: 0 }}
            moreIcon={null}
            items={tabCategories.map(cat => ({
              key: cat.key,
              label: <span style={{
                fontWeight: activeTab === cat.key ? 700 : 500,
                borderBottom: activeTab === cat.key ? '2px solid #1677ff' : '2px solid transparent',
                color: activeTab === cat.key ? '#1677ff' : undefined,
                paddingBottom: 4,
                fontSize: 15,
                transition: 'all 0.2s',
                display: 'inline-block',
              }}>{cat.label}</span>,
              children: (
                <>
                  <List
                    dataSource={filtered}
                    loading={loading}
                    locale={{
                      emptyText: <Empty
                        image={<BellOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
                        description={<span style={{ color: '#888' }}>No notifications</span>}
                      />
                    }}
                    renderItem={renderItem}
                    itemLayout="horizontal"
                    style={{ marginTop: 8, minHeight: 120 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '0 4px' }}>
                    <Button size="small" type="default" disabled={unreadCount === 0} onClick={handleMarkAllRead}>
                      Mark all as read
                    </Button>
                    <Button type="link" style={{ fontSize: 13, color: '#1677ff', padding: 0 }} onClick={() => navigate('/notifications')}>View all</Button>
                  </div>
                </>
              )
            }))}
          />
        </div>
      )}
      trigger={["click"]}
      open={visible}
      onOpenChange={setVisible}
      placement="bottomRight"
      arrow
    >
      <Badge count={unreadCount} overflowCount={99}>
        <Button shape="circle" icon={<BellOutlined />} />
      </Badge>
    </Dropdown>
  );
};

export default NotificationDropdown;
