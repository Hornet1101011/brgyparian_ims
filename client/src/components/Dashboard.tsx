
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Button, Badge, Modal, Table, Tooltip, Checkbox, Tag, List, Space, message } from 'antd';
import { FileTextOutlined, MailOutlined, NotificationOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import AvatarImage from './AvatarImage';
import styles from './dashboard.module.css';
import { getAbsoluteApiUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { documentsAPI, contactAPI, verificationAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface DocumentRequest {
  _id: string;
  documentType: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  dateRequested: string;
  requesterId?: {
    fullName?: string;
    username?: string;
  };
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [residentImageSrc, setResidentImageSrc] = useState<string | null>(null);
  const [, setCurrentTime] = useState<string>(() => new Date().toLocaleString());
  const [documents, setDocuments] = useState<DocumentRequest[]>([]);
  const [, setLoading] = useState(true);
  const [announcementsCount, setAnnouncementsCount] = useState<number>(0);
  const [, setAnnouncementsLoading] = useState<boolean>(false);
  const [inquiriesCount, setInquiriesCount] = useState<number>(0);
  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [pendingRequestsList, setPendingRequestsList] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [approvedModalVisible, setApprovedModalVisible] = useState(false);
  const [approvedRequestsList, setApprovedRequestsList] = useState<any[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [tipsModalVisible, setTipsModalVisible] = useState(false);
  const [hideTips, setHideTips] = useState<boolean>(() => {
    try {
      return localStorage.getItem('residentTips.hide') === 'true';
    } catch (err) {
      return false;
    }
  });
  const [helpHover, setHelpHover] = useState(false);
  // Resident appointments
  const [appointments, setAppointments] = useState<any[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [apptModalVisible, setApptModalVisible] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);

  const formatDate = (val?: any) => {
    if (!val) return '';
    try {
      return new Date(val).toLocaleString();
    } catch (err) {
      return String(val);
    }
  };

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        let response;
        if (user?.role === 'admin' || user?.role === 'staff') {
          response = await documentsAPI.getAllDocuments();
        } else {
          response = await documentsAPI.getMyDocuments();
        }
        setDocuments(response);
      } catch (error) {
        console.error('Error fetching documents:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDocuments();
  // Fetch resident personal info image so dashboard can prefer resident container avatar
    (async () => {
      try {
        // Prefer resident personal-info container image (use axios instance so cookies/token are sent)
        try {
          const r1 = await (await import('../services/api')).residentPersonalInfoAPI.getPersonalInfo();
          const data = r1;
          if (data?.profileImage) {
            const url = data.profileImage.startsWith('http') ? data.profileImage : getAbsoluteApiUrl(data.profileImage);
            setResidentImageSrc(url);
            return;
          }
          if (data?.profileImageId) {
            setResidentImageSrc(getAbsoluteApiUrl(`/resident/personal-info/avatar/${data.profileImageId}`));
            return;
          }
        } catch (err) {
          // ignore per-endpoint errors
        }
        // If no resident image, try the user profile endpoint via axios instance
        try {
          const api = await import('../services/api');
          const r2 = await api.default.get('/resident/profile');
          const data2 = r2.data;
          if (data2?.profileImage) {
            const url2 = data2.profileImage.startsWith('http') ? data2.profileImage : getAbsoluteApiUrl(data2.profileImage);
            setResidentImageSrc(url2);
          } else if (data2?.profileImageId) {
            setResidentImageSrc(getAbsoluteApiUrl(`/resident/personal-info/avatar/${data2.profileImageId}`));
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        // ignore
      }
    })();
    // Live timestamp updater
    const tick = () => setCurrentTime(new Date().toLocaleString());
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // TODO: Fetch unread notifications count
  }, [user]);

  // Fetch resident's inquiries/appointments when role is resident
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user || user.role !== 'resident') return;
      setAppointmentsLoading(true);
      try {
        const res = await contactAPI.getMyInquiries();
        if (!mounted) return;
        // Keep only inquiries that have scheduledDates or status 'scheduled'
        const list = (Array.isArray(res) ? res : (res && res.data) ? res.data : []).filter((r: any) => (r.scheduledDates && r.scheduledDates.length) || (r.status === 'scheduled'));
        // normalize and sort by next appointment date
        const normalized = list.map((r: any) => {
          const next = (r.scheduledDates && r.scheduledDates.length) ? r.scheduledDates[0] : null;
          return { ...r, nextAppointment: next };
        }).sort((a: any, b: any) => {
          const da = a.nextAppointment ? new Date(a.nextAppointment.date) : new Date(a.createdAt);
          const db = b.nextAppointment ? new Date(b.nextAppointment.date) : new Date(b.createdAt);
          return da.getTime() - db.getTime();
        });
        setAppointments(normalized);
      } catch (err) {
        console.error('Failed to load resident appointments', err);
        setAppointments([]);
      } finally {
        setAppointmentsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user]);

  // Resident verification status: check backend for pending verification requests
  const [hasPendingVerification, setHasPendingVerification] = useState<boolean>(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (user?.role === 'resident') {
          const reqs = await verificationAPI.getMyRequests();
          if (!mounted) return;
          if (Array.isArray(reqs) && reqs.length > 0) {
            const pending = reqs.some((r: any) => (r.status || '').toString().toLowerCase() === 'pending');
            setHasPendingVerification(pending);
          } else {
            setHasPendingVerification(false);
          }
        }
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    const fetchInquiries = async () => {
      try {
        let res;
        if (user?.role === 'admin' || user?.role === 'staff') {
          res = await contactAPI.getAllInquiries();
        } else {
          res = await contactAPI.getMyInquiries();
        }
        // API may return array or object with count
        if (Array.isArray(res)) setInquiriesCount(res.length);
        else if (res && typeof res.count === 'number') setInquiriesCount(res.count);
        else setInquiriesCount((res && res.length) || 0);
      } catch (err) {
        console.error('Failed to load inquiries:', err);
        setInquiriesCount(0);
      }
    };
    fetchInquiries();
    // Fetch announcements count for the announcements card
    const fetchAnnouncements = async () => {
      setAnnouncementsLoading(true);
      try {
        const res = await contactAPI.getAnnouncements();
        if (Array.isArray(res)) setAnnouncementsCount(res.length);
        else if (res && typeof res.count === 'number') setAnnouncementsCount(res.count);
        else setAnnouncementsCount((res && res.length) || 0);
      } catch (err) {
        console.error('Failed to fetch announcements:', err);
        setAnnouncementsCount(0);
      } finally {
        setAnnouncementsLoading(false);
      }
    };
    fetchAnnouncements();
  }, [user]);

  const pendingCount = documents.filter(doc => (doc.status || '').toString().toLowerCase() === 'pending').length;
  const approvedCount = documents.filter(doc => (doc.status || '').toString().toLowerCase() === 'approved').length;

  return (
    <>
      <div style={{ maxWidth: 1200, margin: '40px auto', padding: '0 16px', position: 'relative' }}>
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 18 }}>
          <Row align="middle">
            <Col>
              <Typography.Text style={{ fontSize: 16, color: '#888' }}>
                <span style={{ marginRight: 8 }}>
                  <span style={{ color: '#1890ff', fontWeight: 600 }}>Dashboard</span> {'>'} Home
                </span>
              </Typography.Text>
            </Col>
          </Row>
        </div>
        {/* Hero Card Section */}
        {user?.role === 'resident' && (
          <Card
            className={styles.residentCard}
            style={{
              width: '100%',
              margin: '0 auto 32px',
              borderRadius: 32,
              boxShadow: '0 8px 32px #bfc7d6cc',
              background: 'linear-gradient(120deg, #e3e6f3 0%, #f8fafc 60%, #f6f1f7 100%)',
              border: 'none',
              padding: 0,
              position: 'relative',
              overflow: 'hidden',
              minHeight: 170
            }}
            styles={{ body: { padding: 0 } }}
          >
            {/* Subtle pattern/gradient background */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              background: 'radial-gradient(circle at 80% 20%, #e3e6f3 0%, #f8fafc 60%, #f6f1f7 100%)',
              opacity: 0.18,
              zIndex: 0
            }} />
            <Row align="middle" className={styles.heroRow} style={{ minHeight: 170, padding: '32px 32px', position: 'relative', zIndex: 1 }} justify="space-between">
              <Col xs={24} md={14} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div className={styles.avatarContainer}>
                      {residentImageSrc ? (
                        <img className={styles.avatarImg} src={residentImageSrc} alt={user?.fullName || user?.username || 'avatar'} />
                      ) : (
                        <AvatarImage user={(() => {
                          let displayUser = user;
                          if (!displayUser) {
                            try {
                              const stored = localStorage.getItem('userProfile');
                              if (stored) displayUser = JSON.parse(stored);
                            } catch (err) {}
                          }
                          return displayUser;
                        })()} size={96} />
                      )}
                      <button
                        onClick={() => navigate('/profile')}
                        title="Edit profile"
                        className={styles.editButton}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#595959"/>
                          <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#595959"/>
                        </svg>
                      </button>
                      {/* verification tag moved next to name (rendered in userInfo) */}
                    </div>
                    <div className={styles.userInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Typography.Title level={3} className={styles.userName} style={{ marginBottom: 0, fontWeight: 800 }}>{user?.fullName ?? user?.username ?? user?.email ?? ''}</Typography.Title>
                        <Typography.Text type="secondary" className={styles.userMeta}>
                          Barangay ID: {user?.barangayID ?? (() => {
                            try {
                              const stored = localStorage.getItem('userProfile');
                              if (stored) {
                                const p = JSON.parse(stored);
                                return p?.barangayID || 'N/A';
                              }
                            } catch (e) {}
                            return 'N/A';
                          })()}
                        </Typography.Text>
                      </div>
                      <div style={{ marginTop: 8 }}><Typography.Text type="secondary" className={styles.userMeta}>{new Date().toLocaleString()}</Typography.Text></div>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
            {/* help button moved to floating bottom-right */}
          </Card>
        )}

        {/* Statistics Grid */}
        <Row gutter={[32, 32]} justify="center" style={{ marginBottom: 40 }}>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 20,
                minHeight: 170,
                boxShadow: '0 2px 12px #faad1444',
                transition: 'box-shadow 0.2s, transform 0.2s',
                padding: 0,
                cursor: 'pointer'
              }}
              onClick={async () => {
                setPendingModalVisible(true);
                setPendingLoading(true);
                try {
                  let res;
                  if (user?.role === 'admin' || user?.role === 'staff') {
                    res = await documentsAPI.getAllDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'pending');
                  } else {
                    res = await documentsAPI.getMyDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'pending');
                  }
                  setPendingRequestsList(res || []);
                } catch (err) {
                  setPendingRequestsList([]);
                } finally {
                  setPendingLoading(false);
                }
              }}
              styles={{ body: { padding: 24 } }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#faad14', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <MailOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{pendingCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#faad14', fontWeight: 700 }}>Pending Requests</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 20,
                minHeight: 170,
                boxShadow: '0 2px 12px #52c41a44',
                transition: 'box-shadow 0.2s, transform 0.2s',
                padding: 0,
                cursor: 'pointer'
              }}
              styles={{ body: { padding: 24 } }}
              onClick={async () => {
                setApprovedModalVisible(true);
                setApprovedLoading(true);
                try {
                  let res;
                  if (user?.role === 'admin' || user?.role === 'staff') {
                    res = await documentsAPI.getAllDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'approved');
                  } else {
                    res = await documentsAPI.getMyDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'approved');
                  }
                  setApprovedRequestsList(res || []);
                } catch (err) {
                  setApprovedRequestsList([]);
                } finally {
                  setApprovedLoading(false);
                }
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#52c41a', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <FileTextOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{approvedCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#52c41a', fontWeight: 700 }}>Approved Documents</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 20,
                minHeight: 170,
                boxShadow: '0 2px 12px #1890ff44',
                transition: 'box-shadow 0.2s, transform 0.2s',
                padding: 0,
                cursor: 'pointer'
              }}
              onClick={() => navigate('/inbox')}
              styles={{ body: { padding: 24 } }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#1890ff', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <MailOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{inquiriesCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#1890ff', fontWeight: 700 }}>Active Inquiries</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card
              onClick={() => navigate('/announcements')}
              hoverable
              style={{
                borderRadius: 20,
                minHeight: 170,
                boxShadow: '0 2px 12px #eb2f9644',
                transition: 'box-shadow 0.2s, transform 0.2s',
                padding: 0,
                cursor: 'pointer'
              }}
              styles={{ body: { padding: 24 } }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#eb2f96', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Badge count={announcementsCount} offset={[8, 0]}>
                    <NotificationOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                  </Badge>
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{announcementsCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#eb2f96', fontWeight: 700 }}>Announcements</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
        </Row>
        
        {/* Resident Appointments (only for residents) */}
        {user?.role === 'resident' && (
          <div style={{ marginBottom: 28 }}>
            <Card title="Your Appointments" bordered={false} style={{ borderRadius: 12 }}>
              <List
                loading={appointmentsLoading}
                dataSource={appointments}
                locale={{ emptyText: 'No scheduled appointments' }}
                renderItem={(item: any) => {
                  const next = item.nextAppointment;
                  const dateLabel = next ? new Date(next.date).toLocaleDateString() : 'N/A';
                  const timeLabel = next ? `${next.startTime} - ${next.endTime}` : '—';
                  const status = item.status || (next ? 'scheduled' : 'pending');
                  return (
                    <List.Item
                      actions={[
                        <Button key="view" type="link" onClick={() => { setSelectedAppt(item); setApptModalVisible(true); }}>View</Button>,
                        <Button key="cancel" type="link" danger onClick={async () => {
                          Modal.confirm({
                            title: 'Cancel appointment',
                            content: 'Are you sure you want to cancel this appointment? This will mark the inquiry as resolved.',
                            onOk: async () => {
                              try {
                                await contactAPI.resolveInquiry(item._id);
                                message.success('Appointment cancelled');
                                // refresh list
                                const res = await contactAPI.getMyInquiries();
                                const list = (Array.isArray(res) ? res : (res && res.data) ? res.data : []).filter((r: any) => (r.scheduledDates && r.scheduledDates.length) || (r.status === 'scheduled'));
                                setAppointments(list);
                              } catch (err) {
                                console.error('Failed to cancel appointment', err);
                                message.error('Failed to cancel appointment');
                              }
                            }
                          });
                        }}>Cancel</Button>
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<div style={{ width: 52, height: 52, borderRadius: 8, background: '#f5f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileTextOutlined style={{ color: '#1890ff', fontSize: 20 }} /></div>}
                        title={<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><strong>{item.subject || 'Appointment'}</strong> <Tag color={status === 'scheduled' ? 'blue' : (status === 'resolved' ? 'default' : 'orange')}>{status}</Tag></div>}
                        description={<div><div style={{ fontWeight: 600 }}>{dateLabel} · {timeLabel}</div><div style={{ color: '#666', marginTop: 6 }}>{item.message || ''}</div></div>}
                      />
                    </List.Item>
                  );
                }}
              />
            </Card>
          </div>
        )}
        {/* Pending Requests Modal */}
        <Modal
          title="Pending Requests"
          open={pendingModalVisible}
          onCancel={() => setPendingModalVisible(false)}
          footer={null}
          width={800}
        >
          <Table
            dataSource={pendingRequestsList}
            loading={pendingLoading}
            rowKey={(record: any) => record._id}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: 'First Name',
                dataIndex: 'fieldValues',
                key: 'firstName',
                render: (fv: any, record: any) => fv?.firstName || record.username || 'Unknown'
              },
              {
                title: 'Doc Type',
                dataIndex: 'type',
                key: 'type',
                render: (text: string) => text || 'Unknown'
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (text: string) => (text || '').toString().toLowerCase()
              }
            ]}
          />
        </Modal>
        {/* Approved Requests Modal */}
        <Modal
          title="Approved Documents"
          open={approvedModalVisible}
          onCancel={() => setApprovedModalVisible(false)}
          footer={null}
          width={1000}
        >
          <Table
            dataSource={approvedRequestsList}
            loading={approvedLoading}
            rowKey={(record: any) => record._id}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: 'First Name',
                dataIndex: 'fieldValues',
                key: 'firstName',
                render: (fv: any, record: any) => fv?.firstName || record.username || 'Unknown'
              },
              {
                title: 'Doc Type',
                dataIndex: 'type',
                key: 'type',
                render: (text: string) => text || 'Unknown'
              },
              {
                title: 'Date Requested',
                dataIndex: 'dateRequested',
                key: 'dateRequested',
                render: (_: any, record: any) => formatDate(record.dateRequested || record.requestedAt || record.createdAt)
              },
              {
                title: 'Date Approved',
                dataIndex: 'dateApproved',
                key: 'dateApproved',
                render: (_: any, record: any) => formatDate(record.dateApproved || record.approvedAt || record.approvedOn || record.updatedAt)
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (text: string) => (text || '').toString().toLowerCase()
              }
            ]}
          />
        </Modal>
        {/* Resident Tool Tips Modal */}
        <Modal
          title="Resident Tool Tips"
          open={tipsModalVisible}
          onCancel={() => setTipsModalVisible(false)}
          footer={(
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <Checkbox
                checked={hideTips}
                onChange={e => {
                  const val = e.target.checked;
                  setHideTips(val);
                  try { localStorage.setItem('residentTips.hide', val ? 'true' : 'false'); } catch (err) {}
                }}
              >Don't show again</Checkbox>
              <div>
                <Button onClick={() => setTipsModalVisible(false)} style={{ marginRight: 8 }}>Cancel</Button>
                <Button type="primary" onClick={() => { setTipsModalVisible(false); }}>Got it</Button>
              </div>
            </div>
          )}
          width={720}
        >
          <ul style={{ paddingLeft: 20 }}>
            <li>Use the Request Document button to apply for barangay certificates and permits.</li>
            <li>Check your profile information regularly to ensure accuracy.</li>
            <li>Contact barangay staff for assistance with business registration or solo parent certification.</li>
            <li>For lost documents, use the Inquiry form to request help.</li>
            <li>All document requests are processed during office hours only.</li>
          </ul>
        </Modal>
        {/* Floating help button (bottom-right) */}
        <div style={{ position: 'fixed', right: 20, bottom: 24, zIndex: 1050 }}>
          <Tooltip title={hideTips ? 'Tips hidden (will remain hidden if checked)' : 'Resident Tool Tips'}>
            <Button
              type="primary"
              shape="circle"
              size="large"
              onClick={() => setTipsModalVisible(true)}
              onMouseEnter={() => setHelpHover(true)}
              onMouseLeave={() => setHelpHover(false)}
              icon={<QuestionCircleOutlined style={{ color: '#fff', fontSize: 20 }} />}
              style={{
                width: 56,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: helpHover ? '0 10px 30px rgba(24,144,255,0.22)' : '0 6px 18px rgba(0,0,0,0.12)',
                transform: helpHover ? 'translateY(-4px) scale(1.03)' : 'none',
                transition: 'transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 160ms',
              }}
            />
          </Tooltip>
        </div>
        {/* Appointment detail modal */}
        <Modal
          title="Appointment Details"
          open={apptModalVisible}
          onCancel={() => setApptModalVisible(false)}
          footer={null}
          width={720}
        >
          {selectedAppt ? (
            <div>
              <Typography.Title level={4}>{selectedAppt.subject || 'Appointment'}</Typography.Title>
              <Typography.Paragraph>{selectedAppt.message}</Typography.Paragraph>
              <div style={{ marginTop: 12 }}>
                <strong>Scheduled Dates:</strong>
                <ul>
                  {(selectedAppt.scheduledDates || []).map((s: any, i: number) => (
                    <li key={i}>{new Date(s.date).toLocaleDateString()} — {s.startTime} to {s.endTime}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : <div>No appointment selected</div>}
        </Modal>

        {/* ...other dashboard sections... */}
      </div>
    </>
  );
};

export default Dashboard;
                
