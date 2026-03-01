import React, { useEffect, useState } from 'react';
import './DocumentRequestForm.css';
import { documentsAPI, axiosInstance } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTemplateValidations } from '../hooks/useTemplateValidations';
import { FileWordOutlined, MoreOutlined, EyeOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { 
  Card, 
  Row, 
  Col, 
  Typography, 
  Input, 
  Select, 
  Tooltip, 
  Button, 
  Space,
  Breadcrumb,
  
  message,
  Modal,
  Form,
  Empty,
  DatePicker,
  List,
  Divider,
  Tag
} from 'antd';
// upload icon already imported above

const { Title, Text } = Typography;
const { Search } = Input;

interface FormValues {
  purpose: string;
  // fields may contain strings or date objects (dayjs) before serialization
  fields: Record<string, any>;
}

interface ResidentProfile {
  _id: string;
  username: string;
  email: string;
  address: string;
  contactNumber: string;
  barangayID: string;
  role: string;
  fullName?: string;
  verified?: boolean;
}

interface PersonalInfo {
  barangayID?: string;
  spouseMiddleName?: string;
  spouseLastName?: string;
  middleName?: string;
  nationality?: string;
  placeOfBirth?: string;
  religion?: string;
  maritalStatus?: string;
  passportNumber?: string;
  governmentIdNumber?: string;
  bloodType?: string;
  disabilityStatus?: string;
  occupation?: string;
  educationalAttainment?: string;
  numberOfChildren?: number;
  childrenNames?: string;
  childrenAges?: string;
  spouseNationality?: string;
  spouseContactNumber?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  businessName?: string;
  businessType?: string;
  natureOfBusiness?: string;
  businessAddress?: string;
  dateEstablished?: string;
  tin?: string;
  registrationNumber?: string;
  businessPermitNumber?: string;
  barangayClearanceNumber?: string;
  numberOfEmployees?: number;
  capitalInvestment?: number;
  annualGrossIncome?: number;
  businessContactPerson?: string;
  businessContactNumber?: string;
  businessEmail?: string;
  firstName: string;
  lastName: string;
  age?: number;
  birthDate?: string;
  dateOfResidency?: string;
  sex?: string;
  civilStatus?: string;
  facebook?: string;
  contactNumber?: string;
  emergencyContact?: string;
  landlineNumber?: string;
  spouseName?: string;
  spouseAge?: number;
  spouseBirthDate?: string;
  spouseOccupation?: string;
  spouseStatus?: string;
  motherName?: string;
  motherAge?: number;
  motherBirthDate?: string;
  motherOccupation?: string;
  motherStatus?: string;
  fatherName?: string;
  fatherAge?: number;
  fatherBirthDate?: string;
  fatherOccupation?: string;
  fatherStatus?: string;
}

interface FileData {
  _id: string;
  filename: string;
  length: number;
  uploadDate: string;
  category?: string;
}

const DocumentRequestForm: React.FC = () => {
  // State management
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDocName, setModalDocName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type'>('name');
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  
  // Load validations for selected template
  const { getValidation, validateField } = useTemplateValidations(selectedTemplateId || '');
  

  const { user: authUser } = useAuth();
  // currentUser will be resolved inside handlers when needed

  // Authoritative profile from server (preferred source of truth for verification)
  const [profile, setProfile] = useState<ResidentProfile | null>(() => {
    try {
      const stored = localStorage.getItem('userProfile');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);

  // Fetch authoritative profile on mount and keep it up to date
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await axiosInstance.get('/resident/profile');
        if (mounted && resp && resp.data) {
          setProfile(resp.data);
          try { localStorage.setItem('userProfile', JSON.stringify(resp.data)); } catch (e) {}
        }
      } catch (err) {
        // ignore fetch errors; we'll fallback to token-decoded user
      }

      // Also fetch personal info
      try {
        const personalInfoResp = await axiosInstance.get('/resident/personal-info');
        if (mounted && personalInfoResp && personalInfoResp.data) {
          setPersonalInfo(personalInfoResp.data);
        }
      } catch (err) {
        // ignore fetch errors
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Prefer `profile.verified` when available; fall back to `authUser.verified`.
  const userIsResidentUnverified = Boolean(
    authUser && (authUser as any).role === 'resident' && !((profile && (profile.verified === true)) || ((authUser as any).verified === true))
  );

  // Verification popups disabled while the feature is paused

  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      try {
        const data = await documentsAPI.listFiles();
        setFiles(data);
      } catch (error) {
        message.error('Failed to fetch document templates');
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
    // pending verification checks are disabled while feature is paused
  }, []);

  const handleCardClick = async (file: FileData) => {
    if (userIsResidentUnverified) {
      setShowVerifyModal(true);
      return;
    }
    // If resident and not verified, normally we'd prompt for verification.
    // That behavior is currently disabled while verification is paused.
    setSelectedTemplateId(file._id);
    setModalDocName(file.filename.replace(/\.docx$/i, ''));
    try {
      const api = await import('../services/api');
      const res = await api.axiosPublic.get(`/documents/preview/${file._id}`, { params: { format: 'html' }, responseType: 'text' });
      const html = res && res.data ? res.data : '';
      const regex = /\{(.*?)\}/g;
      const fields: string[] = [];
      let match;
      while ((match = regex.exec(html)) !== null) {
        fields.push(match[1].trim());
      }
      // Hide QR field from the request form — it is generated server-side
      const visibleFields = fields.filter(f => f && f.toLowerCase() !== 'qr');
      setSelectedFields(visibleFields);
      const initialValues: Record<string, string> = {};
      // compute current date parts
      const now = new Date();
      const day = now.getDate();
      const monthNum = now.getMonth() + 1;
      const monthName = now.toLocaleString(undefined, { month: 'long' });
      const year = now.getFullYear();
      const mm = String(monthNum).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const currentDateFormatted = `${mm}/${dd}/${year}`;

      visibleFields.forEach(f => {
        // default empty
        initialValues[f] = '';
        // auto-fill common "current" fields
        if (/^current(day|dayof)?$/i.test(f) || /currentday/i.test(f)) {
          initialValues[f] = String(day);
        } else if (/current(month)?$/i.test(f) || /currentmonth/i.test(f)) {
          // put human-readable month name
          initialValues[f] = monthName;
        } else if (/current(year)?$/i.test(f) || /currentyear/i.test(f)) {
          initialValues[f] = String(year);
        } else if (/currentdate|current_date|current date|dateofrequest|requesteddate/i.test(f)) {
          // unified date field
          initialValues[f] = currentDateFormatted;
        }
      });
      setFieldValues(initialValues);
      setModalOpen(true);
    } catch (error) {
      message.error('Failed to load document preview');
      setSelectedFields([]);
      setFieldValues({});
    }
  };

  // Minimal action buttons with tooltips for each document card
  const handleView = async (file: FileData) => {
    if (userIsResidentUnverified) {
      setShowVerifyModal(true);
      return;
    }
    setSelectedTemplateId(file._id);
    setModalDocName(file.filename.replace(/\.docx$/i, ''));
    try {
      const api = await import('../services/api');
      const res = await api.axiosPublic.get(`/documents/preview/${file._id}`, { params: { format: 'html' }, responseType: 'text' });
      const html = res && res.data ? res.data : '';
      const regex = /\{(.*?)\}/g;
      const fields: string[] = [];
      let match;
      while ((match = regex.exec(html)) !== null) {
        fields.push(match[1].trim());
      }
      const visibleFields = fields.filter(f => f && f.toLowerCase() !== 'qr');
      setSelectedFields(visibleFields);
      const initialValues: Record<string, string> = {};
      const now = new Date();
      const day = now.getDate();
      const monthNum = now.getMonth() + 1;
      const monthName = now.toLocaleString(undefined, { month: 'long' });
      const year = now.getFullYear();
      const mm = String(monthNum).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const currentDateFormatted = `${mm}/${dd}/${year}`;

      visibleFields.forEach(f => {
        initialValues[f] = '';
        if (/^current(day|dayof)?$/i.test(f) || /currentday/i.test(f)) {
          initialValues[f] = String(day);
        } else if (/current(month)?$/i.test(f) || /currentmonth/i.test(f)) {
          initialValues[f] = monthName;
        } else if (/current(year)?$/i.test(f) || /currentyear/i.test(f)) {
          initialValues[f] = String(year);
        } else if (/currentdate|current_date|current date|dateofrequest|requesteddate/i.test(f)) {
          initialValues[f] = currentDateFormatted;
        }
      });
      setFieldValues(initialValues);
      setModalOpen(true);
    } catch (error) {
      message.error('Failed to load document preview');
      setSelectedFields([]);
      setFieldValues({});
    }
  };

  const handleDownload = (file: FileData) => {
    try {
      const link = document.createElement('a');
      link.href = `/api/documents/file/${file._id}`;
      link.download = file.filename;
      link.click();
      message.success('Document downloaded');
    } catch (error) {
      message.error('Failed to download document');
    }
  };

  // Filter and sort files for display
  const filteredFiles = files
    .filter(file => {
      // Hide generated/processed copies from the templates list so only
      // the canonical templates are shown in the UI. Generated files saved
      // by the server often use names like `filled_<id>.docx` or a
      // transaction-code-style name that starts with the year (e.g. `2025-...`).
      // Exclude those patterns here so generated copies remain only in the
      // `processed_documents` bucket and don't appear in the templates grid.
      const fname = file.filename || '';
      // Exclude obvious filled/generate file names
      if (/^filled_/i.test(fname)) return false;
      // Exclude filenames that start with a year-like transaction code
      if (/^\d{4}-/.test(fname)) return false;

      const name = fname.toLowerCase();
      const search = searchTerm.toLowerCase();
      const categoryMatch = selectedCategory === 'all' || file.category === selectedCategory;
      return name.includes(search) && categoryMatch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
        case 'type':
          return a.filename.split('.').pop()?.localeCompare(b.filename.split('.').pop() || '') || 0;
        default:
          return a.filename.localeCompare(b.filename);
      }
    });

  return (
    <div style={{ padding: '16px', minHeight: '100vh', background: 'linear-gradient(135deg, #e3f6fd 0%, #b3e0ff 60%, #b3e0ff 100%)' }}>
      {/* Main Container */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 248, 255, 0.95) 100%)',
        borderRadius: 16,
        padding: '40px',
        boxShadow: '0 20px 60px rgba(64, 201, 255, 0.1), 0 8px 32px rgba(64, 201, 255, 0.075), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        border: '2px solid rgba(64, 201, 255, 0.3)',
        backdropFilter: 'blur(10px)',
        minHeight: 'calc(100vh - 32px)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Shiny Gradient Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(64, 201, 255, 0.1) 50%, transparent 100%)',
          borderRadius: '16px 16px 50% 0',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        {/* Content Wrapper */}
        <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header Section */}
        <Row justify="start" align="middle" style={{ marginBottom: 32 }}>
          <Col style={{ textAlign: 'left' }}>
            <Breadcrumb 
              items={[
                { title: 'Home' },
                { title: 'Documents' },
                { title: 'Request' }
              ]}
              style={{ marginBottom: 12, fontSize: 13, color: '#999' }}
            />
            <Title level={2} style={{ 
              margin: 0, 
              textAlign: 'left',
              background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontSize: 36,
              fontWeight: 700
            }}>
              Request Document
            </Title>
            <Text style={{ display: 'block', marginTop: 8, color: '#666', fontSize: 14 }}>
              Browse and request official documents from the Barangay
            </Text>
          </Col>
        </Row>

      {/* Filters Section */}
      <Row gutter={16} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={12} md={10} lg={8}>
          <Search
            placeholder="Search documents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
            className="document-search"
          />
        </Col>
        <Col xs={24} sm={12} md={14} lg={16}>
          <div className="filter-controls">
            <Select
              value={selectedCategory}
              className="filter-select category-select"
              style={{ minWidth: 200 }}
              onChange={value => setSelectedCategory(value)}
            >
              <Select.Option value="all">All Categories</Select.Option>
              <Select.Option value="personal">Personal Documents</Select.Option>
              <Select.Option value="business">Business Documents</Select.Option>
              <Select.Option value="certificates">Certificates</Select.Option>
            </Select>
            <Select
              value={sortBy}
              className="filter-select sort-select"
              style={{ minWidth: 160 }}
              onChange={value => setSortBy(value as 'name' | 'date' | 'type')}
            >
              <Select.Option value="name">Sort by Name</Select.Option>
              <Select.Option value="date">Sort by Date</Select.Option>
              <Select.Option value="type">Sort by Type</Select.Option>
            </Select>
          </div>
        </Col>
      </Row>

      {/* Documents Grid */}
      <Row gutter={[24, 24]}>
          {loading ? (
          <Col span={24} style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ fontSize: 16, color: '#666' }}>Loading documents...</div>
          </Col>
        ) : filteredFiles.length === 0 ? (
          <Col span={24} style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ fontSize: 16, color: '#666' }}>No documents found</div>
          </Col>
        ) : (
          filteredFiles.map((file) => {
            const blocked = userIsResidentUnverified;
            return (
            <Col xs={24} sm={12} md={8} lg={6} key={file._id}>
              <Card
                hoverable={!blocked}
                className="document-card"
                style={{ 
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: 12,
                  opacity: blocked ? 0.65 : 1,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  background: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 4px 12px rgba(64, 201, 255, 0.1)'
                }}
                styles={{ body: { padding: 16 } }}
                onClick={() => { if (!blocked) handleCardClick(file); else setShowVerifyModal(true); }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ 
                    width: 40, 
                    height: 40, 
                    background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    flexShrink: 0
                  }}>
                    <FileWordOutlined style={{ fontSize: 20, color: '#fff' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ 
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 14,
                      color: '#333'
                    }}>
                      {file.filename.replace(/\.docx$/i, '')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, color: '#999' }}>
                      {new Date(file.uploadDate).toLocaleDateString()} · {Math.round(file.length / 1024)} KB
                    </Text>
                  </div>
                  {blocked ? null : null}
                </div>
              </Card>
            </Col>
            );
          })
        )}
      </Row>
        </div>
      </div>

      {/* Document Request Modal */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={900}
        footer={null}
        title={
          <div style={{ 
            background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontSize: 20,
            fontWeight: 600,
            margin: 0
          }}>
            Request Document: {modalDocName}
          </div>
        }
        modalRender={(modal) => (
          <div className="document-request-modal-wrapper">
            {modal}
          </div>
        )}
      >
        {selectedFields.length === 0 ? (
          <Empty description="No fields found in this template" />
        ) : (
          <Form
            layout="vertical"
            initialValues={{ fields: fieldValues }}
            onFinish={async (values: FormValues) => {
              setSubmitLoading(true);
              try {
                const processedFields: Record<string, any> = { ...values.fields };
                Object.entries(processedFields).forEach(([k, v]) => {
                  if (v && typeof (v as any).format === 'function') {
                    try { processedFields[k] = (v as any).format('MM/DD/YYYY'); } catch (e) { processedFields[k] = String(v); }
                  }
                });

                const payload = {
                  type: modalDocName,
                  documentType: modalDocName,
                  purpose: values.purpose,
                  fileId: files.find((f) => f.filename.replace(/\.docx$/i, '') === modalDocName)?._id,
                  fieldValues: processedFields,
                  username: (authUser && authUser.username) || undefined,
                  barangayID: (authUser && authUser.barangayID) || undefined
                };
                await documentsAPI.requestDocument(payload);
                message.success('Request submitted successfully!');
                // Dispatch custom event so Dashboard and other components can refresh
                window.dispatchEvent(new CustomEvent('documentRequestCreated', { detail: payload }));
                setModalOpen(false);
              } catch (err) {
                message.error('Failed to submit request.');
              } finally {
                setSubmitLoading(false);
              }
            }}
            className="document-request-form"
          >
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Form.Item
                  name="purpose"
                  label={<span style={{ fontWeight: 600, color: '#333' }}>Purpose <span style={{ color: '#ff4d4f' }}>*</span></span>}
                  rules={[{ required: true, message: 'Please enter the purpose' }]}
                >
                  <Input.TextArea 
                    rows={4} 
                    placeholder="Enter the purpose of your request"
                    className="document-request-input"
                  />
                </Form.Item>
              </Col>

              {selectedFields.map((field, idx) => {
                const fieldValidation = getValidation(field);
                const isDate = /date|dob|birth|issued/i.test(field);
                
                return (
                <Col xs={24} sm={12} key={idx}>
                  <Form.Item
                    name={['fields', field]}
                    label={
                      <span style={{ fontWeight: 600, color: '#333' }}>
                        {field} 
                        {fieldValidation?.isRequired && <span style={{ color: '#ff4d4f' }}>*</span>}
                        {fieldValidation?.tooltip && (
                          <Tooltip title={fieldValidation.tooltip}>
                            <span style={{ marginLeft: 8, color: '#1890ff', cursor: 'help' }}>ℹ️</span>
                          </Tooltip>
                        )}
                      </span>
                    }
                    rules={[
                      { required: fieldValidation?.isRequired || true, message: `Please enter ${field}` },
                      {
                        validator: (_, value) => {
                          if (!value) return Promise.resolve();
                          const result = validateField(field, value);
                          if (!result.valid) {
                            return Promise.reject(new Error(result.error));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    {isDate ? 
                      <DatePicker 
                        style={{ width: '100%' }} 
                        format="MM/DD/YYYY"
                        className="document-request-input"
                        disabled={fieldValidation?.disabled}
                        readOnly={fieldValidation?.readOnly}
                      /> 
                      : 
                      <Input 
                        placeholder={`Enter ${field}`}
                        className="document-request-input"
                        maxLength={fieldValidation?.maxCharacters}
                        disabled={fieldValidation?.disabled}
                        readOnly={fieldValidation?.readOnly}
                      /> 
                    }
                  </Form.Item>
                </Col>
                );
              })}

              <Col span={24} style={{ textAlign: 'right', marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                <Space size="large" wrap>
                  <Button 
                    icon={<InfoCircleOutlined />}
                    onClick={() => setShowInfoModal(true)}
                    style={{ marginRight: 'auto' }}
                  >
                    Available Information
                  </Button>
                  <Space>
                    <Button 
                      onClick={() => setModalOpen(false)}
                      size="large"
                      style={{ minWidth: 120 }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="primary" 
                      htmlType="submit" 
                      loading={submitLoading}
                      size="large"
                      style={{ 
                        minWidth: 120,
                        background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
                        borderColor: 'transparent'
                      }}
                    >
                      Submit Request
                    </Button>
                  </Space>
                </Space>
              </Col>
            </Row>
          </Form>
        )}
      </Modal>

      {/* Available Information Modal */}
      <Modal
        open={showInfoModal}
        onCancel={() => setShowInfoModal(false)}
        width={700}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setShowInfoModal(false)}>Close</Button>
            <Button 
              type="primary"
              onClick={() => {
                // Copy basic information
                const textToCopy = `${personalInfo?.firstName || ''} ${personalInfo?.lastName || ''} ${personalInfo?.middleName || ''}\n${personalInfo?.contactNumber || ''}`.trim();
                navigator.clipboard.writeText(textToCopy).then(() => {
                  message.success('Basic information copied!');
                }).catch(() => {
                  message.error('Failed to copy information');
                });
              }}
            >
              Copy Basic Info
            </Button>
          </div>
        }
        title={
          <div style={{ 
            background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontSize: 18,
            fontWeight: 600,
            margin: 0
          }}>
            <InfoCircleOutlined style={{ marginRight: 8 }} />
            Available Resident Information
          </div>
        }
        modalRender={(modal) => (
          <div className="available-info-modal-wrapper">
            {modal}
          </div>
        )}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {profile || personalInfo ? (
            <div>
              {/* Profile Section */}
              {profile && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Account Information</h3>
                    <List
                      className="info-list"
                      dataSource={[
                        profile.fullName ? { label: 'Full Name', value: profile.fullName } : null,
                        profile.username ? { label: 'Username', value: profile.username } : null,
                        profile.email ? { label: 'Email', value: profile.email } : null,
                        profile.contactNumber ? { label: 'Contact Number', value: profile.contactNumber } : null,
                        profile.barangayID ? { label: 'Barangay ID', value: profile.barangayID } : null,
                        profile.address ? { label: 'Address', value: profile.address } : null,
                      ].filter(Boolean)}
                      renderItem={(item) => (
                        <List.Item className="info-list-item">
                          <List.Item.Meta
                            title={
                              <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                {item!.label}
                              </span>
                            }
                            description={
                              <span style={{ color: '#666', fontSize: 13 }}>
                                {item!.value}
                              </span>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  </div>
                  <Divider style={{ margin: '16px 0' }} />
                </>
              )}

              {/* Personal Information Section */}
              {personalInfo && (
                <>
                  {/* Basic Information */}
                  {(personalInfo.firstName || personalInfo.lastName || personalInfo.age || personalInfo.birthDate || 
                    personalInfo.sex || personalInfo.civilStatus || personalInfo.nationality || personalInfo.religion) && (
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Basic Information</h3>
                      <List
                        className="info-list"
                        dataSource={[
                          personalInfo.firstName ? { label: 'First Name', value: personalInfo.firstName } : null,
                          personalInfo.lastName ? { label: 'Last Name', value: personalInfo.lastName } : null,
                          personalInfo.middleName ? { label: 'Middle Name', value: personalInfo.middleName } : null,
                          personalInfo.age ? { label: 'Age', value: personalInfo.age } : null,
                          personalInfo.birthDate ? { label: 'Date of Birth', value: new Date(personalInfo.birthDate).toLocaleDateString() } : null,
                          personalInfo.sex ? { label: 'Sex', value: personalInfo.sex } : null,
                          personalInfo.civilStatus ? { label: 'Civil Status', value: personalInfo.civilStatus } : null,
                          personalInfo.nationality ? { label: 'Nationality', value: personalInfo.nationality } : null,
                          personalInfo.placeOfBirth ? { label: 'Place of Birth', value: personalInfo.placeOfBirth } : null,
                          personalInfo.religion ? { label: 'Religion', value: personalInfo.religion } : null,
                        ].filter(Boolean)}
                        renderItem={(item) => (
                          <List.Item className="info-list-item">
                            <List.Item.Meta
                              title={
                                <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                  {item!.label}
                                </span>
                              }
                              description={
                                <span style={{ color: '#666', fontSize: 13 }}>
                                  {item!.value}
                                </span>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    </div>
                  )}

                  {/* Contact Information */}
                  {(personalInfo.contactNumber || personalInfo.landlineNumber || personalInfo.facebook || personalInfo.emergencyContact || 
                    personalInfo.emergencyContactName || personalInfo.emergencyContactRelationship) && (
                    <>
                      <Divider style={{ margin: '16px 0' }} />
                      <div style={{ marginBottom: 20 }}>
                        <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Contact Information</h3>
                        <List
                          className="info-list"
                          dataSource={[
                            personalInfo.contactNumber ? { label: 'Contact Number', value: personalInfo.contactNumber } : null,
                            personalInfo.landlineNumber ? { label: 'Landline Number', value: personalInfo.landlineNumber } : null,
                            personalInfo.facebook ? { label: 'Facebook', value: personalInfo.facebook } : null,
                            personalInfo.emergencyContactName ? { label: 'Emergency Contact Name', value: personalInfo.emergencyContactName } : null,
                            personalInfo.emergencyContactRelationship ? { label: 'Emergency Contact Relationship', value: personalInfo.emergencyContactRelationship } : null,
                            personalInfo.emergencyContact ? { label: 'Emergency Contact', value: personalInfo.emergencyContact } : null,
                          ].filter(Boolean)}
                          renderItem={(item) => (
                            <List.Item className="info-list-item">
                              <List.Item.Meta
                                title={
                                  <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                    {item!.label}
                                  </span>
                                }
                                description={
                                  <span style={{ color: '#666', fontSize: 13 }}>
                                    {item!.value}
                                  </span>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {/* Professional Information */}
                  {(personalInfo.occupation || personalInfo.educationalAttainment) && (
                    <>
                      <Divider style={{ margin: '16px 0' }} />
                      <div style={{ marginBottom: 20 }}>
                        <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Professional Information</h3>
                        <List
                          className="info-list"
                          dataSource={[
                            personalInfo.occupation ? { label: 'Occupation', value: personalInfo.occupation } : null,
                            personalInfo.educationalAttainment ? { label: 'Educational Attainment', value: personalInfo.educationalAttainment } : null,
                          ].filter(Boolean)}
                          renderItem={(item) => (
                            <List.Item className="info-list-item">
                              <List.Item.Meta
                                title={
                                  <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                    {item!.label}
                                  </span>
                                }
                                description={
                                  <span style={{ color: '#666', fontSize: 13 }}>
                                    {item!.value}
                                  </span>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {/* Family Information */}
                  {(personalInfo.spouseName || personalInfo.spouseAge || personalInfo.spouseBirthDate || personalInfo.spouseOccupation || 
                    personalInfo.spouseStatus || personalInfo.spouseContactNumber || personalInfo.spouseNationality || personalInfo.spouseMiddleName || 
                    personalInfo.spouseLastName || personalInfo.numberOfChildren || personalInfo.childrenNames || personalInfo.childrenAges) && (
                    <>
                      <Divider style={{ margin: '16px 0' }} />
                      <div style={{ marginBottom: 20 }}>
                        <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Family Information</h3>
                        <List
                          className="info-list"
                          dataSource={[
                            personalInfo.spouseName ? { label: 'Spouse Name', value: personalInfo.spouseName } : null,
                            personalInfo.spouseAge ? { label: 'Spouse Age', value: personalInfo.spouseAge } : null,
                            personalInfo.spouseBirthDate ? { label: 'Spouse Date of Birth', value: new Date(personalInfo.spouseBirthDate).toLocaleDateString() } : null,
                            personalInfo.spouseOccupation ? { label: 'Spouse Occupation', value: personalInfo.spouseOccupation } : null,
                            personalInfo.spouseStatus ? { label: 'Spouse Status', value: personalInfo.spouseStatus } : null,
                            personalInfo.spouseContactNumber ? { label: 'Spouse Contact Number', value: personalInfo.spouseContactNumber } : null,
                            personalInfo.spouseNationality ? { label: 'Spouse Nationality', value: personalInfo.spouseNationality } : null,
                            personalInfo.numberOfChildren ? { label: 'Number of Children', value: personalInfo.numberOfChildren } : null,
                            personalInfo.childrenNames ? { label: 'Children Names', value: personalInfo.childrenNames } : null,
                            personalInfo.childrenAges ? { label: 'Children Ages', value: personalInfo.childrenAges } : null,
                            personalInfo.motherName ? { label: 'Mother Name', value: personalInfo.motherName } : null,
                            personalInfo.motherAge ? { label: 'Mother Age', value: personalInfo.motherAge } : null,
                            personalInfo.motherBirthDate ? { label: 'Mother Date of Birth', value: new Date(personalInfo.motherBirthDate).toLocaleDateString() } : null,
                            personalInfo.motherOccupation ? { label: 'Mother Occupation', value: personalInfo.motherOccupation } : null,
                            personalInfo.motherStatus ? { label: 'Mother Status', value: personalInfo.motherStatus } : null,
                            personalInfo.fatherName ? { label: 'Father Name', value: personalInfo.fatherName } : null,
                            personalInfo.fatherAge ? { label: 'Father Age', value: personalInfo.fatherAge } : null,
                            personalInfo.fatherBirthDate ? { label: 'Father Date of Birth', value: new Date(personalInfo.fatherBirthDate).toLocaleDateString() } : null,
                            personalInfo.fatherOccupation ? { label: 'Father Occupation', value: personalInfo.fatherOccupation } : null,
                            personalInfo.fatherStatus ? { label: 'Father Status', value: personalInfo.fatherStatus } : null,
                          ].filter(Boolean)}
                          renderItem={(item) => (
                            <List.Item className="info-list-item">
                              <List.Item.Meta
                                title={
                                  <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                    {item!.label}
                                  </span>
                                }
                                description={
                                  <span style={{ color: '#666', fontSize: 13 }}>
                                    {item!.value}
                                  </span>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {/* Business Information */}
                  {(personalInfo.businessName || personalInfo.businessType || personalInfo.natureOfBusiness || personalInfo.businessAddress || 
                    personalInfo.dateEstablished || personalInfo.tin || personalInfo.registrationNumber || personalInfo.businessPermitNumber || 
                    personalInfo.barangayClearanceNumber || personalInfo.numberOfEmployees || personalInfo.capitalInvestment || 
                    personalInfo.annualGrossIncome || personalInfo.businessContactPerson || personalInfo.businessContactNumber || 
                    personalInfo.businessEmail) && (
                    <>
                      <Divider style={{ margin: '16px 0' }} />
                      <div style={{ marginBottom: 20 }}>
                        <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Business Information</h3>
                        <List
                          className="info-list"
                          dataSource={[
                            personalInfo.businessName ? { label: 'Business Name', value: personalInfo.businessName } : null,
                            personalInfo.businessType ? { label: 'Business Type', value: personalInfo.businessType } : null,
                            personalInfo.natureOfBusiness ? { label: 'Nature of Business', value: personalInfo.natureOfBusiness } : null,
                            personalInfo.businessAddress ? { label: 'Business Address', value: personalInfo.businessAddress } : null,
                            personalInfo.dateEstablished ? { label: 'Date Established', value: new Date(personalInfo.dateEstablished).toLocaleDateString() } : null,
                            personalInfo.tin ? { label: 'TIN', value: personalInfo.tin } : null,
                            personalInfo.registrationNumber ? { label: 'Registration Number', value: personalInfo.registrationNumber } : null,
                            personalInfo.businessPermitNumber ? { label: 'Business Permit Number', value: personalInfo.businessPermitNumber } : null,
                            personalInfo.barangayClearanceNumber ? { label: 'Barangay Clearance Number', value: personalInfo.barangayClearanceNumber } : null,
                            personalInfo.numberOfEmployees ? { label: 'Number of Employees', value: personalInfo.numberOfEmployees } : null,
                            personalInfo.capitalInvestment ? { label: 'Capital Investment', value: `₱${personalInfo.capitalInvestment.toLocaleString()}` } : null,
                            personalInfo.annualGrossIncome ? { label: 'Annual Gross Income', value: `₱${personalInfo.annualGrossIncome.toLocaleString()}` } : null,
                            personalInfo.businessContactPerson ? { label: 'Contact Person', value: personalInfo.businessContactPerson } : null,
                            personalInfo.businessContactNumber ? { label: 'Contact Number', value: personalInfo.businessContactNumber } : null,
                            personalInfo.businessEmail ? { label: 'Email', value: personalInfo.businessEmail } : null,
                          ].filter(Boolean)}
                          renderItem={(item) => (
                            <List.Item className="info-list-item">
                              <List.Item.Meta
                                title={
                                  <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                    {item!.label}
                                  </span>
                                }
                                description={
                                  <span style={{ color: '#666', fontSize: 13 }}>
                                    {item!.value}
                                  </span>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {/* Identification & Health Information */}
                  {(personalInfo.passportNumber || personalInfo.governmentIdNumber || personalInfo.bloodType || 
                    personalInfo.disabilityStatus || personalInfo.dateOfResidency) && (
                    <>
                      <Divider style={{ margin: '16px 0' }} />
                      <div style={{ marginBottom: 20 }}>
                        <h3 style={{ color: '#333', fontWeight: 600, marginBottom: 12, fontSize: 16 }}>Additional Information</h3>
                        <List
                          className="info-list"
                          dataSource={[
                            personalInfo.passportNumber ? { label: 'Passport Number', value: personalInfo.passportNumber } : null,
                            personalInfo.governmentIdNumber ? { label: 'Government ID Number', value: personalInfo.governmentIdNumber } : null,
                            personalInfo.bloodType ? { label: 'Blood Type', value: personalInfo.bloodType } : null,
                            personalInfo.disabilityStatus ? { label: 'Disability Status', value: personalInfo.disabilityStatus } : null,
                            personalInfo.dateOfResidency ? { label: 'Date of Residency', value: new Date(personalInfo.dateOfResidency).toLocaleDateString() } : null,
                          ].filter(Boolean)}
                          renderItem={(item) => (
                            <List.Item className="info-list-item">
                              <List.Item.Meta
                                title={
                                  <span style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>
                                    {item!.label}
                                  </span>
                                }
                                description={
                                  <span style={{ color: '#666', fontSize: 13 }}>
                                    {item!.value}
                                  </span>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <Empty description="Loading resident information..." />
          )}
        </div>
        <Divider />
        <div style={{ textAlign: 'right' }}>
          <Button 
            type="primary" 
            onClick={() => setShowInfoModal(false)}
            style={{ 
              background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
              borderColor: 'transparent'
            }}
          >
            Close
          </Button>
        </div>
      </Modal>

      {/* Modal prompting unverified resident to verify their profile */}
      <Modal
        open={showVerifyModal}
        onCancel={() => setShowVerifyModal(false)}
        title="Verification required"
        footer={[
          <Button key="cancel" onClick={() => setShowVerifyModal(false)}>Close</Button>,
          <Button key="profile" type="primary" onClick={() => { setShowVerifyModal(false); window.location.href = '/profile'; }}>Go to Profile</Button>
        ]}
      >
        <p>To request documents you must verify your resident profile. Please visit your profile page and complete the verification steps to unlock this service.</p>
      </Modal>
    </div>
  );
};

export default DocumentRequestForm;