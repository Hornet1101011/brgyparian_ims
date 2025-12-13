import React from 'react';
import { Tabs, Badge, Card } from 'antd';
import MessageInbox from '../admin/MessageInbox';
import MessageSent from './MessageSent';
import MessageCompose from './MessageCompose';

const Messaging: React.FC<{ unreadCount: number }> = ({ unreadCount }) => (
  <Card
    style={{
      borderRadius: 18,
      boxShadow: '0 20px 60px rgba(64, 201, 255, 0.1), 0 8px 32px rgba(64, 201, 255, 0.075), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 248, 255, 0.95) 100%)',
      border: '2px solid rgba(64, 201, 255, 0.2)',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
      marginBottom: 32
    }}
    styles={{ body: { padding: 0 } }}
  >
    {/* Glossy overlay for light reflection effect */}
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '40%',
      background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.05) 100%)',
      opacity: 0.6,
      zIndex: 0,
      pointerEvents: 'none'
    }} />
    <div style={{ position: 'relative', zIndex: 1 }}>
  <Tabs defaultActiveKey="inbox">
    <Tabs.TabPane
      tab={<span>Inbox <Badge count={unreadCount} offset={[8, 0]} /></span>}
      key="inbox"
    >
      <MessageInbox />
    </Tabs.TabPane>
    <Tabs.TabPane tab="Sent" key="sent">
      <MessageSent />
    </Tabs.TabPane>
    <Tabs.TabPane tab="Compose" key="compose">
      <MessageCompose />
    </Tabs.TabPane>
  </Tabs>
    </div>
  </Card>
);

export default Messaging;
