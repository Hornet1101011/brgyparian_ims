import React, { useState } from 'react';
import { Button, Tooltip, Upload, message, Card, Spin, Empty, Modal, Space, Select, Form, Input, Divider, Tag, Typography } from 'antd';
import { UploadOutlined, EyeOutlined, DownloadOutlined, DeleteOutlined, FileWordOutlined, CloudUploadOutlined, SettingOutlined, SettingFilled } from '@ant-design/icons';
import { axiosInstance, axiosPublic } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import TemplateValidationConfig from './TemplateValidationConfig';
import styles from './TemplatesManager.module.css';

const getLabel = (filename?: string) =>
  filename ? filename.replace(/_/g, " ").replace(/\.docx$/, "") : "Untitled";

// Resident profile field mappings for autofill
const RESIDENT_PROFILE_FIELDS = {
  // Basic Information
  'firstName': { label: 'First Name', category: 'Basic Information' },
  'lastName': { label: 'Last Name', category: 'Basic Information' },
  'middleName': { label: 'Middle Name', category: 'Basic Information' },
  'fullName': { label: 'Full Name', category: 'Basic Information' },
  'age': { label: 'Age', category: 'Basic Information' },
  'birthDate': { label: 'Birth Date', category: 'Basic Information' },
  'dateOfResidency': { label: 'Date of Residency', category: 'Basic Information' },
  'sex': { label: 'Sex', category: 'Basic Information' },
  'civilStatus': { label: 'Civil Status', category: 'Basic Information' },
  'nationality': { label: 'Nationality', category: 'Basic Information' },
  'placeOfBirth': { label: 'Place of Birth', category: 'Basic Information' },
  'religion': { label: 'Religion', category: 'Basic Information' },
  'bloodType': { label: 'Blood Type', category: 'Basic Information' },
  
  // Contact Information
  'email': { label: 'Email', category: 'Contact Information' },
  'contactNumber': { label: 'Contact Number', category: 'Contact Information' },
  'landlineNumber': { label: 'Landline Number', category: 'Contact Information' },
  'emergencyContact': { label: 'Emergency Contact', category: 'Contact Information' },
  'emergencyContactName': { label: 'Emergency Contact Name', category: 'Contact Information' },
  'emergencyContactRelationship': { label: 'Emergency Contact Relationship', category: 'Contact Information' },
  
  // Address Information
  'address': { label: 'Address', category: 'Address Information' },
  'barangayID': { label: 'Barangay ID', category: 'Address Information' },
  
  // Family Information
  'spouseName': { label: 'Spouse Name', category: 'Family Information' },
  'spouseAge': { label: 'Spouse Age', category: 'Family Information' },
  'spouseBirthDate': { label: 'Spouse Birth Date', category: 'Family Information' },
  'spouseMiddleName': { label: 'Spouse Middle Name', category: 'Family Information' },
  'spouseLastName': { label: 'Spouse Last Name', category: 'Family Information' },
  'spouseOccupation': { label: 'Spouse Occupation', category: 'Family Information' },
  'spouseStatus': { label: 'Spouse Status', category: 'Family Information' },
  'spouseNationality': { label: 'Spouse Nationality', category: 'Family Information' },
  'spouseContactNumber': { label: 'Spouse Contact Number', category: 'Family Information' },
  'motherName': { label: 'Mother Name', category: 'Family Information' },
  'motherAge': { label: 'Mother Age', category: 'Family Information' },
  'motherBirthDate': { label: 'Mother Birth Date', category: 'Family Information' },
  'motherOccupation': { label: 'Mother Occupation', category: 'Family Information' },
  'motherStatus': { label: 'Mother Status', category: 'Family Information' },
  'fatherName': { label: 'Father Name', category: 'Family Information' },
  'fatherAge': { label: 'Father Age', category: 'Family Information' },
  'fatherBirthDate': { label: 'Father Birth Date', category: 'Family Information' },
  'fatherOccupation': { label: 'Father Occupation', category: 'Family Information' },
  'fatherStatus': { label: 'Father Status', category: 'Family Information' },
  'numberOfChildren': { label: 'Number of Children', category: 'Family Information' },
  'childrenNames': { label: 'Children Names', category: 'Family Information' },
  'childrenAges': { label: 'Children Ages', category: 'Family Information' },
  
  // Business Information
  'businessName': { label: 'Business Name', category: 'Business Information' },
  'businessType': { label: 'Business Type', category: 'Business Information' },
  'natureOfBusiness': { label: 'Nature of Business', category: 'Business Information' },
  'businessAddress': { label: 'Business Address', category: 'Business Information' },
  'dateEstablished': { label: 'Date Established', category: 'Business Information' },
  'tin': { label: 'TIN', category: 'Business Information' },
  'registrationNumber': { label: 'Registration Number', category: 'Business Information' },
  'businessPermitNumber': { label: 'Business Permit Number', category: 'Business Information' },
  'barangayClearanceNumber': { label: 'Barangay Clearance Number', category: 'Business Information' },
  'numberOfEmployees': { label: 'Number of Employees', category: 'Business Information' },
  'capitalInvestment': { label: 'Capital Investment', category: 'Business Information' },
  'annualGrossIncome': { label: 'Annual Gross Income', category: 'Business Information' },
  'businessContactPerson': { label: 'Business Contact Person', category: 'Business Information' },
  'businessContactNumber': { label: 'Business Contact Number', category: 'Business Information' },
  'businessEmail': { label: 'Business Email', category: 'Business Information' },
  
  // Additional Fields
  'facebook': { label: 'Facebook', category: 'Additional Information' },
  'passportNumber': { label: 'Passport Number', category: 'Additional Information' },
  'governmentIdNumber': { label: 'Government ID Number', category: 'Additional Information' },
  'disabilityStatus': { label: 'Disability Status', category: 'Additional Information' },
  'occupation': { label: 'Occupation', category: 'Additional Information' },
  'educationalAttainment': { label: 'Educational Attainment', category: 'Additional Information' },
};

