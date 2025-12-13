/**
 * Example Integration Components
 * Demonstrates how to use the analytics data fetching and normalization system
 */

import React, { useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Spin,
  Empty,
  Statistic,
  Table,
  Space,
  Button,
  DatePicker,
  Select,
  Input,
  Tag,
  Progress,
  Tooltip,
} from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { Moment } from 'moment';

import {
  useMultipleAnalytics,
  useDashboardSummary,
  useAnalyticsFilters,
  useAnalyticsSearch,
  useAnalyticsExport,
  usePersonalInfoRecords,
  useDebouncedAnalyticsFilters,
} from '../../hooks/useAnalytics';
import type { AnalyticsDataPoint } from '../../utils/dataNormalization';

const { RangePicker } = DatePicker;

// ============================================================================
// Example 1: Simple Analytics Dashboard
// ============================================================================

/**
 * Basic dashboard showing multiple analytics with filters
 */
export const SimpleAnalyticsDashboard: React.FC = () => {
  const { filters, setFilter, clearFilters } = useAnalyticsFilters();
  const debouncedFilters = useDebouncedAnalyticsFilters(filters, 500);
  
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(debouncedFilters);
  
  const { data, isLoading, isError } = useMultipleAnalytics(
    ['gender', 'age', 'occupation', 'education'],
    debouncedFilters
  );
  
  if (isError) {
    return <Empty description="Failed to load analytics data" />;
  }
  
  return (
    <div>
      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <Space wrap>
          <RangePicker
            onChange={(dates) => {
              if (dates) {
                setFilter('startDate', dates[0]?.format('YYYY-MM-DD'));
                setFilter('endDate', dates[1]?.format('YYYY-MM-DD'));
              }
            }}
          />
          <Select
            placeholder="Select Barangay"
            style={{ width: 200 }}
            onChange={(value) => setFilter('barangayID', value)}
            allowClear
          >
            <Select.Option value="brgy-001">Barangay 1</Select.Option>
            <Select.Option value="brgy-002">Barangay 2</Select.Option>
          </Select>
          <Button onClick={clearFilters}>Reset Filters</Button>
        </Space>
      </Card>
      
      {/* Summary Statistics */}
      {summaryLoading ? (
        <Spin />
      ) : (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Residents"
                value={summary?.totalResidents || 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Average Age"
                value={summary?.avgAge || 0}
                suffix="years"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Business Owners"
                value={summary?.businessOwners || 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Data Quality"
                value={summary?.dataQuality || 0}
                suffix="%"
              />
            </Card>
          </Col>
        </Row>
      )}
      
      {/* Analytics Cards */}
      {isLoading ? (
        <Spin />
      ) : (
        <Row gutter={16}>
          {Object.entries(data).map(([chartId, analytics]) => (
            <Col key={chartId} xs={24} md={12} lg={8}>
              <AnalyticsCard
                title={chartId.replace('-', ' ').toUpperCase()}
                data={(analytics as any)?.data || []}
                quality={(analytics as any)?.metadata?.dataQuality}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

// ============================================================================
// Example 2: Analytics Card Component
// ============================================================================

interface AnalyticsCardProps {
  title: string;
  data: AnalyticsDataPoint[];
  quality?: 'high' | 'medium' | 'low';
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({ title, data, quality }) => {
  const qualityColor = {
    high: '#52c41a',
    medium: '#faad14',
    low: '#f5222d',
  };
  
  return (
    <Card
      title={title}
      extra={
        quality && (
          <Tooltip title={`Data Quality: ${quality}`}>
            <Tag color={qualityColor[quality]}>
              {quality.toUpperCase()}
            </Tag>
          </Tooltip>
        )
      }
      loading={!data}
    >
      {data.length === 0 ? (
        <Empty description="No data available" />
      ) : (
        <div>
          {data.slice(0, 5).map((item) => (
            <div key={item.type} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{item.type}</span>
                <span>
                  {item.value} {item.percentage && `(${item.percentage}%)`}
                </span>
              </div>
              {item.percentage && (
                <Progress percent={item.percentage} size="small" showInfo={false} />
              )}
            </div>
          ))}
          {data.length > 5 && (
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              +{data.length - 5} more items
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// ============================================================================
// Example 3: Searchable Residents Table
// ============================================================================

export const SearchableResidentsTable: React.FC = () => {
  const { data: records, isLoading } = usePersonalInfoRecords();
  const { searchQuery, setSearchQuery, filters, setFilters, filteredRecords } =
    useAnalyticsSearch(records);
  const { exportAsCSV, isExporting } = useAnalyticsExport();
  
  const columns = [
    {
      title: 'Name',
      dataIndex: 'firstName',
      key: 'name',
      render: (text: string, record: any) => `${record.firstName} ${record.lastName}`,
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
    },
    {
      title: 'Sex',
      dataIndex: 'sex',
      key: 'sex',
      render: (text: string) => text || 'N/A',
    },
    {
      title: 'Occupation',
      dataIndex: 'occupation',
      key: 'occupation',
      render: (text: string) => text || 'N/A',
    },
    {
      title: 'Contact',
      dataIndex: 'contactNumber',
      key: 'contact',
      render: (text: string) => text || 'N/A',
    },
  ];
  
  const handleExport = () => {
    const data = filteredRecords.map((record: any) => ({
      firstName: record.firstName,
      lastName: record.lastName,
      age: record.age,
      sex: record.sex,
      occupation: record.occupation,
      email: record.email,
      contactNumber: record.contactNumber,
      barangayID: record.barangayID,
    }));
    
    exportAsCSV(
      data,
      ['firstName', 'lastName', 'age', 'sex', 'occupation', 'email', 'contactNumber', 'barangayID'],
      'residents.csv'
    );
  };
  
  return (
    <Card title="Residents Directory">
      <Space style={{ marginBottom: 16, width: '100%' }} wrap>
        <Input.Search
          placeholder="Search by name, email, phone..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 300 }}
        />
        <Select
          placeholder="Filter by Gender"
          style={{ width: 150 }}
          onChange={(value) => setFilters({ ...filters, sex: value })}
          allowClear
        >
          <Select.Option value="Male">Male</Select.Option>
          <Select.Option value="Female">Female</Select.Option>
        </Select>
        <Button
          icon={<DownloadOutlined />}
          onClick={handleExport}
          loading={isExporting}
        >
          Export CSV
        </Button>
      </Space>
      
      <Table
        columns={columns}
        dataSource={filteredRecords}
        loading={isLoading}
        rowKey="_id"
        pagination={{ pageSize: 20 }}
      />
    </Card>
  );
};

// ============================================================================
// Example 4: Data Quality Report
// ============================================================================

export const DataQualityReport: React.FC = () => {
  const { data: records, isLoading } = usePersonalInfoRecords();
  
  const qualityMetrics = useMemo(() => {
    if (!records || records.length === 0) {
      return {};
    }
    
    const fields = [
      'firstName',
      'lastName',
      'email',
      'contactNumber',
      'age',
      'sex',
      'occupation',
      'educationalAttainment',
      'businessName',
    ];
    
    const metrics: Record<string, number> = {};
    
    fields.forEach(field => {
      const validCount = records.filter((r: any) => {
        const value = r[field as keyof typeof r];
        return value !== null && value !== undefined && String(value).trim() !== '';
      }).length;
      
      metrics[field] = Math.round((validCount / records.length) * 100);
    });
    
    return metrics;
  }, [records]);
  
  if (isLoading) return <Spin />;
  
  return (
    <Card title="Data Quality Report">
      {Object.entries(qualityMetrics).map(([field, quality]) => (
        <div key={field} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ textTransform: 'capitalize' }}>
              {field.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span>{quality}%</span>
          </div>
          <Progress
            percent={quality}
            status={quality >= 80 ? 'success' : quality >= 50 ? 'normal' : 'exception'}
            showInfo={false}
          />
        </div>
      ))}
    </Card>
  );
};

// ============================================================================
// Example 5: Advanced Filter Panel
// ============================================================================

export const AdvancedFilterPanel: React.FC<{
  onFiltersChange: (filters: any) => void;
}> = ({ onFiltersChange }) => {
  const [dateRange, setDateRange] = useState<[Moment | null, Moment | null] | null>(null);
  const [barangayID, setBarangayID] = useState<string | undefined>();
  const [residentType, setResidentType] = useState<string | undefined>();
  
  React.useEffect(() => {
    const filters: any = {};
    if (dateRange) {
      filters.startDate = dateRange[0]?.format('YYYY-MM-DD');
      filters.endDate = dateRange[1]?.format('YYYY-MM-DD');
    }
    if (barangayID) filters.barangayID = barangayID;
    if (residentType) filters.residentType = residentType;
    
    onFiltersChange(filters);
  }, [dateRange, barangayID, residentType, onFiltersChange]);
  
  return (
    <Card title="Advanced Filters" style={{ marginBottom: 24 }}>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <label>Date Range</label>
          <RangePicker
            value={dateRange as any}
            onChange={(dates) => setDateRange(dates as any)}
            style={{ width: '100%' }}
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <label>Barangay</label>
          <Select
            placeholder="Select Barangay"
            value={barangayID}
            onChange={setBarangayID}
            allowClear
            style={{ width: '100%' }}
          >
            <Select.Option value="brgy-001">Barangay 1</Select.Option>
            <Select.Option value="brgy-002">Barangay 2</Select.Option>
            <Select.Option value="brgy-003">Barangay 3</Select.Option>
          </Select>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <label>Resident Type</label>
          <Select
            placeholder="Select Type"
            value={residentType}
            onChange={setResidentType}
            allowClear
            style={{ width: '100%' }}
          >
            <Select.Option value="active">Active</Select.Option>
            <Select.Option value="inactive">Inactive</Select.Option>
            <Select.Option value="temporary">Temporary</Select.Option>
          </Select>
        </Col>
      </Row>
    </Card>
  );
};

// ============================================================================
// Example 6: Complete Dashboard Component
// ============================================================================

export const CompleteAnalyticsDashboard: React.FC = () => {
  const [filters, setFilters] = useState<any>({});
  const debouncedFilters = useDebouncedAnalyticsFilters(filters, 500);
  
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(debouncedFilters);
  const { data: analyticsData, isLoading: analyticsLoading } = useMultipleAnalytics(
    [
      'gender',
      'age',
      'occupation',
      'nationality',
      'blood-type',
      'disability',
      'education',
      'business-type',
    ],
    debouncedFilters
  );
  
  return (
    <div>
      {/* Filter Panel */}
      <AdvancedFilterPanel onFiltersChange={setFilters} />
      
      {/* Summary Cards */}
      {summaryLoading ? (
        <Spin />
      ) : (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Residents"
                value={summary?.totalResidents || 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Male"
                value={summary?.maleCount || 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Female"
                value={summary?.femaleCount || 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Avg Age"
                value={summary?.avgAge || 0}
              />
            </Card>
          </Col>
        </Row>
      )}
      
      {/* Analytics Grid */}
      {analyticsLoading ? (
        <Spin />
      ) : (
        <Row gutter={16}>
          {Object.entries(analyticsData).map(([chartId, analytics]) => (
            <Col key={chartId} xs={24} md={12} lg={8}>
              <AnalyticsCard
                title={chartId.replace('-', ' ').toUpperCase()}
                data={(analytics as any)?.data || []}
                quality={(analytics as any)?.metadata?.dataQuality}
              />
            </Col>
          ))}
        </Row>
      )}
      
      {/* Data Quality Section */}
      <div style={{ marginTop: 24 }}>
        <DataQualityReport />
      </div>
      
      {/* Residents Table */}
      <div style={{ marginTop: 24 }}>
        <SearchableResidentsTable />
      </div>
    </div>
  );
};

export default CompleteAnalyticsDashboard;
