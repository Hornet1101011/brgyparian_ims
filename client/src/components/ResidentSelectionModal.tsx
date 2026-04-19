import React, { useState, useEffect } from 'react';
import { Modal, Input, Button, List, Avatar, Tag, Typography, Space, Pagination, Empty, Spin, Alert, Card, Row, Col } from 'antd';
import { SearchOutlined, UserOutlined, FilterOutlined, EnvironmentOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import AdvancedResidentFilterModal from './AdvancedResidentFilterModal';
import { residentsListAPI } from '../services/api';
import AvatarImage from './AvatarImage';

const { Search } = Input;
const { Text, Title } = Typography;

interface Resident {
  _id: string;
  barangayID: string;
  username?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  nameExtension?: string;
  age?: number;
  sex?: string;
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  email?: string;
  contactNumber?: string;
  address?: string;
  dateOfResidency?: string;
  businessName?: string;
  profileImage?: string;
}

interface FilterData {
  query: string;
  filters: {
    ageRange?: { min?: number; max?: number };
    sex?: string;
    civilStatus?: string;
    nationality?: string | string[];
    religion?: string | string[];
    bloodType?: string | string[];
    occupation?: string | string[];
    educationalAttainment?: string | string[];
    dateOfResidencyRange?: { start?: string; end?: string };
    hasBusiness?: boolean;
    singleParent?: boolean;
    disabilityStatus?: string | string[];
  };
  sortBy: string;
  sortOrder: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onResidentSelect: (resident: Resident) => void;
  title?: string;
  multiSelect?: boolean;
  selectedResidents?: Resident[];
}

const ResidentSelectionModal: React.FC<Props> = ({
  visible,
  onClose,
  onResidentSelect,
  title = "Select Resident",
  multiSelect = false,
  selectedResidents = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<FilterData>({
    query: '',
    filters: {},
    sortBy: 'lastName',
    sortOrder: 'asc'
  });
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedResidents.map(r => r._id));

  // Search residents
  const searchResidents = async (page = 1, filters?: FilterData) => {
    setLoading(true);
    try {
      const searchFilters = filters || currentFilters;
      const response = await residentsListAPI.searchResidents({
        ...searchFilters,
        page,
        limit: pagination.pageSize
      });

      setResidents(response.residents);
      setPagination({
        current: response.pagination.current,
        pageSize: response.pagination.pageSize,
        total: response.pagination.total,
        totalPages: response.pagination.totalPages
      });
      setCurrentFilters(response.filters);
    } catch (error) {
      console.error('Error searching residents:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial search and when modal opens
  useEffect(() => {
    if (visible) {
      searchResidents(1);
    }
  }, [visible]);

  // Handle search
  const handleSearch = (value: string) => {
    const newFilters = { ...currentFilters, query: value };
    setCurrentFilters(newFilters);
    searchResidents(1, newFilters);
  };

  // Handle advanced filters
  const handleAdvancedFilters = (filters: FilterData) => {
    setCurrentFilters(filters);
    setSearchQuery(filters.query);
    searchResidents(1, filters);
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    searchResidents(page);
  };

  // Handle resident selection
  const handleResidentClick = (resident: Resident) => {
    if (multiSelect) {
      const newSelectedIds = selectedIds.includes(resident._id)
        ? selectedIds.filter(id => id !== resident._id)
        : [...selectedIds, resident._id];
      setSelectedIds(newSelectedIds);
    } else {
      onResidentSelect(resident);
      onClose();
    }
  };

  // Get display name
  const getDisplayName = (resident: Resident) => {
    const parts = [resident.firstName, resident.middleName, resident.lastName];
    if (resident.nameExtension) parts.push(resident.nameExtension);
    return parts.filter(Boolean).join(' ');
  };

  // Render filter tags
  const renderFilterTags = () => {
    const tags = [];
    
    if (currentFilters.query) {
      tags.push(<Tag key="query" closable onClose={() => handleAdvancedFilters({ ...currentFilters, query: '' })}>Search: "{currentFilters.query}"</Tag>);
    }

    if (currentFilters.filters.ageRange) {
      const { min, max } = currentFilters.filters.ageRange;
      tags.push(<Tag key="age" closable onClose={() => handleAdvancedFilters({ ...currentFilters, filters: { ...currentFilters.filters, ageRange: undefined } })}>Age: {min || '0'} - {max || '100+'}</Tag>);
    }

    if (currentFilters.filters.sex) {
      tags.push(<Tag key="sex" closable onClose={() => handleAdvancedFilters({ ...currentFilters, filters: { ...currentFilters.filters, sex: undefined } })}>Sex: {currentFilters.filters.sex}</Tag>);
    }

    if (currentFilters.filters.civilStatus) {
      tags.push(<Tag key="civilStatus" closable onClose={() => handleAdvancedFilters({ ...currentFilters, filters: { ...currentFilters.filters, civilStatus: undefined } })}>Civil Status: {currentFilters.filters.civilStatus}</Tag>);
    }

    if (currentFilters.filters.occupation) {
      const occupations = Array.isArray(currentFilters.filters.occupation) 
        ? currentFilters.filters.occupation 
        : [currentFilters.filters.occupation];
      tags.push(<Tag key="occupation" closable onClose={() => handleAdvancedFilters({ ...currentFilters, filters: { ...currentFilters.filters, occupation: undefined } })}>Occupation: {occupations.join(', ')}</Tag>);
    }

    if (currentFilters.filters.hasBusiness !== undefined) {
      tags.push(<Tag key="hasBusiness" closable onClose={() => handleAdvancedFilters({ ...currentFilters, filters: { ...currentFilters.filters, hasBusiness: undefined } })}>Has Business: {currentFilters.filters.hasBusiness ? 'Yes' : 'No'}</Tag>);
    }

    if (currentFilters.filters.singleParent !== undefined) {
      tags.push(<Tag key="singleParent" closable onClose={() => handleAdvancedFilters({ ...currentFilters, filters: { ...currentFilters.filters, singleParent: undefined } })}>Single Parent: {currentFilters.filters.singleParent ? 'Yes' : 'No'}</Tag>);
    }

    return tags;
  };

  return (
    <>
      <Modal
        title={title}
        open={visible}
        onCancel={onClose}
        width={900}
        footer={multiSelect ? [
          <Button key="cancel" onClick={onClose}>Cancel</Button>,
          <Button 
            key="select" 
            type="primary" 
            onClick={() => {
              const selected = residents.filter(r => selectedIds.includes(r._id));
              onResidentSelect(selected as any);
              onClose();
            }}
            disabled={selectedIds.length === 0}
          >
            Select {selectedIds.length} Resident{selectedIds.length !== 1 ? 's' : ''}
          </Button>
        ] : [
          <Button key="cancel" onClick={onClose}>Cancel</Button>
        ]}
      >
        {/* Search and Filter Controls */}
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Row gutter={8} align="middle">
            <Col flex="auto">
              <Search
                placeholder="Search residents by name, ID, contact info..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onSearch={handleSearch}
                style={{ width: '100%' }}
              />
            </Col>
            <Col>
              <Button
                icon={<FilterOutlined />}
                onClick={() => setShowAdvancedFilters(true)}
                type={Object.keys(currentFilters.filters).length > 0 ? 'primary' : 'default'}
              >
                Advanced Filters
              </Button>
            </Col>
          </Row>

          {/* Active Filters Display */}
          {renderFilterTags().length > 0 && (
            <div>
              <Text strong>Active Filters:</Text>
              <div style={{ marginTop: 8 }}>
                <Space wrap>
                  {renderFilterTags()}
                </Space>
              </div>
            </div>
          )}

          {/* Results Summary */}
          <div>
            <Text type="secondary">
              Found {pagination.total} resident{pagination.total !== 1 ? 's' : ''}
              {pagination.total > pagination.pageSize && ` (Page ${pagination.current} of ${pagination.totalPages})`}
            </Text>
          </div>
        </Space>

        {/* Residents List */}
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : residents.length === 0 ? (
            <Empty
              description="No residents found"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <List
              dataSource={residents}
              renderItem={(resident) => {
                const isSelected = selectedIds.includes(resident._id);
                return (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      padding: '12px 16px',
                      backgroundColor: isSelected ? '#f0f8ff' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                      border: isSelected ? '2px solid #1890ff' : '1px solid #f0f0f0'
                    }}
                    onClick={() => handleResidentClick(resident)}
                  >
                    <List.Item.Meta
                      avatar={
                        <AvatarImage 
                          user={{ profileImage: resident.profileImage }} 
                          size={48}
                        />
                      }
                      title={
                        <Space>
                          <Text strong>{getDisplayName(resident)}</Text>
                          {resident.sex && <Tag size="small">{resident.sex}</Tag>}
                          {resident.age && <Tag size="small">{resident.age}y</Tag>}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Space wrap>
                            <Text type="secondary"><EnvironmentOutlined /> {resident.barangayID}</Text>
                            {resident.contactNumber && <Text type="secondary"><PhoneOutlined /> {resident.contactNumber}</Text>}
                            {resident.email && <Text type="secondary"><MailOutlined /> {resident.email}</Text>}
                          </Space>
                          {resident.occupation && (
                            <Text type="secondary">Occupation: {resident.occupation}</Text>
                          )}
                          {resident.businessName && (
                            <Tag color="green">Business: {resident.businessName}</Tag>
                          )}
                          {resident.address && (
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              {resident.address}
                            </Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Pagination
              current={pagination.current}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onChange={handlePageChange}
              showSizeChanger={false}
              showQuickJumper
              showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} residents`}
            />
          </div>
        )}
      </Modal>

      {/* Advanced Filter Modal */}
      <AdvancedResidentFilterModal
        visible={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        onApplyFilters={handleAdvancedFilters}
        initialFilters={currentFilters}
      />
    </>
  );
};

export default ResidentSelectionModal;
