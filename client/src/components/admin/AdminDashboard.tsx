
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, List, Typography, Space, Spin, Button, Drawer, Table, Modal, Tag, Tooltip, Divider, Avatar, Alert } from 'antd';
import {
  UserOutlined,
  FileTextOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  FileOutlined,
  CalendarOutlined,
  PictureOutlined
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

// Color palette for SVG pie chart slices (kept for future chart implementations)
// const pieColors = [
//   '#6366F1', // Indigo
//   '#22C55E', // Green
//   '#F59E42', // Orange
//   '#EF4444', // Red
//   '#3B82F6', // Blue
//   '#FBBF24', // Yellow
//   '#A21CAF', // Purple
//   '#14B8A6', // Teal
// ];

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
  const [expandedTitle, setExpandedTitle] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  // Demo data for mini charts
  const usersTrend = [3, 5, 4, 6, 7, 8, 10]; // last 7 days
  const requestsByType = [
    { type: 'Clearance', value: 12 },
    { type: 'Certificate', value: 8 },
    { type: 'Permit', value: 5 },
    { type: 'Other', value: 3 },
  ];
  
  // Document category data (kept for future analytics implementations)
  // const documentCategoryData = [
  //   { type: 'Clearance', value: 27 },
  //   { type: 'Certificate', value: 18 },
  //   { type: 'Permit', value: 12 },
  //   { type: 'Other', value: 8 },
  // ];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDashboardData]);

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

  // Load staff approval notifications separately to prevent them from disappearing
  const loadStaffApprovals = async () => {
    try {
      const notificationsRes = await notificationAPI.getNotifications();
      const unreadNotifs = notificationsRes.filter((n: Notification) => !n.read);
      const staffApprovalNotifs = unreadNotifs.filter((n: Notification) => (n.type || '').toString().toLowerCase() === 'staff_approval');
      setStaffAccessNotifs(staffApprovalNotifs);
    } catch (err) {
      console.error('Failed to load staff approvals:', err);
      // Keep showing previously loaded staff approvals instead of clearing them
    }
  };

  useEffect(() => {
    // Load staff approvals on mount
    loadStaffApprovals();
    // Poll consistently for staff approvals independently every 20 seconds
    const interval = setInterval(loadStaffApprovals, 20000);
    return () => clearInterval(interval);
  }, []);

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
      // Optimistic update: remove from local state immediately
      setStaffAccessNotifs(prev => prev.filter(n => n._id !== notif._id));
      setStats(prev => ({ ...prev, pendingRequests: Math.max(0, prev.pendingRequests - 1) }));
      
      await notificationAPI.approveStaff(notif.data.userId, notif._id);
      // Reload staff approvals to ensure consistency
      await loadStaffApprovals();
    } catch (err) {
      console.error('Failed to approve staff:', err);
      // Reload on error to restore correct state
      await loadStaffApprovals();
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
      // Optimistic update: remove from local state immediately
      setStaffAccessNotifs(prev => prev.filter(n => n._id !== notif._id));
      setStats(prev => ({ ...prev, pendingRequests: Math.max(0, prev.pendingRequests - 1) }));
      
      await notificationAPI.rejectStaff(notif._id, reason || undefined);
      // Reload staff approvals to ensure consistency
      await loadStaffApprovals();
    } catch (err) {
      console.error('Failed to reject staff request:', err);
      // Reload on error to restore correct state
      await loadStaffApprovals();
    } finally {
      setLoading(false);
    }
  };

  // Inject scrollbar styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
      .announcement-drawer-content {
        width: 100%;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scroll-behavior: smooth;
        scrollbar-width: auto;
        -webkit-overflow-scrolling: touch;
      }
      .announcement-drawer-content::-webkit-scrollbar {
        width: 10px;
      }
      .announcement-drawer-content::-webkit-scrollbar-track {
        background: transparent;
      }
      .announcement-drawer-content::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.08);
        border-radius: 5px;
        transition: background 0.3s ease;
      }
      .announcement-drawer-content:hover::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
      }
      .announcement-drawer-content::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.35);
      }
      .announcement-drawer-content::-webkit-scrollbar-thumb:active {
        background: rgba(0, 0, 0, 0.5);
      }
      .announcement-drawer-content:hover {
        scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
      }
    `;
    document.head.appendChild(styleElement);
    return () => styleElement.remove();
  }, []);

  // Handle drawer UX: ESC key to close and prevent body scroll
  useEffect(() => {
    if (!drawerVisible) return;

    // Reset expanded states when drawer opens
    setExpandedTitle(false);
    setExpandedDescription(false);

    // Prevent body scroll when drawer is open
    document.body.style.overflow = 'hidden';
    document.body.classList.add('ant-drawer-open');

    // Handler for ESC key
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerVisible(false);
        setMiniSelected(null);
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleEscKey);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'unset';
      document.body.classList.remove('ant-drawer-open');
    };
  }, [drawerVisible]);

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
      title={
        <Space size="large">
          <Avatar 
            size={40} 
            icon={<UserAddOutlined />} 
            style={{ background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)' }} 
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', color: '#1f2937' }}>Staff Access Approval</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{staffAccessNotifs.length} pending request{staffAccessNotifs.length !== 1 ? 's' : ''}</div>
          </div>
        </Space>
      }
      style={{ marginTop: 0, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(24, 144, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #1890ff', borderTop: '6px solid #1890ff', position: 'relative' }}
      styles={{ body: { padding: 0 } }}
      size="small"
      hoverable={false}
    >
      {staffAccessNotifs.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <Alert
            message="All Caught Up!"
            description="No pending staff approval requests at the moment."
            type="success"
            icon={<CheckCircleOutlined />}
            showIcon
            style={{ marginBottom: 0 }}
          />
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
          <List
            dataSource={staffAccessNotifs.filter((n: any) => n != null)}
            renderItem={(record: Notification) => {
              const d: any = record.data || {};
              const nameFromData = d.fullName || (d.userId && (d.userId.fullName || d.userId.username));
              const displayName = nameFromData || record.message || 'Unknown';
              return (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', transition: 'background 0.2s', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16 }} onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <Avatar icon={<UserOutlined />} style={{ background: '#1890ff', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1f2937', fontSize: 14, marginBottom: 4 }}>{displayName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af' }}>
                        <ClockCircleOutlined />
                        <span>{new Date(record.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <Space size="small">
                    <Tooltip title="Approve staff access">
                      <Button 
                        type="primary" 
                        size="small" 
                        icon={<CheckOutlined />} 
                        onClick={() => handleApproveStaff(record)} 
                        style={{ background: '#10b981', border: 'none', fontWeight: 600 }}
                      >
                        Approve
                      </Button>
                    </Tooltip>
                    <Tooltip title="Reject staff access">
                      <Button 
                        danger 
                        size="small" 
                        icon={<ExclamationCircleOutlined />} 
                        onClick={() => handleRejectStaff(record)} 
                        style={{ fontWeight: 600 }}
                      >
                        Reject
                      </Button>
                    </Tooltip>
                  </Space>
                </div>
              );
            }}
            size="small"
          />
        </div>
      )}
      <Divider style={{ margin: 0 }} />
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
        <Text style={{ fontSize: 12, color: '#6b7280' }}>Showing {Math.min(staffAccessNotifs.length, 10)} of {staffAccessNotifs.length} requests</Text>
        <Button type="link" style={{ fontSize: 13, color: '#1890ff', padding: 0 }} onClick={() => navigate('/admin/verification-requests')}>View all →</Button>
      </div>
    </Card>
  );

  // Verification widget for admin dashboard
  const renderVerificationWidget = () => {
    const approvedCount = verifs.filter((v: any) => v.status === 'approved').length;
    const pendingCount = verifs.filter((v: any) => v.status === 'pending').length;
    
    return (
      <Card
        title={
          <Space size="large">
            <Avatar 
              size={40} 
              icon={<FileOutlined />} 
              style={{ background: 'linear-gradient(135deg, #722ed1 0%, #b37feb 100%)' }} 
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', color: '#1f2937' }}>Verification Requests</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{verifs.length} total request{verifs.length !== 1 ? 's' : ''}</div>
            </div>
          </Space>
        }
        style={{ marginTop: 0, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(114, 46, 209, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #722ed1', borderTop: '6px solid #722ed1' }}
        styles={{ body: { padding: 0 } }}
        size="small"
        hoverable={false}
      >
        {verifsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (!verifs || verifs.length === 0) ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Alert
              message="No Requests Yet"
              description="All verification requests have been processed."
              type="info"
              showIcon
              style={{ marginBottom: 0 }}
            />
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{pendingCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, fontWeight: 500 }}>Pending</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{approvedCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, fontWeight: 500 }}>Approved</div>
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 6 }}>
              <List
                dataSource={verifs.filter((v: any) => v != null)}
                renderItem={(record: VerificationRequest) => {
                  const isApproved = record.status === 'approved';
                  return (
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                        <Avatar icon={<UserOutlined />} style={{ background: isApproved ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#1f2937', fontSize: 14, marginBottom: 4 }}>
                            {(record.userId && (record.userId.fullName || record.userId.username)) || 'Unknown Resident'}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>
                            {new Date(record.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <Tag 
                        color={isApproved ? '#f6ffed' : '#fffbe6'} 
                        style={{ 
                          color: isApproved ? '#052e16' : '#7c2d12',
                          fontWeight: 600,
                          border: `1px solid ${isApproved ? '#b7eb8f' : '#fcd34d'}`,
                          marginRight: 0
                        }}
                      >
                        {isApproved ? 'Verified' : 'Pending'}
                      </Tag>
                    </div>
                  );
                }}
                size="small"
              />
            </div>
          </>
        )}
        <Divider style={{ margin: 0 }} />
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>Showing {Math.min(verifs.length, 10)} of {verifs.length} requests</Text>
          <Button type="link" style={{ fontSize: 13, color: '#722ed1', padding: 0 }} onClick={() => navigate('/admin/verification-requests')}>View all →</Button>
        </div>
      </Card>
    );
  };

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

  // Helper function to truncate text with character limit and line count
  const truncateText = (text: string | undefined, maxChars: number = 150, maxLines: number = 3): { truncated: string; isTruncated: boolean } => {
    if (!text) return { truncated: '', isTruncated: false };
    
    // Check line count
    const lines = text.split('\n');
    let result = text;
    
    if (lines.length > maxLines) {
      result = lines.slice(0, maxLines).join('\n');
    }
    
    // Check character count
    if (result.length > maxChars) {
      result = result.substring(0, maxChars).trim() + '...';
      return { truncated: result, isTruncated: true };
    }
    
    if (lines.length > maxLines) {
      return { truncated: result, isTruncated: true };
    }
    
    return { truncated: result, isTruncated: false };
  };

  const renderRecentActivity = () => (
    <Card
      title={
        <Space size="large">
          <Avatar 
            size={40} 
            icon={<FileOutlined />} 
            style={{ background: 'linear-gradient(135deg, #52c41a 0%, #b7eb8f 100%)' }} 
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', color: '#1f2937' }}>Announcements</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{miniAnns.length} announcement{miniAnns.length !== 1 ? 's' : ''}</div>
          </div>
        </Space>
      }
      style={{ marginTop: 0, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(82, 196, 26, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #52c41a', borderTop: '6px solid #52c41a', position: 'relative' }}
      styles={{ body: { padding: 0 } }}
      size="small"
      hoverable={false}
    >
      {miniAnns.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <Alert
            message="No Announcements"
            description="No announcements have been posted yet."
            type="info"
            icon={<FileTextOutlined />}
            showIcon
            style={{ marginBottom: 0 }}
          />
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
          <List
            loading={miniLoading}
            dataSource={miniAnns.filter((item: any) => item && item._id)}
            renderItem={(item: any) => (
              <div 
                style={{ 
                  padding: '16px 20px', 
                  borderBottom: '1px solid #e5e7eb', 
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: '#fff'
                }} 
                onClick={() => { setMiniSelected(item); setDrawerVisible(true); }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                  e.currentTarget.style.borderLeft = '4px solid #52c41a';
                  e.currentTarget.style.paddingLeft = '16px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.borderLeft = 'none';
                  e.currentTarget.style.paddingLeft = '20px';
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {item.imagePath ? (
                    <img 
                      loading="lazy" 
                      src={getAbsoluteApiUrl(`/announcements/${item._id}/image`)} 
                      alt="ann" 
                      style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', flexShrink: 0 }} 
                    />
                  ) : (
                    <div style={{ width: 64, height: 48, borderRadius: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileTextOutlined style={{ fontSize: 24, color: '#d1d5db' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.text || 'Untitled Announcement'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ClockCircleOutlined style={{ fontSize: 11 }} />
                      <span>{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            size="small"
          />
        </div>
      )}
      <Divider style={{ margin: 0 }} />
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
        <Text style={{ fontSize: 12, color: '#6b7280' }}>Showing {Math.min(miniAnns.length, 6)} of {miniAnns.length}</Text>
        <Button type="link" style={{ fontSize: 13, color: '#52c41a', padding: 0 }} onClick={() => navigate('/admin/announcements')}>Manage →</Button>
      </div>

      <Drawer 
        open={drawerVisible} 
        onClose={() => { setDrawerVisible(false); setMiniSelected(null); }} 
        title={null}
        width="100%"
        placement="right"
        bodyStyle={{ 
          padding: 0, 
          background: 'rgba(0,0,0,0.02)', 
          display: 'block',
          overflow: 'visible',
          height: '100vh'
        }}
        headerStyle={{ display: 'none' }}
        closeIcon={
          <Button type="text" size="large" icon={<span style={{ fontSize: 18 }}>✕</span>} style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }} />
        }
        maskStyle={{
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          background: 'rgba(0, 0, 0, 0.35)'
        }}
      >
        {miniSelected && (
          <div style={{ 
            width: '100%',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '32px 24px',
            overflowY: 'auto',
            overflowX: 'hidden',
            boxSizing: 'border-box',
            scrollBehavior: 'smooth'
          }}
          className="announcement-drawer-content"
          >
            {/* Modern Card Container */}
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 12px 48px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04)',
              overflow: 'visible',
              width: '100%',
              maxWidth: '800px',
              margin: '0 auto',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header Section */}
              <div style={{
                padding: '32px 28px 28px',
                borderBottom: '1px solid #f0f0f0',
                background: 'linear-gradient(135deg, #fafbfc 0%, #f5f7fa 100%)',
                position: 'relative',
                flexShrink: 0
              }}>
                {/* Close Button */}
                <button 
                  onClick={() => { setDrawerVisible(false); setMiniSelected(null); }}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    width: 40,
                    height: 40,
                    border: 'none',
                    background: 'rgba(0, 0, 0, 0.04)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    fontSize: 18,
                    color: '#666',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(82, 196, 26, 0.1)';
                    e.currentTarget.style.color = '#52c41a';
                    e.currentTarget.style.transform = 'scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)';
                    e.currentTarget.style.color = '#666';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ✕
                </button>

                {/* Title - Bold and Large with See More/Less */}
                <div>
                  <h2 style={{ 
                    margin: 0, 
                    fontSize: 24, 
                    fontWeight: 700, 
                    color: '#0f172a', 
                    lineHeight: 1.3,
                    marginBottom: 12,
                    paddingRight: 40,
                    wordBreak: 'break-word'
                  }}>
                    {expandedTitle 
                      ? (miniSelected.text || 'Untitled Announcement')
                      : truncateText(miniSelected.text, 150, 2).truncated
                    }
                  </h2>
                  {truncateText(miniSelected.text, 150, 2).isTruncated && (
                    <button
                      onClick={() => setExpandedTitle(!expandedTitle)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#52c41a',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        padding: 0,
                        marginBottom: 16,
                        transition: 'all 0.2s',
                        textDecoration: 'underline'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#3da63d';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#52c41a';
                      }}
                    >
                      {expandedTitle ? 'See Less' : 'See More...'}
                    </button>
                  )}
                </div>

                {/* Metadata - Muted Gray with Icons */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 20, 
                  flexWrap: 'wrap',
                  fontSize: 13,
                  fontWeight: 500
                }}>
                  {/* Date Metadata */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'rgba(82, 196, 26, 0.08)',
                    color: '#52c41a'
                  }}>
                    <CalendarOutlined style={{ fontSize: 14 }} />
                    <span>
                      {new Date(miniSelected.createdAt).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric'
                      })}
                    </span>
                  </div>

                  {/* Time Metadata */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'rgba(102, 126, 234, 0.08)',
                    color: '#667eea'
                  }}>
                    <ClockCircleOutlined style={{ fontSize: 14 }} />
                    <span>
                      {timeAgo(miniSelected.createdAt)}
                    </span>
                  </div>

                  {/* Exact Time */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: '#6b7280',
                    fontSize: 12
                  }}>
                    <span style={{ fontSize: 12 }}>
                      {new Date(miniSelected.createdAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Image Section */}
              {miniSelected.imagePath && (
                <div style={{
                  padding: '28px',
                  borderBottom: '1px solid #f0f0f0',
                  flexShrink: 0
                }}>
                  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PictureOutlined style={{ fontSize: 16, color: '#52c41a' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#65748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Featured Image</span>
                  </div>
                  
                  {/* Image Container with 16:9 Aspect Ratio */}
                  <div 
                    style={{
                      position: 'relative',
                      width: '100%',
                      paddingBottom: '56.25%', // 16:9 aspect ratio
                      backgroundColor: '#f0f0f0',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                    }}
                    onMouseEnter={(e) => {
                      const imgElement = e.currentTarget.querySelector('img');
                      if (imgElement) {
                        imgElement.style.transform = 'scale(1.02)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      const imgElement = e.currentTarget.querySelector('img');
                      if (imgElement) {
                        imgElement.style.transform = 'scale(1)';
                      }
                    }}
                    onClick={() => {
                      // Open image in preview modal
                      window.open(getAbsoluteApiUrl(`/announcements/${miniSelected._id}/image`), '_blank');
                    }}
                  >
                    {/* Image */}
                    <img
                      loading="lazy"
                      src={getAbsoluteApiUrl(`/announcements/${miniSelected._id}/image`)}
                      alt="announcement-featured"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        display: 'block'
                      }}
                    />

                    {/* Subtle Gradient Overlay at Bottom */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '60px',
                        background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.2))',
                        pointerEvents: 'none'
                      }}
                    />

                    {/* Hover Icon - Zoom In */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0, 0, 0, 0)',
                        opacity: 0,
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0';
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0)';
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.9)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
                          color: '#52c41a',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}
                      >
                        🔍
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Content Section */}
              <div style={{
                padding: '28px',
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden'
              }}>
                {/* Section Header with Divider */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    marginBottom: 12 
                  }}>
                    <FileTextOutlined style={{ fontSize: 16, color: '#52c41a' }} />
                    <span style={{ 
                      fontSize: 12, 
                      fontWeight: 600, 
                      color: '#65748b', 
                      letterSpacing: '0.5px', 
                      textTransform: 'uppercase' 
                    }}>Details</span>
                  </div>
                  <div style={{ 
                    height: 1, 
                    background: 'linear-gradient(to right, #d1d5db, transparent)', 
                    borderRadius: 1 
                  }} />
                </div>

                {/* Content Container with See More/Less */}
                <div style={{ 
                  padding: '24px',
                  borderRadius: 12, 
                  background: '#f9fafb',
                  border: '1px solid #ecf0f1',
                  fontSize: 16,
                  lineHeight: 1.62,
                  color: '#374151',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {expandedDescription 
                    ? (miniSelected.text || 'No additional details available.')
                    : truncateText(miniSelected.text, 300, 5).truncated || 'No additional details available.'
                  }
                </div>

                {/* See More / See Less Button */}
                {truncateText(miniSelected.text, 300, 5).isTruncated && (
                  <button
                    onClick={() => setExpandedDescription(!expandedDescription)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#52c41a',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '12px 0 0 0',
                      marginTop: 8,
                      transition: 'all 0.2s',
                      textDecoration: 'underline'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#3da63d';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#52c41a';
                    }}
                  >
                    {expandedDescription ? 'See Less' : 'See More...'}
                  </button>
                )}
              </div>

              {/* Footer Section */}
              <div style={{
                padding: '24px 28px',
                borderTop: '1px solid #f0f0f0',
                background: 'linear-gradient(135deg, #fafbfc 0%, #f5f7fa 100%)',
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                flexShrink: 0
              }}>
                <Button 
                  type="default"
                  style={{ 
                    fontWeight: 600,
                    height: 38,
                    borderRadius: 8
                  }}
                  onClick={() => { setDrawerVisible(false); setMiniSelected(null); }}
                >
                  Close
                </Button>
                <Button 
                  type="primary" 
                  style={{ 
                    background: 'linear-gradient(135deg, #52c41a 0%, #7cb342 100%)',
                    borderColor: 'transparent',
                    fontWeight: 600,
                    height: 38,
                    borderRadius: 8
                  }}
                  onClick={() => navigate('/admin/announcements')}
                >
                  View All
                </Button>
              </div>
            </div>
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
          <Col xs={24}>
            {renderRecentActivity()}
          </Col>
        </Row>
        <Row gutter={[28, 28]} style={{ marginTop: 28 }}>
          <Col xs={24}>
            {renderNotifications()}
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
