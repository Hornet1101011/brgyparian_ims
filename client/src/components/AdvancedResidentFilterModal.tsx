import React, { useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, Checkbox, Slider, Button, Space, Typography, Divider, Row, Col } from 'antd';
import { FilterOutlined, ClearOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Title, Text } = Typography;

// Philippines-specific options (same as in ResidentPortal)
const PHILIPPINE_OPTIONS = {
  civilStatus: [
    'Single', 'Married', 'Widowed', 'Separated', 'Divorced', 'Annulled', 
    'Domestic Partnership', 'Common Law Marriage', 'Legally Separated'
  ],
  bloodType: [
    'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'
  ],
  education: [
    'No Formal Education', 'Elementary', 'High School', 'Vocational', 'College',
    'Bachelor\'s Degree', 'Master\'s Degree', 'Doctorate', 'Professional License'
  ],
  occupation: [
    'Student', 'Teacher', 'Engineer', 'Doctor', 'Nurse', 'Accountant', 'Lawyer',
    'Architect', 'Police Officer', 'Soldier', 'Seaman', 'OFW', 'Business Owner',
    'Farmer', 'Driver', 'Construction Worker', 'Salesperson', 'Clerk', 'Manager',
    'IT Professional', 'Government Employee', 'Private Employee', 'Freelancer',
    'Self-Employed', 'Retired', 'Unemployed', 'Homemaker'
  ],
  nationality: [
    'Filipino', 'American', 'Chinese', 'Japanese', 'Korean', 'Indian',
    'British', 'Canadian', 'Australian', 'Singaporean', 'Malaysian', 'Indonesian',
    'Thai', 'Vietnamese', 'German', 'French', 'Italian', 'Spanish', 'Other'
  ],
  religion: [
    'Roman Catholic', 'Islam', 'Iglesia ni Cristo', 'Methodist', 'Baptist',
    'Seventh-day Adventist', 'Jehovah\'s Witness', 'Buddhist', 'Hindu',
    'Aglipayan', 'United Church of Christ', 'Other Christian', 'Other'
  ],
  disabilityStatus: [
    'None', 'Physical Disability', 'Visual Impairment', 'Hearing Impairment',
    'Speech Impairment', 'Mental Disability', 'Learning Disability', 'Multiple Disabilities'
  ]
};

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
  onApplyFilters: (filters: FilterData) => void;
  initialFilters?: FilterData;
}

