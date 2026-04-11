
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, List, Typography, Space, Spin, Button, Drawer, Table, Empty, Modal } from 'antd';
import {
  UserOutlined,
  BellOutlined,
  FileTextOutlined,
  CheckOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { adminAPI, contactAPI, verificationAPI, notificationAPI, documentsAPI } from '../../services/api';
import { initNotificationSocket, onNotificationEvent, offNotificationEvent } from '../../services/notificationSocket';
import { Notification } from '../../types/notification';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardSummary } from '../../hooks/useAnalytics';

// Helper function to get absolute API URL
const getAbsoluteApiUrl = (path: string): string => {
  const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  return `${baseUrl}${path}`;
};

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
  type: string;
  description: string;
  timestamp: string;
  user: string;
}

interface DocumentData {
  status: string;
  category: string;
  count: number;
}

interface VerificationRequest {
  _id: string;
  userId: { _id: string; fullName?: string; username?: string };
  status: string;
  createdAt: string;
  approvedAt?: string;
  filesMeta?: any[];
  gridFileIds?: string[];
}

interface Inquiry {
  _id: string;
  assignedRole?: string;
  assignedTo?: string[];
  status?: string;
}

interface Announcement {
  _id: string;
  text?: string;
  createdAt?: string;
  imagePath?: string;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    pendingRequests: 0,
    totalDocuments: 0,
    completedRequests: 0,
    unreadMessages: 0
  } as DashboardStats);
  const [notifications, setNotifications] = useState([] as Notification[]);
  const [staffAccessNotifs, setStaffAccessNotifs] = useState([] as Notification[]);
  const [, setRecentActivity] = useState([] as Activity[]);
  const [verifs, setVerifs] = useState([] as VerificationRequest[]);
  const [verifsLoading, setVerifsLoading] = useState(false);
  const [verifModalVisible, setVerifModalVisible] = useState(false);
  const [selectedVerif, setSelectedVerif] = useState(null as VerificationRequest | null);
  const [, setInquiries] = useState([] as Inquiry[]);
  const [, setInboxInquiries] = useState([] as Inquiry[]);
  const [documentsModalVisible, setDocumentsModalVisible] = useState(false);
  const [documentsData, setDocumentsData] = useState([] as DocumentData[]);
  const summaryQuery = useDashboardSummary();
  // Mini announcements viewer to replace Recent Activity
  const [miniAnns, setMiniAnns] = useState([] as Announcement[]);
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniSelected, setMiniSelected] = useState(null as Announcement | null);
  const [drawerVisible, setDrawerVisible] = useState(false);
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
    let docs: any = [];
    try {
      setLoading(true);
      const statsRes = await adminAPI.getSystemStatistics();
      // Fetch document requests for modal
      try {
        docs = await documentsAPI.getDocumentRecords();

        // Process documents for modal table
        const categorized = docs.reduce((acc: any, doc: any) => {
          const status = doc.status || 'pending';
          const category = doc.category || 'Other';
          if (!acc[status]) acc[status] = {};
          if (!acc[status][category]) acc[status][category] = 0;
          acc[status][category]++;
          return acc;
        }, {});
        const tableData = Object.entries(categorized).flatMap(([status, categories]: [string, any]) =>
          Object.entries(categories).map(([category, count]: [string, number]) => ({ status, category, count }))
        );
        setDocumentsData(tableData);

        // templates count is provided by the dashboard summary hook; no local fetch required here
      } catch (err) {
        setDocumentsData([]);
      }

      const notificationsRes = await notificationAPI.getNotifications();

      // Only show unread notifications in the dashboard
      const unreadNotifs = notificationsRes.filter((n: Notification) => !n.read);
      setNotifications(unreadNotifs); // store all unread notifications

      // Define staff access notifications for pendingRequests calculation
      // Only include explicit `staff_approval` notification types here, and only unread
      const staffApprovalNotifs = unreadNotifs.filter((n: Notification) => (n.type || '').toString().toLowerCase() === 'staff_approval');
      setStaffAccessNotifs(staffApprovalNotifs);

      // Transform system statistics
      const systemPending = (statsRes.documents?.pending || 0) + staffApprovalNotifs.length;

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
      
      // Calculate total documents from fetched data
      const totalDocsFromFetch = docs ? docs.length : 0;
      const completedDocsCount = docs ? docs.filter((d: any) => (d.status || '').toString().toLowerCase() === 'approved').length : 0;

      // Prefer authoritative counts from admin statistics endpoint when available,
      // but fall back to counts derived from fetched records.
      const systemTotalDocs = statsRes.documents?.total || 0;
      const systemCompleted = statsRes.documents?.completed || 0;

      setStats({
        totalUsers: statsRes.users?.total || 0,
        activeUsers: statsRes.users?.active || 0,
        // Combine pending document requests with unread staff access notifications
        pendingRequests: totalPending,
        totalDocuments: systemTotalDocs || totalDocsFromFetch,
        completedRequests: systemCompleted || completedDocsCount,
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
          try { summaryQuery?.refetch?.(); } catch (e) { /* best-effort */ }
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
  }, [fetchDashboardData, summaryQuery]);

  // Load verification requests (separate from main fetch to keep concerns isolated)
  const loadVerifs = async () => {
    setVerifsLoading(true);
    try {
      const res = await verificationAPI.getRequests();
      setVerifs(Array.isArray(res) ? res.filter((item: any) => item != null) : []);
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
      // prefer the dashboard summary values when available
      value: summaryQuery?.data?.totalDocuments ?? stats.totalDocuments,
      // include templates and processed counts to mirror the Statistics page
      templates: summaryQuery?.data?.templatesCount ?? 0,
      processed: summaryQuery?.data?.processedDocuments ?? stats.completedRequests,
      icon: '📄',
      bg: 'linear-gradient(90deg, #52c41a 0%, #b7eb8f 100%)',
      color: '#52c41a',
      labelColor: '#f6ffed',
      onClick: () => setDocumentsModalVisible(true),
      chart: null,
    },
    {
      label: 'Notifications',
      // Show the number of unread notification messages (not just staff approvals)
      value: notifications.length,
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
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafb 100%)',
              color: '#000',
              borderRadius: 16,
              minHeight: 240,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: card.onClick ? 'pointer' : 'default',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              position: 'relative',
              marginBottom: 0,
              padding: 32,
              border: `2px solid ${card.color}`,
              borderTop: `6px solid ${card.color}`,
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
              e.currentTarget.style.boxShadow = '0 16px 48px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 -1px 2px rgba(0, 0, 0, 0.03)';
              e.currentTarget.style.transform = 'translateY(-8px) scale(1.01)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 18,
              background: `linear-gradient(135deg, ${card.color}15 0%, ${card.color}08 100%)`,
              border: `2px solid ${card.color}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
              fontSize: 40,
              boxShadow: `inset 0 2px 4px rgba(255,255,255,0.5), 0 2px 8px ${card.color}20`,
            }}>
              {card.icon}
            </div>
            <span style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.1, background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}cc 100%)`, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8, whiteSpace: 'pre-line' }}>{card.value}</span>
            <span style={{ fontSize: 16, color: card.color, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.3px' }}>{card.label}</span>
            <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500, textAlign: 'center', letterSpacing: '0.3px' }}>{statCardSubtitles[idx]}</span>
            {(card.templates !== undefined || card.processed !== undefined) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 0', borderTop: '1px solid #f0f0f0', width: '100%' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Templates</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: card.color }}>{card.templates}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Processed</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: card.color }}>{card.processed}</div>
                </div>
              </div>
            )}
            {card.chart && <div style={{ marginTop: 12, width: '100%' }}>{card.chart}</div>}
          </Card>
        </Col>
      ))}
    </Row>
  );

  // documentColumns removed (was used only by the removed inbox rendering block)

  const renderNotifications = () => (
    <Card
      title={<Space><BellOutlined style={{ color: '#1890ff', fontSize: 20 }} /> <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px', color: '#1f2937' }}>Staff Access Approval</span></Space>}
      style={{ marginTop: 0, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(24, 144, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #1890ff', borderTop: '6px solid #1890ff', position: 'relative' }}
      styles={{ body: { padding: 16 } }}
      size="small"
      hoverable={false}
    >
  {/* Render a dedicated table for unread staff access approval requests */}
      {/* Show staff approval notifications (type === 'staff_approval') if present */}
      <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 6, paddingBottom: 12 }}>
        <Table
          size="small"
          pagination={{ pageSize: 100, hideOnSinglePage: true, position: ['bottomCenter'] }}
          dataSource={staffAccessNotifs.filter((n: any) => n != null)}
          rowKey={(r: any) => r?._id || String(r?.createdAt || '') || 'unknown'}
          style={{ borderRadius: 8 }}
          rowClassName={() => 'staff-access-row'}
          columns={[
            {
              title: 'Name',
              key: 'requestedBy',
              render: (_: any, record: Notification) => {
                const d: any = record.data || {};
                const nameFromData = d.fullName || (d.userId && (d.userId.fullName || d.userId.username));
                const requestedByName = (record as any).requestedByName;
                const displayName = nameFromData || (requestedByName || record.message) || 'Unknown';
                return <span style={{ fontWeight: 700, color: '#1f2937', fontSize: 14, display: 'block', padding: '6px 0' }}>{displayName}</span>;
              }
            },
            {
              title: 'Requested At',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (val: any, record: Notification) => <span style={{ fontSize: 14, color: '#6b7280', display: 'block', padding: '6px 0' }}>{new Date(record.createdAt || val).toLocaleString()}</span>
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: any, record: Notification) => (
                <Space size="small">
                  {!record.read && (
                    <Button type="primary" size="small" onClick={() => handleApproveStaff(record)} icon={<CheckOutlined />} style={{ background: '#10b981', border: 'none', fontWeight: 600 }}>Approve</Button>
                  )}
                  <Button danger size="small" onClick={() => handleRejectStaff(record)} icon={<ExclamationCircleOutlined />} style={{ fontWeight: 600 }}>Reject</Button>
                </Space>
              )
            }
          ]}
        />
      </div>

      {/* Notifications removed from this container to avoid duplicate admin entries */}
  <Button type="link" style={{ position: 'absolute', right: 16, bottom: 8, fontSize: 13, color: '#1890ff' }} onClick={() => navigate('/admin/notifications')}>View all</Button>
    </Card>
  );

  // Verification widget for admin dashboard
  const handleApproveVerif = async (arg: VerificationRequest | string) => {
    // arg may be a userId string or the verification request object
    try {
      setVerifsLoading(true);
      if (arg && typeof arg === 'object') {
        const reqId = arg._id;
        const userId = arg.userId._id;
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
  const handleUnverifyVerif = async (arg: VerificationRequest | string) => {
    try {
      setVerifsLoading(true);
      if (arg && typeof arg === 'object') {
        const reqId = arg._id;
        const userId = arg.userId._id;
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

  const handleRejectVerif = async (arg: VerificationRequest | string) => {
    try {
      setVerifsLoading(true);
      if (arg && typeof arg === 'object') {
        const reqId = arg._id;
        const userId = arg.userId._id;
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

  const openCheckId = (req: VerificationRequest) => {
    setSelectedVerif(req);
    setVerifModalVisible(true);
  };

  const renderVerificationWidget = () => (
    <Card
      title={<Space><UserOutlined style={{ color: '#722ed1', fontSize: 20 }} /> <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px', color: '#1f2937' }}>Verification Requests</span></Space>}
      style={{ marginTop: 0, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(114, 46, 209, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #722ed1', borderTop: '6px solid #722ed1' }}
      size="small"
      hoverable={false}
      styles={{ body: { padding: 20 } }}
    >
      {verifsLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (!verifs || verifs.length === 0) ? (
        <Empty description="No verification requests" />
      ) : (
        <Table
          size="small"
          pagination={{ pageSize: 6 }}
          dataSource={verifs.filter((v: any) => v != null)}
          rowKey={(r: any) => r?._id || 'unknown'}
          columns={[{
              title: 'Resident',
              key: 'resident',
              render: (_: any, record: VerificationRequest) => <span style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{(record.userId && (record.userId.fullName || record.userId.username)) || 'Unknown Resident'}</span>
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (val: any) => {
                const isApproved = val === 'approved';
                return (
                  <span style={{ 
                    color: isApproved ? '#059669' : '#d97706',
                    fontWeight: 700,
                    fontSize: 14,
                    backgroundColor: isApproved ? '#ecfdf5' : '#fffbeb',
                    padding: '6px 14px',
                    borderRadius: 6,
                    display: 'inline-block',
                    border: `1px solid ${isApproved ? '#a7f3d0' : '#fcd34d'}`
                  }}>
                    {val || 'pending'}
                  </span>
                );
              }
            },
            {
              title: 'Submitted',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (val: any) => <span style={{ color: '#6b7280', fontSize: 14 }}>{val ? new Date(val).toLocaleString() : '-'}</span>
            },
            {
              title: 'Verified',
              dataIndex: 'approvedAt',
              key: 'approvedAt',
              render: (val: any) => <span style={{ color: '#6b7280', fontSize: 14 }}>{val ? new Date(val).toLocaleString() : '-'}</span>
            },
            {
              title: 'Files',
              key: 'files',
              render: (_: any, record: VerificationRequest) => {
                if (!record) return null;
                const filesMeta = Array.isArray(record.filesMeta) ? record.filesMeta.filter((f: any) => f != null) : [];
                const gridFileIds = Array.isArray(record.gridFileIds) ? record.gridFileIds.filter((id: any) => id != null) : [];
                const files = filesMeta.length > 0 ? filesMeta : gridFileIds.map((id: string) => ({ filename: id, gridFileId: id }));
                return (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {files.map((f: any, i: number) => {
                      if (!f) return null;
                      const userId = (typeof record.userId === 'object' && record.userId ? record.userId._id : record.userId) as string;
                      const fileType = f.fileType || 'unknown';
                      const fileUrl = verificationAPI.getFileUrlByUserType(userId, fileType);
                      return (
                        <a key={i} href={fileUrl} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontWeight: 600, fontSize: 13 }}>{fileType}</a>
                      );
                    })}
                  </div>
                );
              }
            },
            {
              title: 'Action',
              key: 'action',
              render: (_: any, record: VerificationRequest) => (
                <Space size="small">
                  <Button size="small" onClick={() => openCheckId(record)} style={{ fontWeight: 600 }}>Check ID</Button>
                  {record.status === 'approved' ? (
                    <Button size="small" onClick={() => handleUnverifyVerif(record)} danger style={{ fontWeight: 600 }}>Unverify</Button>
                  ) : (
                    <Button type="primary" size="small" onClick={() => handleApproveVerif(record)} style={{ background: '#10b981', border: 'none', fontWeight: 600 }}>Verify</Button>
                  )}
                  {record.status === 'approved' ? null : <Button danger size="small" onClick={() => handleRejectVerif(record)} style={{ fontWeight: 600 }}>Reject</Button>}
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
              {((selectedVerif.filesMeta && selectedVerif.filesMeta.filter((f: any) => f != null).length) ? selectedVerif.filesMeta.filter((f: any) => f != null) : (selectedVerif.gridFileIds || []).filter((id: any) => id != null).map((id: string) => ({ filename: id, gridFileId: id }))).map((f: any, idx: number) => {
                if (!f) return null;
                const userId = (typeof selectedVerif.userId === 'object' && selectedVerif.userId ? selectedVerif.userId._id : selectedVerif.userId) as string;
                const fileType = f.fileType || 'unknown';
                const fileUrl = verificationAPI.getFileUrlByUserType(userId, fileType);
                const label = fileType.charAt(0).toUpperCase() + fileType.slice(1);
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
                      <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>{f.filename || fileType}</div>
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
      title={<Space><FileTextOutlined style={{ color: '#52c41a', fontSize: 20 }} /> <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px', color: '#1f2937' }}>Announcements</span></Space>}
      style={{ marginTop: 0, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(82, 196, 26, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #52c41a', borderTop: '6px solid #52c41a', position: 'relative' }}
      styles={{ body: { padding: 16 } }}
      size="small"
      hoverable={false}
    >
      {miniAnns.length === 0 ? (
        <Empty
          image={<FileTextOutlined style={{ fontSize: 42, color: '#d9d9d9' }} />}
          description={<span style={{ color: '#888' }}>No announcements</span>}
        />
      ) : (
  <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 6, paddingBottom: 48 }}>
          <List
            loading={miniLoading}
            dataSource={miniAnns.filter((item: any) => item && item._id)}
            renderItem={(item: any) => (
              <List.Item style={{ cursor: 'pointer', padding: '16px 10px', alignItems: 'flex-start', borderBottom: '1px solid #f0f0f0', transition: 'background 0.2s' }} onClick={() => { setMiniSelected(item); setDrawerVisible(true); }} onMouseEnter={(e) => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <List.Item.Meta
                  title={<div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.3em' }}>{item.text || 'Untitled'}</div>
                      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8, fontWeight: 500 }}>{timeAgo(item.createdAt)}</div>
                    </div>
                    {item.imagePath && (
                      <div style={{ marginLeft: 8, width: 88, flexShrink: 0 }}>
                        <img loading="lazy" className="rounded-img" src={getAbsoluteApiUrl(`/announcements/${item._id}/image`)} alt="ann" style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb' }} />
                      </div>
                    )}
                  </div>}
                  description={null}
                />
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
      <div style={{ padding: '32px', background: 'linear-gradient(135deg, #f5f7fa 0%, #ffffff 50%, #f5f7fa 100%)', minHeight: '100vh' }}>
        <div style={{ marginBottom: 40, paddingBottom: 24, borderBottom: '2px solid rgba(24, 144, 255, 0.1)' }}>
          <Title level={2} style={{ marginBottom: 8, fontWeight: 900, color: '#0f172a', fontSize: 36, letterSpacing: '-0.5px' }}>Admin Dashboard</Title>
          <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: 500 }}>Monitor system activity, manage requests, and verify residents</Text>
        </div>
        {renderStatCards()}
        <Row gutter={[28, 28]} style={{ marginTop: 8 }}>
          <Col xs={24} lg={12}>
            {renderNotifications()}
          </Col>
          <Col xs={24} lg={12}>
            {renderRecentActivity()}
          </Col>
        </Row>
        <Row gutter={[28, 28]} style={{ marginTop: 28 }}>
          <Col xs={24}>
            {renderVerificationWidget()}
          </Col>
        </Row>
        <Modal
          title="Document Breakdown"
          open={documentsModalVisible}
          onCancel={() => setDocumentsModalVisible(false)}
          footer={null}
          width={800}
        >
          <Table
            dataSource={documentsData}
            columns={[
              { title: 'Status', dataIndex: 'status', key: 'status' },
              { title: 'Category', dataIndex: 'category', key: 'category' },
              { title: 'Count', dataIndex: 'count', key: 'count' },
            ]}
            pagination={false}
            size="small"
          />
        </Modal>
      </div>
    </Spin>
  );
};

export default AdminDashboard;
