import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Alert,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { message as antdMessage } from 'antd';
import { adminAPI, axiosInstance } from '../../services/api';
import EmailProviderManager from '../../utils/EmailProviderManager';

interface SendGridConfig {
  enabled: boolean;
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

interface SendGridSettingsProps {
  config: SendGridConfig;
  onSave: (config: SendGridConfig) => void | Promise<void>;
  hasBackendApiKey?: boolean; // Whether backend has a saved API key (even if not shown in UI)
  loading?: boolean;
  saving?: boolean;
}

const SendGridSettings: React.FC<SendGridSettingsProps> = ({
  config,
  onSave,
  hasBackendApiKey = false,
  loading = false,
  saving = false,
}) => {
  const [localConfig, setLocalConfig] = useState<SendGridConfig>(config);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Update local config when prop changes
  useEffect(() => {
    setLocalConfig(config);
    setApiKeyDirty(false);
  }, [config]);

  /**
   * Test SendGrid email with unsaved config
   */
  const handleTestEmail = async () => {
    // Validate email address
    if (!testEmail || !testEmail.trim()) {
      antdMessage.error('Please enter a test email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail.trim())) {
      antdMessage.error('Please enter a valid email address');
      return;
    }

    // Validate SendGrid configuration before testing
    const errors: string[] = [];
    
    if (!localConfig.apiKey || localConfig.apiKey.trim().length === 0) {
      if (!hasBackendApiKey) {
        errors.push('SendGrid API Key is required');
      }
    }
    
    if (!localConfig.fromEmail || localConfig.fromEmail.trim().length === 0) {
      errors.push('From Email address is required');
    } else if (!localConfig.fromEmail.includes('@')) {
      errors.push('From Email must be a valid email address');
    }
    
    if (!localConfig.fromName || localConfig.fromName.trim().length === 0) {
      errors.push('From Name is required');
    }

    if (errors.length > 0) {
      antdMessage.error(`Cannot test email: ${errors[0]}`);
      return;
    }

    setIsTestingEmail(true);
    try {
      const payload = {
        testEmail: testEmail.trim(),
        emailConfig: {
          enabled: localConfig.enabled,
          provider: 'sendgrid',
          sendgrid: {
            apiKey: localConfig.apiKey,
            fromEmail: localConfig.fromEmail,
            fromName: localConfig.fromName,
          }
        }
      };

      console.log('[SendGridSettings] Testing email with config:', {
        testEmail: testEmail.trim(),
        hasApiKey: !!localConfig.apiKey,
        fromEmail: localConfig.fromEmail,
      });

      const response = await axiosInstance.post('/admin/settings/email/test', payload);

      if (response.data.success) {
        antdMessage.success(`Test email sent successfully to ${testEmail.trim()}`);
        setTestEmail('');
      } else {
        antdMessage.error(`Failed to send test email: ${response.data.error}`);
      }
    } catch (error: any) {
      console.error('[SendGridSettings] Test email failed:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to send test email';
      antdMessage.error(`Test email failed: ${errorMsg}`);
    } finally {
      setIsTestingEmail(false);
    }
  };

  /**
   * Validate SendGrid configuration
   */
  const validate = (): boolean => {
    const errors: string[] = [];

    if (localConfig.enabled) {
      if (!localConfig.apiKey || localConfig.apiKey.trim().length === 0) {
        if (!hasBackendApiKey) {
          errors.push('SendGrid API Key is required when enabled');
        }
      }

      if (!localConfig.fromEmail || localConfig.fromEmail.trim().length === 0) {
        errors.push('From Email address is required');
      } else if (!localConfig.fromEmail.includes('@')) {
        errors.push('From Email must be a valid email address');
      }

      if (!localConfig.fromName || localConfig.fromName.trim().length === 0) {
        errors.push('From Name is required');
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  /**
   * Handle save
   */
  const handleSave = async () => {
    if (!validate()) {
      const errorMsg = EmailProviderManager.formatValidationErrors(validationErrors);
      console.log('[SendGridSettings] Validation failed:\n' + errorMsg);
      antdMessage.error(
        <Box sx={{ whiteSpace: 'pre-wrap' }}>
          <strong>Please fix the following issues:</strong>
          {'\n'}
          {errorMsg}
        </Box>
      );
      return;
    }

    setIsSaving(true);
    try {
      // Build the config object
      const configToSave: SendGridConfig = {
        enabled: localConfig.enabled,
        // Always send the current API key value
        // If user entered something new, send it
        // If user left it blank and there's a backend key, send empty (backend will preserve it)
        apiKey: localConfig.apiKey,
        fromEmail: localConfig.fromEmail,
        fromName: localConfig.fromName,
      };

      console.log('[SendGridSettings] Saving SendGrid configuration:', {
        enabled: configToSave.enabled,
        hasApiKey: !!configToSave.apiKey,
        apiKeyChanged: apiKeyDirty,
        fromEmail: configToSave.fromEmail,
        fromName: configToSave.fromName,
      });

      await onSave(configToSave);

      antdMessage.success('SendGrid settings saved successfully');
      setApiKeyDirty(false);
    } catch (error) {
      console.error('[SendGridSettings] Error saving SendGrid settings:', error);
      antdMessage.error('Failed to save SendGrid settings');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle field changes
   */
  const handleFieldChange = (field: keyof SendGridConfig, value: any) => {
    setLocalConfig((prev) => ({ ...prev, [field]: value }));

    if (field === 'apiKey') {
      // Mark as dirty whenever the API key field is modified
      // This ensures we send the new value to the backend
      setApiKeyDirty(true);
    }

    // Clear validation errors when user starts editing
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#1f2937' }}>
          📧 SendGrid Configuration
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mb: 3 }}>
          Configure SendGrid as your email service provider for transactional emails and announcements.
        </Typography>

        {validationErrors.length > 0 && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Box sx={{ whiteSpace: 'pre-wrap' }}>
              <strong>Please fix the following issues:</strong>
              {'\n'}
              {EmailProviderManager.formatValidationErrors(validationErrors)}
            </Box>
          </Alert>
        )}

        {/* Enable/Disable Toggle */}
        <Box sx={{ mb: 3, p: 2, backgroundColor: '#ffffff', borderRadius: 1, border: '1px solid #e5e7eb' }}>
          <FormControlLabel
            control={
              <Switch
                checked={localConfig.enabled}
                onChange={(e) => handleFieldChange('enabled', e.target.checked)}
                color="primary"
                disabled={isSaving}
              />
            }
            label={
              <Box>
                <Typography sx={{ fontWeight: 500 }}>
                  {localConfig.enabled ? '✓ SendGrid Enabled' : 'Enable SendGrid'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6b7280' }}>
                  When enabled, SendGrid will be used for sending emails
                </Typography>
              </Box>
            }
          />
        </Box>

        {localConfig.enabled && (
          <>
            {/* API Key Field */}
            <Box sx={{ mb: 3 }}>
              <TextField
                label="SendGrid API Key"
                type={showApiKey ? 'text' : 'password'}
                value={localConfig.apiKey}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                fullWidth
                margin="normal"
                placeholder={
                  hasBackendApiKey && !apiKeyDirty 
                    ? 'API key is saved (leave blank to keep it)' 
                    : 'Enter your SendGrid API key'
                }
                helperText={
                  apiKeyDirty
                    ? 'Enter your new SendGrid API key'
                    : hasBackendApiKey
                    ? 'Leave blank to keep existing API key'
                    : 'API key is required'
                }
                size="small"
                disabled={isSaving}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                        size="small"
                        disabled={!localConfig.apiKey || isSaving}
                      >
                        {showApiKey ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* From Email and From Name */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="From Email"
                  type="email"
                  value={localConfig.fromEmail}
                  onChange={(e) => handleFieldChange('fromEmail', e.target.value)}
                  fullWidth
                  margin="normal"
                  placeholder="noreply@barangay.gov.ph"
                  helperText="Sender email address"
                  size="small"
                  disabled={isSaving}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="From Name"
                  value={localConfig.fromName}
                  onChange={(e) => handleFieldChange('fromName', e.target.value)}
                  fullWidth
                  margin="normal"
                  placeholder="Barangay System"
                  helperText="Display name for sender"
                  size="small"
                  disabled={isSaving}
                />
              </Grid>
            </Grid>

            {/* Test Email Section */}
            <Divider sx={{ my: 3 }} />
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#1f2937' }}>
                🧪 Test Email Configuration
              </Typography>
              <Typography variant="caption" sx={{ color: '#6b7280', mb: 2, display: 'block' }}>
                Send a test email to verify your SendGrid configuration is working correctly.
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 3 }}>
                <TextField
                  label="Test Email Address"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="admin@example.com"
                  helperText="Enter the email where you want to receive the test"
                  size="small"
                  disabled={isSaving || isTestingEmail}
                  sx={{ flexGrow: 1 }}
                />
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleTestEmail}
                  disabled={isSaving || isTestingEmail || !testEmail.trim() || !localConfig.apiKey || !localConfig.fromEmail}
                  sx={{ mt: 1, whiteSpace: 'nowrap' }}
                >
                  {isTestingEmail ? (
                    <>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      Testing...
                    </>
                  ) : (
                    'Send Test Email'
                  )}
                </Button>
              </Box>
            </Box>

            {/* Info Box */}
            <Box sx={{ p: 2, backgroundColor: '#dbeafe', border: '1px solid #3b82f6', borderRadius: 1, mb: 3 }}>
              <Typography variant="caption" sx={{ color: '#1e40af' }}>
                <strong>ℹ️ API Key Security:</strong> Your API key is encrypted and stored securely on the server. It
                will never be displayed in full after saving.
              </Typography>
            </Box>

            {/* Save Button */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSave}
                disabled={isSaving || saving}
                sx={{ minWidth: 120 }}
              >
                {isSaving || saving ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    Saving...
                  </>
                ) : (
                  '💾 Save Changes'
                )}
              </Button>
            </Box>
          </>
        )}

        {!localConfig.enabled && (
          <Box sx={{ p: 2, backgroundColor: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: '#92400e' }}>
              <strong>⚠️ SendGrid is disabled:</strong> Enable SendGrid above to configure and use it for sending
              emails.
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default SendGridSettings;
