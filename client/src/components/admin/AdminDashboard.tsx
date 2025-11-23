
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, List, Typography, Space, Spin, Button, Drawer, Table, Empty, Modal } from 'antd';
import AppAvatar from '../AppAvatar';
import {
  UserOutlined,
  BellOutlined,
  FileTextOutlined,
  TeamOutlined,
  
  CheckOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { adminAPI, notificationAPI, contactAPI, verificationAPI, getAbsoluteApiUrl } from '../../services/api';
import { documentsAPI } from '../../services/api';
import { initNotificationSocket, onNotificationEvent, offNotificationEvent } from '../../services/notificationSocket';
import { Notification } from '../../types/notification';
import { useAuth } from '../../contexts/AuthContext';

// Color palette for SVG pie chart slices
const pieColors = [
  '#6366F1', // Indigo
  '#22C55E', // Green
  '#F59E42', // Orange
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#FBBF24', // Yellow
  '#A21CAF', // Purple
  '#14B8A6', // Teal
];

const { Title, Text } = Typography;

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingRequests: number;
  totalDocuments: number;
  completedRequests: number;
  unreadMessages: number;
}

interface Activity {
  id: string;
  type: 'document' | 'user' | 'system';
  description: string;
  timestamp: string;
  user?: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [, setDocumentRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    pendingRequests: 0,
    totalDocuments: 0,
    completedRequests: 0,
    unreadMessages: 0
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [staffAccessNotifs, setStaffAccessNotifs] = useState<Notification[]>([]);
  const [, setRecentActivity] = useState<Activity[]>([]);
  const [verifs, setVerifs] = useState<any[]>([]);
  const [verifsLoading, setVerifsLoading] = useState(false);
  const [verifModalVisible, setVerifModalVisible] = useState(false);
  const [selectedVerif, setSelectedVerif] = useState<any | null>(null);
  const [, setInquiries] = useState<any[]>([]);
  const [, setInboxInquiries] = useState<any[]>([]);
  // Demo data for mini charts
  const usersTrend = [3, 5, 4, 6, 7, 8, 10]; // last 7 days
  const requestsByType = [
    { type: 'Clearance', value: 12 },
    { type: 'Certificate', value: 8 },
    { type: 'Permit', value: 5 },
    { type: 'Other', value: 3 },
  ];
  const documentCategoryData = [
    { type: 'Clearance', value: 27 },
    { type: 'Certificate', value: 18 },
    { type: 'Permit', value: 12 },
    { type: 'Other', value: 8 },
  ];

  // (Removed unused PieChartSVG helper to silence ESLint unused-symbol warnings)



  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const statsRes = await adminAPI.getSystemStatistics();
      // Fetch document requests for modal
  // Fetch document requests for modal
      try {
  const docs = await documentsAPI.getDocumentRecords();
        setDocumentRequests(docs);
      } catch (err) {
        setDocumentRequests([]);
      }

  const notificationsRes = await notificationAPI.getNotifications();

  // Only show unread notifications in the dashboard
  const unreadNotifs = notificationsRes.filter((n: Notification) => !n.read);
  setNotifications(unreadNotifs.slice(0, 10)); // show up to 10 unread notifications

  // Define staff access notifications for pendingRequests calculation
  // Only include explicit `staff_approval` notification types here
  const staffApprovalNotifs = unreadNotifs.filter((n: Notification) => (n.type || '').toString().toLowerCase() === 'staff_approval');
  setStaffAccessNotifs(staffApprovalNotifs);

  // Transform system statistics
  const systemPending = (statsRes.documents?.pending || 0) + staffApprovalNotifs.length;
      const systemTotalDocs = statsRes.documents?.total || 0;

      // Try to fetch document requests directly and derive pending count to ensure accuracy
      let directPending = 0;
      try {
        const allReqs = await documentsAPI.getDocumentRecords();
        const arr: any[] = Array.isArray(allReqs) ? allReqs : (allReqs && allReqs.data) ? allReqs.data : [];
        directPending = (arr || []).filter(r => (r.status || '').toString().toLowerCase() === 'pending').length;
      } catch (e) {
        directPending = systemPending;
      }

      const totalPending = directPending + (staffApprovalNotifs ? staffApprovalNotifs.length : 0);
      setStats({
        totalUsers: statsRes.users?.total || 0,
        activeUsers: statsRes.users?.active || 0,
        // Combine pending document requests with unread staff access notifications
        pendingRequests: totalPending,
        totalDocuments: systemTotalDocs,
        completedRequests: statsRes.documents?.completed || 0,
        unreadMessages: (unreadNotifs && Array.isArray(unreadNotifs)) ? unreadNotifs.length : 0
      });

      // Fetch all resident inquiries for admin inbox
      const inquiriesRes = await contactAPI.getAllInquiries();
      setInquiries(inquiriesRes);
      // Filter for inbox: assignedRole matches user.role or assignedTo includes user._id
      const filtered = inquiriesRes.filter((inq: any) =>
        (inq.assignedRole && user && inq.assignedRole === user.role) ||
        (inq.assignedTo && Array.isArray(inq.assignedTo) && user && inq.assignedTo.includes(user._id))
      );
      setInboxInquiries(filtered);

      // Fetch real recent activity logs
      const activityRes = await adminAPI.getActivityLogs({});
      // Map backend ActivityLog[] to local Activity[]
      setRecentActivity(activityRes.map((log: any) => ({
        id: log.id,
        type: log.module || 'system',
        description: log.description || log.action,
        timestamp: log.timestamp,
        user: log.userName || log.userId
      })));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);


