import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Button,
  Space,
  Table,
  Tag,
  message,
  Divider,
  InputNumber,
  DatePicker,
} from 'antd';
import {
  SettingOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { axiosInstance, axiosPublic } from '../services/api';
import { Alert, Empty } from 'antd';

// Add pulse animation styles
const styles = `
  @keyframes pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

interface PlaceholderValidation {
  placeholder: string;
  fieldType: 'string' | 'integer' | 'date' | 'email' | 'phone' | 'text';
  tooltip: string;
  isRequired: boolean;
  maxCharacters?: number;
  minCharacters?: number;
  pattern?: string;
  // Date specific
  enablePastDates?: boolean;
  enableFutureDates?: boolean;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  autoFillMode?: 'none' | 'full-date' | 'day-only' | 'month-only' | 'year-only';
  autoFillValue?: string; // for when auto-fill is enabled
  // Field control
  disabled?: boolean;
  readOnly?: boolean;
}

interface TemplateValidationConfigProps {
  templateId: string;
  templateName: string;
  onClose: () => void;
  onSave: () => void;
}

// Helper function to detect placeholders from HTML content
const detectPlaceholders = (htmlContent: string): string[] => {
  const regex = /\{(.*?)\}/g;
  const placeholders: string[] = [];
  const seen = new Set<string>();
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    const placeholder = match[1].trim();
    // Skip QR code placeholder (generated server-side)
    if (placeholder && placeholder.toLowerCase() !== 'qr' && !seen.has(placeholder)) {
      placeholders.push(placeholder);
      seen.add(placeholder);
    }
  }
  return placeholders;
};

const TemplateValidationConfig: React.FC<TemplateValidationConfigProps> = ({
  templateId,
  templateName,
  onClose,
  onSave,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [validations, setValidations] = useState<PlaceholderValidation[]>([]);
  const [savedValidations, setSavedValidations] = useState<PlaceholderValidation[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [detectedPlaceholders, setDetectedPlaceholders] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingValidation, setEditingValidation] = useState<PlaceholderValidation | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');

  useEffect(() => {
    loadValidations();
    detectTemplateplaceholders();
  }, [templateId]);

  // Auto-save validations when they change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (validations.length > 0 && JSON.stringify(validations) !== JSON.stringify(savedValidations)) {
        autoSaveValidations();
      }
    }, 3000); // Auto-save after 3 seconds of inactivity
    return () => clearTimeout(timer);
  }, [validations, savedValidations]);

  const loadValidations = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`/documents/${templateId}/validations`);
      const data = res.data || {};
      const loadedValidations = data.validations || [];
      setValidations(loadedValidations);
      setSavedValidations(loadedValidations);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to load validations:', err);
      setValidations([]);
      setSavedValidations([]);
    }
    setLoading(false);
  };

  const detectTemplateplaceholders = async () => {
    setIsDetecting(true);
    try {
      const res = await axiosPublic.get(`/documents/preview/${templateId}?format=html`, {
        responseType: 'text',
      });
      const htmlContent = res.data || '';
      const placeholders = detectPlaceholders(htmlContent);
      setDetectedPlaceholders(placeholders);
    } catch (err) {
      console.error('Failed to detect placeholders:', err);
      setDetectedPlaceholders([]);
    }
    setIsDetecting(false);
  };

  const handleAddValidation = () => {
    setEditingValidation({
      placeholder: '',
      fieldType: 'string',
      tooltip: '',
      isRequired: false,
      enablePastDates: true,
      enableFutureDates: true,
      autoFillMode: 'none',
      disabled: false,
      readOnly: false,
    });
    setModalVisible(true);
  };

  const handleAddFromDetected = (placeholder: string) => {
    if (validations.some(v => v.placeholder === placeholder)) {
      message.info(`"${placeholder}" already has a validation rule`);
      return;
    }
    setEditingValidation({
      placeholder,
      fieldType: 'string',
      tooltip: '',
      isRequired: false,
      enablePastDates: true,
      enableFutureDates: true,
      autoFillMode: 'none',
      disabled: false,
      readOnly: false,
    });
    setModalVisible(true);
  };

  const handleEditValidation = (record: PlaceholderValidation) => {
    setEditingValidation(record);
    setModalVisible(true);
  };

  const handleDeleteValidation = (placeholder: string) => {
    setValidations(validations.filter(v => v.placeholder !== placeholder));
    setSaveStatus('unsaved');
    message.success('Validation rule removed');
  };

  const handleSaveValidation = async () => {
    try {
      const values = await form.validateFields();
      if (!editingValidation) return;

      const updated = { ...editingValidation, ...values };
      const existing = validations.find(v => v.placeholder === editingValidation.placeholder);

      if (existing) {
        setValidations(
          validations.map(v => (v.placeholder === existing.placeholder ? updated : v))
        );
      } else {
        setValidations([...validations, updated]);
      }

      setSaveStatus('unsaved');
      message.success('Validation rule saved locally. Changes will auto-save in a few seconds.');
      setModalVisible(false);
      setEditingValidation(null);
      form.resetFields();
    } catch (err) {
      console.error('Validation error:', err);
    }
  };

  const autoSaveValidations = async () => {
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      await axiosInstance.post(`/documents/${templateId}/validations`, {
        validations,
      });
      setSavedValidations(validations);
      setSaveStatus('saved');
      message.success('✓ Validations auto-saved');
    } catch (err) {
      console.error('Failed to auto-save validations:', err);
      setSaveStatus('unsaved');
      message.error('Failed to auto-save validations');
    }
    setIsSaving(false);
  };

  const handleSaveAll = async () => {
    setLoading(true);
    setSaveStatus('saving');
    try {
      await axiosInstance.post(`/documents/${templateId}/validations`, {
        validations,
      });
      setSavedValidations(validations);
      setSaveStatus('saved');
      message.success('✓ All validation configurations saved successfully');
      onSave();
    } catch (err) {
      message.error('Failed to save validations');
      setSaveStatus('unsaved');
      console.error(err);
    }
    setLoading(false);
  };

  const columns = [
    {
      title: 'Placeholder',
      dataIndex: 'placeholder',
      key: 'placeholder',
      render: (text: string) => <code>{text}</code>,
    },
    {
      title: 'Field Type',
      dataIndex: 'fieldType',
      key: 'fieldType',
      render: (type: string) => (
        <Tag color={type === 'date' ? 'blue' : type === 'integer' ? 'green' : 'default'}>
          {type}
        </Tag>
      ),
    },
    {
      title: 'Tooltip/Guideline',
      dataIndex: 'tooltip',
      key: 'tooltip',
      ellipsis: true,
      render: (text: string) => text || <em style={{ color: '#999' }}>No guideline set</em>,
    },
    {
      title: 'Required',
      dataIndex: 'isRequired',
      key: 'isRequired',
      render: (required: boolean) => (required ? '✓ Yes' : '○ No'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: PlaceholderValidation) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => handleEditValidation(record)}
          >
            Configure
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteValidation(record.placeholder)}
          >
            Remove
          </Button>
        </Space>
      ),
    },
  ];

  const configuredPlaceholders = new Set(validations.map(v => v.placeholder));
  const unconfiguredPlaceholders = detectedPlaceholders.filter(p => !configuredPlaceholders.has(p));

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '4px' }}>Validation Configuration for {templateName}</h2>
          <p style={{ color: '#666', margin: 0 }}>
            Set up field validations, restrictions, and guidelines for template placeholders
          </p>
        </div>
        <div style={{ textAlign: 'right', minWidth: '150px' }}>
          {saveStatus === 'saving' && (
            <div style={{ color: '#faad14', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#faad14', animation: 'pulse 1s infinite' }} />
              Saving...
            </div>
          )}
          {saveStatus === 'saved' && (
            <div style={{ color: '#52c41a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              ✓ All saved
            </div>
          )}
          {saveStatus === 'unsaved' && (
            <div style={{ color: '#ff7875', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              ⚠ Unsaved changes
            </div>
          )}
        </div>
      </div>

      {/* Detected Placeholders Section */}
      {detectedPlaceholders.length > 0 && (
        <Alert
          message="Detected Placeholders"
          description={
            <div>
              <p style={{ marginBottom: '12px', marginTop: '8px' }}>
                Found <strong>{detectedPlaceholders.length}</strong> placeholder(s) in this template:
              </p>
              {unconfiguredPlaceholders.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                    <strong>Unconfigured ({unconfiguredPlaceholders.length}):</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {unconfiguredPlaceholders.map(placeholder => (
                      <Tag
                        key={placeholder}
                        color="processing"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleAddFromDetected(placeholder)}
                        title="Click to configure"
                      >
                        <span style={{ marginRight: '4px' }}>+</span>
                        <code>{placeholder}</code>
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              {configuredPlaceholders.size > 0 && (
                <div>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                    <strong>Configured ({configuredPlaceholders.size}):</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {detectedPlaceholders
                      .filter(p => configuredPlaceholders.has(p))
                      .map(placeholder => (
                        <Tag key={placeholder} color="success">
                          ✓ <code>{placeholder}</code>
                        </Tag>
                      ))}
                  </div>
                </div>
              )}
            </div>
          }
          type="info"
          icon={<ScanOutlined />}
          showIcon
          closable={false}
          style={{ marginBottom: '20px' }}
        />
      )}

      {detectedPlaceholders.length === 0 && !isDetecting && (
        <Alert
          message="No placeholders detected"
          description="This template does not contain any detectable placeholders."
          type="warning"
          style={{ marginBottom: '20px' }}
        />
      )}

      <div style={{ marginBottom: '20px' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddValidation}
          style={{ marginRight: '8px' }}
        >
          Add New Validation Rule
        </Button>
        <Button
          icon={<ScanOutlined />}
          onClick={detectTemplateplaceholders}
          loading={isDetecting}
        >
          Refresh Placeholder Detection
        </Button>
      </div>

      {validations.length === 0 ? (
        <Empty description="No validation rules configured yet. Add rules above or click on unconfigured placeholders to get started." />
      ) : (
        <Table
          columns={columns}
          dataSource={validations}
          loading={loading}
          rowKey="placeholder"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      )}

      <Divider />

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSaveAll}
          loading={loading}
        >
          Save All Configurations
        </Button>
      </div>

      {/* Edit Modal */}
      <Modal
        title={`${editingValidation ? 'Edit' : 'Add'} Validation: ${editingValidation?.placeholder}`}
        open={modalVisible}
        onOk={handleSaveValidation}
        onCancel={() => {
          setModalVisible(false);
          setEditingValidation(null);
          form.resetFields();
        }}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={editingValidation || {}}
        >
          <Form.Item
            label="Placeholder Name"
            name="placeholder"
            rules={[{ required: true, message: 'Please enter placeholder name' }]}
          >
            <Input placeholder="e.g., {{FULL_NAME}}" disabled={!!editingValidation?.placeholder} />
          </Form.Item>

          <Form.Item
            label="Field Type"
            name="fieldType"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="string">Text (String)</Select.Option>
              <Select.Option value="integer">Number (Integer)</Select.Option>
              <Select.Option value="date">Date</Select.Option>
              <Select.Option value="email">Email</Select.Option>
              <Select.Option value="phone">Phone Number</Select.Option>
              <Select.Option value="text">Long Text (Textarea)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Tooltip/Guideline Message"
            name="tooltip"
            tooltip="This message will be displayed to users when they fill out this field"
          >
            <Input.TextArea
              placeholder="e.g., Enter your full legal name as it appears on your ID"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            label="Required Field"
            name="isRequired"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Divider>Text/String Restrictions</Divider>

          <Form.Item
            label="Minimum Characters"
            name="minCharacters"
          >
            <InputNumber min={0} placeholder="Leave empty for no limit" />
          </Form.Item>

          <Form.Item
            label="Maximum Characters"
            name="maxCharacters"
          >
            <InputNumber min={0} placeholder="Leave empty for no limit" />
          </Form.Item>

          <Divider>Date Field Options</Divider>

          <Form.Item
            label="Allow Past Dates"
            name="enablePastDates"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Allow Future Dates"
            name="enableFutureDates"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Auto-Fill Mode"
            name="autoFillMode"
          >
            <Select>
              <Select.Option value="none">None (Manual Entry)</Select.Option>
              <Select.Option value="full-date">Auto-fill Today's Full Date</Select.Option>
              <Select.Option value="day-only">Auto-fill Day Only</Select.Option>
              <Select.Option value="month-only">Auto-fill Month Only</Select.Option>
              <Select.Option value="year-only">Auto-fill Year Only</Select.Option>
            </Select>
          </Form.Item>

          <Divider>Field Controls</Divider>

          <Form.Item
            label="Disabled Field"
            name="disabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Read-Only Field"
            name="readOnly"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TemplateValidationConfig;
