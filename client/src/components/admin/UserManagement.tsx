
import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Spin,
  Form,
  Input,
  message,
  Select,
  Drawer,
  Dropdown,
  Menu,
  DatePicker,
  Row,
  Col,
  Popconfirm,
  Modal,
  Tabs,
  Upload,
} from 'antd';
import AppAvatar from '../AppAvatar';
import { EditOutlined, DeleteOutlined, MoreOutlined, EyeOutlined, StopOutlined, CheckOutlined, ReloadOutlined, FormOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { SortOrder } from 'antd/es/table/interface';
import { adminAPI } from '../../services/api';
import dayjs from 'dayjs';
import { getAbsoluteApiUrl } from '../../services/api';

const roleOptions = [
  { text: 'Admin', value: 'admin' },
  { text: 'Staff', value: 'staff' },
  { text: 'Resident', value: 'resident' },
];
const statusOptions = [
  { text: 'Active', value: true },
  { text: 'Inactive', value: false },
];

// ...existing code...
// Columns will be defined inside the component to access state/handlers


const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [dateRange, setDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedResident, setSelectedResident] = useState(null);
  const [residentLoading, setResidentLoading] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [userFormValues, setUserFormValues] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPreview, setUploadPreview] = useState(null);
  const pendingUploadRef = React.useRef(null);
  const [loading, setLoading] = useState(true);
  const [editFormValues, setEditFormValues] = useState({});
  // Helper to generate a random unique Barangay ID
  

  const fetchUsers = () => {
    setLoading(true);
    adminAPI.getUsers()
      .then((data: any[]) => {
        setUsers(data.map((user, idx) => ({
          key: user._id || idx,
          _id: user._id || null,
          fullName: user.fullName || user.username || '',
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          restricted: !!user.restricted,
          warning: !!user.warning,
          verified: !!user.verified,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          avatar: user.avatar || null,
          barangayId: user.barangayId || user.barangayID || user.barangay_id || null,
        })));
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Fetch resident info for a user when drawer opens
  const fetchResidentForUser = async (user: any) => {
    if (!user) return;
    setResidentLoading(true);
    try {
      // Prefer fetching by barangayId when available
      const barangayId = user.barangayId || user.barangayID || user.barangay_id;
      if (barangayId) {
        const resp: any = await adminAPI.getResidentByBarangayID(barangayId);
        // server returns { resident, user }
        setSelectedResident(resp?.resident || null);
      } else if (user._id) {
        const resp: any = await adminAPI.getUserWithResident(user._id);
        setSelectedResident(resp?.resident || null);
      } else {
        setSelectedResident(null);
      }
    } catch (err) {
      console.error('Failed to fetch resident for user', err);
      setSelectedResident(null);
    } finally {
      setResidentLoading(false);
    }
  };

  // Disable a user (optionally suspend until a date). Updates UI after success.
  const handleDisableUser = async (userId: string, suspendedUntil?: string | null) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Disabling user...', key: 'disable' });
      const payload = suspendedUntil ? { suspendedUntil } : {};
      const res: any = await adminAPI.disableUser(userId, payload);
      message.success({ content: 'User disabled', key: 'disable', duration: 2 });
      // Refresh list and selected user
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(res.user || res);
      }
    } catch (err) {
      console.error('Failed to disable user', err);
      message.error('Failed to disable user');
    }
  };

  const handleEnableUser = async (userId: string) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Enabling user...', key: 'enable' });
      const res: any = await adminAPI.enableUser(userId);
      message.success({ content: 'User enabled', key: 'enable', duration: 2 });
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(res.user || res);
      }
    } catch (err) {
      console.error('Failed to enable user', err);
      message.error('Failed to enable user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Deleting user...', key: 'delete' });
      await adminAPI.deleteUser(userId);
      message.success({ content: 'User deleted', key: 'delete', duration: 2 });
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(null);
        setDrawerOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete user', err);
      message.error('Failed to delete user');
    }
  };

  const openActivityLogs = async (userId: string) => {
    if (!userId) { message.error('No user selected'); return; }
    setLogsLoading(true);
    try {
      const logs = await adminAPI.getActivityLogs({ userId });
      setActivityLogs(Array.isArray(logs) ? logs : (logs && logs.logs) || []);
      setLogsModalOpen(true);
    } catch (err) {
      console.error('Failed to load activity logs', err);
      message.error('Failed to load activity logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleBulkActivate = async () => {
    if (!selectedRowKeys || selectedRowKeys.length === 0) return;
    try {
      message.loading({ content: 'Activating users...', key: 'bulk-activate' });
      await Promise.all(selectedRowKeys.map((id: any) => adminAPI.enableUser(id)));
      message.success({ content: 'Users activated', key: 'bulk-activate', duration: 2 });
      setSelectedRowKeys([]);
      await fetchUsers();
    } catch (err) {
      console.error('Bulk activate failed', err);
      message.error('Bulk activation failed');
    }
  };

  const handleBulkDeactivate = async () => {
    if (!selectedRowKeys || selectedRowKeys.length === 0) return;
    try {
      message.loading({ content: 'Deactivating users...', key: 'bulk-deactivate' });
      await Promise.all(selectedRowKeys.map((id: any) => adminAPI.disableUser(id)));
      message.success({ content: 'Users deactivated', key: 'bulk-deactivate', duration: 2 });
      setSelectedRowKeys([]);
      await fetchUsers();
    } catch (err) {
      console.error('Bulk deactivate failed', err);
      message.error('Bulk deactivation failed');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedRowKeys || selectedRowKeys.length === 0) return;
    try {
      message.loading({ content: 'Deleting users...', key: 'bulk-delete' });
      await Promise.all(selectedRowKeys.map((id: any) => adminAPI.deleteUser(id)));
      message.success({ content: 'Users deleted', key: 'bulk-delete', duration: 2 });
      setSelectedRowKeys([]);
      await fetchUsers();
    } catch (err) {
      console.error('Bulk delete failed', err);
      message.error('Bulk delete failed');
    }
  };

  // Demote a staff user back to resident
  const handleDemoteUser = async (userId: string) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Demoting user...', key: 'demote' });
      const res: any = await adminAPI.demoteUser(userId);
      message.success({ content: 'User demoted to resident', key: 'demote', duration: 2 });
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(res.user || res);
      }
    } catch (err) {
      console.error('Failed to demote user', err);
      message.error('Failed to demote user');
    }
  };

  // Restrict or remove restriction from a resident account
  const handleRestrictUser = async (userId: string, restricted: boolean) => {
    if (!userId) return;
    try {
      message.loading({ content: restricted ? 'Restricting user...' : 'Removing restriction...', key: 'restrict' });
      const res: any = await adminAPI.restrictUser(userId, restricted);
      message.success({ content: restricted ? 'User restricted' : 'Restriction removed', key: 'restrict', duration: 2 });
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(res.user || res);
      }
    } catch (err) {
      console.error('Failed to update restriction', err);
      message.error('Failed to update restriction');
    }
  };

  // Warn or remove warning from a resident account
  const handleWarnUser = async (userId: string, warning: boolean) => {
    if (!userId) return;
    try {
      message.loading({ content: warning ? 'Setting warning...' : 'Removing warning...', key: 'warn' });
      const res: any = await adminAPI.warnUser(userId, warning);
      message.success({ content: warning ? 'Warning set' : 'Warning removed', key: 'warn', duration: 2 });
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser(res.user || res);
      }
    } catch (err) {
      console.error('Failed to update warning', err);
      message.error('Failed to update warning');
    }
  };

  // Toggle verified flag for a user (admin action)
  const handleToggleVerified = async (userId: string, currentVerified: boolean) => {
    if (!userId) return;
    try {
      const action = currentVerified ? 'Unverify' : 'Mark as Verified';
      message.loading({ content: `${action}...`, key: 'verify' });
      // Use verificationAPI to toggle verified flag on server
      await (await import('../../services/api')).verificationAPI.verifyUser(userId, !currentVerified);
      message.success({ content: `${action} succeeded`, key: 'verify', duration: 2 });
      // Refresh user list and selected user view
      await fetchUsers();
      if (selectedUser && selectedUser._id === userId) {
        setSelectedUser((prev: any) => prev ? { ...prev, verified: !currentVerified } : prev);
      }
    } catch (err) {
      console.error('Failed to toggle verified', err);
      message.error('Failed to update verification status');
    }
  };

  // add-user helpers removed (UI buttons were removed)

  // (registration helpers removed — staff registration handled elsewhere)

  // Filtered and searched users
  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    const matchesStatus = statusFilter !== undefined ? user.isActive === statusFilter : true;
    const matchesDate = dateRange && dateRange.length === 2
      ? dayjs(user.createdAt).isAfter(dateRange[0], 'day') && dayjs(user.createdAt).isBefore(dateRange[1], 'day')
      : true;
    return matchesSearch && matchesRole && matchesStatus && matchesDate;
  });

  // Table columns with avatar, tags, actions, sticky header, selection
  const columns = [
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (text: string, record: any) => (
        <Space>
          {(() => {
            let displayUser = record as any;
            try {
              const stored = localStorage.getItem('userProfile');
              if (stored) displayUser = JSON.parse(stored);
            } catch (err) {}
            return (
              <AppAvatar
                style={{ backgroundColor: '#1890ff', verticalAlign: 'middle' }}
                src={record.avatar}
                user={displayUser}
                size={40}
              >
                {(text && text.length > 0) ? text.charAt(0).toUpperCase() : '?'}
              </AppAvatar>
            );
          })()}
          <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>{text}</div>
        </Space>
      ),
      sorter: (a: any, b: any) => a.fullName.localeCompare(b.fullName),
      sortDirections: ['ascend' as SortOrder, 'descend' as SortOrder],
      fixed: 'left' as const,
    },
    {
      title: 'Barangay ID',
      dataIndex: 'barangayId',
      key: 'barangayId',
      render: (id: string) => (
        <span style={{ 
          fontSize: 14,
          color: '#6b7280',
          fontWeight: 500,
          letterSpacing: '-0.2px'
        }}>
          {id || '—'}
        </span>
      ),
      width: 160,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => (
        <span style={{ 
          fontSize: 14,
          color: '#6b7280',
          fontWeight: 500,
          letterSpacing: '-0.2px'
        }}>
          {email || '-'}
        </span>
      ),
      sorter: (a: any, b: any) => a.email.localeCompare(b.email),
      sortDirections: ['ascend' as SortOrder, 'descend' as SortOrder],
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const r = role || '';
        const roleColors: any = {
          'admin': { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' },
          'staff': { bg: '#dbeafe', text: '#1890ff', border: '#93c5fd' },
          'resident': { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' }
        };
        const colors = roleColors[r] || { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
        return (
          <span style={{ 
            background: colors.bg,
            color: colors.text, 
            padding: '6px 14px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            border: `1px solid ${colors.border}`,
            display: 'inline-block'
          }}>
            {r ? (r.charAt(0).toUpperCase() + r.slice(1)) : ''}
          </span>
        );
      },
      filters: roleOptions,
      onFilter: (value: any, record: any) => record.role === value,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <span style={{ 
          background: active ? '#d1fae5' : '#fee2e2',
          color: active ? '#059669' : '#dc2626', 
          padding: '6px 14px',
          borderRadius: 6,
          fontWeight: 700,
          fontSize: 13,
          border: `1px solid ${active ? '#a7f3d0' : '#fecaca'}`,
          display: 'inline-block'
        }}>
          {active ? 'Active' : 'Inactive'}
        </span>
      ),
      filters: statusOptions,
      onFilter: (value: any, record: any) => record.isActive === value,
    },
    {
      title: 'Verified',
      dataIndex: 'verified',
      key: 'verified',
      width: 100,
      render: (verified: boolean) => (
        <span style={{ 
          background: verified ? '#d1fae5' : '#fee2e2',
          color: verified ? '#059669' : '#dc2626', 
          padding: '6px 14px',
          borderRadius: 6,
          fontWeight: 700,
          fontSize: 13,
          border: `1px solid ${verified ? '#a7f3d0' : '#fecaca'}`,
          display: 'inline-block'
        }}>
          {verified ? 'Verified' : 'Not Verified'}
        </span>
      ),
      filters: [
        { text: 'Verified', value: true },
        { text: 'Not Verified', value: false },
      ],
      onFilter: (value: any, record: any) => record.verified === value,
    },
    {
      title: 'Flags',
      dataIndex: 'flags',
      key: 'flags',
      width: 160,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!record.isActive && (
            <span style={{
              background: '#fff1f2',
              color: '#c53030',
              padding: '6px 10px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              border: '1px solid #fecaca',
              display: 'inline-block'
            }}>Disabled</span>
          )}
          {record.restricted && (
            <span style={{
              background: '#fffbeb',
              color: '#b45309',
              padding: '6px 10px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              border: '1px solid #ffedd5',
              display: 'inline-block'
            }}>Restricted</span>
          )}
        </div>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => (
        <span style={{ 
          fontSize: 14,
          color: '#6b7280',
          fontWeight: 500,
          letterSpacing: '-0.2px'
        }}>
          {dayjs(date).format('YYYY-MM-DD')}
        </span>
      ),
      sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      sortDirections: ['ascend' as SortOrder, 'descend' as SortOrder],
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Dropdown
          popupRender={() => (
            <Menu style={{ 
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 160,
              padding: '4px 0'
            }}>
              <Menu.Item key="edit" icon={<EditOutlined style={{ color: '#1890ff' }} />} style={{ color: '#1f2937' }} onClick={() => { setSelectedUser(record); setDrawerOpen(true); }}>
                Edit
              </Menu.Item>
              <Menu.Item key="deactivate" icon={<StopOutlined style={{ color: '#faad14' }} />} style={{ color: '#1f2937' }} onClick={() => { if (!record || !record._id) { message.error('No user selected'); return; } Modal.confirm({ title: 'Deactivate user', content: `Are you sure you want to deactivate ${record.fullName || record.email || record._id}?`, onOk: async () => { await handleDisableUser(record._id); } }); }}>
                Deactivate
              </Menu.Item>
              <Menu.Item key="toggleVerified" icon={<CheckOutlined style={{ color: '#52c41a' }} />} style={{ color: '#1f2937' }} onClick={async () => {
                if (!record || !record._id) { message.error('No user selected'); return; }
                const confirmText = record.verified ? `Mark ${record.fullName || record.email} as unverified?` : `Mark ${record.fullName || record.email} as verified?`;
                Modal.confirm({
                  title: record.verified ? 'Unverify user' : 'Verify user',
                  content: confirmText,
                  onOk: async () => { await handleToggleVerified(record._id, !record.verified); }
                });
              }}>
                {record.verified ? 'Unverify' : 'Verify'}
              </Menu.Item>
              <Menu.Item key="disable_now" icon={<StopOutlined style={{ color: '#faad14' }} />} style={{ color: '#1f2937' }} onClick={async () => {
                if (!record || !record._id) { message.error('No user selected'); return; }
                // confirm and disable immediately
                Modal.confirm({
                  title: 'Disable user',
                  content: `Are you sure you want to disable ${record.fullName || record.email || record._id}?`,
                  onOk: async () => { await handleDisableUser(record._id); }
                });
              }}>
                Disable
              </Menu.Item>
              {record.role === 'resident' && record.warning && (
                <Menu.Item key="warn" icon={<ExclamationCircleOutlined style={{ color: '#f59e0b' }} />} style={{ color: '#1f2937' }} onClick={async () => {
                  if (!record || !record._id) { message.error('No user selected'); return; }
                  Modal.info({
                    title: 'Violation Warning',
                    content: (<div>you currently have a violation please go to the barangay to resolve this issue.thank you and godbless</div>),
                  });
                }}>
                  View Warning
                </Menu.Item>
              )}
              {record.role === 'resident' && (
                <Menu.Item key="restrict" icon={<StopOutlined style={{ color: '#f97316' }} />} style={{ color: '#1f2937' }} onClick={async () => {
                  if (!record || !record._id) { message.error('No user selected'); return; }
                  Modal.confirm({
                    title: record.restricted ? 'Remove restriction' : 'Restrict user',
                    content: `Are you sure you want to ${record.restricted ? 'remove restriction from' : 'restrict'} ${record.fullName || record.email || record._id}?`,
                    onOk: async () => { await handleRestrictUser(record._id, !record.restricted); }
                  });
                }}>
                  {record.restricted ? 'Remove restriction' : 'Restrict account'}
                </Menu.Item>
              )}
              {record.role === 'staff' && (
                <Menu.Item key="demote" icon={<ReloadOutlined style={{ color: '#8b5cf6' }} />} style={{ color: '#1f2937' }} onClick={async () => {
                  if (!record || !record._id) { message.error('No user selected'); return; }
                  Modal.confirm({
                    title: 'Demote user',
                    content: `Are you sure you want to demote ${record.fullName || record.email || record._id} to resident?`,
                    onOk: async () => { await handleDemoteUser(record._id); }
                  });
                }}>
                  Demote to Resident
                </Menu.Item>
              )}
              <Menu.Item key="enable_now" icon={<CheckOutlined style={{ color: '#52c41a' }} />} style={{ color: '#1f2937' }} onClick={async () => {
                if (!record || !record._id) { message.error('No user selected'); return; }
                Modal.confirm({
                  title: 'Enable user',
                  content: `Are you sure you want to enable ${record.fullName || record.email || record._id}?`,
                  onOk: async () => { await handleEnableUser(record._id); }
                });
              }}>
                Enable
              </Menu.Item>
              <Menu.Item key="delete" icon={<DeleteOutlined style={{ color: '#dc2626' }} />} danger style={{ color: '#dc2626' }} onClick={() => { if (!record || !record._id) { message.error('No user selected'); return; } Modal.confirm({ title: 'Delete user', content: `Are you sure you want to delete ${record.fullName || record.email || record._id}? This cannot be undone.`, okText: 'Yes', cancelText: 'No', onOk: async () => { await handleDeleteUser(record._id); } }); }}>
                Delete
              </Menu.Item>
            </Menu>
          )}
          trigger={['click']}
        >
            <Button 
            className="no-open-drawer"
            icon={<MoreOutlined />} 
            size="small"
            style={{
              background: 'transparent',
              border: '1px solid #e5e7eb',
              color: '#6b7280',
              fontWeight: 600,
              borderRadius: 6
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#1f2937';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#6b7280';
            }}
            />
        </Dropdown>
      ),
    },
  ];

  // Bulk actions bar
  const hasSelection = selectedRowKeys.length > 0;
  const bulkBar = hasSelection && (
    <Space style={{ marginBottom: 16 }}>
      <Button icon={<CheckOutlined />} onClick={handleBulkActivate}>Activate</Button>
      <Button icon={<StopOutlined />} onClick={() => { Modal.confirm({ title: 'Deactivate selected users', content: `Are you sure you want to deactivate ${selectedRowKeys.length} users?`, onOk: async () => { await handleBulkDeactivate(); } }); }}>Deactivate</Button>
      <Popconfirm title="Are you sure to delete selected users?" onConfirm={async () => { await handleBulkDelete(); }} okText="Yes" cancelText="No">
        <Button icon={<DeleteOutlined />} danger>Delete</Button>
      </Popconfirm>
      <span style={{ marginLeft: 8 }}>{`Selected ${selectedRowKeys.length} users`}</span>
    </Space>
  );

  // Pagination info
  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, filteredUsers.length);

  return (
    <div style={{ padding: '32px', background: 'linear-gradient(135deg, #f5f7fa 0%, #ffffff 50%, #f5f7fa 100%)', minHeight: '100vh' }}>
      {/* Header Section */}
      <div style={{ marginBottom: 40, paddingBottom: 28, borderBottom: '2px solid rgba(24, 144, 255, 0.1)' }}>
        <Typography.Title level={2} style={{ marginBottom: 12, fontWeight: 900, color: '#0f172a', fontSize: 36, letterSpacing: '-0.5px' }}>User Management</Typography.Title>
        <Typography.Text style={{ color: '#6b7280', fontSize: 15, fontWeight: 500, lineHeight: 1.6 }}>Manage system users, roles, and permissions</Typography.Text>
      </div>

      {/* Filters Card */}
      <Card 
        style={{ marginBottom: 32, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(24, 144, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #e5f0ff' }}
        styles={{ body: { padding: 24 } }}
        hoverable={false}
      >
        <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 8 }}>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Search</Typography.Text>
            </div>
            <Input.Search
              placeholder="Search by name or email"
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: '100%' }}
              size="large"
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ marginBottom: 8 }}>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Role</Typography.Text>
            </div>
            <Select
              placeholder="Filter by role"
              allowClear
              style={{ width: '100%' }}
              value={roleFilter}
              onChange={setRoleFilter}
              options={roleOptions}
              size="large"
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ marginBottom: 8 }}>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</Typography.Text>
            </div>
            <Select
              placeholder="Filter by status"
              allowClear
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              size="large"
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 8 }}>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range</Typography.Text>
            </div>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={setDateRange}
              style={{ width: '100%' }}
              allowClear
              size="large"
            />
          </Col>
        </Row>
        <Row>
          <Col>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={() => {
                setSearch('');
                setRoleFilter(undefined);
                setStatusFilter(undefined);
                setDateRange(null);
              }}
              size="large"
              style={{ fontWeight: 600 }}
            >
              Reset Filters
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Bulk Actions Bar */}
      {bulkBar && (
        <div style={{ marginBottom: 28, padding: '16px 20px', background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)', borderRadius: 12, border: '2px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
            {bulkBar}
          </Space>
        </div>
      )}

      {/* Users Table Card */}
      <Card 
        style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)', border: '2px solid #f0f0f0', borderTop: '6px solid #1890ff' }}
        styles={{ body: { padding: 0 } }}
        hoverable={false}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredUsers}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            pagination={{
              pageSize,
              current: page,
              onChange: setPage,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onShowSizeChange: (_current, size) => setPageSize(size),
              showTotal: (total) => `Showing ${startIdx}–${endIdx} of ${total} users`,
              style: { paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24 }
            }}
            onRow={record => ({
              onClick: (event: any) => {
                try {
                  const target = event && event.target ? event.target as HTMLElement : null;
                  if (target && target.closest && target.closest('.no-open-drawer')) {
                    // clicked an action control (three-dots) — don't open drawer
                    return;
                  }
                } catch (e) {}
                setSelectedUser(record);
                setDrawerOpen(true);
                fetchResidentForUser(record);
              },
            })}
            style={{ cursor: 'pointer' }}
            scroll={{ x: 'max-content' }}
            sticky
          />
        )}
      </Card>

      <Drawer
        title={selectedUser ? selectedUser.fullName : 'User Profile'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        styles={{
          header: {
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafb 100%)',
            borderBottom: '2px solid rgba(24,144,255,0.1)',
            padding: '20px 24px'
          },
          body: {
            background: 'linear-gradient(135deg, #f5f7fa 0%, #ffffff 50%, #f5f7fa 100%)',
            padding: '0px'
          }
        }}
      >
        {selectedUser && (
          <Space direction="vertical" size="large" style={{ width: '100%', padding: '28px 24px', display: 'flex' }}>
            <Row align="middle" gutter={16} style={{ marginBottom: 8 }}>
              <Col>
                {(() => {
                  let displayUser = selectedUser as any;
                  try {
                    const stored = localStorage.getItem('userProfile');
                    if (stored) displayUser = JSON.parse(stored);
                  } catch (err) {}
                  const src = selectedResident && (selectedResident.profileImage || selectedResident.profileImageId)
                    ? (selectedResident.profileImage ? selectedResident.profileImage : getAbsoluteApiUrl(`/resident/personal-info/avatar/${selectedResident.profileImageId}`))
                    : (selectedUser.avatar || null);
                  return (
                    <AppAvatar size={72} style={{ backgroundColor: '#1890ff' }} src={src} user={displayUser}>
                      {(selectedUser.fullName && selectedUser.fullName.length > 0) ? selectedUser.fullName.charAt(0).toUpperCase() : '?'}
                    </AppAvatar>
                  );
                })()}
              </Col>
              <Col style={{ flex: 1 }}>
                <Typography.Title level={4} style={{ margin: 0, marginBottom: 12, fontWeight: 700, color: '#1f2937', fontSize: 18 }}>{selectedUser.fullName}</Typography.Title>
                <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ 
                    background: selectedUser.isActive ? '#d1fae5' : '#fee2e2',
                    color: selectedUser.isActive ? '#059669' : '#dc2626', 
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    border: `1px solid ${selectedUser.isActive ? '#a7f3d0' : '#fecaca'}`
                  }}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span style={{ 
                    background: selectedUser.verified ? '#d1fae5' : '#f3f4f6',
                    color: selectedUser.verified ? '#059669' : '#6b7280', 
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    border: `1px solid ${selectedUser.verified ? '#a7f3d0' : '#d1d5db'}`
                  }}>
                    {selectedUser.verified ? 'Verified' : 'Unverified'}
                  </span>
                  <span style={{ 
                    background: selectedUser.role === 'admin' ? '#fef3c7' : selectedUser.role === 'staff' ? '#dbeafe' : '#d1fae5',
                    color: selectedUser.role === 'admin' ? '#d97706' : selectedUser.role === 'staff' ? '#1890ff' : '#059669', 
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    border: `1px solid ${selectedUser.role === 'admin' ? '#fcd34d' : selectedUser.role === 'staff' ? '#93c5fd' : '#a7f3d0'}`
                  }}>
                    {(selectedUser.role ? (selectedUser.role.charAt(0).toUpperCase() + selectedUser.role.slice(1)) : '')}
                  </span>
                </div>
                {selectedUser.warning && (
                  <div style={{ marginTop: 12, padding: 12, background: '#fff7ed', border: '1px solid #ffedd5', color: '#b45309', borderRadius: 8 }}>
                    you currently have a violation please go to the barangay to resolve this issue.thank you and godbless
                  </div>
                )}
                {selectedUser.restricted && (
                  <div style={{ marginTop: 12, padding: 12, background: '#fff7ed', border: '1px solid #ffedd5', color: '#b45309', borderRadius: 8 }}>
                    Please visit the barangay to resolve the restriction status
                  </div>
                )}
                {selectedUser.barangayId && (
                  <div style={{ marginTop: 10 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Barangay ID</Typography.Text>
                    <Typography.Text copyable style={{ display: 'block', marginTop: 4, color: '#1f2937', fontWeight: 600, fontSize: 13 }}>{selectedUser.barangayId}</Typography.Text>
                  </div>
                )}
              </Col>
            </Row>
            <div style={{ paddingTop: 12, paddingBottom: 12, borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
              <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Email</Typography.Text>
              <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedUser.email}</Typography.Text>
            </div>

            <Row style={{ marginTop: 12, marginBottom: 16, paddingLeft: 0, paddingRight: 0 }} gutter={[16, 8]}>
              <Col span={12}>
                <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Created At</Typography.Text>
                <Typography.Text style={{ display: 'block', marginTop: 4, color: '#1f2937', fontWeight: 500, fontSize: 13 }}>{selectedResident?.createdAt ? dayjs(selectedResident.createdAt).format('YYYY-MM-DD HH:mm') : (selectedUser.createdAt ? dayjs(selectedUser.createdAt).format('YYYY-MM-DD HH:mm') : 'N/A')}</Typography.Text>
              </Col>
              <Col span={12}>
                <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Last Login</Typography.Text>
                <Typography.Text style={{ display: 'block', marginTop: 4, color: '#1f2937', fontWeight: 500, fontSize: 13 }}>{selectedUser.lastLogin ? dayjs(selectedUser.lastLogin).format('YYYY-MM-DD HH:mm') : 'N/A'}</Typography.Text>
              </Col>
            </Row>

            {/* Resident Information section (prefer resident container) */}
            <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', fontSize: 15 }}>Resident Information</Typography.Title>
            {residentLoading ? (
              <Spin />
            ) : selectedResident ? (
              <>
                {/* Personal / Identity */}
                <div style={{ marginTop: 16, padding: '16px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, fontSize: 14 }}>Personal Information</Typography.Title>
                  <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Full Name</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{`${selectedResident.firstName || ''} ${selectedResident.middleName || ''} ${selectedResident.lastName || ''}`.trim() || 'N/A'}</Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Barangay ID</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.barangayID || 'N/A'}</Typography.Text>
                  </Col>

                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Username</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.username || 'N/A'}</Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Email</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.email || selectedUser.email || 'N/A'}</Typography.Text>
                  </Col>

                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Phone</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.contactNumber || 'N/A'}</Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Landline</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.landlineNumber || 'N/A'}</Typography.Text>
                  </Col>

                  <Col span={24}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Address</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.address || 'N/A'}</Typography.Text>
                  </Col>

                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>DOB</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.birthDate ? dayjs(selectedResident.birthDate).format('YYYY-MM-DD') : (selectedResident.birthDate || 'N/A')}</Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Sex/Gender</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.sex || selectedResident.gender || 'N/A'}</Typography.Text>
                  </Col>

                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Civil/Marital Status</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.civilStatus || selectedResident.maritalStatus || 'N/A'}</Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Nationality</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.nationality || 'N/A'}</Typography.Text>
                  </Col>

                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Occupation</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.occupation || 'N/A'}</Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Education</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.educationalAttainment || 'N/A'}</Typography.Text>
                  </Col>
                  </Row>
                </div>

                {/* Identification & IDs */}
                <div style={{ marginTop: 18, padding: '16px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, fontSize: 14 }}>Identification</Typography.Title>
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Passport #</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.passportNumber || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Gov ID #</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.governmentIdNumber || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>TIN</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.tin || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Barangay Clearance #</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.barangayClearanceNumber || 'N/A'}</Typography.Text>
                    </Col>
                  </Row>
                </div>

                {/* Family */}
                <div style={{ marginTop: 18, padding: '16px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, fontSize: 14 }}>Family</Typography.Title>
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Spouse</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.spouseName ? `${selectedResident.spouseName} ${selectedResident.spouseLastName || ''}` : 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Number of Children</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{(selectedResident.numberOfChildren || selectedResident.numberOfChildren === 0) ? selectedResident.numberOfChildren : 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Children Names/Ages</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.childrenNames ? `${selectedResident.childrenNames} (${selectedResident.childrenAges || ''})` : 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Mother</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.motherName || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Father</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.fatherName || 'N/A'}</Typography.Text>
                    </Col>
                  </Row>
                </div>

                {/* Emergency */}
                <div style={{ marginTop: 18, padding: '16px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, fontSize: 14 }}>Emergency Contact</Typography.Title>
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Contact Name</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.emergencyContactName || selectedResident.emergencyContact || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Relationship</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.emergencyContactRelationship || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Emergency Phone</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.emergencyContact || selectedResident.spouseContactNumber || 'N/A'}</Typography.Text>
                    </Col>
                  </Row>
                </div>

                {/* Business */}
                <div style={{ marginTop: 18, padding: '16px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, fontSize: 14 }}>Business / Employment</Typography.Title>
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Business Name</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.businessName || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Business Type</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.businessType || 'N/A'}</Typography.Text>
                    </Col>
                  <Col span={12}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Business Contact</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.businessContactNumber || 'N/A'}</Typography.Text>
                  </Col>
                  <Col span={24}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Business Address</Typography.Text>
                    <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.businessAddress || 'N/A'}</Typography.Text>
                  </Col>
                  </Row>
                </div>

                {/* Other fields / meta */}
                <div style={{ marginTop: 18, padding: '16px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, fontSize: 14 }}>Other</Typography.Title>
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Blood Type</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.bloodType || 'N/A'}</Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text strong style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Disability Status</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 6, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.disabilityStatus || 'N/A'}</Typography.Text>
                    </Col>
                  </Row>
                </div>

                {/* Social Media / Links */}
                <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <Typography.Title level={5} style={{ marginBottom: 12, color: '#1f2937', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Social Media / Links</Typography.Title>
                  <Row gutter={[12, 12]}>
                    <Col span={24}>
                      <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Facebook:</Typography.Text>
                      {selectedResident.facebook ? (
                        <Typography.Text style={{ display: 'block', marginTop: 4 }}>
                          <a href={selectedResident.facebook} target="_blank" rel="noreferrer" style={{ color: '#1890ff', fontWeight: 500 }}>{selectedResident.facebook}</a>
                        </Typography.Text>
                      ) : <Typography.Text style={{ display: 'block', marginTop: 4, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>N/A</Typography.Text>}
                    </Col>
                    <Col span={24}>
                      <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Instagram:</Typography.Text>
                      {selectedResident.instagram ? (
                        <Typography.Text style={{ display: 'block', marginTop: 4 }}>
                          <a href={selectedResident.instagram} target="_blank" rel="noreferrer" style={{ color: '#1890ff', fontWeight: 500 }}>{selectedResident.instagram}</a>
                        </Typography.Text>
                      ) : <Typography.Text style={{ display: 'block', marginTop: 4, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>N/A</Typography.Text>}
                    </Col>
                    <Col span={24}>
                      <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Other Link:</Typography.Text>
                      <Typography.Text style={{ display: 'block', marginTop: 4, color: '#1f2937', fontWeight: 500, fontSize: 14 }}>{selectedResident.website || 'N/A'}</Typography.Text>
                    </Col>
                  </Row>
                </div>
              </>
            ) : (
              <Typography.Text type="warning">This resident doesn't have resident info yet.</Typography.Text>
            )}

            {/* Action buttons */}
            <div style={{ marginTop: 28, paddingTop: 20, paddingBottom: 8, borderTop: '2px solid #e5e7eb', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start', flexDirection: window.innerWidth < 576 ? 'column' : 'row' }}>
              <Button 
                icon={<EditOutlined />} 
                onClick={() => setEditUserModalOpen(true)}
                style={{
                  background: '#1890ff',
                  color: 'white',
                  fontWeight: 600,
                  border: 'none',
                  height: window.innerWidth < 576 ? 40 : 36,
                  paddingLeft: window.innerWidth < 576 ? 12 : 16,
                  paddingRight: window.innerWidth < 576 ? 12 : 16,
                  flex: window.innerWidth < 576 ? 1 : 'none',
                  fontSize: window.innerWidth < 576 ? '14px' : '16px'
                }}
              >
                Edit User
              </Button>
              {selectedResident && (
                <Button 
                  icon={<FormOutlined />}
                  onClick={() => setEditModalOpen(true)}
                  style={{
                    background: '#52c41a',
                    color: 'white',
                    fontWeight: 600,
                    border: 'none',
                    height: window.innerWidth < 576 ? 40 : 36,
                    paddingLeft: window.innerWidth < 576 ? 12 : 16,
                    paddingRight: window.innerWidth < 576 ? 12 : 16,
                    flex: window.innerWidth < 576 ? 1 : 'none',
                    fontSize: window.innerWidth < 576 ? '14px' : '16px'
                  }}
                >
                  Edit Resident
                </Button>
              )}
              {selectedUser && selectedUser.role === 'resident' && (
                <Popconfirm
                  title={selectedUser && selectedUser.restricted ? 'Remove restriction' : 'Restrict user'}
                  description={`Are you sure you want to ${selectedUser && selectedUser.restricted ? 'remove restriction from' : 'restrict'} ${selectedUser && (selectedUser.fullName || selectedUser.email || selectedUser._id)}?`}
                  onConfirm={async () => { if (selectedUser) await handleRestrictUser(selectedUser._id, !selectedUser.restricted); }}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button
                    icon={<StopOutlined />}
                    style={{
                      background: selectedUser && selectedUser.restricted ? '#f97316' : '#f97316',
                      color: 'white',
                      fontWeight: 600,
                      border: 'none',
                      height: window.innerWidth < 576 ? 40 : 36,
                      paddingLeft: window.innerWidth < 576 ? 12 : 16,
                      paddingRight: window.innerWidth < 576 ? 12 : 16,
                      flex: window.innerWidth < 576 ? 1 : 'none',
                      fontSize: window.innerWidth < 576 ? '14px' : '16px'
                    }}
                  >
                    {selectedUser && selectedUser.restricted ? 'Unrestrict' : 'Restrict'}
                  </Button>
                </Popconfirm>
              )}
              {selectedUser && selectedUser.role === 'staff' && (
                <Popconfirm
                  title="Demote user"
                  description={`Are you sure you want to demote ${selectedUser.fullName || selectedUser.email || selectedUser._id} to resident?`}
                  onConfirm={async () => { if (selectedUser) await handleDemoteUser(selectedUser._id); }}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button
                    icon={<ReloadOutlined />}
                    style={{
                      background: '#8b5cf6',
                      color: 'white',
                      fontWeight: 600,
                      border: 'none',
                      height: window.innerWidth < 576 ? 40 : 36,
                      paddingLeft: window.innerWidth < 576 ? 12 : 16,
                      paddingRight: window.innerWidth < 576 ? 12 : 16,
                      flex: window.innerWidth < 576 ? 1 : 'none',
                      fontSize: window.innerWidth < 576 ? '14px' : '16px'
                    }}
                  >
                    Demote
                  </Button>
                </Popconfirm>
              )}
              {selectedUser && selectedUser.isActive ? (
                <Popconfirm 
                  title="Disable user" 
                  description="Are you sure you want to disable this user?" 
                  onConfirm={async () => { if (selectedUser) await handleDisableUser(selectedUser._id); }}
                  okText="Yes" 
                  cancelText="No"
                >
                  <Button 
                    danger
                    style={{
                      background: '#faad14',
                      color: 'white',
                      fontWeight: 600,
                      border: 'none',
                      height: window.innerWidth < 576 ? 40 : 36,
                      paddingLeft: window.innerWidth < 576 ? 12 : 16,
                      paddingRight: window.innerWidth < 576 ? 12 : 16,
                      flex: window.innerWidth < 576 ? 1 : 'none',
                      fontSize: window.innerWidth < 576 ? '14px' : '16px'
                    }}
                  >
                    Disable
                  </Button>
                </Popconfirm>
              ) : (
                <Button 
                  onClick={async () => { if (selectedUser) await handleEnableUser(selectedUser._id); }}
                  style={{
                    background: '#52c41a',
                    color: 'white',
                    fontWeight: 600,
                    border: 'none',
                    height: window.innerWidth < 576 ? 40 : 36,
                    paddingLeft: window.innerWidth < 576 ? 12 : 16,
                    paddingRight: window.innerWidth < 576 ? 12 : 16,
                    flex: window.innerWidth < 576 ? 1 : 'none',
                    fontSize: window.innerWidth < 576 ? '14px' : '16px'
                  }}
                >
                  Enable
                </Button>
              )}
            </div>
            {/* Full resident JSON view removed per design */}
          </Space>
        )}
      </Drawer>

      <Modal
        title="Activity Logs"
        open={logsModalOpen}
        onCancel={() => setLogsModalOpen(false)}
        footer={
          [<Button key="close" onClick={() => setLogsModalOpen(false)}>Close</Button>]
        }
        width={800}
      >
        {logsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (activityLogs && activityLogs.length > 0) ? (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {activityLogs.map((log: any, idx: number) => (
              <div key={log.id || log._id || idx} style={{ padding: 12, borderBottom: '1px solid #eee' }}>
                <div style={{ fontWeight: 700 }}>{log.action || log.description || log.module || 'Activity'}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{log.timestamp ? dayjs(log.timestamp).format('YYYY-MM-DD HH:mm') : ''}</div>
                <div style={{ marginTop: 8 }}>{log.details || log.message || log.description || JSON.stringify(log)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 12 }}>No activity logs available</div>
        )}
      </Modal>

      <Modal
        title="Edit Resident"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={async () => {
          if (!selectedResident) return;
          try {
            // merge existing resident with form changes; server will whitelist allowed fields
            const payload: any = { ...selectedResident, ...editFormValues };
            const res = await adminAPI.updateResident(selectedResident._id, payload);
            message.success('Resident updated');
            setSelectedResident(res?.resident || { ...selectedResident, ...payload });
            setEditModalOpen(false);
          } catch (err: any) {
            console.error('Failed to save resident', err);
            message.error('Failed to update resident.');
          }
        }}
        width={window.innerWidth < 576 ? '90%' : 900}
      >
        {/* Tabbed structured form with validation and avatar upload */}
        <Form
          layout="vertical"
          initialValues={{ ...(selectedResident || {}), barangayID: selectedResident?.barangayID || selectedUser?.barangayId }}
          onValuesChange={(_, values) => setEditFormValues(values as any)}
        >
          <Tabs defaultActiveKey="personal">
            <Tabs.TabPane tab="Personal" key="personal">
              <Row gutter={8}>
                <Col span={8}><Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'First name is required' }]}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="middleName" label="Middle Name"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Last name is required' }]}><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="username" label="Username"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="barangayID" label="Barangay ID" rules={[{ required: true, message: 'Barangay ID is required' }]}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Enter a valid email' }]}><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="contactNumber" label="Contact Number" rules={[{ pattern: /^[0-9+\-() ]{6,20}$/, message: 'Enter a valid phone number' }]}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="landlineNumber" label="Landline"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="address" label="Address"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="birthDate" label="Birth Date"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="placeOfBirth" label="Place of Birth"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="age" label="Age"><Input type="number" /></Form.Item></Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="IDs" key="ids">
              <Row gutter={8}>
                <Col span={8}><Form.Item name="passportNumber" label="Passport #"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="governmentIdNumber" label="Government ID #"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="tin" label="TIN"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="bloodType" label="Blood Type"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="disabilityStatus" label="Disability Status"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="educationalAttainment" label="Education"><Input /></Form.Item></Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="Family" key="family">
              <Row gutter={8}>
                <Col span={8}><Form.Item name="spouseName" label="Spouse Name"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="spouseMiddleName" label="Spouse Middle"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="spouseLastName" label="Spouse Last"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="spouseAge" label="Spouse Age"><Input type="number" /></Form.Item></Col>
                <Col span={8}><Form.Item name="spouseBirthDate" label="Spouse DOB"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="spouseOccupation" label="Spouse Occupation"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="numberOfChildren" label="# Children"><Input type="number" /></Form.Item></Col>
                <Col span={8}><Form.Item name="childrenNames" label="Children Names"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="childrenAges" label="Children Ages"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="motherName" label="Mother's Name"><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="fatherName" label="Father's Name"><Input /></Form.Item></Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="Business" key="business">
              <Row gutter={8}>
                <Col span={12}><Form.Item name="businessName" label="Business Name"><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="businessType" label="Business Type"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="businessContactNumber" label="Business Contact"><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="businessEmail" label="Business Email"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={24}><Form.Item name="businessAddress" label="Business Address"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="registrationNumber" label="Registration #"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="businessPermitNumber" label="Business Permit #"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="barangayClearanceNumber" label="Barangay Clearance #"><Input /></Form.Item></Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="Avatar / Media" key="media">
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item label="Upload Profile Image">
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={() => false}
                      customRequest={(options: any) => {
                        if (!selectedResident) return;
                        const file = options.file as File;
                        setUploading(true);
                        setUploadProgress(10);
                        // create a pending upload promise so modal save can await it
                        const p = (async () => {
                          try {
                            // small simulated progress
                            setUploadProgress(30);
                            const resp: any = await adminAPI.uploadResidentAvatar(selectedResident._id, file);
                            setUploadProgress(80);
                            if (resp?.resident) {
                              setSelectedResident(resp.resident);
                              setEditFormValues((prev: any) => ({ ...prev, profileImage: resp.resident.profileImage, profileImageId: resp.resident.profileImageId }));
                              setUploadPreview(resp.resident.profileImage || `${getAbsoluteApiUrl(`/resident/personal-info/avatar/${resp.fileId}`)}?t=${Date.now()}`);
                            } else if (resp?.fileId) {
                              setEditFormValues((prev: any) => ({ ...prev, profileImage: getAbsoluteApiUrl(`/resident/personal-info/avatar/${resp.fileId}`), profileImageId: resp.fileId }));
                              setUploadPreview(`${getAbsoluteApiUrl(`/resident/personal-info/avatar/${resp.fileId}`)}?t=${Date.now()}`);
                            }
                            setUploadProgress(100);
                            message.success('Avatar uploaded');
                            return resp;
                          } catch (e: any) {
                            console.error('Avatar upload failed', e);
                            message.error(e?.message || 'Avatar upload failed');
                            throw e;
                          } finally {
                            setUploading(false);
                          }
                        })();
                        pendingUploadRef.current = p;
                        return p as any;
                      }}
                    >
                      <Button type="default">Choose Image</Button>
                    </Upload>
                    {uploading && <div style={{ marginTop: 8 }}>Uploading: {uploadProgress}%</div>}
                    {uploadPreview && <div style={{ marginTop: 8 }}><img src={typeof uploadPreview === 'string' && !uploadPreview.startsWith('http') ? getAbsoluteApiUrl(uploadPreview) : uploadPreview} alt="preview" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 6 }} /></div>}
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="profileImage" label="Profile Image URL"><Input /></Form.Item>
                  <Form.Item name="profileImageId" label="Profile Image ID"><Input /></Form.Item>
                </Col>
              </Row>
            </Tabs.TabPane>
          </Tabs>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title="Edit User"
        open={editUserModalOpen}
        onCancel={() => setEditUserModalOpen(false)}
        onOk={async () => {
          try {
            // Do not allow changing barangayId or role from this modal (read-only shown)
            const payload = { ...userFormValues };
            // Remove non-editable fields if present
            delete payload.barangayId;
            delete payload.role;
            // Call admin API to update user
            await adminAPI.updateUser(selectedUser._id, payload);
            message.success('User updated');
            // Update local list and selectedUser
            const updatedUsers = users.map(u => u._id === selectedUser._id ? { ...u, ...payload } : u);
            setUsers(updatedUsers);
            setSelectedUser((prev: any) => prev ? { ...prev, ...payload } : prev);
            setEditUserModalOpen(false);
          } catch (err) {
            console.error('Failed to update user', err);
            message.error('Failed to update user');
          }
        }}
        width={window.innerWidth < 576 ? '90%' : 600}
      >
        <Form layout="vertical" initialValues={userFormValues} onValuesChange={(_, vals) => setUserFormValues(vals)}>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="fullName" label="Full Name" rules={[{ required: true, message: 'Full name required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="isActive" label="Active">
                <Select options={[{ label: 'Active', value: true }, { label: 'Inactive', value: false }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Role">
                <Input value={selectedUser?.role} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={24}>
              <Form.Item label="Barangay ID">
                <Input value={selectedUser?.barangayId || selectedUser?.barangayID || ''} disabled />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Staff Registration Modal */}
      {/* Staff Registration Modal removed */}

      {/* User Registration Modal */}
      {/* User Registration Modal removed */}
    </div>
  );
};

export default UserManagement;
