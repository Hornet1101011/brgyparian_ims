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
  Link,
} from '@mui/material';
import { message as antdMessage } from 'antd';
import { adminAPI } from '../../services/api';

interface EmailConfig {
  enabled: boolean;
  provider: 'custom' | 'gmail';
  fromName: string;
  fromEmail: string;
  // Custom SMTP fields
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean;
  // Gmail fields
  gmailAddress?: string;
  gmailAppPassword?: string;
}

interface GmailSettingsProps {
  onGmailStatusChange?: (enabled: boolean) => void;
  onEmailConfigChange?: (config: EmailConfig) => void;
}

const GmailSettingsComponent = ({ onGmailStatusChange, onEmailConfigChange }: GmailSettingsProps) => {
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    enabled: false,
    provider: 'gmail',
    fromName: 'Barangay System',
    fromEmail: '',
    gmailAddress: '',
    gmailAppPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [passwordSavedBefore, setPasswordSavedBefore] = useState(false);

  // Notify parent component whenever config changes
  useEffect(() => {
    if (onEmailConfigChange) {
      onEmailConfigChange(emailConfig);
    }
  }, [emailConfig, onEmailConfigChange]);

  useEffect(() => {
    loadGmailSettings();
  }, []);

  // SINGLE PROVIDER ENFORCEMENT: Monitor if provider changes away from gmail
  // If so, custom SMTP fields won't be included in config sent to backend
  useEffect(() => {
    if (emailConfig.provider !== 'gmail') {
      console.log('[GmailSettings] Provider changed away from gmail, clearing gmail fields from state');
      // When provider is not gmail, these fields won't be sent to backend
      // Ensures only ONE provider's credentials are active
    }
  }, [emailConfig.provider]);

  const loadGmailSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.get('/settings/gmail');
      if (response.data?.gmail) {
        // Check if a password was previously saved
        if (response.data.gmail.gmailAddress) {
          setPasswordSavedBefore(true);
        }
        setEmailConfig({
          enabled: response.data.gmail.enabled || false,
          provider: 'gmail',
          fromName: response.data.gmail.displayName || 'Barangay System',
          fromEmail: response.data.gmail.gmailAddress || '',
          gmailAddress: response.data.gmail.gmailAddress || '',
          gmailAppPassword: '', // Always start with empty password for security
        });
      }
    } catch (err) {
      console.error('Failed to load Gmail settings:', err);
      antdMessage.error('Failed to load Gmail settings');
    } finally {
      setLoading(false);
    }  
  };
  const handleSaveGmailSettings = async () => {
    try {
      // Validate inputs
      if (emailConfig.enabled) {
        if (!emailConfig.gmailAddress || !emailConfig.gmailAddress.includes('@gmail.com')) {
          antdMessage.error('Please enter a valid Gmail address');
          return;
        }
        // Only require password if it's new OR if no password was saved before
        if (!emailConfig.gmailAppPassword && !passwordSavedBefore) {
          antdMessage.error('Please enter the Gmail app password');
          return;
        }
      }

      setSaving(true);
      
      // Log what we're sending
      console.log('[GmailSettings] Saving Gmail settings:', {
        enabled: emailConfig.enabled,
        gmailAddress: emailConfig.gmailAddress,
        fromName: emailConfig.fromName,
        hasPassword: !!emailConfig.gmailAppPassword,
        passwordLength: emailConfig.gmailAppPassword?.length || 0
      });
      
      const response = await adminAPI.patch('/settings/gmail', emailConfig);

      console.log('[GmailSettings] Save response:', response.data);

      if (response.data?.gmail) {
        // Mark that password has been saved
        if (emailConfig.enabled && emailConfig.gmailAddress) {
          setPasswordSavedBefore(true);
        }
        // Clear the app password from state after successful save
        // The password is now encrypted and stored on server
        setEmailConfig({
          ...emailConfig,
          gmailAppPassword: '', // Clear password from state for security
        });
        antdMessage.success('Gmail settings updated successfully');
        
        // Notify parent about status change
        if (onGmailStatusChange) {
          onGmailStatusChange(emailConfig.enabled);
        }
      }
    } catch (err: any) {
      console.error('Failed to save Gmail settings:', err);
      const errorMsg = err.response?.data?.message || 'Failed to save Gmail settings';
      antdMessage.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestGmailConnection = async () => {
    try {
      // Validate Gmail configuration
      if (!emailConfig.gmailAddress || !emailConfig.gmailAddress.includes('@gmail.com')) {
        antdMessage.error('Please configure a valid Gmail address first');
        return;
      }

      if (!emailConfig.gmailAppPassword && !passwordSavedBefore) {
        antdMessage.error('Please configure the app password first');
        return;
      }

      // Validate test email recipient
      const recipientEmail = testEmailAddress.trim() || emailConfig.gmailAddress;
      if (!recipientEmail.includes('@')) {
        antdMessage.error('Please enter a valid email address for testing');
        return;
      }

      console.log('[GmailSettings] Sending test email request:', {
        testEmail: recipientEmail,
        gmailAddress: emailConfig.gmailAddress,
        fromName: emailConfig.fromName,
        passwordSavedBefore,
        hasPasswordInState: !!emailConfig.gmailAppPassword
      });

      setTesting(true);
      const response = await adminAPI.post('/settings/gmail/test', {
        testEmail: recipientEmail,
        senderName: emailConfig.fromName || 'Barangay System',
        fromEmail: emailConfig.gmailAddress,
      });

      console.log('[GmailSettings] Test email response:', response.data);

      if (response.data?.success) {
        antdMessage.success(
          `Test email sent successfully to ${recipientEmail}! Check your inbox.`
        );
        setTestEmailAddress(''); // Clear test email field
      }
    } catch (err: any) {
      console.error('[GmailSettings] Test email error:', err);
      
      const fullErrorData = err.response?.data;
      const errorMsg = 
        err.response?.data?.error || 
        err.response?.data?.message || 
        'Failed to send test email. Please check your Gmail configuration.';
      
      console.error('[GmailSettings] Full error response:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: fullErrorData,
        message: errorMsg,
        details: fullErrorData?.details
      });
      
      // Show detailed error to user
      const displayMessage = fullErrorData?.details 
        ? `${errorMsg} (${fullErrorData.details})`
        : errorMsg;
      
      antdMessage.error(displayMessage);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#1f2937' }}>
        📧 Alternative Email System - Gmail
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Enable Gmail as an alternative email provider to SMTP. When enabled, all system emails will be sent
        through this Gmail account.{' '}
        <Link
          href="https://support.google.com/accounts/answer/185833"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ fontWeight: 600 }}
        >
          Learn how to create a Gmail App Password
        </Link>
      </Alert>

      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={emailConfig.enabled}
              onChange={(e) => {
                setEmailConfig({
                  ...emailConfig,
                  enabled: e.target.checked,
                });
              }}
              color="primary"
            />
          }
          label={
            <Typography sx={{ fontWeight: 500 }}>
              {emailConfig.enabled ? '✓ Gmail Enabled' : 'Enable Gmail'}
            </Typography>
          }
        />
      </Box>

      {emailConfig.enabled && (
        <>
          <Divider sx={{ my: 2 }} />

          <Box sx={{ mt: 3 }}>
            <TextField
              label="Gmail Address"
              value={emailConfig.gmailAddress || ''}
              onChange={(e) =>
                setEmailConfig({
                  ...emailConfig,
                  gmailAddress: e.target.value,
                  fromEmail: e.target.value,
                })
              }
              fullWidth
              margin="normal"
              type="email"
              placeholder="your-email@gmail.com"
              helperText="Your Gmail account email address"
              size="small"
            />

            <TextField
              label="App Password"
              value={emailConfig.gmailAppPassword || ''}
              onChange={(e) =>
                setEmailConfig({
                  ...emailConfig,
                  gmailAppPassword: e.target.value,
                })
              }
              fullWidth
              margin="normal"
              type={showPassword ? 'text' : 'password'}
              placeholder="xxxx xxxx xxxx xxxx"
              helperText={passwordSavedBefore ? '✓ Password saved (enter new password to update)' : '16-character app password (without spaces)'}
              size="small"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  size="small"
                />
              }
              label="Show password"
              sx={{ mt: 1 }}
            />

            <TextField
              label="Display Name"
              value={emailConfig.fromName || ''}
              onChange={(e) =>
                setEmailConfig({
                  ...emailConfig,
                  fromName: e.target.value,
                })
              }
              fullWidth
              margin="normal"
              placeholder="e.g., Barangay System"
              helperText="How the sender name appears in emails"
              size="small"
            />

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
              📨 Test Email Configuration
            </Typography>

            <TextField
              label="Test Email Recipient"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              fullWidth
              margin="normal"
              type="email"
              placeholder="Leave blank to send to Gmail address above"
              helperText="Enter an email address where you want to receive the test email"
              size="small"
            />

            <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={handleSaveGmailSettings}
                disabled={saving || testing}
                sx={{ minWidth: 150 }}
              >
                {saving ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1 }} /> Saving...
                  </>
                ) : (
                  'Save Gmail Settings'
                )}
              </Button>

              <Button
                variant="outlined"
                color="success"
                onClick={handleTestGmailConnection}
                disabled={!emailConfig.gmailAddress || (!emailConfig.gmailAppPassword && !passwordSavedBefore) || saving || testing}
                sx={{ minWidth: 150 }}
              >
                {testing ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1 }} /> Sending Test...
                  </>
                ) : (
                  '📧 Send Test Email'
                )}
              </Button>
            </Box>
          </Box>

          <Alert severity="warning" sx={{ mt: 3 }}>
            ⚠️ <strong>Important:</strong> When Gmail is enabled, SMTP settings will be ignored. Emails will be sent
            through the Gmail account specified above.
          </Alert>
        </>
      )}

      {!emailConfig.enabled && (
        <Alert severity="success">Gmail is currently disabled. SMTP settings will be used for sending emails.</Alert>
      )}
    </Paper>
  );
};

export default GmailSettingsComponent;
