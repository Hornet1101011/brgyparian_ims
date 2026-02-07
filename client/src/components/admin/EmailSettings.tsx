import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Grid,
  FormHelperText,
  Divider,
  InputAdornment,
  IconButton,
  Typography
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { message } from 'antd';
import { adminAPI } from '../../services/api';

interface EmailConfig {
  enabled: boolean;
  provider: 'gmail' | 'mailtrap' | 'sendgrid' | 'aws-ses' | 'custom';
  fromName: string;
  fromEmail: string;
  // Gmail
  gmailAddress?: string;
  // Mailtrap
  user?: string;
  password?: string;
  // SendGrid
  sendgridApiKey?: string;
  // AWS SES
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  // Custom SMTP
  host?: string;
  port?: number;
  secure?: boolean;
}

interface Provider {
  id: string;
  name: string;
  fields: string[];
}

const EmailSettings = ({ onConfigChange }: { onConfigChange?: (config: EmailConfig) => void }) => {
  const [config, setConfig] = useState({
    enabled: false,
    provider: 'custom' as const,
    fromName: 'Barangay System',
    fromEmail: ''
  } as EmailConfig);

  const [providers, setProviders] = useState([] as Provider[]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showPasswords, setShowPasswords] = useState({} as Record<string, boolean>);

  useEffect(() => {
    // Providers are static configuration, load once
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await adminAPI.get('/settings/email/providers');
      if (response.data?.success) {
        setProviders(response.data.providers);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
      // Providers failed to load, but component can still work with static list
    }
  };

  const handleConfigChange = (field: string, value: any) => {
    const updatedConfig = { ...config, [field]: value };
    setConfig(updatedConfig);
    // Notify parent of config changes
    if (onConfigChange) {
      onConfigChange(updatedConfig);
    }
  };



  const validateConfig = (): boolean => {
    if (!config.enabled) return true;
    if (!config.fromName || !config.fromEmail) {
      message.error('From name and email are required');
      return false;
    }

    switch (config.provider) {
      case 'gmail':
        if (!config.gmailAddress) {
          message.error('Gmail address is required');
          return false;
        }
        break;
      case 'mailtrap':
        if (!config.user || !config.password) {
          message.error('Mailtrap username and password are required');
          return false;
        }
        break;
      case 'sendgrid':
        if (!config.sendgridApiKey) {
          message.error('SendGrid API key is required');
          return false;
        }
        break;
      case 'aws-ses':
        if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
          message.error('AWS access key and secret key are required');
          return false;
        }
        break;
      case 'custom':
        if (!config.host || !config.port) {
          message.error('Host and port are required for custom SMTP');
          return false;
        }
        break;
    }
    return true;
  };

  const handleTestEmail = async () => {
    if (!validateConfig()) {
      return;
    }

    try {
      if (!testEmail.includes('@')) {
        message.error('Please enter a valid test email address');
        return;
      }

      setTesting(true);
      // Send current email config along with test email so we can test before saving
      const response = await adminAPI.post('/settings/email/test', {
        testEmail,
        emailConfig: config  // Send the current frontend config, not just the test email
      });

      if (response.data?.success) {
        message.success(`Test email sent successfully to ${testEmail}`);
        setTestEmail('');
      }
    } catch (err: any) {
      console.error('Failed to send test email:', err);
      message.error(err.response?.data?.message || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const togglePasswordVisibility = (field: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const renderProviderFields = () => {
    const provider = config.provider;

    switch (provider) {
      case 'gmail':
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Gmail Address"
                value={config.gmailAddress || ''}
                onChange={(e) => handleConfigChange('gmailAddress', e.target.value)}
                placeholder="example@gmail.com"
                type="email"
              />
            </Grid>
          </Grid>
        );

      case 'mailtrap':
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Mailtrap Username"
                value={config.user || ''}
                onChange={(e) => handleConfigChange('user', e.target.value)}
                placeholder="Your Mailtrap username"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Mailtrap Password"
                type={showPasswords['mailtrap'] ? 'text' : 'password'}
                value={config.password || ''}
                onChange={(e) => handleConfigChange('password', e.target.value)}
                placeholder="Your Mailtrap password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility('mailtrap')}
                        edge="end"
                      >
                        {showPasswords['mailtrap'] ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
          </Grid>
        );

      case 'sendgrid':
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="SendGrid API Key"
                type={showPasswords['sendgrid'] ? 'text' : 'password'}
                value={config.sendgridApiKey || ''}
                onChange={(e) => handleConfigChange('sendgridApiKey', e.target.value)}
                placeholder="Your SendGrid API key"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility('sendgrid')}
                        edge="end"
                      >
                        {showPasswords['sendgrid'] ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <FormHelperText>Get your API key from SendGrid dashboard</FormHelperText>
            </Grid>
          </Grid>
        );

      case 'aws-ses':
        return (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="AWS Access Key ID"
                value={config.awsAccessKeyId || ''}
                onChange={(e) => handleConfigChange('awsAccessKeyId', e.target.value)}
                placeholder="AKIA..."
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="AWS Region"
                value={config.awsRegion || 'us-east-1'}
                onChange={(e) => handleConfigChange('awsRegion', e.target.value)}
                placeholder="us-east-1"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="AWS Secret Access Key"
                type={showPasswords['aws'] ? 'text' : 'password'}
                value={config.awsSecretAccessKey || ''}
                onChange={(e) => handleConfigChange('awsSecretAccessKey', e.target.value)}
                placeholder="Your AWS secret key"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility('aws')}
                        edge="end"
                      >
                        {showPasswords['aws'] ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
          </Grid>
        );

      case 'custom':
        return (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="SMTP Host"
                value={config.host || ''}
                onChange={(e) => handleConfigChange('host', e.target.value)}
                placeholder="smtp.example.com"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="SMTP Port"
                type="number"
                value={config.port || 587}
                onChange={(e) => handleConfigChange('port', parseInt(e.target.value) || 587)}
                placeholder="587"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                value={config.user || ''}
                onChange={(e) => handleConfigChange('user', e.target.value)}
                placeholder="SMTP username"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Password"
                type={showPasswords['custom'] ? 'text' : 'password'}
                value={config.password || ''}
                onChange={(e) => handleConfigChange('password', e.target.value)}
                placeholder="SMTP password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => togglePasswordVisibility('custom')}
                        edge="end"
                      >
                        {showPasswords['custom'] ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={config.secure || false}
                    onChange={(e) => handleConfigChange('secure', e.target.checked)}
                  />
                }
                label="Use TLS/SSL (secure connection)"
              />
            </Grid>
          </Grid>
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader title="Email Settings" subheader="Configure email provider and sender information" />
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Enable/Disable */}
          <FormControlLabel
            control={
              <Checkbox
                checked={config.enabled}
                onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              />
            }
            label="Enable Email Sending"
          />

          {config.enabled && (
            <Alert severity="info">
              Email sending is enabled. Make sure to test your configuration before relying on it.
            </Alert>
          )}

          {/* Provider Selection */}
          <TextField
            select
            label="Email Provider"
            value={config.provider}
            onChange={(e) => handleConfigChange('provider', e.target.value)}
            fullWidth
          >
            {providers.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>

          {/* Common Fields */}
          <Divider />
          <Typography variant="subtitle2">Sender Information</Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="From Name"
                value={config.fromName}
                onChange={(e) => handleConfigChange('fromName', e.target.value)}
                placeholder="Barangay System"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="From Email"
                type="email"
                value={config.fromEmail}
                onChange={(e) => handleConfigChange('fromEmail', e.target.value)}
                placeholder="noreply@example.com"
              />
            </Grid>
          </Grid>

          {/* Provider-Specific Fields */}
          <Divider />
          <Typography variant="subtitle2">Provider Configuration</Typography>
          {renderProviderFields()}
          {/* Test Email Section */}
          <Divider />
          <Typography variant="subtitle2">Test Configuration</Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Test Email Address"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button
                variant="outlined"
                onClick={handleTestEmail}
                disabled={testing || !config.enabled}
                fullWidth
                sx={{ mt: 1 }}
              >
                {testing ? <CircularProgress size={24} /> : 'Send Test Email'}
              </Button>
            </Grid>
          </Grid>

          {/* Provider Info */}
          <Alert severity="info">
            <strong>{config.provider.toUpperCase()} Configuration</strong>
            <br />
            Email provider settings are saved with the main system settings using the Save button at the bottom right.
          </Alert>
        </Box>
      </CardContent>
    </Card>
  );
};

export default EmailSettings;
