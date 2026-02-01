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
}

const GmailSettingsComponent = ({ onGmailStatusChange }: GmailSettingsProps) => {
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

  useEffect(() => {
    loadGmailSettings();
  }, []);

  const loadGmailSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.get('/settings/gmail');
      if (response.data?.gmail) {
        setGmailSettings(response.data.gmail);
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
        if (!gmailSettings.appPassword) {
          antdMessage.error('Please enter the Gmail app password');
          return;
        }
      }

      setSaving(true);
      const response = await adminAPI.patch('/settings/gmail', gmailSettings);

      if (response.data?.gmail) {
        setGmailSettings(response.data.gmail);
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
      if (!gmailSettings.gmailAddress || !gmailSettings.gmailAddress.includes('@')) {
        antdMessage.error('Please enter a valid Gmail address first');
        return;
      }

      setTesting(true);
      const response = await adminAPI.post('/settings/gmail/test', {
        testEmail: gmailSettings.gmailAddress,
      });

      if (response.data?.success) {
        antdMessage.success('Test email sent successfully! Check your inbox.');
      }
    } catch (err: any) {
      console.error('Gmail test failed:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Gmail test failed';
      antdMessage.error(errorMsg);
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
              helperText="16-character app password (without spaces)"
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
                onClick={handleTestGmailConnection}
                disabled={!gmailSettings.gmailAddress || !gmailSettings.appPassword || saving || testing}
                sx={{ minWidth: 150 }}
              >
                {testing ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1 }} /> Testing...
                  </>
                ) : (
                  'Test Connection'
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
