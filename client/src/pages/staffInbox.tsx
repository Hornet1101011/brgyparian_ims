import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { List, Typography, Spin, Input, Button, Modal, message as antdMessage } from 'antd';
import AppAvatar from '../components/AppAvatar';
import styles from './staffInbox.module.css';
import { InboxOutlined, SendOutlined, PlusOutlined, QuestionCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { contactAPI, adminAPI, getAbsoluteApiUrl } from '../services/api';

interface FilterState {
  status: 'all' | 'pending' | 'responded' | 'closed';
  search: string;
}

const defaultFilterState: FilterState = {
  status: 'all',
  search: ''
};

const StaffInbox: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterState>(defaultFilterState);
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [replyLoading, setReplyLoading] = useState<{ [id: string]: boolean }>({});
  const [isMobile, setIsMobile] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [isTablet, setIsTablet] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);
  const [replyText, setReplyText] = useState<string>('');
  const [, setLoadingThread] = useState<boolean>(false);
  const [, setThreadVisible] = useState(false);
  const [residentsModalVisible, setResidentsModalVisible] = useState(false);
  const [residentsLoading, setResidentsLoading] = useState(false);
  const [residents, setResidents] = useState<Array<{ label: string; username?: string; barangayID?: string }>>([]);
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ============ UTILITIES ============
  const storedProfile = (() => {
    try {
      return localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile') || 'null') : null;
    } catch {
      return null;
    }
  })();

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

  // ============ EFFECTS ============
  useEffect(() => {
    const state: any = (location && (location as any).state) || {};
    const openId = state && state.openInquiryId;

    if (openId) {
      (async () => {
        setLoading(true);
        try {
          const all = await contactAPI.getAllInquiries();
          const filteredAll = (all || []).filter((i: any) => !(i && i.type === 'SCHEDULE_APPOINTMENT'));
          setInquiries(filteredAll);
          const found = (all || []).find((i: any) => i._id === openId);
          if (found) {
            setSelectedInquiry(found);
            return;
          }
          try {
            const single = await contactAPI.getInquiryById(openId);
            if (single) setSelectedInquiry(single);
          } catch (e) {
            // ignore
          }
        } catch (e) {
          try {
            const single = await contactAPI.getInquiryById(openId);
            if (single) {
              setSelectedInquiry(single);
              if (!(single && single.type === 'SCHEDULE_APPOINTMENT')) {
                setInquiries(prev => [single, ...prev]);
              }
            }
          } catch (err) {
            // ignore
          }
        } finally {
          setLoading(false);
        }
      })();
    } else {
      fetchAll();
    }
  }, [location]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await contactAPI.getAllInquiries();
      const filtered = (res || []).filter((i: any) => !(i && i.type === 'SCHEDULE_APPOINTMENT'));
      setInquiries(filtered);
    } catch (e) {
      console.error('Failed to load inquiries', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedInquiry?.responses?.length]);

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

  // Refresh inbox when inquiries are updated elsewhere (resident/staff scheduling)
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        // Fire a full refresh so the staff sees up-to-date inquiry state
        fetchAll();
      } catch (e) {
        fetchAll();
      }
    };
    window.addEventListener('inquiryUpdated', handler as EventListener);
    return () => window.removeEventListener('inquiryUpdated', handler as EventListener);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setLoadingThread(false);
    }
  }, [isMobile]);

  // ============ HANDLERS ============
  const openThread = (inquiry: any) => {
    setLoadingThread(true);
    
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
      if (selectedInquiry.isNewThread) {
        let recipientUsername = (selectedInquiry.residentUsername || selectedInquiry.username || selectedInquiry.userName || selectedInquiry.author || (selectedInquiry.createdBy && (selectedInquiry.createdBy.username || selectedInquiry.createdBy.userName)));
        let recipientBarangayID = ((selectedInquiry as any).residentBarangayID || selectedInquiry.barangayID || (selectedInquiry.createdBy && selectedInquiry.createdBy.barangayID));

        if ((!recipientUsername || recipientUsername === '') && selectedInquiry.createdBy) {
          if (typeof selectedInquiry.createdBy === 'string') {
            recipientUsername = selectedInquiry.createdBy;
          } else if (selectedInquiry.createdBy.username || selectedInquiry.createdBy.userName) {
            recipientUsername = selectedInquiry.createdBy.username || selectedInquiry.createdBy.userName;
          }
          if (!recipientBarangayID && selectedInquiry.createdBy && (selectedInquiry.createdBy.barangayID)) {
            recipientBarangayID = selectedInquiry.createdBy.barangayID;
          }
        }

        if ((!recipientUsername || recipientUsername === '') && Array.isArray(residents) && selectedInquiry.residentName) {
          const match = residents.find(r => r.label && r.label.toString().toLowerCase() === (selectedInquiry.residentName || '').toString().toLowerCase());
          if (match) {
            recipientUsername = (match as any).username || recipientUsername;
            recipientBarangayID = (match as any).barangayID || recipientBarangayID;
          }
        }

        const payload: any = {
          type: 'staff_message',
          subject: `Message to ${selectedInquiry.residentName}`,
          message: replyText.trim(),
          ...(recipientUsername ? { username: recipientUsername } : {}),
          ...(recipientBarangayID ? { barangayID: recipientBarangayID } : {}),
        };

        if (!payload.username) {
          antdMessage.error('Please select a resident to send this message to.');
          return;
        }

        const created = await contactAPI.submitInquiry(payload);
        antdMessage.success(`Message sent to ${selectedInquiry.residentName || payload.username}`);
        if (!(created && created.type === 'SCHEDULE_APPOINTMENT')) {
          setInquiries(prev => [created].concat(prev));
        }
        setSelectedInquiry(created);
        setReplyText('');
      } else {
        const resp = await contactAPI.respondToInquiry(sendingKey, { response: replyText.trim() });
        setInquiries(prev => prev.map(i => i._id === resp._id ? resp : i));
        setSelectedInquiry(resp);
        setReplyText('');
        antdMessage.success('Reply sent');
      }
    } catch (err) {
      console.error('Failed to send reply', err);
      antdMessage.error('Failed to send reply');
    } finally {
      setReplyLoading(r => ({ ...r, [sendingKey]: false }));
    }
  };

  const handleCloseInquiry = async () => {
    if (!selectedInquiry || !selectedInquiry._id) {
      return antdMessage.error('No inquiry selected');
    }

    Modal.confirm({
      title: 'Close Inquiry',
      content: 'Are you sure you want to close this inquiry? The resident will be notified.',
      okText: 'Close',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await fetch(`/api/inquiries/${selectedInquiry._id}/close`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ reason: 'Inquiry closed by staff' })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to close inquiry');
          }

          const updatedInquiry = await response.json();
          setInquiries(prev => prev.map(i => i._id === updatedInquiry.inquiry._id ? updatedInquiry.inquiry : i));
          setSelectedInquiry(null);
          antdMessage.success('Inquiry closed successfully');
        } catch (err) {
          console.error('Failed to close inquiry', err);
          antdMessage.error(`Failed to close inquiry: ${(err as any).message}`);
        }
      }
    });
  };

  // ============ FILTERING LOGIC ============
  const filteredInquiries = inquiries.filter(inquiry => {
    // Exclude SCHEDULE_APPOINTMENT type
    if (inquiry.type === 'SCHEDULE_APPOINTMENT') return false;

    let statusMatch = true;
    if (filter.status === 'pending') statusMatch = !inquiry.responses || inquiry.responses.length === 0;
    if (filter.status === 'responded') statusMatch = inquiry.status === 'resolved' || (inquiry.responses && inquiry.responses.length > 0);
    if (filter.status === 'closed') statusMatch = inquiry.status === 'closed';

    const search = filter.search.toLowerCase();
    const searchMatch =
      !search ||
      (inquiry.residentName && inquiry.residentName.toLowerCase().includes(search)) ||
      (inquiry.subject && inquiry.subject.toLowerCase().includes(search)) ||
      (inquiry.message && inquiry.message.toLowerCase().includes(search)) ||
      (inquiry.createdAt && new Date(inquiry.createdAt).toLocaleString().toLowerCase().includes(search));

    return statusMatch && searchMatch;
  });

  // ============ MAIN RENDER ============
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #fafbfc 0%, #f5f8fc 100%)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Poppins, Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        background: '#ffffff', 
        padding: isMobile ? '10px 12px' : '12px 20px', 
        borderBottom: '1px solid rgba(24, 144, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: isMobile ? 56 : 64,
        boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        gap: isMobile ? 8 : 12,
        flexWrap: isMobile ? 'wrap' : 'nowrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0 }}>
          <div style={{ width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: 12, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(114, 46, 209, 0.35)', flexShrink: 0 }}>
            <InboxOutlined style={{ fontSize: isMobile ? 22 : 28, color: '#ffffff', flexShrink: 0 }} />
          </div>
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 700, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: isMobile ? 16 : 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Inquiries Inbox
          </Typography.Title>
        </div>
        <div style={{ minWidth: 0, flex: isMobile ? '1' : 'none' }}>
          <Input.Search 
            placeholder={isMobile ? "Search..." : "Search inquiries..."} 
            allowClear 
            value={filter.search} 
            onChange={(e) => setFilter(s => ({ ...s, search: e.target.value }))} 
            style={{ width: isMobile ? '100%' : 280, borderRadius: 8 }}
            size={isMobile ? "middle" : "large"}
          />
        </div>
      </div>

      {/* Status Filter Tabs - Desktop only */}
      {!isMobile && (
        <div style={{ 
          background: '#ffffff', 
          padding: '0 20px', 
          borderBottom: '1px solid rgba(114, 46, 209, 0.15)',
          display: 'flex',
          gap: 24,
          height: 48,
          alignItems: 'center'
        }}>
          {['all', 'pending', 'responded', 'closed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(s => ({ ...s, status: status as any }))}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 13,
                fontWeight: filter.status === status ? 600 : 400,
                color: filter.status === status ? '#1890ff' : '#6b7280',
                borderBottom: filter.status === status ? '3px solid #1890ff' : 'none',
                padding: '8px 0',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                textTransform: 'capitalize'
              }}
            >
              {status === 'responded' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {status}
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    style={{ padding: 0, height: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setResidentsModalVisible(true);
                      setResidentsLoading(true);
                      (async () => {
                        try {
                          const users: any[] = await adminAPI.getUsers();
                          const list = (users || []).filter(u => {
                            const role = (u.role || u.type || '').toString().toLowerCase();
                            return role.includes('resident') || (!role.includes('admin') && !role.includes('staff'));
                          }).map(u => ({
                            label: u.fullName || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : (u.username || u.email || u.name)),
                            username: u.username || u.userName || u.email || u._id,
                            barangayID: u.barangayID || u.brgy || (u.barangay && (u.barangay.id || u.barangayID))
                          }));
                          setResidents(list.filter(r => r && r.label));
                        } catch (err) {
                          setResidents([]);
                        } finally {
                          setResidentsLoading(false);
                        }
                      })();
                    }}
                  />
                </span>
              ) : (
                status
              )}
            </button>
          ))}
        </div>
      )}

      {/* Residents Modal */}
      <Modal
        title="Select Resident"
        open={residentsModalVisible}
        onCancel={() => setResidentsModalVisible(false)}
        footer={null}
        width={400}
        style={{ borderRadius: 12 }}
      >
        {residentsLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin />
          </div>
        ) : residents.length === 0 ? (
          <Typography.Text type="secondary">No residents found.</Typography.Text>
        ) : (
          <List
            dataSource={residents}
            renderItem={resident => (
              <List.Item 
                style={{ cursor: 'pointer', padding: '10px 0' }} 
                onClick={() => {
                  const name = resident.label;
                  const username = resident.username;
                  const barangayID = (resident as any).barangayID;
                  const found = inquiries.find(i => {
                    const rn = ((i.username || i.residentName || (i.createdBy && (i.createdBy.username || '')) || '')).toString().toLowerCase();
                    return rn && (username ? rn === (username || '').toString().toLowerCase() : rn === (name || '').toString().toLowerCase());
                  });
                  if (found) {
                    setSelectedInquiry(found);
                    setResidentsModalVisible(false);
                  } else {
                    const temp: any = {
                      _id: `new-${Date.now()}`,
                      residentName: name,
                      residentUsername: username,
                      residentBarangayID: barangayID,
                      message: '',
                      responses: [],
                      isNewThread: true,
                    };
                    setSelectedInquiry(temp);
                    setResidentsModalVisible(false);
                  }
                }}
              >
                <List.Item.Meta
                  avatar={<AppAvatar style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>{getInitial(resident.label)}</AppAvatar>}
                  title={resident.label}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* Main Content Container - Shiny Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        border: '1px solid rgba(24, 144, 255, 0.1)',
        margin: '16px',
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        flexDirection: 'column'
      }}>
        {/* Main Content Area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Conversation List - Left Sidebar */}
        <div 
          className={styles.conversationList} 
          style={{ 
            width: isMobile ? (selectedInquiry ? 0 : '100%') : isTablet ? 280 : 360,
            borderRight: isMobile && selectedInquiry ? 'none' : '1px solid rgba(24, 144, 255, 0.1)',
            background: '#ffffff',
            display: isMobile && selectedInquiry ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {/* List Header */}
          <div style={{ padding: isMobile ? '10px 12px' : '12px 16px', borderBottom: '1px solid rgba(114, 46, 209, 0.15)', background: 'linear-gradient(135deg, rgba(242, 240, 255, 0.5) 0%, rgba(240, 230, 255, 0.5) 100%)' }}>
            <Typography.Text style={{ fontSize: 11, fontWeight: 700, background: 'linear-gradient(90deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', textTransform: 'uppercase' }}>
              All Inquiries
            </Typography.Text>
          </div>

          {/* Scrollable List */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Spin size="large" />
              </div>
            ) : filteredInquiries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                <InboxOutlined style={{ fontSize: 32, display: 'block', marginBottom: 12, opacity: 0.5 }} />
                <Typography.Text type="secondary">No inquiries</Typography.Text>
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
                        padding: isMobile ? '10px 6px' : '12px 8px',
                        background: isSelected ? 'rgba(114, 46, 209, 0.08)' : 'transparent', 
                        borderRadius: '12px', 
                        cursor: 'pointer', 
                        transition: 'all 0.3s ease-in-out',
                        display: 'flex', 
                        gap: isMobile ? 8 : 12, 
                        alignItems: 'flex-start',
                        border: isSelected ? '1px solid rgba(114, 46, 209, 0.2)' : 'none'
                      }}
                      onClick={() => openThread(inquiry)}
                      onMouseEnter={(e) => {
                        if (!isSelected && !isMobile) {
                          e.currentTarget.style.backgroundColor = 'rgba(114, 46, 209, 0.04)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected && !isMobile) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ flexShrink: 0, marginTop: 4 }}>
                        <AppAvatar 
                          style={{ 
                            background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', 
                            color: '#ffffff', 
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
                            <QuestionCircleOutlined style={{ color: '#dc2626', fontSize: isMobile ? 14 : 16, flexShrink: 0 }} />
                            <Typography.Text strong style={{ fontSize: isMobile ? 12 : 13, color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displayName}
                            </Typography.Text>
                          </div>
                          <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#6b7280', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {timeAgo(lastResponse?.createdAt || inquiry.createdAt)}
                          </Typography.Text>
                        </div>
                        <Typography.Text 
                          style={{ 
                            fontSize: isMobile ? 11 : 12, 
                            color: '#6b7280', 
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
                padding: isMobile ? '10px 12px' : '12px 20px', 
                borderBottom: '1px solid #e5e7eb',
                background: '#ffffff',
                gap: isMobile ? 8 : 12
              }}>
                {isMobile && (
                  <button 
                    onClick={() => setSelectedInquiry(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 20,
                      cursor: 'pointer',
                      color: '#dc2626',
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
                      background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', 
                      color: '#ffffff',
                      fontSize: isMobile ? 12 : 14,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {getInitial(selectedInquiry.residentName || selectedInquiry.username || 'U', 'U')}
                  </AppAvatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong style={{ display: 'block', fontSize: isMobile ? 12 : 14, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedInquiry.residentName || selectedInquiry.username || 'Unknown'}
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#6b7280', display: 'block', marginTop: 2 }}>
                      {selectedInquiry.isNewThread ? 'New message' : 'Active now'}
                    </Typography.Text>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: isMobile ? 6 : 8, 
                padding: isMobile ? '12px 12px' : '16px 20px', 
                minHeight: 0, 
                overflowY: 'auto',
                background: 'linear-gradient(135deg, rgba(250, 251, 252, 0.5) 0%, rgba(245, 248, 252, 0.5) 100%)'
              }}>
                {/* Original message */}
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                  <div style={{ maxWidth: isMobile ? '90%' : '70%' }}>
                    <Typography.Text style={{ fontSize: isMobile ? 11 : 12, color: '#6b7280', marginBottom: 4, display: 'block' }}>
                      {selectedInquiry.createdAt ? new Date(selectedInquiry.createdAt).toLocaleString() : ''}
                    </Typography.Text>
                    <div style={{ 
                      background: '#ffffff', 
                      padding: isMobile ? '10px 12px' : '12px 16px', 
                      borderRadius: 18,
                      wordBreak: 'break-word',
                      border: '1px solid rgba(24, 144, 255, 0.1)',
                      boxShadow: '0 2px 8px rgba(24, 144, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                    }}>
                      <Typography.Paragraph style={{ margin: 0, fontSize: isMobile ? 12 : 13, lineHeight: 1.5, color: '#0f172a' }}>
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
                                    <img src={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} alt={filename} style={{ maxWidth: '100%', borderRadius: 12 }} />
                                  </a>
                                ) : (
                                  <div>
                                    <a href={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} target="_blank" rel="noreferrer" style={{ background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 500, fontSize: isMobile ? 11 : 12 }}>{filename}</a>
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
                  const roleRaw = (response.role || response.authorRole || response.author_role || '').toString().toLowerCase();
                  let role = roleRaw;
                  const authorRaw = response.author || response.authorName || response.author_name || response.createdByName || '';
                  const createdById = response.createdBy ? String(response.createdBy) : undefined;

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

                  let authorName = authorRaw || response.authorName || response.createdByName || '';
                  if (!authorName) {
                    authorName = role === 'resident' 
                      ? (selectedInquiry.residentName || selectedInquiry.username || 'Resident')
                      : 'Staff';
                  }

                  const isResidentReply = role === 'resident' || role === 'user';
                  const align = isResidentReply ? 'flex-end' : 'flex-start';
                  const bgColor = isResidentReply ? '#ffffff' : '#ffffff';

                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: align, marginBottom: 8 }}>
                      <div style={{ maxWidth: '70%' }}>
                        <Typography.Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block', textAlign: align === 'flex-end' ? 'right' : 'left' }}>
                          <span style={{ fontWeight: 600, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{isResidentReply ? 'Resident' : 'Staff'}</span> • {response.createdAt ? new Date(response.createdAt).toLocaleString() : ''}
                        </Typography.Text>
                        <div style={{ 
                          background: bgColor, 
                          padding: '12px 16px', 
                          borderRadius: 18,
                          wordBreak: 'break-word',
                          border: '1px solid rgba(24, 144, 255, 0.1)',
                          boxShadow: '0 2px 8px rgba(24, 144, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                        }}>
                          <Typography.Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#0f172a' }}>
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
                                        <img src={typeof url === 'string' && !url.startsWith('http') ? getAbsoluteApiUrl(url) : url} alt={filename} style={{ maxWidth: '100%', borderRadius: 12 }} />
                                      </a>
                                    ) : (
                                      <div>
                                        <a href={url} target="_blank" rel="noreferrer" style={{ background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 500 }}>{filename}</a>
                                        {a.size && <span style={{ marginLeft: 10, color: '#6b7280', fontSize: 12 }}>({Math.round(a.size/1024)} KB)</span>}
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
                background: 'linear-gradient(135deg, rgba(249, 245, 255, 0.5) 0%, rgba(240, 230, 255, 0.5) 100%)', 
                padding: isMobile ? '10px 10px 12px 10px' : '12px 20px 16px 20px', 
                borderTop: '1px solid rgba(114, 46, 209, 0.15)', 
                display: 'flex', 
                alignItems: 'flex-end', 
                gap: isMobile ? 8 : 12
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
                    if (e.key === 'Enter' && !e.shiftKey && !(selectedInquiry && selectedInquiry.status === 'closed')) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder={selectedInquiry && selectedInquiry.status === 'closed' ? 'Inquiry is closed' : 'Aa'}
                  style={{
                    width: '100%',
                    minHeight: isMobile ? 32 : 36,
                    maxHeight: isMobile ? 80 : 100,
                    resize: 'none',
                    padding: isMobile ? '8px 12px' : '10px 16px',
                    borderRadius: 20,
                    border: '1px solid rgba(114, 46, 209, 0.2)',
                    fontSize: isMobile ? 12 : 13,
                    outline: 'none',
                    fontFamily: 'Poppins, Arial, sans-serif',
                    color: '#1f2937',
                    backgroundColor: selectedInquiry && selectedInquiry.status === 'closed' ? '#f3f4f6' : '#ffffff',
                    cursor: selectedInquiry && selectedInquiry.status === 'closed' ? 'not-allowed' : 'auto',
                  }}
                  onFocus={(e) => {
                    if (!(selectedInquiry && selectedInquiry.status === 'closed')) {
                      e.currentTarget.style.borderColor = '#1890ff';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(24, 144, 255, 0.1)';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(114, 46, 209, 0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.backgroundColor = selectedInquiry && selectedInquiry.status === 'closed' ? '#f3f4f6' : '#ffffff';
                  }}
                  disabled={selectedInquiry && selectedInquiry.status === 'closed'}
                />

                <button
                  onClick={handleSendReply}
                  style={{
                    background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: isMobile ? '6px 10px' : '8px 16px',
                    borderRadius: 20,
                    cursor: (replyText.trim() && !(selectedInquiry && selectedInquiry.status === 'closed')) ? 'pointer' : 'not-allowed',
                    fontSize: isMobile ? 12 : 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease-in-out',
                    gap: isMobile ? 4 : 6,
                    flexShrink: 0,
                    opacity: (replyText.trim() && !(selectedInquiry && selectedInquiry.status === 'closed')) ? 1 : 0.5,
                    minWidth: isMobile ? 32 : 40,
                    minHeight: isMobile ? 32 : 36,
                    boxShadow: (replyText.trim() && !(selectedInquiry && selectedInquiry.status === 'closed')) ? '0 4px 20px rgba(114, 46, 209, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4)' : 'none'
                  }}
                  disabled={selectedInquiry && selectedInquiry.status === 'closed' || !replyText.trim() || (selectedInquiry && replyLoading[selectedInquiry._id])}
                  title={selectedInquiry && selectedInquiry.status === 'closed' ? 'Inquiry is closed' : 'Send (Enter)'}
                  onMouseEnter={(e) => {
                    if (replyText.trim() && !(selectedInquiry && selectedInquiry.status === 'closed')) {
                      e.currentTarget.style.boxShadow = '0 6px 24px rgba(114, 46, 209, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (replyText.trim() && !(selectedInquiry && selectedInquiry.status === 'closed')) {
                      e.currentTarget.style.boxShadow = '0 4px 20px rgba(114, 46, 209, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <SendOutlined style={{ fontSize: isMobile ? 12 : 14 }} />
                </button>
                {selectedInquiry && selectedInquiry.status === 'closed' && (
                  <div style={{ color: '#dc2626', fontWeight: 600, fontSize: isMobile ? 12 : 14, marginTop: 8 }}>
                    This inquiry is closed. You cannot send further replies.
                  </div>
                )}

                <button
                  onClick={handleCloseInquiry}
                  style={{
                    background: 'linear-gradient(135deg, #f5222d 0%, #ff4d4f 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: isMobile ? '6px 10px' : '8px 16px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontSize: isMobile ? 12 : 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease-in-out',
                    gap: isMobile ? 4 : 6,
                    flexShrink: 0,
                    minWidth: isMobile ? 32 : 40,
                    minHeight: isMobile ? 32 : 36,
                    boxShadow: '0 4px 20px rgba(245, 34, 45, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                  }}
                  title="Close Inquiry"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 6px 24px rgba(245, 34, 45, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(245, 34, 45, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <CloseOutlined style={{ fontSize: isMobile ? 12 : 14 }} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: isMobile ? 24 : 48, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#65676b' }}>
              <Typography.Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>Select an inquiry to view details</Typography.Text>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default StaffInbox;
