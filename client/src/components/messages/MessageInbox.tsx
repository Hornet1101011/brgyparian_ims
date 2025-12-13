import React, { useEffect, useState, useContext } from 'react';
import { List, Typography, Button, Badge } from 'antd';
import { AuthContext } from '../../context/AuthContext';
import { axiosInstance } from '../../services/api';
import './MessageInbox.css';

const MessageInbox: React.FC<{ onRead?: (id: string) => void }> = ({ onRead }) => {
  const { user } = useContext(AuthContext)!;
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setLoading(true);
      axiosInstance.get('/messages/inbox').then(res => {
        setMessages(res.data);
        setLoading(false);
      });
    }
  }, [user]);

  const markAsRead = async (id: string) => {
    await axiosInstance.patch(`/messages/${id}/read`);
    setMessages(msgs => msgs.map(m => m._id === id ? { ...m, status: 'read' } : m));
    if (onRead) onRead(id);
  };

  return (
    <List
      loading={loading}
      header={
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#333',
          marginBottom: 16
        }}>
          ALL MESSAGES
        </div>
      }
      dataSource={messages}
      renderItem={msg => (
        <List.Item
          className="message-inbox-item"
          actions={msg.status === 'unread' ? [<Button type="link" onClick={() => markAsRead(msg._id)}>Mark as read</Button>] : []}
          onClick={() => { if (msg.status === 'unread') markAsRead(msg._id); }}
          style={{
            cursor: 'pointer',
            padding: '16px 12px',
            borderRadius: 12,
            transition: 'all 0.3s ease',
            marginBottom: 12,
            background: msg.status === 'unread' ? 'linear-gradient(135deg, rgba(64, 201, 255, 0.05) 0%, rgba(232, 28, 255, 0.05) 100%)' : 'transparent',
            border: msg.status === 'unread' ? '1px solid rgba(64, 201, 255, 0.15)' : '1px solid transparent',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(64, 201, 255, 0.1) 0%, rgba(232, 28, 255, 0.1) 100%)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(64, 201, 255, 0.1)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = msg.status === 'unread' ? 'linear-gradient(135deg, rgba(64, 201, 255, 0.05) 0%, rgba(232, 28, 255, 0.05) 100%)' : 'transparent';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <Badge dot={msg.status === 'unread'} color="#40c9ff">
            <div style={{ flex: 1 }}>
              <Typography.Text strong={msg.status === 'unread'} style={{
                fontSize: 15,
                fontWeight: msg.status === 'unread' ? 700 : 600,
                color: msg.status === 'unread' ? '#333' : '#666'
              }}>
                {msg.subject}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
                from {msg.senderId}
              </Typography.Text>
              <Typography.Text type={msg.status === 'unread' ? 'secondary' : undefined} style={{
                display: 'block',
                marginTop: 6,
                fontSize: 13,
                color: msg.status === 'unread' ? '#888' : '#999'
              }}>
                {msg.body}
              </Typography.Text>
            </div>
          </Badge>
        </List.Item>
      )}
    />
  );
};

export default MessageInbox;
