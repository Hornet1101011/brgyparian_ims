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
  Row,
  Col,
  Popconfirm,
  Modal,
  Tabs,
  Descriptions,
  Tag,
  Badge,
  Avatar,
  Statistic,
  Divider,
  DatePicker,
  Empty,
  ConfigProvider,
  theme,
  Progress,
  Tooltip,
  Alert,
} from 'antd';
import AppAvatar from '../AppAvatar';
import {
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  StopOutlined,
  CheckOutlined,
  ReloadOutlined,
  FormOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  HomeOutlined,
  TeamOutlined,
  FileTextOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import type { SortOrder, ColumnsType } from 'antd/es/table/interface';
import { adminAPI } from '../../services/api';
import dayjs from 'dayjs';
import { getAbsoluteApiUrl } from '../../services/api';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Staff', value: 'staff' },
  { label: 'Resident', value: 'resident' },
];

const statusOptions = [
  { label: 'Active', value: true },
  { label: 'Inactive', value: false },
];

const roleColors: Record<string, { color: string; icon: React.ReactNode }> = {
  admin: { color: 'gold', icon: <SafetyOutlined /> },
  staff: { color: 'blue', icon: <TeamOutlined /> },
  resident: { color: 'green', icon: <UserOutlined /> },
};

const UserManagement = () => {
  const { token } = theme.useToken();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);
  const [dateRange, setDateRange] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedResident, setSelectedResident] = useState<any>(null);
  const [residentLoading, setResidentLoading] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [userFormValues, setUserFormValues] = useState({});
  const [editFormValues, setEditFormValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  // Enhanced profile completion calculation with comprehensive field validation
  const calculateProfileCompletion = (user: any, resident: any) => {
    // Helper function to check if a field has meaningful content
    const hasValidContent = (value: any) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        return trimmed !== '' && trimmed !== 'n/a' && trimmed !== 'na' && trimmed !== 'not applicable' && trimmed !== 'none';
      }
      if (typeof value === 'number') return !isNaN(value) && value >= 0;
      return true;
    };

    // Comprehensive user account fields
    const userFields = [
      'username', 'email', 'contactNumber', 'address'
    ];

    // Comprehensive personal information fields
    const personalFields = [
      // Basic Information
      'firstName', 'lastName', 'middleName', 'nameExtension', 'age', 'birthDate', 
      'dateOfResidency', 'sex', 'civilStatus',
      
      // Personal Details
      'nationality', 'placeOfBirth', 'religion', 'maritalStatus', 
      'passportNumber', 'governmentIdNumber', 'bloodType', 'disabilityStatus', 
      'occupation', 'educationalAttainment',
      
      // Contact Information
      'facebook', 'landlineNumber', 'emergencyContact', 
      'emergencyContactName', 'emergencyContactRelationship',
      
      // Family Information - Spouse
      'spouseName', 'spouseAge', 'spouseBirthDate', 'spouseMiddleName', 
      'spouseLastName', 'spouseOccupation', 'spouseStatus', 'spouseNationality', 
      'spouseContactNumber',
      
      // Family Information - Parents
      'motherName', 'motherAge', 'motherBirthDate', 'motherOccupation', 'motherStatus',
      'fatherName', 'fatherAge', 'fatherBirthDate', 'fatherOccupation', 'fatherStatus',
      
      // Family Information - Children
      'numberOfChildren', 'childrenNames', 'childrenAges',
      
      // Business Information
      'businessName', 'businessType', 'natureOfBusiness', 'businessAddress', 
      'dateEstablished', 'tin', 'registrationNumber', 'businessPermitNumber', 
      'barangayClearanceNumber', 'numberOfEmployees', 'capitalInvestment', 
      'annualGrossIncome', 'businessContactPerson', 'businessContactNumber', 'businessEmail'
    ];

    let completedFields = 0;
    let totalFields = userFields.length;

    // Check user data fields
    userFields.forEach(field => {
      if (user && hasValidContent(user[field])) {
        completedFields++;
      }
    });

    // Check personal data fields - handle different resident data structures
    if (resident) {
      totalFields += personalFields.length;
      personalFields.forEach(field => {
        // Check if field exists in resident data
        if (hasValidContent(resident[field])) {
          completedFields++;
        }
      });
    }

    // Fallback: if no resident data, calculate based on available user fields only
    if (!resident && user && user.role === 'resident') {
      // Add some basic resident-specific checks on user data
      const residentSpecificFields = ['firstName', 'lastName', 'birthDate', 'age', 'sex'];
      totalFields += residentSpecificFields.length;
      residentSpecificFields.forEach(field => {
        if (hasValidContent(user[field])) {
          completedFields++;
        }
      });
    }

    // Calculate percentage with proper rounding
    const percentage = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
    console.log(`Profile completion for ${user?.fullName}: ${completedFields}/${totalFields} = ${Math.round(percentage)}%`);
    return Math.round(percentage);
  };

  const fetchUsers = () => {
    setLoading(true);
    adminAPI.getUsers()
      .then(async (data: any[]) => {
        // Fetch resident data for residents to calculate accurate profile completion
        const usersWithResidentData = await Promise.all(
          data.map(async (user, idx) => {
            let residentData = null;
            if (user.role === 'resident') {
              try {
                // Use the getUserWithResident API to fetch complete user and resident data
                const userWithResident = await adminAPI.getUserWithResident(user._id);
                residentData = userWithResident?.residentData || userWithResident?.resident || null;
                console.log('Resident data for user', user._id, ':', residentData);
              } catch (err) {
                console.log('No resident data found for user:', user._id);
                // Try alternative approach - get resident by barangay ID if available
                if (user.barangayId || user.barangayID || user.barangay_id) {
                  try {
                    const barangayId = user.barangayId || user.barangayID || user.barangay_id;
                    const resident = await adminAPI.getResidentByBarangayID(barangayId);
                    residentData = resident || null;
                    console.log('Resident data by barangay ID', barangayId, ':', residentData);
                  } catch (err2) {
                    console.log('No resident data found by barangay ID either');
                  }
                }
              }
            }
            
            return {
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
              residentData: residentData,
            };
          })
        );
        setUsers(usersWithResidentData);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Inject CSS for hidden scrollbar table
  useEffect(() => {
    const styleId = 'hidden-scrollbar-table-styles';
    if (document.getElementById(styleId)) return;

    const styles = `
      .hidden-scrollbar-table .ant-table-wrapper {
        overflow: hidden;
      }
      .hidden-scrollbar-table .ant-table-body {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .hidden-scrollbar-table .ant-table-body::-webkit-scrollbar {
        width: 0;
        height: 8px;
      }
      .hidden-scrollbar-table .ant-table-body::-webkit-scrollbar-track {
        background: transparent;
      }
      .hidden-scrollbar-table .ant-table-body::-webkit-scrollbar-thumb {
        background: transparent;
        border-radius: 4px;
        transition: background-color 0.2s ease;
      }
      .hidden-scrollbar-table .ant-table-wrapper:hover .ant-table-body::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
      }
      .hidden-scrollbar-table .ant-table-body::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.3);
      }
      .hidden-scrollbar-table .ant-table-body::-webkit-scrollbar-thumb:active {
        background: rgba(0, 0, 0, 0.5);
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.innerHTML = styles;
    document.head.appendChild(styleElement);

    return () => {
      const element = document.getElementById(styleId);
      if (element) element.remove();
    };
  }, []);

  const fetchResidentForUser = async (user: any) => {
    if (!user) return;
    setResidentLoading(true);
    try {
      const barangayId = user.barangayId || user.barangayID || user.barangay_id;
      if (barangayId) {
        const resp: any = await adminAPI.getResidentByBarangayID(barangayId);
        setSelectedResident(resp?.resident || null);
      } else if (user._id) {
        const resp: any = await adminAPI.getUserWithResident(user._id);
        setSelectedResident(resp?.resident || null);
      } else {
        setSelectedResident(null);
      }
    } catch (err) {
      console.error('Failed to fetch resident', err);
      setSelectedResident(null);
    } finally {
      setResidentLoading(false);
    }
  };

  const handleDisableUser = async (userId: string) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Disabling user...', key: 'disable' });
      const res: any = await adminAPI.disableUser(userId, {});
      message.success({ content: 'User disabled', key: 'disable', duration: 2 });
      await fetchUsers();
      if (selectedUser?._id === userId) setSelectedUser(res.user || res);
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
      if (selectedUser?._id === userId) setSelectedUser(res.user || res);
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
      if (selectedUser?._id === userId) {
        setSelectedUser(null);
        setDrawerOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete user', err);
      message.error('Failed to delete user');
    }
  };

  const handleDemoteUser = async (userId: string) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Demoting user...', key: 'demote' });
      const res: any = await adminAPI.demoteUser(userId);
      message.success({ content: 'User demoted', key: 'demote', duration: 2 });
      await fetchUsers();
      if (selectedUser?._id === userId) setSelectedUser(res.user || res);
    } catch (err) {
      console.error('Failed to demote user', err);
      message.error('Failed to demote user');
    }
  };

  const handleRestrictUser = async (userId: string, restricted: boolean) => {
    if (!userId) return;
    try {
      message.loading({
        content: restricted ? 'Restricting user...' : 'Removing restriction...',
        key: 'restrict',
      });
      const res: any = await adminAPI.restrictUser(userId, restricted);
      message.success({
        content: restricted ? 'User restricted' : 'Restriction removed',
        key: 'restrict',
        duration: 2,
      });
      await fetchUsers();
      if (selectedUser?._id === userId) setSelectedUser(res.user || res);
    } catch (err) {
      console.error('Failed to update restriction', err);
      message.error('Failed to update restriction');
    }
  };

  const handleBulkActivate = async () => {
    if (selectedRowKeys.length === 0) return;
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
    if (selectedRowKeys.length === 0) return;
    try {
      message.loading({ content: 'Deactivating users...', key: 'bulk-deactivate' });
      await Promise.all(selectedRowKeys.map((id: any) => adminAPI.disableUser(id, {})));
      message.success({ content: 'Users deactivated', key: 'bulk-deactivate', duration: 2 });
      setSelectedRowKeys([]);
      await fetchUsers();
    } catch (err) {
      console.error('Bulk deactivate failed', err);
      message.error('Bulk deactivation failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) return;
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

  const handleToggleVerified = async (userId: string, currentVerified: boolean) => {
    if (!userId) return;
    try {
      message.loading({ content: 'Updating...', key: 'verify' });
      await (await import('../../services/api')).verificationAPI.verifyUser(userId, !currentVerified);
      message.success({ content: 'Updated successfully', key: 'verify', duration: 2 });
      await fetchUsers();
      if (selectedUser?._id === userId) {
        setSelectedUser((prev: any) => (prev ? { ...prev, verified: !currentVerified } : prev));
      }
    } catch (err) {
      console.error('Failed to update verified', err);
      message.error('Failed to update verification status');
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    const matchesStatus = statusFilter !== undefined ? user.isActive === statusFilter : true;
    const matchesDate =
      dateRange && dateRange.length === 2
        ? dayjs(user.createdAt).isAfter(dateRange[0], 'day') &&
          dayjs(user.createdAt).isBefore(dateRange[1], 'day')
        : true;
    return matchesSearch && matchesRole && matchesStatus && matchesDate;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'User',
      dataIndex: 'fullName',
      key: 'fullName',
      fixed: 'left',
      width: 220,
      render: (text: string, record: any) => (
        <Space size={4} style={{ gap: 6 }}>
          <AppAvatar
            size={32}
            src={record.avatar}
            style={{ backgroundColor: token.colorPrimary, flexShrink: 0 }}
            shape="circle"
          >
            {text?.charAt(0).toUpperCase() || '?'}
          </AppAvatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {text}
              {record.restricted && (
                <WarningOutlined style={{ marginLeft: 8, color: token.colorWarning }} />
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Barangay ID',
      dataIndex: 'barangayId',
      key: 'barangayId',
      width: 130,
      render: (id: string) => <Text code>{id || '—'}</Text>,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (role: string) => {
        const config = roleColors[role] || { color: 'default' };
        return <Tag icon={config.icon} color={config.color}>{role?.toUpperCase()}</Tag>;
      },
      filters: roleOptions.map((r) => ({ text: r.label, value: r.value })),
      onFilter: (value: any, record: any) => record.role === value,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (active: boolean) => (
        <Badge
          status={active ? 'success' : 'error'}
          text={active ? 'Active' : 'Inactive'}
        />
      ),
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
      onFilter: (value: any, record: any) => record.isActive === value,
    },
    {
      title: 'Verified',
      dataIndex: 'verified',
      key: 'verified',
      width: 100,
      render: (verified: boolean) => (
        <Badge
          status={verified ? 'success' : 'default'}
          text={verified ? 'Yes' : 'No'}
        />
      ),
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value: any, record: any) => record.verified === value,
    },
    {
      title: 'Profile Completion',
      dataIndex: 'profileCompletion',
      key: 'profileCompletion',
      width: 140,
      render: (_, record: any) => {
        if (record.role !== 'resident') return <Text type="secondary">N/A</Text>;
        
        // Use resident data from the record itself
        const completion = calculateProfileCompletion(record, record.residentData);
        
        return (
          <Tooltip title={`Profile completion: ${completion}%`}>
            <Progress 
              percent={completion} 
              size="small" 
              status={completion === 100 ? 'success' : 'active'}
              strokeColor={completion >= 80 ? '#52c41a' : completion >= 50 ? '#faad14' : '#ff4d4f'}
              style={{ width: 80, margin: 0 }}
              format={(percent) => `${percent}%`}
            />
          </Tooltip>
        );
      },
      sorter: (a: any, b: any) => {
        const aCompletion = a.role === 'resident' ? calculateProfileCompletion(a, a.residentData) : 0;
        const bCompletion = b.role === 'resident' ? calculateProfileCompletion(b, b.residentData) : 0;
        return aCompletion - bCompletion;
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (date: string) => dayjs(date).format('MMM DD, YYYY'),
      sorter: (a: any, b: any) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 80,
      render: (_: any, record: any) => (
        <Button
          type="text"
          icon={<MoreOutlined />}
          onClick={() => {
            setSelectedUser(record);
            setDrawerOpen(true);
            fetchResidentForUser(record);
          }}
        />
      ),
    },
  ];

  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, filteredUsers.length);
  const hasSelection = selectedRowKeys.length > 0;

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
        },
      }}
    >
      <div style={{ padding: 24 }}>
        {/* Header */}
        <Row gutter={[0, 28]} style={{ marginBottom: 32 }}>
          <Col span={24}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Title level={2} style={{ margin: 0 }}>
                User Management
              </Title>
              <Text type="secondary">
                Manage system users, roles, and permissions
              </Text>
            </Space>
          </Col>
        </Row>

        {/* KPI Stats */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" hoverable>
              <Statistic
                title="Total Users"
                value={users.length}
                prefix={<UserOutlined />}
                valueStyle={{ color: token.colorPrimary }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" hoverable>
              <Statistic
                title="Active"
                value={users.filter((u) => u.isActive).length}
                valueStyle={{ color: token.colorSuccess }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" hoverable>
              <Statistic
                title="Staff"
                value={users.filter((u) => u.role === 'staff').length}
                valueStyle={{ color: token.colorWarning }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" hoverable>
              <Statistic
                title="Restricted"
                value={users.filter((u) => u.restricted).length}
                valueStyle={{ color: token.colorError }}
              />
            </Card>
          </Col>
        </Row>

        {/* Filters Card */}
        <Card style={{ marginBottom: 24 }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={12} md={5}>
              <Input.Search
                placeholder="Search by name or email"
                prefix={<MailOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Select
                placeholder="Filter by role"
                allowClear
                value={roleFilter}
                onChange={setRoleFilter}
                options={roleOptions}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Select
                placeholder="Filter by status"
                allowClear
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
              />
            </Col>
            <Col xs={24} sm={12} md={7}>
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Button
                block
                onClick={() => {
                  setSearch('');
                  setRoleFilter(undefined);
                  setStatusFilter(undefined);
                  setDateRange(null);
                }}
              >
                Reset
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Bulk Actions */}
        {hasSelection && (
          <Card style={{ marginBottom: 16, backgroundColor: token.colorPrimaryBg }}>
            <Space wrap>
              <Text strong>{`${selectedRowKeys.length} user(s) selected`}</Text>
              <Button
                size="small"
                icon={<CheckOutlined />}
                onClick={handleBulkActivate}
              >
                Activate
              </Button>
              <Button
                size="small"
                icon={<StopOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: 'Deactivate selected users?',
                    content: `Are you sure you want to deactivate ${selectedRowKeys.length} user(s)?`,
                    onOk: handleBulkDeactivate,
                  });
                }}
              >
                Deactivate
              </Button>
              <Popconfirm
                title="Delete selected users?"
                description="This action cannot be undone."
                onConfirm={handleBulkDelete}
              >
                <Button size="small" icon={<DeleteOutlined />} danger>
                  Delete
                </Button>
              </Popconfirm>
            </Space>
          </Card>
        )}

        {/* Users Table */}
        <Card>
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
              onShowSizeChange: (_, size) => setPageSize(size),
              showTotal: (total) => `${startIdx}–${endIdx} of ${total} users`,
            }}
            loading={loading}
            scroll={{ x: 'max-content' }}
            sticky
            className="hidden-scrollbar-table"
          />
        </Card>

        {/* User Detail Drawer */}
        <Drawer
          title={
            <Space>
              <Avatar
                src={selectedUser?.avatar}
                size={32}
                style={{ backgroundColor: token.colorPrimary }}
              >
                {selectedUser?.fullName?.charAt(0).toUpperCase() || '?'}
              </Avatar>
              <div>
                <div style={{ fontWeight: 600 }}>{selectedUser?.fullName}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {selectedUser?.email}
                </Text>
              </div>
            </Space>
          }
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={500}
          bodyStyle={{ padding: 0 }}
        >
          {selectedUser && (
            <Tabs
              defaultActiveKey="overview"
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: (
                    <div style={{ padding: 24 }}>
                      <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        {/* Status Badges */}
                        <Space wrap>
                          <Badge
                            status={selectedUser.isActive ? 'success' : 'error'}
                            text={selectedUser.isActive ? 'Active' : 'Inactive'}
                          />
                          <Badge
                            status={selectedUser.verified ? 'success' : 'default'}
                            text={selectedUser.verified ? 'Verified' : 'Not Verified'}
                          />
                          <Tag color={roleColors[selectedUser.role]?.color || 'default'}>
                            {selectedUser.role?.toUpperCase()}
                          </Tag>
                          {selectedUser.restricted && (
                            <Tag icon={<WarningOutlined />} color="warning">
                              Restricted
                            </Tag>
                          )}
                        </Space>

                        <Divider style={{ margin: '16px 0' }} />

                        {/* User Info */}
                        <Descriptions column={1} size="small">
                          <Descriptions.Item label="Full Name">
                            {selectedUser.fullName || '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Email">
                            <Text copyable>{selectedUser.email}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="Barangay ID">
                            <Text code>{selectedUser.barangayId || '—'}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="Created">
                            {dayjs(selectedUser.createdAt).format('MMM DD, YYYY HH:mm')}
                          </Descriptions.Item>
                          <Descriptions.Item label="Last Login">
                            {selectedUser.lastLogin
                              ? dayjs(selectedUser.lastLogin).format('MMM DD, YYYY HH:mm')
                              : '—'}
                          </Descriptions.Item>
                        </Descriptions>

                        {selectedUser.restricted && (
                          <Empty
                            description="Account is restricted"
                            style={{ marginTop: 16 }}
                          />
                        )}
                      </Space>

                      {/* Action Buttons */}
                      <Divider />
                      <Space wrap style={{ width: '100%', marginTop: 16 }}>
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={() => setEditUserModalOpen(true)}
                        >
                          Edit User
                        </Button>
                        {selectedUser.role === 'resident' && (
                          <Popconfirm
                            title={
                              selectedUser.restricted
                                ? 'Remove restriction?'
                                : 'Restrict account?'
                            }
                            onConfirm={() =>
                              handleRestrictUser(
                                selectedUser._id,
                                !selectedUser.restricted
                              )
                            }
                          >
                            <Button
                              danger={!selectedUser.restricted}
                              icon={<StopOutlined />}
                            >
                              {selectedUser.restricted
                                ? 'Unrestrict'
                                : 'Restrict'}
                            </Button>
                          </Popconfirm>
                        )}
                        {selectedUser.role === 'staff' && (
                          <Popconfirm
                            title="Demote to resident?"
                            onConfirm={() => handleDemoteUser(selectedUser._id)}
                          >
                            <Button icon={<ReloadOutlined />}>Demote</Button>
                          </Popconfirm>
                        )}
                        {selectedUser.isActive ? (
                          <Popconfirm
                            title="Disable user?"
                            onConfirm={() => handleDisableUser(selectedUser._id)}
                          >
                            <Button danger icon={<StopOutlined />}>
                              Disable
                            </Button>
                          </Popconfirm>
                        ) : (
                          <Button
                            type="primary"
                            onClick={() => handleEnableUser(selectedUser._id)}
                          >
                            Enable
                          </Button>
                        )}
                        <Popconfirm
                          title="Delete user?"
                          description="This action cannot be undone."
                          onConfirm={() => handleDeleteUser(selectedUser._id)}
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            Delete
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  ),
                },
                {
                  key: 'resident',
                  label: 'Resident Info',
                  children: (
                    <div style={{ padding: 24 }}>
                      {residentLoading ? (
                        <Spin />
                      ) : selectedResident ? (
                        <>
                          {/* Profile Completion Overview */}
                          <Alert
                            message="Resident Profile Overview"
                            description={
                              <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <Text strong>Profile Completion:</Text>
                                  <Text>{calculateProfileCompletion(selectedUser, selectedResident)}%</Text>
                                </div>
                                <Progress 
                                  percent={calculateProfileCompletion(selectedUser, selectedResident)} 
                                  status={calculateProfileCompletion(selectedUser, selectedResident) === 100 ? 'success' : 'active'}
                                />
                              </div>
                            }
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                          />
                          
                          <Tabs
                            defaultActiveKey="personal"
                            type="card"
                            items={[
                              {
                                key: 'personal',
                                label: 'Personal',
                                children: (
                                  <Descriptions column={1} size="small" bordered>
                                    <Descriptions.Item label="Full Name">
                                      {`${selectedResident.firstName || ''} ${selectedResident.middleName || ''} ${selectedResident.lastName || ''}`.trim() ||
                                        ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Email">
                                      {selectedResident.email ||
                                        selectedUser.email ||
                                        ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Contact Number">
                                      {selectedResident.contactNumber || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Landline">
                                      {selectedResident.landlineNumber || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Address">
                                      {selectedResident.address || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Birth Date">
                                      {selectedResident.birthDate
                                        ? dayjs(selectedResident.birthDate).format(
                                            'MMM DD, YYYY'
                                          )
                                        : ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Age">
                                      {selectedResident.age || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Gender">
                                      {selectedResident.sex ||
                                        selectedResident.gender ||
                                        ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Civil Status">
                                      {selectedResident.civilStatus || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Nationality">
                                      {selectedResident.nationality || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Religion">
                                      {selectedResident.religion || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Place of Birth">
                                      {selectedResident.placeOfBirth || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Date of Residency">
                                      {selectedResident.dateOfResidency
                                        ? dayjs(selectedResident.dateOfResidency).format('MMM DD, YYYY')
                                        : ' - '}
                                    </Descriptions.Item>
                                  </Descriptions>
                                ),
                              },
                              {
                                key: 'family',
                                label: 'Family',
                                children: (
                                  <Descriptions column={1} size="small" bordered>
                                    <Descriptions.Item label="Spouse">
                                      {selectedResident.spouseName
                                        ? `${selectedResident.spouseName} ${selectedResident.spouseLastName || ''}`
                                        : ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Children">
                                      {selectedResident.numberOfChildren ??
                                        ' - '}{' '}
                                      child(ren)
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Father">
                                      {selectedResident.fatherName || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Mother">
                                      {selectedResident.motherName || ' - '}
                                    </Descriptions.Item>
                                  </Descriptions>
                                ),
                              },
                              {
                                key: 'identification',
                                label: 'Identification',
                                children: (
                                  <Descriptions column={1} size="small" bordered>
                                    <Descriptions.Item label="Passport">
                                      {selectedResident.passportNumber || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Gov ID">
                                      {selectedResident.governmentIdNumber ||
                                        ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="TIN">
                                      {selectedResident.tin || ' - '}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Blood Type">
                                      {selectedResident.bloodType || ' - '}
                                    </Descriptions.Item>
                                  </Descriptions>
                                ),
                              },
                            ]}
                          />
                        </>
                      ) : (
                        <Empty description="No resident information available" />
                      )}
                      {selectedResident && (
                        <Button
                          type="primary"
                          block
                          style={{ marginTop: 16 }}
                          icon={<FormOutlined />}
                          onClick={() => setEditModalOpen(true)}
                        >
                          Edit Resident Info
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Drawer>

        {/* Edit User Modal */}
        <Modal
          title="Edit User"
          open={editUserModalOpen}
          onCancel={() => setEditUserModalOpen(false)}
          onOk={async () => {
            try {
              const values = await form.validateFields();
              message.loading({ content: 'Updating...', key: 'edit' });
              await adminAPI.updateUser(selectedUser._id, values);
              message.success({ content: 'User updated', key: 'edit', duration: 2 });
              await fetchUsers();
              setEditUserModalOpen(false);
              form.resetFields();
            } catch (err) {
              console.error('Failed to update user', err);
            }
          }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={selectedUser}
            onValuesChange={(_, values) => setUserFormValues(values)}
          >
            <Form.Item
              name="fullName"
              label="Full Name"
              rules={[{ required: true, message: 'Full name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Invalid email' },
              ]}
            >
              <Input type="email" />
            </Form.Item>
            <Form.Item
              name="role"
              label="Role"
              rules={[{ required: true, message: 'Role is required' }]}
            >
              <Select options={roleOptions} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Edit Resident Modal */}
        <Modal
          title="Edit Resident Information"
          open={editModalOpen}
          onCancel={() => setEditModalOpen(false)}
          onOk={async () => {
            try {
              if (!selectedResident) return;
              const values = await editForm.validateFields();
              message.loading({ content: 'Updating...', key: 'edit-resident' });
              await adminAPI.updateResident(selectedResident._id, values);
              message.success({
                content: 'Resident updated',
                key: 'edit-resident',
                duration: 2,
              });
              await fetchResidentForUser(selectedUser);
              setEditModalOpen(false);
              editForm.resetFields();
            } catch (err) {
              console.error('Failed to update resident', err);
            }
          }}
          width={900}
          style={{ top: 20 }}
        >
          <Form
            form={editForm}
            layout="vertical"
            initialValues={selectedResident}
            onValuesChange={(_, values) => setEditFormValues(values)}
          >
            <Tabs
              defaultActiveKey="personal"
              items={[
                {
                  key: 'personal',
                  label: 'Personal Information',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'First name is required' }]}>
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="middleName" label="Middle Name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Last name is required' }]}>
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="age" label="Age">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="birthDate" label="Birth Date">
                            <DatePicker 
                              value={editForm.getFieldValue('birthDate') ? dayjs(editForm.getFieldValue('birthDate')) : null}
                              onChange={(date) => { 
                                if (date) { 
                                  const birthDate = date.format('YYYY-MM-DD'); 
                                  const age = dayjs().diff(date, 'year'); 
                                  editForm.setFieldsValue({ birthDate, age }); 
                                } else {
                                  editForm.setFieldsValue({ birthDate: '', age: undefined }); 
                                } 
                              }} 
                              disabledDate={(current) => current && current > dayjs().endOf('day')}
                              style={{ width: '100%' }}
                              placeholder="Select birth date"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="sex" label="Gender">
                            <Select options={[
                              { label: 'Male', value: 'Male' },
                              { label: 'Female', value: 'Female' },
                              { label: 'Other', value: 'Other' }
                            ]} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="civilStatus" label="Civil Status">
                            <Select options={[
                              { label: 'Single', value: 'Single' },
                              { label: 'Married', value: 'Married' },
                              { label: 'Widowed', value: 'Widowed' },
                              { label: 'Separated', value: 'Separated' },
                              { label: 'Divorced', value: 'Divorced' },
                              { label: 'Annulled', value: 'Annulled' },
                              { label: 'Domestic Partnership', value: 'Domestic Partnership' },
                              { label: 'Other', value: 'Other' }
                            ]} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="nationality" label="Nationality">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="religion" label="Religion">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="placeOfBirth" label="Place of Birth">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="dateOfResidency" label="Date of Residency">
                            <DatePicker 
                              value={editForm.getFieldValue('dateOfResidency') ? dayjs(editForm.getFieldValue('dateOfResidency')) : null}
                              onChange={(date) => { 
                                const dateOfResidency = date ? date.format('YYYY-MM-DD') : ''; 
                                editForm.setFieldsValue({ dateOfResidency }); 
                              }} 
                              disabledDate={(current) => current && current > dayjs().endOf('day')}
                              style={{ width: '100%' }}
                              placeholder="Select residency start date"
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="address" label="Address">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </div>
                  ),
                },
                {
                  key: 'contact',
                  label: 'Contact Information',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="contactNumber" label="Contact Number">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="landlineNumber" label="Landline Number">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="facebook" label="Facebook">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="emergencyContactName" label="Emergency Contact Name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="emergencyContactRelationship" label="Emergency Contact Relationship">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="emergencyContact" label="Emergency Contact Number">
                        <Input />
                      </Form.Item>
                    </div>
                  ),
                },
                {
                  key: 'professional',
                  label: 'Professional Information',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="occupation" label="Occupation">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="educationalAttainment" label="Educational Attainment">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                {
                  key: 'family',
                  label: 'Family Information',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="spouseName" label="Spouse Name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="spouseAge" label="Spouse Age">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="spouseBirthDate" label="Spouse Birth Date">
                            <Input type="date" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="spouseOccupation" label="Spouse Occupation">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="spouseStatus" label="Spouse Status">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="spouseContactNumber" label="Spouse Contact">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="spouseNationality" label="Spouse Nationality">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="numberOfChildren" label="Number of Children">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="childrenNames" label="Children Names">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="childrenAges" label="Children Ages">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Divider orientation="left">Parent Information</Divider>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="motherName" label="Mother Name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="motherAge" label="Mother Age">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="motherBirthDate" label="Mother Birth Date">
                            <Input type="date" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="motherOccupation" label="Mother Occupation">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="motherStatus" label="Mother Status">
                        <Input />
                      </Form.Item>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="fatherName" label="Father Name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="fatherAge" label="Father Age">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="fatherBirthDate" label="Father Birth Date">
                            <Input type="date" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="fatherOccupation" label="Father Occupation">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="fatherStatus" label="Father Status">
                        <Input />
                      </Form.Item>
                    </div>
                  ),
                },
                {
                  key: 'business',
                  label: 'Business Information',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="businessName" label="Business Name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="businessType" label="Business Type">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="natureOfBusiness" label="Nature of Business">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="dateEstablished" label="Date Established">
                            <Input type="date" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="businessAddress" label="Business Address">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="tin" label="TIN">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="registrationNumber" label="Registration Number">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="businessPermitNumber" label="Business Permit Number">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="barangayClearanceNumber" label="Barangay Clearance Number">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="numberOfEmployees" label="Number of Employees">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="capitalInvestment" label="Capital Investment">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="annualGrossIncome" label="Annual Gross Income">
                            <Input type="number" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="businessContactPerson" label="Contact Person">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="businessContactNumber" label="Business Contact Number">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="businessEmail" label="Business Email">
                            <Input type="email" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                {
                  key: 'additional',
                  label: 'Additional Information',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="passportNumber" label="Passport Number">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="governmentIdNumber" label="Government ID Number">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="bloodType" label="Blood Type">
                            <Select options={[
                              { label: 'A+', value: 'A+' },
                              { label: 'A-', value: 'A-' },
                              { label: 'B+', value: 'B+' },
                              { label: 'B-', value: 'B-' },
                              { label: 'O+', value: 'O+' },
                              { label: 'O-', value: 'O-' },
                              { label: 'AB+', value: 'AB+' },
                              { label: 'AB-', value: 'AB-' }
                            ]} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="disabilityStatus" label="Disability Status">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  ),
                },
              ]}
            />
          </Form>
        </Modal>
      </div>
    </ConfigProvider>
  );
};

export default UserManagement;