const AdvancedResidentFilterModal: React.FC<Props> = ({ 
  visible, 
  onClose, 
  onApplyFilters, 
  initialFilters 
}) => {
  const [form] = Form.useForm();
  const [ageRange, setAgeRange] = useState<[number, number]>([0, 100]);

  React.useEffect(() => {
    if (visible && initialFilters) {
      form.setFieldsValue({
        query: initialFilters.query,
        sex: initialFilters.filters.sex,
        civilStatus: initialFilters.filters.civilStatus,
        nationality: initialFilters.filters.nationality,
        religion: initialFilters.filters.religion,
        bloodType: initialFilters.filters.bloodType,
        occupation: initialFilters.filters.occupation,
        educationalAttainment: initialFilters.filters.educationalAttainment,
        dateOfResidencyRange: initialFilters.filters.dateOfResidencyRange ? 
          [dayjs(initialFilters.filters.dateOfResidencyRange.start), dayjs(initialFilters.filters.dateOfResidencyRange.end)] : undefined,
        hasBusiness: initialFilters.filters.hasBusiness,
        singleParent: initialFilters.filters.singleParent,
        disabilityStatus: initialFilters.filters.disabilityStatus,
        sortBy: initialFilters.sortBy,
        sortOrder: initialFilters.sortOrder
      });
      
      if (initialFilters.filters.ageRange) {
        setAgeRange([
          initialFilters.filters.ageRange.min || 0,
          initialFilters.filters.ageRange.max || 100
        ]);
      }
    } else if (visible) {
      form.resetFields();
      setAgeRange([0, 100]);
    }
  }, [visible, initialFilters, form]);

  const handleApply = () => {
    const values = form.getFieldsValue();
    
    const filterData: FilterData = {
      query: values.query || '',
      filters: {
        ...values,
        ageRange: values.ageRange ? {
          min: values.ageRange[0],
          max: values.ageRange[1]
        } : undefined,
        dateOfResidencyRange: values.dateOfResidencyRange ? {
          start: values.dateOfResidencyRange[0].format('YYYY-MM-DD'),
          end: values.dateOfResidencyRange[1].format('YYYY-MM-DD')
        } : undefined
      },
      sortBy: values.sortBy || 'lastName',
      sortOrder: values.sortOrder || 'asc'
    };

    // Clean up empty values
    Object.keys(filterData.filters).forEach(key => {
      const value = filterData.filters[key as keyof typeof filterData.filters];
      if (value === undefined || value === null || value === '') {
        delete filterData.filters[key as keyof typeof filterData.filters];
      }
    });

    onApplyFilters(filterData);
    onClose();
  };

  const handleClear = () => {
    form.resetFields();
    setAgeRange([0, 100]);
  };

  return (
    <Modal
      title={
        <Space>
          <FilterOutlined />
          <span>Advanced Resident Search</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="clear" icon={<ClearOutlined />} onClick={handleClear}>
          Clear All
        </Button>,
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="apply" type="primary" onClick={handleApply}>
          Apply Filters
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          sortBy: 'lastName',
          sortOrder: 'asc'
        }}
      >
        {/* Basic Search */}
        <Title level={5}>Basic Search</Title>
        <Form.Item name="query" label="Search in names, ID, contact info, address, occupation">
          <Input placeholder="Enter search terms..." />
        </Form.Item>

        <Divider />

        {/* Personal Information */}
        <Title level={5}>Personal Information</Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="sex" label="Sex">
              <Select placeholder="Select sex" allowClear>
                <Option value="Male">Male</Option>
                <Option value="Female">Female</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="civilStatus" label="Civil Status">
              <Select placeholder="Select civil status" allowClear>
                {PHILIPPINE_OPTIONS.civilStatus.map(status => (
                  <Option key={status} value={status}>{status}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="singleParent" valuePropName="checked">
              <Checkbox>Single Parent</Checkbox>
            </Form.Item>
          </Col>
        </Row>

        {/* Age Range */}
        <Form.Item label="Age Range">
          <Form.Item name="ageRange" noStyle>
            <Slider
              range
              min={0}
              max={100}
              value={ageRange}
              onChange={setAgeRange}
              marks={{
                0: '0',
                25: '25',
                50: '50',
                75: '75',
                100: '100'
              }}
            />
          </Form.Item>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text type="secondary">Age: {ageRange[0]} - {ageRange[1]} years</Text>
          </div>
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="nationality" label="Nationality">
              <Select mode="multiple" placeholder="Select nationalities" allowClear>
                {PHILIPPINE_OPTIONS.nationality.map(nationality => (
                  <Option key={nationality} value={nationality}>{nationality}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="religion" label="Religion">
              <Select mode="multiple" placeholder="Select religions" allowClear>
                {PHILIPPINE_OPTIONS.religion.map(religion => (
                  <Option key={religion} value={religion}>{religion}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="bloodType" label="Blood Type">
              <Select mode="multiple" placeholder="Select blood types" allowClear>
                {PHILIPPINE_OPTIONS.bloodType.map(bloodType => (
                  <Option key={bloodType} value={bloodType}>{bloodType}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="disabilityStatus" label="Disability Status">
              <Select mode="multiple" placeholder="Select disability status" allowClear>
                {PHILIPPINE_OPTIONS.disabilityStatus.map(status => (
                  <Option key={status} value={status}>{status}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        {/* Professional Information */}
        <Title level={5}>Professional Information</Title>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="occupation" label="Occupation">
              <Select mode="multiple" placeholder="Select occupations" allowClear>
                {PHILIPPINE_OPTIONS.occupation.map(occupation => (
                  <Option key={occupation} value={occupation}>{occupation}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="educationalAttainment" label="Educational Attainment">
              <Select mode="multiple" placeholder="Select education levels" allowClear>
                {PHILIPPINE_OPTIONS.education.map(education => (
                  <Option key={education} value={education}>{education}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="hasBusiness" valuePropName="checked">
          <Checkbox>Has Business Information</Checkbox>
        </Form.Item>

        <Divider />

        {/* Residency Information */}
        <Title level={5}>Residency Information</Title>
        <Form.Item name="dateOfResidencyRange" label="Date of Residency Range">
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>

        <Divider />

        {/* Sort Options */}
        <Title level={5}>Sort Options</Title>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="sortBy" label="Sort By">
              <Select>
                <Option value="lastName">Last Name</Option>
                <Option value="firstName">First Name</Option>
                <Option value="barangayID">Barangay ID</Option>
                <Option value="age">Age</Option>
                <Option value="dateOfResidency">Date of Residency</Option>
                <Option value="occupation">Occupation</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sortOrder" label="Sort Order">
              <Select>
                <Option value="asc">Ascending</Option>
                <Option value="desc">Descending</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default AdvancedResidentFilterModal;
