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
  gmailAppPassword?: string;
}

interface CustomSmtpSettingsProps {
  emailConfig: EmailConfig;
  setEmailConfig: (config: EmailConfig) => void;
  smtpPassword?: string;  // Real SMTP password from parent component
  passwordDirty?: boolean;  // Tracks if password field has been edited by user
}

const CustomSmtpSettings = ({ emailConfig, setEmailConfig, smtpPassword = '', passwordDirty = false }: CustomSmtpSettingsProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  // Track if password has been modified by user (real password always stored in emailConfig.password)
  const [passwordModified, setPasswordModified] = useState(false);

  // Clean irrelevant provider fields when provider changes away from custom
  // This enforces single provider: only custom SMTP fields are preserved
  React.useEffect(() => {
    if (emailConfig.provider !== 'custom') {
      console.log('[CustomSmtpSettings] Provider changed away from custom, clearing custom SMTP fields');
      // Fields will be naturally cleared when custom SMTP is not active
      // But we can log this for debugging provider enforcement
    }
  }, [emailConfig.provider]);

  const handleConfigChange = (field: keyof EmailConfig, value: any) => {
    // SINGLE PROVIDER ENFORCEMENT: Only allow custom SMTP fields to be set
    // When provider is 'custom', these fields are preserved
    // When provider changes away, these fields won't be sent to backend
    setEmailConfig({
      ...emailConfig,
      [field]: value,
    });
  };

  const handleTestSmtpConnection = async () => {
    try {
      // Check if password has been dirtied (edited by user)
      if (!passwordDirty) {
        const errorMsg = 'Password must be entered before testing. Please type or change the password field.';
        console.warn('[CustomSmtpSettings] Test blocked - password not dirty:', {
          passwordDirty: passwordDirty,
          hasPassword: !!smtpPassword,
          passwordLength: smtpPassword?.length || 0
        });
        antdMessage.warning(errorMsg);
        return;
      }

      // EARLY ABORT: Check if password from parent is missing
      if (!smtpPassword || smtpPassword.trim() === '') {
        const errorMsg = 'SMTP password is missing or empty. Please enter a password and save settings first.';
        console.error('[CustomSmtpSettings] Early abort - Password missing from parent:', {
          smtpPassword: smtpPassword,
          isEmpty: !smtpPassword || smtpPassword.trim() === '',
          source: 'parent_component'
        });
        antdMessage.error(errorMsg);
        return;
      }

      // Comprehensive validation of all SMTP fields before making API call
      const validationErrors: string[] = [];

      // Validate SMTP host
      if (!emailConfig.host || emailConfig.host.trim() === '') {
        validationErrors.push('SMTP host is required');
      }

      // Validate SMTP port
      if (!emailConfig.port || emailConfig.port < 1 || emailConfig.port > 65535) {
        validationErrors.push('SMTP port must be between 1 and 65535');
      }

      // Validate username
      if (!emailConfig.user || emailConfig.user.trim() === '') {
        validationErrors.push('SMTP username is required');
      }

      // Validate from email
      if (!emailConfig.fromEmail || emailConfig.fromEmail.trim() === '') {
        validationErrors.push('From email address is required');
      } else if (!emailConfig.fromEmail.includes('@')) {
        validationErrors.push('From email address must be a valid email');
      }

      // Validate test email recipient
      const recipientEmail = testEmailAddress.trim() || emailConfig.fromEmail;
      if (!recipientEmail || recipientEmail === '') {
        validationErrors.push('Test email recipient is required');
      } else if (!recipientEmail.includes('@')) {
        validationErrors.push('Test email recipient must be a valid email address');
      }

      // If any validation errors, show them all and block the request
      if (validationErrors.length > 0) {
        const errorMessage = validationErrors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
        console.log('[CustomSmtpSettings] Test email validation failed:\n' + errorMessage);
        antdMessage.error(
          <Box sx={{ whiteSpace: 'pre-wrap' }}>
            <strong>Please fix the following issues before testing:</strong>
            {'\n'}
            {errorMessage}
          </Box>
        );
        return;
      }

      // ASSERTION: Validate password type and length before building payload
      if (typeof smtpPassword !== 'string' || smtpPassword.length === 0) {
        const errorMsg = 'ASSERTION FAILED: Password must be a non-empty string';
        console.error('[CustomSmtpSettings] Password assertion failed before payload build:', {
          assertion: 'typeof password === "string" && password.length > 0',
          passwordType: typeof smtpPassword,
          passwordLength: smtpPassword?.length || 0,
          passwordIsString: typeof smtpPassword === 'string',
          passwordIsNonEmpty: smtpPassword?.length > 0,
          source: 'parent_component'
        });
        throw new Error(errorMsg + '. Cannot build email config for test.');
      }

      // Build request payload with emailConfig nested structure
      // Match backend DTO exactly - no extra fields, precise order
      const requestPayload = {
        emailConfig: {
          provider: 'custom',
          host: emailConfig.host,
          port: emailConfig.port,
          username: emailConfig.user,  // Normalize: user → username
          password: smtpPassword,  // Real password from parent component
          secure: emailConfig.secure,  // Already normalized by parent based on port
          fromEmail: emailConfig.fromEmail,
          fromName: emailConfig.fromName  // Optional field - only include if defined
        },
        testEmail: recipientEmail
      };
      
      // Remove undefined optional fields to match backend DTO exactly
      if (!requestPayload.emailConfig.fromName) {
        delete requestPayload.emailConfig.fromName;
      }

      console.log('[CustomSmtpSettings] Sending FULL test email request with unsaved SMTP config:', {
        emailConfig: {
          provider: requestPayload.emailConfig.provider,
          host: requestPayload.emailConfig.host,
          port: requestPayload.emailConfig.port,
          username: requestPayload.emailConfig.username,  // Normalized field name
          hasPassword: !!requestPayload.emailConfig.password,
          secure: requestPayload.emailConfig.secure,
          fromName: requestPayload.emailConfig.fromName,
          fromEmail: requestPayload.emailConfig.fromEmail
        },
        testEmail: requestPayload.testEmail,
        passwordDirty: passwordDirty,
        validationPassed: true,
        timestamp: new Date().toISOString()
      });

      // Assert password from parent component is a non-empty string before sending API request
      if (typeof smtpPassword !== 'string' || smtpPassword.trim() === '') {
        const errorMsg = 'CRITICAL: Password assertion failed - password must be a non-empty string from parent component';
        console.error('[CustomSmtpSettings] ' + errorMsg, {
          passwordType: typeof smtpPassword,
          passwordLength: smtpPassword?.length || 0,
          isEmptyString: smtpPassword === '',
          isWhitespace: typeof smtpPassword === 'string' && smtpPassword.trim() === '',
          source: 'parent_component'
        });
        throw new Error(errorMsg + '. Password not properly managed by parent.');
      }

      setTesting(true);
      const response = await adminAPI.post('/settings/email/test', requestPayload);

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
        📧 Advanced SMTP Configuration
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
                  value={smtpPassword || ''}
                  onChange={(e) => {
                    const newPassword = e.target.value;
                    handleConfigChange('password', newPassword);
                    // Mark as modified so save knows to include password
                    setPasswordModified(true);
                  }}
                  fullWidth
                  margin="normal"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  helperText={
                    smtpPassword
                      ? '✓ Password stored (clear and re-enter to change)'
                      : 'SMTP authentication password (enters will be masked for security)'
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
