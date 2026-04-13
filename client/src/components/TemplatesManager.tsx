import React, { useState } from 'react';
import { Button, Tooltip, Upload, message, Card, Spin, Empty, Modal, Space } from 'antd';
import { UploadOutlined, EyeOutlined, DownloadOutlined, DeleteOutlined, FileWordOutlined, CloudUploadOutlined, SettingOutlined } from '@ant-design/icons';
import { axiosInstance, axiosPublic } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import TemplateValidationConfig from './TemplateValidationConfig';
import styles from './TemplatesManager.module.css';

const getLabel = (filename?: string) =>
  filename ? filename.replace(/_/g, " ").replace(/\.docx$/, "") : "Untitled";

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
      </Spin>
      </div>
    </div>
  );
};

export default TemplatesManager;