  useEffect(() => {
    fetchDashboardData();

    // Initialize socket and listen for document-related events to refresh dashboard
    try {
      initNotificationSocket();
      const handler = (payload: any) => {
        console.log('Received document socket event, refreshing dashboard', payload);
        fetchDashboardData();
      };
      onNotificationEvent('documentStatusUpdate', handler);
      onNotificationEvent('documentCreated', handler);
      onNotificationEvent('documentDeleted', handler);
      onNotificationEvent('documents-updated', handler);

      // Poll as a fallback for environments without sockets
      const pollInterval = setInterval(() => {
        fetchDashboardData();
      }, 30000);

      return () => {
        offNotificationEvent('documentStatusUpdate', handler);
        offNotificationEvent('documentCreated', handler);
        offNotificationEvent('documentDeleted', handler);
        offNotificationEvent('documents-updated', handler);
        clearInterval(pollInterval);
      };
    } catch (err) {
      // If sockets fail, still keep polling
      const pollInterval = setInterval(() => {
        fetchDashboardData();
      }, 30000);
      return () => clearInterval(pollInterval);
    }
  }, [fetchDashboardData]);

  // Load verification requests (separate from main fetch to keep concerns isolated)
  const loadVerifs = async () => {
    setVerifsLoading(true);
    try {
      const res = await verificationAPI.getRequests();
      setVerifs(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load verification requests', err);
      setVerifs([]);
    } finally {
      setVerifsLoading(false);
    }
  };

  useEffect(() => { loadVerifs(); }, []);

  // Fetch users count explicitly from User Management and keep it refreshed
  const fetchUsersCount = async () => {
    try {
      const users = await adminAPI.getUsers();
      const usersAny: any = users;
      const count = Array.isArray(usersAny) ? usersAny.length : (usersAny && typeof usersAny.length === 'number' ? usersAny.length : 0);
      setStats(prev => ({ ...prev, totalUsers: count }));
    } catch (err) {
      console.error('Failed to fetch users list for count:', err);
    }
  };

  useEffect(() => {
    // initial fetch
    fetchUsersCount();
    // poll every 30 seconds to keep the count up-to-date
    const interval = setInterval(fetchUsersCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // handleMarkAsRead removed (not referenced in this component)

  // Approve staff request
  const handleApproveStaff = async (notif: Notification) => {
    if (!notif.data?.userId || !notif._id) return;
    try {
      setLoading(true);
      await notificationAPI.approveStaff(notif.data.userId, notif._id);
      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to approve staff:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reject staff request
  const handleRejectStaff = async (notif: Notification) => {
    if (!notif._id) return;
    const reason = window.prompt('Enter a brief reason for rejection (optional):');
    try {
      setLoading(true);
      await notificationAPI.rejectStaff(notif._id, reason || undefined);
      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to reject staff request:', err);
    } finally {
      setLoading(false);
    }
  };

  // (Unread badge removed — messages moved to dedicated notifications page)

  const kpiCards = [
    {
      label: 'Users',
      value: stats.totalUsers,
      icon: '👤',
      bg: 'linear-gradient(90deg, #1890ff 0%, #40a9ff 100%)',
      color: '#1890ff',
      labelColor: '#e6f7ff',
      onClick: undefined,
      chart: (
                <div style={{ width: '100%', marginTop: 8, height: 32 }}>
                  {/* Pure SVG sparkline for Users */}
                  <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <polyline
                      fill="none"
                      stroke="#4F46E5"
                      strokeWidth="2"
                      points={usersTrend.map((d, i) => `${i * (100 / (usersTrend.length - 1))},${40 - (d / Math.max(...usersTrend)) * 35}`).join(' ')}
                    />
                  </svg>
                </div>
      ),
    },
    {
      label: 'Pending Requests',
      value: stats.pendingRequests,
      icon: '⏳',
      bg: 'linear-gradient(90deg, #faad14 0%, #ffe58f 100%)',
      color: '#faad14',
      labelColor: '#fffbe6',
      onClick: undefined,
      chart: (
                <div style={{ width: '100%', marginTop: 8, height: 32 }}>
                  {/* Pure SVG bar chart for Requests */}
                  <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                    {requestsByType.map((d, i) => {
                      const barWidth = 100 / requestsByType.length - 2;
                      const barHeight = (d.value / Math.max(...requestsByType.map(r => r.value))) * 35;
                      return (
                        <rect
                          key={i}
                          x={i * (100 / requestsByType.length) + 1}
                          y={40 - barHeight}
                          width={barWidth}
                          height={barHeight}
                          fill="#22C55E"
                          rx="2"
                        />
                      );
                    })}
                  </svg>
                </div>
      ),
    },
    {
      label: 'Documents',
      value: stats.totalDocuments,
      icon: '📄',
      bg: 'linear-gradient(90deg, #52c41a 0%, #b7eb8f 100%)',
      color: '#52c41a',
      labelColor: '#f6ffed',
      onClick: undefined,
      chart: (
                <div style={{ width: '100%', marginTop: 8, height: 32, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {/* Pure SVG pie chart for Documents */}
                  <svg width="40" height="40" viewBox="0 0 40 40">
                    {(() => {
                      const total = documentCategoryData.reduce((sum, d) => sum + d.value, 0);
                      let startAngle = 0;
                      return documentCategoryData.map((d, i) => {
                        const angle = (d.value / total) * 360;
                        const endAngle = startAngle + angle;
                        const largeArc = angle > 180 ? 1 : 0;
                        const x1 = 20 + 18 * Math.cos((Math.PI * (startAngle - 90)) / 180);
                        const y1 = 20 + 18 * Math.sin((Math.PI * (startAngle - 90)) / 180);
                        const x2 = 20 + 18 * Math.cos((Math.PI * (endAngle - 90)) / 180);
                        const y2 = 20 + 18 * Math.sin((Math.PI * (endAngle - 90)) / 180);
                        const path = `M20,20 L${x1},${y1} A18,18 0 ${largeArc} 1 ${x2},${y2} Z`;
                        const el = (
                          <path
                            key={i}
                            d={path}
                            fill={pieColors[i % pieColors.length]}
                          />
                        );
                        startAngle += angle;
                        return el;
                      });
                    })()}
                  </svg>
                </div>
      ),
    },
    {
      label: 'Notifications',
      value: stats.unreadMessages,
      icon: '🔔',
      bg: 'linear-gradient(90deg, #722ed1 0%, #b37feb 100%)',
      color: '#722ed1',
      labelColor: '#f9f0ff',
      onClick: () => navigate('/admin/notifications'),
      chart: null,
    },
    // Messages KPI removed — notifications now have a dedicated admin page
  ];

  const statCardSubtitles = [
    'Total Users',
    'Pending Requests',
    'Total Documents',
    'Unread Messages',
  ];

  const renderStatCards = () => (
    <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
      {kpiCards.map((card, idx) => (
        <Col xs={24} sm={12} md={6} key={typeof card.label === 'string' ? card.label : String(idx)}>
          <Card
            hoverable
            onClick={card.onClick}
            style={{
              background: card.bg,
              color: '#fff',
              borderRadius: 20,
              minHeight: 170,
              boxShadow: '0 2px 8px 0 rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: card.onClick ? 'pointer' : 'default',
              transition: 'box-shadow 0.2s, transform 0.2s',
              position: 'relative',
              marginBottom: 8,
              padding: 24,
            }}
            styles={{
              body: {
                width: '100%',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
              }
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.18)';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(0,0,0,0.08)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span style={{ fontSize: 40, marginBottom: 8, opacity: 0.92 }}>{card.icon}</span>
            <span style={{ fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{card.value}</span>
            <span style={{ fontSize: 15, color: card.labelColor, fontWeight: 500, marginTop: 2, letterSpacing: 0.5 }}>{card.label}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: 400 }}>{statCardSubtitles[idx]}</span>
            {card.chart}
          </Card>
        </Col>
      ))}
    </Row>
  );

  // documentColumns removed (was used only by the removed inbox rendering block)

  const renderNotifications = () => (
    <Card
      title={<Space><BellOutlined /> Staff Access Approval</Space>}
      style={{ marginTop: 0, background: '#fafbfc', borderRadius: 12, boxShadow: '0 2px 8px #d9d9d933', border: '1px solid #f0f0f0', position: 'relative' }}
  styles={{ body: { padding: 16 } }}
      size="small"
      hoverable={false}
    >
  {/* Render a dedicated table for unread staff access approval requests */}
      {/* Show staff approval notifications (type === 'staff_approval') if present */}
      {staffAccessNotifs && staffAccessNotifs.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Table
            size="small"
            pagination={{ pageSize: 5 }}
            dataSource={staffAccessNotifs}
            rowKey={r => r._id || String(r.createdAt)}
            columns={[
              {
                title: 'Name',
                key: 'requestedBy',
                render: (_: any, record: Notification) => {
                  const d: any = record.data || {};
                  const nameFromData = d.fullName || (d.userId && (d.userId.fullName || d.userId.username));
                  const requestedByName = (record as any).requestedByName;
                  const displayName = nameFromData || (requestedByName || record.message) || 'Unknown';
                  return <span style={{ fontWeight: 600 }}>{displayName}</span>;
                }
              },
              {
                title: 'Requested At',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (val: any, record: Notification) => <span style={{ fontSize: 12, color: '#888' }}>{new Date(record.createdAt || val).toLocaleString()}</span>
              },
              {
                title: 'Actions',
                key: 'actions',
                render: (_: any, record: Notification) => (
                  <Space>
                    {!record.read && (
                      <Button type="primary" size="small" onClick={() => handleApproveStaff(record)} icon={<CheckOutlined />}>Approve</Button>
                    )}
                    <Button danger size="small" onClick={() => handleRejectStaff(record)} icon={<ExclamationCircleOutlined />}>Reject</Button>
                  </Space>
                )
              }
            ]}
          />
        </div>
      )}

      {/* Notifications removed from this container to avoid duplicate admin entries */}
  <Button type="link" style={{ position: 'absolute', right: 16, bottom: 8, fontSize: 13, color: '#1890ff' }} onClick={() => navigate('/admin/notifications')}>View all</Button>
    </Card>
  );

  // Verification widget for admin dashboard
  const handleApproveVerif = async (arg: any) => {
    // arg may be a userId string or the verification request object
    try {
      setVerifsLoading(true);
      if (arg && typeof arg === 'object') {
        const reqId = arg._id;
        const userId = arg.userId?._id || arg.userId;
        // mark request approved on server (if endpoint exists)
        try { await verificationAPI.approveRequest(reqId); } catch (e) { /* best-effort */ }
        // set the user verified
        if (userId) await verificationAPI.verifyUser(userId, true);
        // refresh list from server so approved items show as verified in the table/widget
        await loadVerifs();
      } else if (typeof arg === 'string') {
        await verificationAPI.verifyUser(arg, true);
      }
    } catch (err) {
      console.error('Failed to verify user', err);
    } finally {
      setVerifsLoading(false);
    }
  };

  // Handler to revert an approval (unverify)
  const handleUnverifyVerif = async (arg: any) => {
    try {
      setVerifsLoading(true);
      if (arg && typeof arg === 'object') {
        const reqId = arg._id;
        const userId = arg.userId?._id || arg.userId;
        // Call the server-side unapprove route if available to revert approval state
        try { if (reqId) await verificationAPI.unapproveRequest(reqId); } catch (e) { /* best-effort */ }
        if (userId) await verificationAPI.verifyUser(userId, false);
        // refresh list from server to reflect unverified status
        await loadVerifs();
      } else if (typeof arg === 'string') {
        await verificationAPI.verifyUser(arg, false);
        await loadVerifs();
      }
    } catch (err) {
      console.error('Failed to unverify user', err);
    } finally {
      setVerifsLoading(false);
    }
  };

  const handleRejectVerif = async (arg: any) => {
    try {
      setVerifsLoading(true);
      if (arg && typeof arg === 'object') {
        const reqId = arg._id;
        const userId = arg.userId?._id || arg.userId;
        try { await verificationAPI.rejectRequest(reqId); } catch (e) { /* best-effort */ }
        if (userId) await verificationAPI.verifyUser(userId, false);
      } else if (typeof arg === 'string') {
        // no request id available; just flip user verified to false
        await verificationAPI.verifyUser(arg, false);
      }
      await loadVerifs();
    } catch (err) {
      console.error('Failed to reject verification', err);
    } finally {
      setVerifsLoading(false);
    }
  };

  const openCheckId = (req: any) => {
    setSelectedVerif(req);
    setVerifModalVisible(true);
  };

  const renderVerificationWidget = () => (
    <Card
      title={<Space><UserOutlined /> Verification Requests</Space>}
      style={{ marginTop: 0, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #d9d9d933', border: '1px solid #f0f0f0' }}
      size="small"
      hoverable={false}
    >
      {verifsLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (!verifs || verifs.length === 0) ? (
        <Empty description="No verification requests" />
      ) : (
        <Table
          size="small"
          pagination={{ pageSize: 6 }}
          dataSource={verifs}
          rowKey={(r: any) => r._id}
          columns={[
            {
              title: 'Resident',
              key: 'resident',
              render: (_: any, record: any) => <span style={{ fontWeight: 600 }}>{(record.userId && (record.userId.fullName || record.userId.username)) || 'Unknown Resident'}</span>
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (val: any) => <span style={{ color: val === 'approved' ? '#167d3b' : '#d48806', fontWeight: 600 }}>{val || 'pending'}</span>
            },
            {
              title: 'Submitted',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (val: any) => <span style={{ color: '#888' }}>{val ? new Date(val).toLocaleString() : '-'}</span>
            },
            {
              title: 'Verified',
              dataIndex: 'approvedAt',
              key: 'approvedAt',
              render: (val: any) => <span style={{ color: '#888' }}>{val ? new Date(val).toLocaleString() : '-'}</span>
            },
            {
              title: 'Files',
              key: 'files',
              render: (_: any, record: any) => {
                const files = Array.isArray(record.filesMeta) && record.filesMeta.length ? record.filesMeta
                  : (Array.isArray(record.gridFileIds) ? record.gridFileIds.map((id: string) => ({ filename: id, gridFileId: id })) : []);
                return (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {files.map((f: any, i: number) => (
                      <a key={i} href={getAbsoluteApiUrl(`/verification/file/${f.gridFileId || f.filename}`)} target="_blank" rel="noreferrer">{f.fileType ? `${f.fileType}` : 'Open'}</a>
                    ))}
                  </div>
                );
              }
            },
            {
              title: 'Action',
              key: 'action',
              render: (_: any, record: any) => (
                <Space>
                  <Button size="small" onClick={() => openCheckId(record)}>Check ID</Button>
                  {record.status === 'approved' ? (
                    <Button size="small" onClick={() => handleUnverifyVerif(record)}>Unverify</Button>
                  ) : (
                    <Button type="primary" size="small" onClick={() => handleApproveVerif(record)}>Verify</Button>
                  )}
                  {record.status === 'approved' ? null : <Button danger size="small" onClick={() => handleRejectVerif(record)}>Reject</Button>}
                </Space>
              )
            }
          ]}
        />
      )}

      <Button type="link" style={{ marginTop: 12 }} onClick={() => navigate('/admin/verification-requests')}>View all</Button>

      <Modal
        title="Verification Files"
        open={verifModalVisible}
        onCancel={() => setVerifModalVisible(false)}
        footer={null}
        width={840}
      >
        {selectedVerif ? (
          <div>
            <p><strong>Resident:</strong> {(selectedVerif.userId && (selectedVerif.userId.fullName || selectedVerif.userId.username)) || 'Unknown'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {((selectedVerif.filesMeta && selectedVerif.filesMeta.length) ? selectedVerif.filesMeta : (selectedVerif.gridFileIds || []).map((id: string) => ({ filename: id, gridFileId: id }))).map((f: any, idx: number) => {
                const fid = f.gridFileId || f.filename;
                const fileUrl = getAbsoluteApiUrl(`/verification/file/${fid}`);
                const label = f.fileType ? (f.fileType.charAt(0).toUpperCase() + f.fileType.slice(1)) : (f.filename || 'File');
                return (
                  <div key={idx} style={{ border: '1px solid #f0f0f0', padding: 12, borderRadius: 8, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <a href={fileUrl} target="_blank" rel="noreferrer">Open</a>
                        <a href={fileUrl} download>Download</a>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      {/* try to render image preview, otherwise show filename */}
                      <img src={fileUrl} alt={label} style={{ maxWidth: '100%', maxHeight: 360 }} onError={(e) => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; }} />
                      <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>{f.filename || fid}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty description="No files" />
        )}
      </Modal>
    </Card>
  );

  // Mini announcements viewer to replace Recent Activity
  const [miniAnns, setMiniAnns] = useState<any[]>([]);
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniSelected, setMiniSelected] = useState<any | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const fetchMiniAnnouncements = async () => {
    setMiniLoading(true);
    try {
      const data = await contactAPI.getAnnouncements();
      setMiniAnns(Array.isArray(data) ? data.slice(0, 6) : []); // show up to 6
    } catch (err) {
      console.error('Failed to load mini announcements', err);
      setMiniAnns([]);
    } finally {
      setMiniLoading(false);
    }
  };

  useEffect(() => { fetchMiniAnnouncements(); }, []);

  // helper: simple time-ago
  const timeAgo = (iso?: string) => {
    if (!iso) return ''; 
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const renderRecentActivity = () => (
    <Card
      title={<Space><FileTextOutlined /> Announcements</Space>}
      style={{ marginTop: 0, background: '#fafbfc', borderRadius: 12, boxShadow: '0 2px 8px #d9d9d933', border: '1px solid #f0f0f0', position: 'relative' }}
      styles={{ body: { padding: 12 } }}
      size="small"
      hoverable={false}
    >
      {miniAnns.length === 0 ? (
        <Empty
          image={<FileTextOutlined style={{ fontSize: 42, color: '#d9d9d9' }} />}
          description={<span style={{ color: '#888' }}>No announcements</span>}
        />
      ) : (
  <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 6, paddingBottom: 48 }}>
          <List
            loading={miniLoading}
            dataSource={miniAnns}
            renderItem={(item) => (
              <List.Item style={{ cursor: 'pointer', padding: '10px 8px', alignItems: 'center' }} onClick={() => { setMiniSelected(item); setDrawerVisible(true); }}>
                <List.Item.Meta
                  title={<div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2em' }}>{item.text || 'Untitled'}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{timeAgo(item.createdAt)}</div>
                    </div>
                  </div>}
                  description={null}
                />
                  {item.imagePath && (
                    <div style={{ marginLeft: 12, width: 92, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                      <img loading="lazy" className="rounded-img" src={getAbsoluteApiUrl(`/announcements/${item._id}/image`)} alt="ann" style={{ width: 92, height: 60, objectFit: 'cover', borderRadius: 6, background: '#f0f0f0' }} />
                    </div>
                  )}
              </List.Item>
            )}
            size="small"
          />
        </div>
      )}

      {/* Footer area to host Manage link and avoid overlapping the scrollable list */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="link" style={{ fontSize: 13, color: '#1890ff' }} onClick={() => navigate('/admin/announcements')}>Manage</Button>
      </div>

      <Drawer open={drawerVisible} onClose={() => { setDrawerVisible(false); setMiniSelected(null); }} title="Announcement" width={720} placement="right">
        {miniSelected && (
          <div>
            <Text style={{ display: 'block', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{miniSelected.text}</Text>
                    {miniSelected.imagePath && (
                      <img loading="lazy" className="rounded-img rounded-img-lg" src={getAbsoluteApiUrl(`/announcements/${miniSelected._id}/image`)} alt="announcement" style={{ width: '100%', height: 'auto', borderRadius: 8, background: '#f6f6f6' }} />
                    )}
            <div style={{ marginTop: 8, color: '#888' }}>{timeAgo(miniSelected.createdAt)}</div>
          </div>
        )}
      </Drawer>
    </Card>
  );

  // renderInbox removed (not referenced in this component)

  return (
    <Spin spinning={loading}>
      <div style={{ padding: 24, backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
        <Title level={4} style={{ marginBottom: 24 }}>Admin Dashboard</Title>
        {renderStatCards()}
        <Row gutter={[24, 24]} style={{ marginTop: 0 }}>
          <Col xs={24} lg={12}>
            {renderNotifications()}
          </Col>
          <Col xs={24} lg={12}>
            {renderRecentActivity()}
          </Col>
        </Row>
        <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
          <Col xs={24}>
            {renderVerificationWidget()}
          </Col>
        </Row>
        {/* Modal is rendered inside renderInbox above */}
      </div>
    </Spin>
  );
};

export default AdminDashboard;
