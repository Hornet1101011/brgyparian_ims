import React, { useEffect, useRef, useState } from 'react';
import { Card, List, Typography, Spin, message as antdMessage, Divider, Row, Col, Select, Input, Button, Tag, Result, Tooltip } from 'antd';
import AppAvatar from '../components/AppAvatar';
import { InboxOutlined, SendOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import styles from './inbox.module.css';
import { contactAPI, getAbsoluteApiUrl } from '../services/api';

// ============ TYPES ============
interface FilterState {
  status: 'all' | 'pending' | 'responded' | 'closed';
  search: string;
}

const defaultFilterState: FilterState = {
  status: 'all',
  search: ''
};

const Inbox: React.FC = () => {
  // ============ STATE MANAGEMENT ============
  const [loading, setLoading] = useState(true);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterState>(defaultFilterState);
  const [category, setCategory] = useState<string>('All');
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [replyLoading, setReplyLoading] = useState<{ [id: string]: boolean }>({});
  const [listFullscreen, setListFullscreen] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [isTablet, setIsTablet] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);
  const [replyText, setReplyText] = useState<string>('');
  const [, setLoadingThread] = useState<boolean>(false);
  const [, setThreadVisible] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ============ UTILITIES ============
  const storedProfile = (() => {
    try {
      return localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile') || 'null') : null;
    } catch {
      return null;
    }
  })();
  const isRestricted = Boolean(storedProfile && storedProfile.restricted);

  const getInitial = (val: any, fallback = '?'): string => {
    if (!val) return fallback;
    try {
      const s = String(val).trim();
      return s.length > 0 ? s.charAt(0).toUpperCase() : fallback;
    } catch {
      return fallback;
    }
  };

  const timeAgo = (iso?: string): string => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const monthYearStr = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // ============ LIGHTWEIGHT MESSAGE COMPONENT ============
  const MessageComment: React.FC<{ author?: string; avatar?: React.ReactNode; content?: React.ReactNode; datetime?: React.ReactNode; align?: 'left' | 'right' }> = ({ 
    author, avatar, content, datetime, align = 'left' 
  }) => (
    <div style={{ display: 'flex', justifyContent: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <div className={styles['message-container']}>
        {align === 'left' && avatar}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{author}</div>
          <div style={{ marginTop: 6 }}>{content}</div>
          {datetime && <div style={{ marginTop: 6, fontSize: 12, color: '#999' }}>{datetime}</div>}
        </div>
        {align === 'right' && avatar}
      </div>
    </div>
  );

  // ============ EFFECTS ============
  // Load inquiries
  useEffect(() => {
    setLoading(true);
    contactAPI.getMyInquiries()
      .then(res => {
        setInquiries(res || []);
      })
      .catch(() => {
        antdMessage.error('Failed to load inbox.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedInquiry?.responses?.length]);

  // Handle mobile responsiveness
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width <= 768);
      setIsTablet(width <= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Adjust layout on mobile
  useEffect(() => {
    if (isMobile) {
      setListFullscreen(!selectedInquiry);
    } else {
      setListFullscreen(false);
    }
  }, [isMobile, selectedInquiry]);

  // If account is restricted by barangay, block access to Inbox
  if (isRestricted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Result
          status="warning"
          title="Account Restricted"
          subTitle="Please visit the barangay to resolve this matter. Inbox and Document Request are unavailable while your account is restricted."
          extra={<Button type="primary" onClick={() => { window.location.href = '/profile'; }}>Go to Profile</Button>}
        />
      </div>
    );
  }

  // ============ FILTERING LOGIC ============
  const filteredInquiries = inquiries.filter(inquiry => {
    // Exclude SCHEDULE_APPOINTMENT inquiries
    if (inquiry.type === 'SCHEDULE_APPOINTMENT') return false;

    // Status filter
    let statusMatch = true;
    if (filter.status === 'pending') statusMatch = !inquiry.responses || inquiry.responses.length === 0;
    if (filter.status === 'responded') statusMatch = inquiry.status === 'resolved' || (inquiry.responses && inquiry.responses.length > 0);
    if (filter.status === 'closed') statusMatch = inquiry.status === 'closed';

    // Category filter
    const categoryMatch = !category || category === 'All' || inquiry.category === category;

    // Search filter
    const search = filter.search.toLowerCase();
    const searchMatch =
      !search ||
      (inquiry.residentName && inquiry.residentName.toLowerCase().includes(search)) ||
      (inquiry.category && inquiry.category.toLowerCase().includes(search)) ||
      (inquiry.subject && inquiry.subject.toLowerCase().includes(search)) ||
      (inquiry.createdAt && new Date(inquiry.createdAt).toLocaleString().toLowerCase().includes(search));

    return statusMatch && searchMatch && categoryMatch;
  });

  // ============ HANDLERS ============
  const openThread = (inquiry: any) => {
    setLoadingThread(true);
    setListFullscreen(false);
    
    setTimeout(() => {
      setSelectedInquiry(inquiry);
      setLoadingThread(false);
      setThreadVisible(true);
    }, 250);
  };

  const handleSendReply = async () => {
    if (!replyText || replyText.trim() === '') {
      return antdMessage.warning('Reply cannot be empty');
    }
    if (!selectedInquiry || !selectedInquiry._id) {
      return antdMessage.error('No inquiry selected');
    }

    const sendingKey = selectedInquiry._id;
    setReplyLoading(r => ({ ...r, [sendingKey]: true }));

    try {
      const resp = await contactAPI.respondToInquiry(selectedInquiry._id, { response: replyText.trim() });
      setInquiries(prev => prev.map(i => i._id === resp._id ? resp : i));
      setSelectedInquiry(resp);
      setReplyText('');
      antdMessage.success('Reply sent');
    } catch (err) {
      console.error('Failed to send reply', err);
      antdMessage.error('Failed to send reply');
    } finally {
      setReplyLoading(r => ({ ...r, [sendingKey]: false }));
    }
  };

  // ============ RENDER HELPERS ============
  const getStatusTag = (inquiry: any) => {
    if (inquiry.status === 'resolved') {
      return <Tag color="green" style={{ fontSize: 11, padding: '0 6px' }}>Resolved</Tag>;
    }
    if (Array.isArray(inquiry.responses) && inquiry.responses.length > 0) {
      return null;
    }
    return <Tag color="gold" style={{ fontSize: 11, padding: '0 6px' }}>Pending</Tag>;
  };

  const getCategoryIcon = (category: string): string => {
    switch ((category || '').toLowerCase()) {
      case 'complaints': return '🛑';
      case 'requests': return '📨';
      case 'announcements': return '📣';
      default: return '✉️';
    }
  };

  const getAuthorInfo = (response: any): { name: string; isResident: boolean; isCurrentUser: boolean } => {
    const roleRaw = (response.role || response.authorRole || response.author_role || '').toString().toLowerCase();
    let role = roleRaw;

    const authorRaw = response.author || response.authorName || response.author_name || response.createdByName || '';
    const createdById = response.createdBy ? String(response.createdBy) : undefined;
    const currentUserId = storedProfile && (storedProfile._id || storedProfile.id) ? String(storedProfile._id || storedProfile.id) : undefined;

    // Heuristic: detect resident replies
    if (!role) {
      try {
        let residentId: string | undefined;
        if (selectedInquiry.createdBy && typeof selectedInquiry.createdBy === 'string') {
          residentId = String(selectedInquiry.createdBy);
        } else if (selectedInquiry.createdBy && typeof selectedInquiry.createdBy === 'object') {
          residentId = String(selectedInquiry.createdBy._id || selectedInquiry.createdBy.id);
        }

        if (residentId && createdById && residentId === createdById) {
          role = 'resident';
        }
      } catch {
        // ignore
      }
    }

    // Determine display name
    let authorName = authorRaw || response.authorName || response.createdByName || '';
    const isCurrentUser = !!(currentUserId && createdById && currentUserId === createdById);
    if (isCurrentUser) {
      authorName = 'You';
    } else if (!authorName) {
      authorName = role === 'resident' 
        ? (selectedInquiry.residentName || selectedInquiry.username || 'Resident')
        : 'Staff';
    }

    return {
      name: authorName,
      isResident: role === 'resident' || role === 'user',
      isCurrentUser
    };
  };

  // ============ MAIN RENDER ============
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #fafbfc 0%, #f5f8fc 100%)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Poppins, Arial, sans-serif',
      padding: isMobile ? '12px' : '16px'
    }}>
      {/* Shiny Container */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        overflow: 'hidden',
        border: '1px solid rgba(24, 144, 255, 0.1)'
      }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #f5f8fc 0%, #ffffff 100%)',
        padding: isMobile ? '14px 16px' : '18px 24px', 
        borderBottom: '1px solid rgba(24, 144, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: isMobile ? 56 : 68,
        boxShadow: '0 2px 8px rgba(24, 144, 255, 0.06)',
        gap: isMobile ? 10 : 16,
        flexWrap: isMobile ? 'wrap' : 'nowrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, minWidth: 0 }}>
          <div style={{
            width: isMobile ? 40 : 48,
            height: isMobile ? 40 : 48,
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #1890ff 0%, #0a66c2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(24, 144, 255, 0.25)',
            flexShrink: 0
          }}>
            <InboxOutlined style={{ fontSize: isMobile ? 20 : 24, color: '#ffffff' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Typography.Title level={3} style={{ margin: 0, fontWeight: 700, color: '#1f2937', fontSize: isMobile ? 16 : 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Messages
            </Typography.Title>
            <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#9ca3af', marginTop: 2, display: 'block' }}>
              Manage your conversations
            </Typography.Text>
          </div>
        </div>
        <div style={{ minWidth: 0, flex: isMobile ? '1' : 'none' }}>
          <Input.Search 
            placeholder={isMobile ? "Search..." : "Search conversations..."} 
            allowClear 
            value={filter.search} 
            onChange={(e) => setFilter(s => ({ ...s, search: e.target.value }))} 
            style={{ width: isMobile ? '100%' : 300 }}
            size={isMobile ? "middle" : "large"}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: isMobile ? 0 : 0 }}>
        {/* Conversation List - Left Sidebar */}
        <div 
          className={styles.conversationList} 
          style={{ 
            width: isMobile ? (selectedInquiry ? 0 : '100%') : isTablet ? 300 : 380,
            borderRight: isMobile && selectedInquiry ? 'none' : '1px solid rgba(24, 144, 255, 0.08)',
            background: '#fafbfc',
            display: isMobile && selectedInquiry ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
          }}
        >
          {/* List Header */}
          <div style={{ 
            padding: isMobile ? '14px 16px' : '16px 18px', 
            borderBottom: '1px solid rgba(24, 144, 255, 0.08)',
            background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)'
          }}>
            <Typography.Text style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📬 All Messages
            </Typography.Text>
          </div>

          {/* Scrollable List */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Spin size="large" />
              </div>
            ) : filteredInquiries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#65676b' }}>
                <InboxOutlined style={{ fontSize: 32, display: 'block', marginBottom: 12, opacity: 0.5 }} />
                <Typography.Text type="secondary">No messages</Typography.Text>
              </div>
            ) : (
              <List
                itemLayout="vertical"
                dataSource={filteredInquiries}
                style={{ padding: '8px' }}
                renderItem={inquiry => {
                  const isSelected = selectedInquiry && selectedInquiry._id === inquiry._id;
                  const displayName = inquiry.residentName || inquiry.username || (inquiry.createdBy && (inquiry.createdBy.fullName || inquiry.createdBy.username)) || 'Unknown';
                  const initial = getInitial(displayName, '?');
                  const lastResponse = Array.isArray(inquiry.responses) && inquiry.responses.length > 0 
                    ? inquiry.responses[inquiry.responses.length - 1] 
                    : null;
                  const previewText = lastResponse 
                    ? (lastResponse.text || '')
                    : inquiry.message;

                  return (
                    <div
                      className={styles.listItem}
                      style={{ 
                        marginBottom: 8, 
                        padding: isMobile ? '12px 8px' : '14px 10px',
                        background: isSelected ? 'linear-gradient(135deg, #e6f4ff 0%, #f0f7ff 100%)' : 'transparent', 
                        borderRadius: '10px',
                        border: isSelected ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid transparent',
                        cursor: 'pointer', 
                        transition: 'all 0.25s ease',
                        display: 'flex', 
                        gap: isMobile ? 10 : 12, 
                        alignItems: 'flex-start'
                      }}
                      onClick={() => openThread(inquiry)}
                      onMouseEnter={(e) => {
                        if (!isSelected && !isMobile) {
                          e.currentTarget.style.backgroundColor = '#f9f9fb';
                          e.currentTarget.style.border = '1px solid rgba(24, 144, 255, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected && !isMobile) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.border = '1px solid transparent';
                        }
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ flexShrink: 0, marginTop: 4 }}>
                        <AppAvatar 
                          style={{ 
                            background: '#0a66c2', 
                            color: '#fff', 
                            fontWeight: 700,
                            fontSize: isMobile ? 12 : 14
                          }} 
                          size={isMobile ? 40 : 48}
                        >
                          {initial}
                        </AppAvatar>
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8, alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <QuestionCircleOutlined className={styles.typeIcon} style={{ color: '#0a66c2', fontSize: isMobile ? 14 : 16, flexShrink: 0 }} />
                            <Typography.Text strong style={{ fontSize: isMobile ? 12 : 13, color: '#000', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displayName}
                            </Typography.Text>
                          </div>
                          <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#65676b', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {timeAgo(lastResponse?.createdAt || inquiry.createdAt)}
                          </Typography.Text>
                        </div>
                        <Typography.Text 
                          style={{ 
                            fontSize: isMobile ? 11 : 12, 
                            color: '#65676b', 
                            display: 'block', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {previewText.substring(0, isMobile ? 25 : 40)}...
                        </Typography.Text>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>

        {/* Chat Area - Right Sidebar */}
        <div style={{ flex: 1, display: isMobile && !selectedInquiry ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedInquiry ? (
            <>
              {/* Thread Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: isMobile ? '14px 16px' : '16px 24px', 
                borderBottom: '1px solid rgba(24, 144, 255, 0.08)',
                background: 'linear-gradient(135deg, #f5f8fc 0%, #ffffff 100%)',
                gap: isMobile ? 10 : 16,
                boxShadow: '0 2px 8px rgba(24, 144, 255, 0.04)'
              }}>
                {/* Back Button for Mobile */}
                {isMobile && (
                  <button 
                    onClick={() => setSelectedInquiry(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 20,
                      cursor: 'pointer',
                      color: '#0a66c2',
                      padding: '4px 8px',
                      flexShrink: 0
                    }}
                  >
                    ←
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flex: 1, minWidth: 0 }}>
                  <AppAvatar 
                    size={isMobile ? 32 : 40} 
                    style={{ 
                      background: '#0a66c2', 
                      color: '#fff',
                      fontSize: isMobile ? 12 : 14,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {getInitial(selectedInquiry.residentName || selectedInquiry.username || 'U', 'U')}
                  </AppAvatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong style={{ display: 'block', fontSize: isMobile ? 12 : 14, color: '#000', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedInquiry.residentName || selectedInquiry.username || 'Unknown'}
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#65676b', display: 'block', marginTop: 2 }}>
                      Active now
                    </Typography.Text>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: isMobile ? 10 : 12, 
                padding: isMobile ? '16px 12px' : '24px 24px', 
                minHeight: 0, 
                overflowY: 'auto',
                background: 'linear-gradient(135deg, #f9fafb 0%, #f5f8fc 100%)'
              }}>
                {/* Original message */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <div style={{ maxWidth: isMobile ? '90%' : '70%' }}>
                    <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#9ca3af', marginBottom: 6, display: 'block', textAlign: 'right' }}>
                      {selectedInquiry.createdAt ? new Date(selectedInquiry.createdAt).toLocaleString() : ''}
                    </Typography.Text>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%)', 
                      padding: isMobile ? '12px 14px' : '14px 16px', 
                      borderRadius: '16px',
                      wordBreak: 'break-word',
                      boxShadow: '0 2px 8px rgba(24, 144, 255, 0.15)',
                      border: '1px solid rgba(24, 144, 255, 0.2)'
                    }}>
                      <Typography.Paragraph style={{ margin: 0, fontSize: isMobile ? 12 : 13, lineHeight: 1.5, color: '#000' }}>
                        {selectedInquiry.message}
                      </Typography.Paragraph>
                      {selectedInquiry.attachments && selectedInquiry.attachments.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {selectedInquiry.attachments.map((a: any, i: number) => {
                            const url = a.url || a.path || '#';
                            const filename = a.name || a.filename || 'attachment';
                            const isImage = (a.contentType && a.contentType.startsWith('image/')) || /\.(jpe?g|png|gif|webp)$/i.test(filename);
                            return (
                              <div key={i}>
                                {isImage ? (
                                  <a href={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} target="_blank" rel="noreferrer">
                                    <img src={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} alt={filename} className={styles.chatImage} style={{ maxWidth: '100%', borderRadius: 12 }} />
                                  </a>
                                ) : (
                                  <div>
                                    <a href={url} target="_blank" rel="noreferrer" style={{ color: '#0a66c2', fontWeight: 500, fontSize: isMobile ? 11 : 12 }}>{filename}</a>
                                    {a.size && <span style={{ marginLeft: 10, color: '#65676b', fontSize: isMobile ? 10 : 12 }}>({Math.round(a.size/1024)} KB)</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Response messages */}
                {Array.isArray(selectedInquiry.responses) && selectedInquiry.responses.map((response: any, idx: number) => {
                  const author = getAuthorInfo(response);
                  const align = author.isResident || author.isCurrentUser ? 'flex-end' : 'flex-start';
                  const bgColor = author.isResident || author.isCurrentUser ? 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%)' : 'linear-gradient(135deg, #f0f0f0 0%, #e5e5ea 100%)';
                  const borderColor = author.isResident || author.isCurrentUser ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)';

                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: align, marginBottom: 8 }}>
                      <div style={{ maxWidth: '70%' }}>
                        <Typography.Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6, display: 'block', textAlign: align === 'flex-end' ? 'right' : 'left' }}>
                          {response.createdAt ? new Date(response.createdAt).toLocaleString() : ''}
                        </Typography.Text>
                        <div style={{ 
                          background: bgColor, 
                          padding: '14px 16px', 
                          borderRadius: '16px',
                          wordBreak: 'break-word',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                          border: borderColor
                        }}>
                          <Typography.Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#000' }}>
                            {response.text}
                          </Typography.Paragraph>
                          {response.attachments && response.attachments.length > 0 && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {response.attachments.map((a: any, i: number) => {
                                const url = a.url || a.path || '#';
                                const filename = a.name || a.filename || 'attachment';
                                const isImage = (a.contentType && a.contentType.startsWith('image/')) || /\.(jpe?g|png|gif|webp)$/i.test(filename);
                                return (
                                  <div key={i}>
                                    {isImage ? (
                                      <a href={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} target="_blank" rel="noreferrer">
                                        <img src={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} alt={filename} className={styles.chatImage} style={{ maxWidth: '100%', borderRadius: 12 }} />
                                      </a>
                                    ) : (
                                      <div>
                                        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#0a66c2', fontWeight: 500 }}>{filename}</a>
                                        {a.size && <span style={{ marginLeft: 10, color: '#65676b', fontSize: 12 }}>({Math.round(a.size/1024)} KB)</span>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Bar */}
              <div style={{ 
                background: 'linear-gradient(135deg, #f9fafb 0%, #f5f8fc 100%)', 
                padding: isMobile ? '12px 12px 14px 12px' : '16px 24px 20px 24px', 
                borderTop: '1px solid rgba(24, 144, 255, 0.08)', 
                display: 'flex', 
                alignItems: 'flex-end', 
                gap: isMobile ? 10 : 14
              }}>
                <textarea
                  value={replyText}
                  onChange={e => {
                    setReplyText(e.target.value);
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = 'auto';
                    el.style.height = Math.min(isMobile ? 80 : 100, el.scrollHeight) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="Type your message..."
                  style={{
                    width: '100%',
                    minHeight: isMobile ? 36 : 40,
                    maxHeight: isMobile ? 80 : 100,
                    resize: 'none',
                    padding: isMobile ? '10px 14px' : '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(24, 144, 255, 0.2)',
                    fontSize: isMobile ? 12 : 13,
                    outline: 'none',
                    fontFamily: 'Poppins, Arial, sans-serif',
                    color: '#1f2937',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 2px 8px rgba(24, 144, 255, 0.08)',
                    transition: 'all 0.3s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#1890ff';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(24, 144, 255, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(24, 144, 255, 0.2)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(24, 144, 255, 0.08)';
                  }}
                />

                <button
                  onClick={handleSendReply}
                  className={styles.sendButton}
                  style={{
                    background: 'linear-gradient(135deg, #1890ff 0%, #0a66c2 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: isMobile ? '8px 12px' : '10px 16px',
                    borderRadius: '8px',
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    fontSize: isMobile ? 12 : 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                    gap: isMobile ? 4 : 6,
                    flexShrink: 0,
                    opacity: replyText.trim() ? 1 : 0.6,
                    minWidth: isMobile ? 36 : 44,
                    minHeight: isMobile ? 36 : 40,
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
                  }}
                  disabled={!replyText.trim() || (selectedInquiry && replyLoading[selectedInquiry._id])}
                  title="Send (Enter)"
                >
                  <SendOutlined style={{ fontSize: isMobile ? 12 : 14 }} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: isMobile ? 24 : 48, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#65676b' }}>
              <Typography.Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>Select a conversation to start messaging</Typography.Text>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default Inbox;
