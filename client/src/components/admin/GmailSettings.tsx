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

interface GmailSettings {
  enabled: boolean;
  gmailAddress: string;
  appPassword: string;
  displayName: string;
  useAppPassword: boolean;
}

interface GmailSettingsProps {
  onGmailStatusChange?: (enabled: boolean) => void;
  onSettingsChange?: (settings: GmailSettings) => void;
}

const GmailSettingsComponent = ({ onGmailStatusChange, onSettingsChange }: GmailSettingsProps) => {
  const [gmailSettings, setGmailSettings] = useState({
    enabled: false,
    gmailAddress: '',
    appPassword: '',
    displayName: '',
    useAppPassword: true,
  } as GmailSettings);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [passwordSavedBefore, setPasswordSavedBefore] = useState(false);

  // Notify parent component whenever settings change
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(gmailSettings);
    }
  }, [gmailSettings, onSettingsChange]);

  useEffect(() => {
    loadGmailSettings();
  }, []);

  const loadGmailSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.get('/settings/gmail');
      if (response.data?.gmail) {
        // Check if a password was previously saved
        if (response.data.gmail.gmailAddress) {
          setPasswordSavedBefore(true);
        }
        setGmailSettings({
          ...response.data.gmail,
          appPassword: '', // Always start with empty password for security
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
      if (gmailSettings.enabled) {
        if (!gmailSettings.gmailAddress || !gmailSettings.gmailAddress.includes('@gmail.com')) {
          antdMessage.error('Please enter a valid Gmail address');
          return;
        }
        // Only require password if it's new OR if no password was saved before
        if (!gmailSettings.appPassword && !passwordSavedBefore) {
          antdMessage.error('Please enter the Gmail app password');
          return;
        }
      }

      setSaving(true);
      
      // Log what we're sending
      console.log('[GmailSettings] Saving Gmail settings:', {
        enabled: gmailSettings.enabled,
        gmailAddress: gmailSettings.gmailAddress,
        displayName: gmailSettings.displayName,
        hasPassword: !!gmailSettings.appPassword,
        passwordLength: gmailSettings.appPassword?.length || 0
      });
      
      const response = await adminAPI.patch('/settings/gmail', gmailSettings);

      console.log('[GmailSettings] Save response:', response.data);

      if (response.data?.gmail) {
        // Mark that password has been saved
        if (gmailSettings.enabled && gmailSettings.gmailAddress) {
          setPasswordSavedBefore(true);
        }
        // Clear the app password from state after successful save
        // The password is now encrypted and stored on server
        setGmailSettings({
          ...response.data.gmail,
          appPassword: '', // Clear password from state for security
        });
        antdMessage.success('Gmail settings updated successfully');
        
        // Notify parent about status change
        if (onGmailStatusChange) {
          onGmailStatusChange(response.data.gmail.enabled);
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
      if (!gmailSettings.gmailAddress || !gmailSettings.gmailAddress.includes('@gmail.com')) {
        antdMessage.error('Please configure a valid Gmail address first');
        return;
      }

      if (!gmailSettings.appPassword && !passwordSavedBefore) {
        antdMessage.error('Please configure the app password first');
        return;
      }

      // Validate test email recipient
      const recipientEmail = testEmailAddress.trim() || gmailSettings.gmailAddress;
      if (!recipientEmail.includes('@')) {
        antdMessage.error('Please enter a valid email address for testing');
        return;
      }

      console.log('[GmailSettings] Sending test email request:', {
        testEmail: recipientEmail,
        gmailAddress: gmailSettings.gmailAddress,
        displayName: gmailSettings.displayName,
        passwordSavedBefore,
        hasPasswordInState: !!gmailSettings.appPassword
      });

      setTesting(true);
      const response = await adminAPI.post('/settings/gmail/test', {
        testEmail: recipientEmail,
        senderName: gmailSettings.displayName || 'Barangay System',
        fromEmail: gmailSettings.gmailAddress,
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
              checked={gmailSettings.enabled}
              onChange={(e) => {
                setGmailSettings({
                  ...gmailSettings,
                  enabled: e.target.checked,
                });
              }}
              color="primary"
            />
          }
          label={
            <Typography sx={{ fontWeight: 500 }}>
              {gmailSettings.enabled ? '✓ Gmail Enabled' : 'Enable Gmail'}
            </Typography>
          }
        />
      </Box>

      {gmailSettings.enabled && (
        <>
          <Divider sx={{ my: 2 }} />

          <Box sx={{ mt: 3 }}>
            <TextField
              label="Gmail Address"
              value={gmailSettings.gmailAddress}
              onChange={(e) =>
                setGmailSettings({
                  ...gmailSettings,
                  gmailAddress: e.target.value,
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
              value={gmailSettings.appPassword}
              onChange={(e) =>
                setGmailSettings({
                  ...gmailSettings,
                  appPassword: e.target.value,
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
              value={gmailSettings.displayName}
              onChange={(e) =>
                setGmailSettings({
                  ...gmailSettings,
                  displayName: e.target.value,
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
                disabled={!gmailSettings.gmailAddress || (!gmailSettings.appPassword && !passwordSavedBefore) || saving || testing}
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

      {!gmailSettings.enabled && (
        <Alert severity="success">Gmail is currently disabled. SMTP settings will be used for sending emails.</Alert>
      )}
    </Paper>
  );
};

export default GmailSettingsComponent;