// Composite field options (combinations of basic fields)
const COMPOSITE_FIELDS = {
  'firstName + middleName + lastName': { label: 'First Name + Middle Name + Last Name', fields: ['firstName', 'middleName', 'lastName'] },
  'lastName + firstName': { label: 'Last Name, First Name', fields: ['lastName', 'firstName'] },
  'lastName, firstName + middleName': { label: 'Last Name, First Name + Middle Name', fields: ['lastName', 'firstName', 'middleName'] },
  'firstName + lastName': { label: 'First Name + Last Name', fields: ['firstName', 'lastName'] },
  'barangayID + fullName': { label: 'Barangay ID + Full Name', fields: ['barangayID', 'fullName'] },
  'address + barangayID': { label: 'Address + Barangay ID', fields: ['address', 'barangayID'] },
};

const TemplatesManager: React.FC = () => {
  const { user } = useAuth();
  const isStaff = user?.role === 'staff';
  const [templateList, setTemplateList] = useState<any[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [validationConfigVisible, setValidationConfigVisible] = useState(false);
  const [selectedTemplateForValidation, setSelectedTemplateForValidation] = useState<any>(null);
  
  // Autofill states
  const [autofillModalVisible, setAutofillModalVisible] = useState(false);
  const [selectedTemplateForAutofill, setSelectedTemplateForAutofill] = useState<any>(null);
  const [templatePlaceholders, setTemplatePlaceholders] = useState<string[]>([]);
  const [placeholderMappings, setPlaceholderMappings] = useState<Record<string, string>>({});
  const [autofillForm] = Form.useForm();

  // Function to extract placeholders from template content
  const extractPlaceholders = async (templateId: string): Promise<string[]> => {
    try {
      const res = await axiosPublic.get(`/documents/preview/${templateId}?format=html`, { responseType: 'text' });
      const htmlContent = res.data || '';
      
      // Extract placeholders from HTML content
      // Common placeholder patterns: {{placeholder}}, [placeholder], {placeholder}, etc.
      const placeholderPatterns = [
        /\{\{([^}]+)\}\}/g,  // {{placeholder}}
        /\[([^\]]+)\]/g,     // [placeholder]
        /\{([^}]+)\}/g,      // {placeholder}
        /\$\{([^}]+)\}/g,    // ${placeholder}
      ];
      
      const placeholders = new Set<string>();
      
      placeholderPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(htmlContent)) !== null) {
          placeholders.add(match[1].trim());
        }
      });
      
      return Array.from(placeholders);
    } catch (err) {
      console.error('Failed to extract placeholders:', err);
      return [];
    }
  };

  // Function to handle autofill setup
  const handleAutofillSetup = async (template: any) => {
    setLoading(true);
    try {
      const placeholders = await extractPlaceholders(template._id);
      setTemplatePlaceholders(placeholders);
      
      // Initialize mappings with existing ones if any
      const initialMappings: Record<string, string> = {};
      placeholders.forEach(placeholder => {
        initialMappings[placeholder] = '';
      });
      setPlaceholderMappings(initialMappings);
      
      setSelectedTemplateForAutofill(template);
      setAutofillModalVisible(true);
    } catch (err) {
      message.error('Failed to load template placeholders');
    } finally {
      setLoading(false);
    }
  };

  // Function to save autofill mappings
  const handleSaveAutofillMappings = async () => {
    try {
      const mappings = autofillForm.getFieldsValue();
      
      // Save mappings to backend (server route expects template id before segment)
      await axiosInstance.post(`/templates/${selectedTemplateForAutofill._id}/autofill-mappings`, {
        mappings
      });
      
      message.success('Autofill mappings saved successfully');
      setAutofillModalVisible(false);
      setSelectedTemplateForAutofill(null);
      setTemplatePlaceholders([]);
      setPlaceholderMappings({});
      autofillForm.resetFields();
    } catch (err) {
      message.error('Failed to save autofill mappings');
    }
  };

  React.useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      setError(null);
        try {
          const res = await axiosPublic.get('/documents/list');
          setTemplateList(res.data || []);
        } catch (err) {
          setError('Could not load templates.');
        }
      setLoading(false);
    };
    fetchTemplates();
  }, []);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #fafbfc 0%, #f5f8fc 100%)',
      padding: '16px'
    }}>
      {/* Shiny Container */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        border: '1px solid rgba(24, 144, 255, 0.1)',
        padding: '24px'
      }}>
        <Spin spinning={loading} tip="Loading templates...">
          <div className={styles.wrapper}>
        {/* Header Section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(114, 46, 209, 0.35)',
              flexShrink: 0
            }}>
              <FileWordOutlined style={{ fontSize: 32, color: '#ffffff' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>Templates Manager</h2>
              <p style={{ margin: '8px 0 0 0', background: 'linear-gradient(90deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 13, fontWeight: 600 }}>Manage and organize document templates</p>
            </div>
          </div>

          {/* Error Messages */}
          {error && (
            <Card
              style={{
                background: 'linear-gradient(135deg, #fff2f0 0%, #ffebe6 50%, #ffe7e6 100%)',
                border: '2px solid #ff7875',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
                boxShadow: '0 4px 16px rgba(255, 77, 79, 0.15)'
              }}
            >
              <div style={{ color: '#cf1322', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>❌</span>
                {error}
              </div>
            </Card>
          )}
          {downloadError && (
            <Card
              style={{
                background: 'linear-gradient(135deg, #fff2f0 0%, #ffebe6 50%, #ffe7e6 100%)',
                border: '2px solid #ff7875',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
                boxShadow: '0 4px 16px rgba(255, 77, 79, 0.15)'
              }}
            >
              <div style={{ color: '#cf1322', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>❌</span>
                {downloadError}
              </div>
            </Card>
          )}
        </div>

        {/* Templates Grid */}
        {templateList.length === 0 ? (
          <Card
            style={{
              borderRadius: 14,
              border: '2px dashed rgba(114, 46, 209, 0.4)',
              boxShadow: '0 6px 24px rgba(114, 46, 209, 0.12)',
              background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
              padding: 60,
              textAlign: 'center'
            }}
          >
            <div style={{ color: '#722ed1' }}>
              <FileWordOutlined style={{ fontSize: 56, color: '#722ed1', marginBottom: 16, display: 'block', opacity: 0.6 }} />
            </div>
            <h3 style={{ background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Templates Yet</h3>
            <p style={{ color: '#9ca3af', marginBottom: 24, fontSize: 13, fontWeight: 500 }}>Upload your first document template to get started</p>
          </Card>
        ) : (
          <div className={styles.grid}>
            {templateList.filter((file: any) => file && file.filename).map((file: any) => (
              <Card
                key={file._id}
                hoverable
                className={`${styles.card} ${styles.cardAnimation}`}
                style={{
                  border: '1px solid rgba(24, 144, 255, 0.12)',
                  boxShadow: '0 2px 12px rgba(24, 144, 255, 0.08)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  overflow: 'hidden',
                  height: '100%',
                  background: '#ffffff'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 12px 32px rgba(24, 144, 255, 0.18)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(24, 144, 255, 0.08)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
                  {/* Template Header */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(114, 46, 209, 0.25)'
                    }}>
                      <FileWordOutlined style={{ fontSize: 28, color: '#ffffff' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: '#1f2937',
                        marginBottom: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {getLabel(file.filename)}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: '#9ca3af',
                        fontWeight: 500
                      }}>
                        📄 {file.filename}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className={styles.actions}>
                    <Tooltip title="Preview Template">
                      <Button
                        size="middle"
                        icon={<EyeOutlined />}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setPreviewId(file._id);
                          try {
                            const res = await axiosPublic.get(`/documents/preview/${file._id}?format=html`, { responseType: 'text' });
                            setHtmlContent(res.data || '');
                            setPreviewModalVisible(true);
                          } catch (err) {
                            setHtmlContent('<div style="color:red;padding:20px;text-align:center;">Failed to load preview.</div>');
                            setPreviewModalVisible(true);
                          }
                        }}
                        className={styles.actionButton}
                        style={{ borderRadius: 8, borderColor: 'rgba(24, 144, 255, 0.3)' }}
                      >
                        Preview
                      </Button>
                    </Tooltip>
                    {!isStaff && (
                      <Tooltip title="Configure Validations">
                        <Button
                          size="middle"
                          icon={<SettingOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTemplateForValidation(file);
                            setValidationConfigVisible(true);
                          }}
                          className={styles.actionButton}
                          style={{ borderRadius: 8, borderColor: 'rgba(102, 126, 234, 0.3)' }}
                        >
                          Configure
                        </Button>
                      </Tooltip>
                    )}
                    {!isStaff && (
                      <Tooltip title="Setup Autofill">
                        <Button
                          size="middle"
                          icon={<SettingFilled />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleAutofillSetup(file);
                          }}
                          className={styles.actionButton}
                          style={{ borderRadius: 8, borderColor: 'rgba(82, 196, 26, 0.3)' }}
                        >
                          Autofill
                        </Button>
                      </Tooltip>
                    )}
                    {!isStaff && (
                      <Tooltip title="Download Template">
                        <Button
                          type="primary"
                          size="middle"
                          icon={<DownloadOutlined />}
                          onClick={async () => {
                            setDownloadError(null);
                            try {
                              const res = await axiosInstance.get(`/documents/original/${file._id}`, { responseType: 'blob' });
                              const blob = res.data;
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = file.filename;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              window.URL.revokeObjectURL(url);
                              message.success('✅ Template downloaded');
                            } catch (err) {
                              setDownloadError(`Failed to download ${file.filename}`);
                              message.error('Download failed');
                            }
                          }}
                          className={styles.actionButton}
                          style={{ borderRadius: 8, background: 'linear-gradient(135deg, #52c41a 0%, #13c2c2 100%)', border: 'none', fontWeight: 600 }}
                        >
                          Download
                        </Button>
                      </Tooltip>
                    )}
                    {!isStaff && (
                      <Tooltip title="Delete Template">
                        <Button
                          danger
                          size="middle"
                          icon={<DeleteOutlined />}
                          onClick={async () => {
                            Modal.confirm({
                              title: '🗑️ Delete Template',
                              content: `Are you sure you want to delete "${getLabel(file.filename)}"? This action cannot be undone.`,
                              okText: 'Delete',
                              okType: 'danger',
                              cancelText: 'Cancel',
                              onOk: async () => {
                                setLoading(true);
                                setError(null);
                                try {
                                  const res = await axiosInstance.delete(`/documents/file/${file._id}`);
                                  const data = res.data;
                                  if (data && data.success) {
                                    const resList = await axiosPublic.get('/documents/list');
                                    setTemplateList(resList.data || []);
                                    message.success('Template deleted successfully');
                                  } else {
                                    setError('Delete failed.');
                                    message.error('Delete failed');
                                  }
                                } catch (err) {
                                  setError('Delete failed.');
                                  message.error('Delete failed');
                                }
                                setLoading(false);
                              }
                            });
                          }}
                          className={styles.actionButton}
                          style={{ borderRadius: 8, borderColor: 'rgba(255, 77, 79, 0.3)' }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Preview Modal */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: '#1f2937' }}>
              <EyeOutlined style={{ color: '#1890ff', fontSize: 18 }} />
              Template Preview
            </div>
          }
          open={previewModalVisible}
          onCancel={() => {
            setPreviewModalVisible(false);
            setPreviewId(null);
            setHtmlContent('');
          }}
          footer={[
            <Button 
              key="close" 
              onClick={() => {
                setPreviewModalVisible(false);
                setPreviewId(null);
                setHtmlContent('');
              }}
              style={{ borderRadius: 8 }}
            >
              Close
            </Button>
          ]}
          width={860}
          bodyStyle={{ maxHeight: '75vh', overflowY: 'auto', padding: '24px' }}
          style={{ borderRadius: 12 }}
          centered
        >
          {htmlContent ? (
            <div 
              style={{
                background: '#ffffff',
                padding: 20,
                borderRadius: 10,
                border: '1px solid rgba(24, 144, 255, 0.1)',
                boxShadow: '0 2px 8px rgba(24, 144, 255, 0.08)'
              }}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : (
            <Spin tip="Loading preview..." />
          )}
        </Modal>

        {/* Upload Section */}
        {!isStaff && (
        <div style={{ marginTop: 36 }}>
          <Card
            style={{
              borderRadius: 12,
              border: '2px dashed rgba(114, 46, 209, 0.5)',
              background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
              textAlign: 'center',
              padding: '48px 24px',
              boxShadow: '0 4px 20px rgba(114, 46, 209, 0.12)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(114, 46, 209, 0.8)';
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(114, 46, 209, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(114, 46, 209, 0.5)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(114, 46, 209, 0.12)';
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(114, 46, 209, 0.3)'
              }}>
                <CloudUploadOutlined style={{ fontSize: 44, color: '#ffffff' }} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 8px 0', background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 18, fontWeight: 700 }}>
                  📤 Upload New Template
                </h3>
                <p style={{ margin: 0, color: '#9ca3af', fontSize: 13, fontWeight: 500 }}>
                  Drag and drop your .docx files or click to browse
                </p>
              </div>
              <Upload
                accept=".docx"
                showUploadList={false}
                customRequest={async ({ file, onSuccess, onError }) => {
                  setLoading(true);
                  setError(null);
                  const formData = new FormData();
                  formData.append('file', file);
                  try {
                    const res = await axiosInstance.post('/documents/upload', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    const data = res.data;
                    if (data && data.success) {
                      const resList = await axiosPublic.get('/documents/list');
                      setTemplateList(resList.data || []);
                      message.success('✅ Template uploaded successfully');
                      onSuccess && onSuccess('ok');
                    } else {
                      setError('Upload failed.');
                      message.error('Upload failed');
                      onError && onError(new Error('Upload failed'));
                    }
                  } catch (err) {
                    setError('Upload failed.');
                    message.error('Upload failed');
                    onError && onError(new Error('Upload failed'));
                  }
                  setLoading(false);
                }}
              >
                <Button 
                  type="primary"
                  size="large"
                  icon={<UploadOutlined />}
                  style={{
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
                    fontSize: 14,
                    fontWeight: 600,
                    height: 44,
                    paddingInline: 32,
                    border: 'none',
                    boxShadow: '0 6px 20px rgba(114, 46, 209, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  Choose File to Upload
                </Button>
              </Upload>
            </div>
          </Card>
        </div>
        )}
      </div>

      {/* Validation Config Modal */}
      <Modal
        title="Template Validation Configuration"
        open={validationConfigVisible}
        onCancel={() => {
          setValidationConfigVisible(false);
          setSelectedTemplateForValidation(null);
        }}
        footer={null}
        width={900}
        bodyStyle={{ maxHeight: '80vh', overflowY: 'auto' }}
      >
        {selectedTemplateForValidation && (
          <TemplateValidationConfig
            templateId={selectedTemplateForValidation._id}
            templateName={getLabel(selectedTemplateForValidation.filename)}
            onClose={() => {
              setValidationConfigVisible(false);
              setSelectedTemplateForValidation(null);
            }}
            onSave={() => {
              // Optionally refresh the template list
            }}
          />
        )}
      </Modal>

      {/* Autofill Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: '#1f2937' }}>
            <SettingFilled style={{ color: '#52c41a', fontSize: 18 }} />
            Setup Autofill Mappings
          </div>
        }
        open={autofillModalVisible}
        onCancel={() => {
          setAutofillModalVisible(false);
          setSelectedTemplateForAutofill(null);
          setTemplatePlaceholders([]);
          setPlaceholderMappings({});
          autofillForm.resetFields();
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setAutofillModalVisible(false);
              setSelectedTemplateForAutofill(null);
              setTemplatePlaceholders([]);
              setPlaceholderMappings({});
              autofillForm.resetFields();
            }}
            style={{ borderRadius: 8 }}
          >
            Cancel
          </Button>,
          <Button 
            key="save" 
            type="primary" 
            onClick={handleSaveAutofillMappings}
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #52c41a 0%, #13c2c2 100%)', border: 'none' }}
          >
            Save Mappings
          </Button>
        ]}
        width={800}
        bodyStyle={{ maxHeight: '75vh', overflowY: 'auto', padding: '24px' }}
        style={{ borderRadius: 12 }}
        centered
      >
        {selectedTemplateForAutofill && (
          <div>
            <div style={{ marginBottom: 20, padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef' }}>
              <Typography.Text strong style={{ color: '#495057' }}>
                Template: {getLabel(selectedTemplateForAutofill.filename)}
              </Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Found {templatePlaceholders.length} placeholder(s) in this template
              </Typography.Text>
            </div>

            {templatePlaceholders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#6c757d' }}>
                <Typography.Text>
                  No placeholders found in this template. Placeholders should be in formats like:
                  <br />
                  <Tag color="blue">{'{placeholder}'}</Tag>
                  <Tag color="green">[placeholder]</Tag>
                  <Tag color="orange">{'{placeholder}'}</Tag>
                  <Tag color="purple">{'${placeholder}'}</Tag>
                </Typography.Text>
              </div>
            ) : (
              <Form
                form={autofillForm}
                layout="vertical"
                initialValues={placeholderMappings}
              >
                {templatePlaceholders.map((placeholder, index) => (
                  <div key={placeholder} style={{ marginBottom: 16 }}>
                    <div style={{ 
                      padding: 12, 
                      background: '#f1f3f4', 
                      borderRadius: 8, 
                      marginBottom: 8,
                      border: '1px solid #e1e5e9'
                    }}>
                      <Typography.Text strong style={{ color: '#2c3e50' }}>
                        Placeholder: <Tag color="blue">{placeholder}</Tag>
                      </Typography.Text>
                    </div>
                    
                    <Form.Item
                      name={placeholder}
                      label={`Map to Resident Profile Field:`}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        placeholder="Select a field or create composite mapping"
                        style={{ width: '100%' }}
                        showSearch
                        allowClear
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                      >
                        <Select.OptGroup label="Basic Fields">
                          {Object.entries(RESIDENT_PROFILE_FIELDS)
                            .filter(([_, info]) => info.category === 'Basic Information')
                            .map(([field, info]) => (
                              <Select.Option key={field} value={field}>
                                {info.label}
                              </Select.Option>
                            ))}
                        </Select.OptGroup>
                        
                        <Select.OptGroup label="Contact Information">
                          {Object.entries(RESIDENT_PROFILE_FIELDS)
                            .filter(([_, info]) => info.category === 'Contact Information')
                            .map(([field, info]) => (
                              <Select.Option key={field} value={field}>
                                {info.label}
                              </Select.Option>
                            ))}
                        </Select.OptGroup>
                        
                        <Select.OptGroup label="Address Information">
                          {Object.entries(RESIDENT_PROFILE_FIELDS)
                            .filter(([_, info]) => info.category === 'Address Information')
                            .map(([field, info]) => (
                              <Select.Option key={field} value={field}>
                                {info.label}
                              </Select.Option>
                            ))}
                        </Select.OptGroup>
                        
                        <Select.OptGroup label="Family Information">
                          {Object.entries(RESIDENT_PROFILE_FIELDS)
                            .filter(([_, info]) => info.category === 'Family Information')
                            .map(([field, info]) => (
                              <Select.Option key={field} value={field}>
                                {info.label}
                              </Select.Option>
                            ))}
                        </Select.OptGroup>
                        
                        <Select.OptGroup label="Business Information">
                          {Object.entries(RESIDENT_PROFILE_FIELDS)
                            .filter(([_, info]) => info.category === 'Business Information')
                            .map(([field, info]) => (
                              <Select.Option key={field} value={field}>
                                {info.label}
                              </Select.Option>
                            ))}
                        </Select.OptGroup>
                        
                        <Select.OptGroup label="Additional Information">
                          {Object.entries(RESIDENT_PROFILE_FIELDS)
                            .filter(([_, info]) => info.category === 'Additional Information')
                            .map(([field, info]) => (
                              <Select.Option key={field} value={field}>
                                {info.label}
                              </Select.Option>
                            ))}
                        </Select.OptGroup>
                        
                        <Select.OptGroup label="Composite Fields (Combinations)">
                          {Object.entries(COMPOSITE_FIELDS).map(([composite, info]) => (
                            <Select.Option key={composite} value={composite}>
                              {info.label}
                            </Select.Option>
                          ))}
                        </Select.OptGroup>
                      </Select>
                    </Form.Item>
                    
                    {index < templatePlaceholders.length - 1 && <Divider style={{ margin: '16px 0' }} />}
                  </div>
                ))}
              </Form>
            )}
          </div>
        )}
      </Modal>
      </Spin>
      </div>
    </div>
  );
};

export default TemplatesManager;
