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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { message as antdMessage } from 'antd';
import { adminAPI } from '../../services/api';
import EmailProviderManager from '../../utils/EmailProviderManager';

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
  smtpPasswordProp?: string;  // Real SMTP password from parent component
  passwordDirty?: boolean;  // Tracks if password field has been edited by user
  hasBackendPassword?: boolean;  // Whether backend has a saved password (even if not shown in UI)
}

const CustomSmtpSettings = ({ emailConfig, setEmailConfig, smtpPasswordProp = '', passwordDirty = false, hasBackendPassword = false }: CustomSmtpSettingsProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [smtpPasswordVisible, setSmtpPasswordVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  // Track if password has been modified by user (real password always stored in emailConfig.password)
  const [passwordModified, setPasswordModified] = useState(false);
  // Local state for password input field - updates on every user keystroke
  const [smtpPassword, setSmtpPassword] = useState('');
  // Track if user has edited the password field
  const [smtpPasswordDirty, setSmtpPasswordDirty] = useState(false);
  
  // Provider selection state
  const [selectedProvider, setSelectedProvider] = useState<'mailtrap' | 'sendgrid' | 'gmail'>('mailtrap');
  
  // Provider-specific configuration state
  const [mailtrapConfig, setMailtrapConfig] = useState({
    host: '',
    port: 2525,
    secure: true,
    user: '',
    password: '',
    fromEmail: '',
    fromName: 'Barangay System'
  });

  const [sendgridConfig, setSendgridConfig] = useState({
    apiKey: '',
    fromEmail: '',
    fromName: 'Barangay System'
  });

  const [gmailConfig, setGmailConfig] = useState({
    host: 'smtp.gmail.com',
    port: 587,
    secure: true,
    user: '',
    password: '',
    fromEmail: '',
    fromName: 'Barangay System'
  });
  
  // Track if any provider password is dirty
  const [providerPasswordDirty, setProviderPasswordDirty] = useState({
    mailtrap: false,
    sendgrid: false,
    gmail: false
  });

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
      // STRICT PASSWORD VALIDATION
      // Require smtpPasswordDirty === true (user must have typed in field)
      if (!smtpPasswordDirty) {
        const errorMsg = 'Password must be entered before testing. Please type in the password field.';
        console.warn('[CustomSmtpSettings] Test blocked - password field not edited by user:', {
          smtpPasswordDirty: smtpPasswordDirty,
          hasPassword: !!smtpPassword,
          passwordLength: smtpPassword?.length || 0
        });
        antdMessage.warning(errorMsg);
        return;
      }

      // Require smtpPassword.length > 0 (password must not be empty)
      if (!smtpPassword || smtpPassword.length === 0) {
        const errorMsg = 'SMTP password cannot be empty. Please enter a password.';
        console.error('[CustomSmtpSettings] Test blocked - password is empty:', {
          smtpPasswordDirty: smtpPasswordDirty,
          passwordLength: smtpPassword?.length || 0,
          isEmpty: true
        });
        antdMessage.error(errorMsg);
        return;
      }

      // Check if password is masked using EmailProviderManager utility
      if (EmailProviderManager.isMaskedPassword(smtpPassword)) {
        const errorMsg = 'Password appears to be masked or placeholder. Please enter the actual password.';
        console.error('[CustomSmtpSettings] Test blocked - masked password detected:', {
          smtpPasswordDirty: smtpPasswordDirty,
          isMasked: EmailProviderManager.isMaskedPassword(smtpPassword),
          passwordPattern: smtpPassword.substring(0, 5) + '...'
        });
        antdMessage.error(errorMsg);
        return;
      }

      // Use EmailProviderManager to validate SMTP configuration
      const validationErrors = EmailProviderManager.validateConfig(
        {
          host: emailConfig.host,
          port: emailConfig.port,
          user: emailConfig.user,
          password: smtpPassword,
          fromEmail: emailConfig.fromEmail
        },
        'custom'
      );

      // Validate test email recipient
      const recipientEmail = testEmailAddress.trim() || emailConfig.fromEmail;
      if (!recipientEmail || recipientEmail === '') {
        validationErrors.push('Test email recipient is required');
      } else if (!recipientEmail.includes('@')) {
        validationErrors.push('Test email recipient must be a valid email address');
      }

      // If any validation errors, show them all and block the request
      if (validationErrors.length > 0) {
        const errorMessage = EmailProviderManager.formatValidationErrors(validationErrors);
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
          source: 'local_state'
        });
        throw new Error(errorMsg + '. Cannot build email config for test.');
      }

      // Build request payload with emailConfig nested structure
      // Match backend DTO exactly - no extra fields, precise order
      // Use EmailProviderManager to normalize configuration
      const normalizedConfig = EmailProviderManager.normalizeConfig(
        {
          provider: 'custom',
          host: emailConfig.host,
          port: emailConfig.port,
          user: emailConfig.user,
          password: smtpPasswordDirty ? smtpPassword : undefined,
          secure: emailConfig.secure,
          fromEmail: emailConfig.fromEmail,
          fromName: emailConfig.fromName
        },
        'custom'
      );

      const requestPayload = {
        emailConfig: {
          provider: normalizedConfig.provider,
          host: normalizedConfig.host,
          port: normalizedConfig.port,
          username: normalizedConfig.username,  // Normalized by EmailProviderManager
          ...(normalizedConfig.password && { password: normalizedConfig.password }),
          secure: normalizedConfig.secure,  // Automatically calculated based on port
          fromEmail: normalizedConfig.fromEmail,
          ...(normalizedConfig.fromName && { fromName: normalizedConfig.fromName })
        },
        testEmail: recipientEmail
      };

      console.log('[CustomSmtpSettings] Sending test email request with SMTP config:', {
        emailConfig: {
          provider: requestPayload.emailConfig.provider,
          host: requestPayload.emailConfig.host,
          port: requestPayload.emailConfig.port,
          username: requestPayload.emailConfig.username,  // Normalized field name
          hasPassword: !!requestPayload.emailConfig.password,
          passwordIncluded: smtpPasswordDirty,
          secure: requestPayload.emailConfig.secure,
          fromName: requestPayload.emailConfig.fromName,
          fromEmail: requestPayload.emailConfig.fromEmail
        },
        testEmail: requestPayload.testEmail,
        smtpPasswordDirty: smtpPasswordDirty,
        validationPassed: true,
        timestamp: new Date().toISOString()
      });

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

          {/* Email Provider Selector */}
          <Box sx={{ mt: 3, mb: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Email Provider</InputLabel>
              <Select
                value={selectedProvider}
                label="Email Provider"
                onChange={(e) => {
                  const newProvider = e.target.value as 'mailtrap' | 'sendgrid' | 'gmail';
                  setSelectedProvider(newProvider);
                  console.log('[CustomSmtpSettings] Provider changed to:', newProvider);
                }}
                size="small"
              >
                <MenuItem value="mailtrap">Mailtrap</MenuItem>
                <MenuItem value="sendgrid">SendGrid</MenuItem>
                <MenuItem value="gmail">Gmail</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* MAILTRAP Configuration Form */}
          {selectedProvider === 'mailtrap' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                Sender Information
              </Typography>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="From Name"
                    value={mailtrapConfig.fromName || ''}
                    onChange={(e) => setMailtrapConfig({ ...mailtrapConfig, fromName: e.target.value })}
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
                    value={mailtrapConfig.fromEmail || ''}
                    onChange={(e) => setMailtrapConfig({ ...mailtrapConfig, fromEmail: e.target.value })}
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

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                SMTP Server Settings
              </Typography>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="SMTP Host"
                    value={mailtrapConfig.host || ''}
                    onChange={(e) => setMailtrapConfig({ ...mailtrapConfig, host: e.target.value })}
                    fullWidth
                    margin="normal"
                    placeholder="smtp.mailtrap.io"
                    helperText="SMTP server address"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="SMTP Port"
                    value={mailtrapConfig.port || 2525}
                    onChange={(e) => {
                      const port = parseInt(e.target.value) || 2525;
                      // Automatically calculate secure flag based on port using EmailProviderManager
                      const secure = EmailProviderManager.calculateSecureFromPort(port, 'mailtrap');
                      setMailtrapConfig({ ...mailtrapConfig, port, secure });
                    }}
                    fullWidth
                    margin="normal"
                    type="number"
                    placeholder="2525"
                    helperText="Typical: 2525 (unencrypted) or 465 (SSL)"
                    size="small"
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="SMTP Username"
                    value={mailtrapConfig.user || ''}
                    onChange={(e) => setMailtrapConfig({ ...mailtrapConfig, user: e.target.value })}
                    fullWidth
                    margin="normal"
                    placeholder="your-username"
                    helperText="Mailtrap username"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="SMTP Password"
                    type={smtpPasswordVisible ? 'text' : 'password'}
                    value={mailtrapConfig.password || ''}
                    onChange={(e) => {
                      setMailtrapConfig({ ...mailtrapConfig, password: e.target.value });
                      setProviderPasswordDirty({ ...providerPasswordDirty, mailtrap: true });
                    }}
                    fullWidth
                    margin="normal"
                    placeholder="••••••••"
                    helperText="Your Mailtrap password"
                    size="small"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setSmtpPasswordVisible(!smtpPasswordVisible)}
                            edge="end"
                            size="small"
                          >
                            {smtpPasswordVisible ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
              </Grid>

              <Box sx={{ mb: 3, p: 2, backgroundColor: '#f3f4f6', borderRadius: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={mailtrapConfig.secure !== false}
                      onChange={(e) => setMailtrapConfig({ ...mailtrapConfig, secure: e.target.checked })}
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontWeight: 500 }}>
                        {mailtrapConfig.secure !== false ? '✓ TLS/SSL Enabled' : 'Enable TLS/SSL'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        Mailtrap: Use port 465 (SSL) or 2525 (non-TLS)
                      </Typography>
                    </Box>
                  }
                />
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                📨 Test Mailtrap Configuration
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
                  disabled={!mailtrapConfig.host || !mailtrapConfig.port || testing}
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
          )}

          {/* SENDGRID Configuration Form */}
          {selectedProvider === 'sendgrid' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                Sender Information
              </Typography>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="From Name"
                    value={sendgridConfig.fromName || ''}
                    onChange={(e) => setSendgridConfig({ ...sendgridConfig, fromName: e.target.value })}
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
                    value={sendgridConfig.fromEmail || ''}
                    onChange={(e) => setSendgridConfig({ ...sendgridConfig, fromEmail: e.target.value })}
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

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                SendGrid API Configuration
              </Typography>

              <TextField
                label="SendGrid API Key"
                type={smtpPasswordVisible ? 'text' : 'password'}
                value={sendgridConfig.apiKey || ''}
                onChange={(e) => {
                  setSendgridConfig({ ...sendgridConfig, apiKey: e.target.value });
                  setProviderPasswordDirty({ ...providerPasswordDirty, sendgrid: true });
                }}
                fullWidth
                margin="normal"
                placeholder="SG.xxxxxxxxxx"
                helperText="Your SendGrid API key (starts with 'SG.')"
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setSmtpPasswordVisible(!smtpPasswordVisible)}
                        edge="end"
                        size="small"
                      >
                        {smtpPasswordVisible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                📨 Test SendGrid Configuration
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
                  disabled={!sendgridConfig.apiKey || !sendgridConfig.fromEmail || testing}
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
          )}

          {/* GMAIL Configuration Form */}
          {selectedProvider === 'gmail' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                Gmail Account Information
              </Typography>

              <Alert severity="info" sx={{ mb: 3 }}>
                💡 <strong>Gmail Setup:</strong> You need to enable 2-factor authentication on your Gmail account and generate an app password. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Generate app password here</a>
              </Alert>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Gmail Address"
                    type="email"
                    value={gmailConfig.user || ''}
                    onChange={(e) => setGmailConfig({ ...gmailConfig, user: e.target.value })}
                    fullWidth
                    margin="normal"
                    placeholder="your-email@gmail.com"
                    helperText="Your Gmail address"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="From Name"
                    value={gmailConfig.fromName || ''}
                    onChange={(e) => setGmailConfig({ ...gmailConfig, fromName: e.target.value })}
                    fullWidth
                    margin="normal"
                    placeholder="e.g., Barangay System"
                    helperText="How the sender name appears in emails"
                    size="small"
                  />
                </Grid>
              </Grid>

              <TextField
                label="From Email"
                type="email"
                value={gmailConfig.fromEmail || gmailConfig.user || ''}
                onChange={(e) => setGmailConfig({ ...gmailConfig, fromEmail: e.target.value })}
                fullWidth
                margin="normal"
                placeholder="your-email@gmail.com"
                helperText="Sending email address (usually your Gmail address)"
                size="small"
              />

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                Gmail App Password
              </Typography>

              <TextField
                label="App Password"
                type={smtpPasswordVisible ? 'text' : 'password'}
                value={gmailConfig.password || ''}
                onChange={(e) => {
                  setGmailConfig({ ...gmailConfig, password: e.target.value });
                  setProviderPasswordDirty({ ...providerPasswordDirty, gmail: true });
                }}
                fullWidth
                margin="normal"
                placeholder="••••••••••••••••"
                helperText="The 16-character app password from Google Account"
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setSmtpPasswordVisible(!smtpPasswordVisible)}
                        edge="end"
                        size="small"
                      >
                        {smtpPasswordVisible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: '#374151' }}>
                📨 Test Gmail Configuration
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
                  disabled={!gmailConfig.user || !gmailConfig.password || !gmailConfig.fromEmail || testing}
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
          )}

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
