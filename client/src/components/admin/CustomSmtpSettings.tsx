import React, { useState } from 'react';
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
import { adminAPI } from '../../services/api';

interface EmailConfig {
  enabled: boolean;
  provider: 'custom' | 'gmail';
  fromName: string;
  fromEmail: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean;
  gmailAddress?: string;
  gmailAppPassword?: string;
}

interface CustomSmtpSettingsProps {
  emailConfig: EmailConfig;
  setEmailConfig: (config: EmailConfig) => void;
}

const CustomSmtpSettings = ({ emailConfig, setEmailConfig }: CustomSmtpSettingsProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [passwordSavedBefore, setPasswordSavedBefore] = useState(
    !!(emailConfig.user && emailConfig.host)
  );

  const handleConfigChange = (field: keyof EmailConfig, value: any) => {
    setEmailConfig({
      ...emailConfig,
      [field]: value,
    });
  };

  const handleTestSmtpConnection = async () => {
    try {
      // Validate SMTP configuration
      if (!emailConfig.host || !emailConfig.port) {
        antdMessage.error('Please configure SMTP host and port first');
        return;
      }

      if (!emailConfig.user && emailConfig.password) {
        antdMessage.error('SMTP username is required when password is set');
        return;
      }

      // Validate test email recipient
      const recipientEmail = testEmailAddress.trim() || emailConfig.fromEmail;
      if (!recipientEmail.includes('@')) {
        antdMessage.error('Please enter a valid email address for testing');
        return;
      }

      console.log('[CustomSmtpSettings] Sending test email request:', {
        testEmail: recipientEmail,
        smtpHost: emailConfig.host,
        smtpPort: emailConfig.port,
        fromName: emailConfig.fromName,
        hasPassword: !!emailConfig.password
      });

      setTesting(true);
      const response = await adminAPI.post('/settings/email/test', {
        testEmail: recipientEmail,
        senderName: emailConfig.fromName || 'Barangay System',
        fromEmail: emailConfig.fromEmail,
      });

      console.log('[CustomSmtpSettings] Test email response:', response.data);

      if (response.data?.success) {
        antdMessage.success(
          `Test email sent successfully to ${recipientEmail}! Check your inbox.`
        );
        setTestEmailAddress('');
      }
    } catch (err: any) {
      console.error('[CustomSmtpSettings] Test email error:', err);

      const fullErrorData = err.response?.data;
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to send test email. Please check your SMTP configuration.';

      console.error('[CustomSmtpSettings] Full error response:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: fullErrorData,
        message: errorMsg,
        details: fullErrorData?.details
      });

      const displayMessage = fullErrorData?.details
        ? `${errorMsg} (${fullErrorData.details})`
        : errorMsg;

      antdMessage.error(displayMessage);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#1f2937' }}>
        📧 Custom SMTP Configuration
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Configure a custom SMTP server to send emails. This is the default email provider if Gmail
        is not enabled.
      </Alert>

      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={emailConfig.enabled && emailConfig.provider === 'custom'}
              onChange={(e) => {
                setEmailConfig({
                  ...emailConfig,
                  enabled: e.target.checked,
                  provider: 'custom',
                });
              }}
              color="primary"
            />
          }
          label={
            <Typography sx={{ fontWeight: 500 }}>
              {emailConfig.enabled && emailConfig.provider === 'custom'
                ? '✓ Custom SMTP Enabled'
                : 'Enable Custom SMTP'}
            </Typography>
          }
        />
      </Box>

      {emailConfig.enabled && emailConfig.provider === 'custom' && (
        <>
          <Divider sx={{ my: 2 }} />

          <Box sx={{ mt: 3 }}>
            {/* Sender Information */}
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
              Sender Information
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="From Name"
                  value={emailConfig.fromName || ''}
                  onChange={(e) => handleConfigChange('fromName', e.target.value)}
                  fullWidth
                  margin="normal"
                  placeholder="e.g., Barangay System"
                  helperText="How the sender name appears in emails"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="From Email"
                  value={emailConfig.fromEmail || ''}
                  onChange={(e) => handleConfigChange('fromEmail', e.target.value)}
                  fullWidth
                  margin="normal"
                  type="email"
                  placeholder="noreply@example.com"
                  helperText="Email address that sends the emails"
                  size="small"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* SMTP Server Configuration */}
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
              SMTP Server Settings
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="SMTP Host"
                  value={emailConfig.host || ''}
                  onChange={(e) => handleConfigChange('host', e.target.value)}
                  fullWidth
                  margin="normal"
                  placeholder="smtp.gmail.com"
                  helperText="SMTP server address"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="SMTP Port"
                  value={emailConfig.port || 587}
                  onChange={(e) => handleConfigChange('port', parseInt(e.target.value) || 587)}
                  fullWidth
                  margin="normal"
                  type="number"
                  placeholder="587"
                  helperText="Typical: 587 (TLS) or 465 (SSL)"
                  size="small"
                />
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="SMTP Username"
                  value={emailConfig.user || ''}
                  onChange={(e) => handleConfigChange('user', e.target.value)}
                  fullWidth
                  margin="normal"
                  placeholder="username or email"
                  helperText="SMTP authentication username"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="SMTP Password"
                  value={emailConfig.password || ''}
                  onChange={(e) => {
                    handleConfigChange('password', e.target.value);
                    if (e.target.value && emailConfig.user) {
                      setPasswordSavedBefore(true);
                    }
                  }}
                  fullWidth
                  margin="normal"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  helperText={
                    passwordSavedBefore
                      ? '✓ Password saved (enter new password to update)'
                      : 'SMTP authentication password'
                  }
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
            </Grid>

            {/* Security Settings */}
            <Box sx={{ mb: 3, p: 2, backgroundColor: '#f3f4f6', borderRadius: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.secure || false}
                    onChange={(e) => handleConfigChange('secure', e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 500 }}>
                      {emailConfig.secure ? '✓ TLS/SSL Enabled' : 'Enable TLS/SSL'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>
                      Use TLS (port 587) or SSL (port 465) for secure connection
                    </Typography>
                  </Box>
                }
              />
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Test Email Configuration */}
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
              📨 Test SMTP Configuration
            </Typography>

            <TextField
              label="Test Email Recipient"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              fullWidth
              margin="normal"
              type="email"
              placeholder="Leave blank to send to From Email"
              helperText="Enter an email address where you want to receive the test email"
              size="small"
            />

            <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                color="success"
                onClick={handleTestSmtpConnection}
                disabled={!emailConfig.host || !emailConfig.port || testing}
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
            ⚠️ <strong>Important:</strong> Store SMTP credentials securely. These settings are
            encrypted on the server.
          </Alert>
        </>
      )}

      {(!emailConfig.enabled || emailConfig.provider !== 'custom') && (
        <Alert severity="info">
          Custom SMTP is currently disabled. Enable it above to configure custom email settings.
        </Alert>
      )}
    </Paper>
  );
};

export default CustomSmtpSettings;
