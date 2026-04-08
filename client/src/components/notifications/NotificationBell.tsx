import React, { useEffect, useState, useContext } from 'react';
import { Badge, Dropdown, List, Spin } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { AuthContext } from '../../context/AuthContext';
import { notificationAPI } from '../../services/api';

const NotificationBell: React.FC = () => {
  const { user } = useContext(AuthContext)!;
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setLoading(true);
      notificationAPI.getNotifications()
        .then(res => setNotifications(Array.isArray(res) ? res : []))
        .catch(() => setNotifications([]))
        .finally(() => setLoading(false));
    }
  }, [user]);

  // server stores a boolean `read` flag; consider notification read when `read === true`
  const unreadCount = notifications.filter(n => !n.read).length;

  const menu = (
    <List
      dataSource={notifications}
      renderItem={item => (
        <List.Item style={{ background: !item.read ? '#e6f7ff' : undefined }}>
          <div style={{ padding: 6 }}>
            <div style={{ fontWeight: !item.read ? 700 : 400 }}>{item.title || item.message}</div>
            {item.title && <div style={{ color: '#666', fontSize: 12 }}>{item.message}</div>}
          </div>
        </List.Item>
      )}
      locale={{ emptyText: loading ? <Spin /> : 'No notifications' }}
      style={{ minWidth: 250, maxHeight: 300, overflowY: 'auto' }}
    />
  );

  return (
    <Dropdown popupRender={() => menu} trigger={['click']} placement="bottomRight">
      <Badge count={unreadCount} offset={[0, 8]}>
        <BellOutlined style={{ fontSize: 22, cursor: 'pointer' }} />
      </Badge>
    </Dropdown>
  );
};

export default NotificationBell;
