import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
  Grid,
  Divider,
  Typography
} from '@mui/material';
import { message } from 'antd';
import { adminAPI } from '../../services/api';

interface EmailConfig {
  enabled: boolean;
  provider: 'gmail' | 'mailtrap' | 'sendgrid' | 'aws-ses' | 'custom';
  fromName: string;
  fromEmail: string;
  // Gmail
  gmailAppPassword?: string;
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

  return (
    <Card>
      <CardHeader title="Email Settings" subheader="Configure email provider, sender identity, and enable or disable email sending." />
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

          {/* Info about provider-specific fields */}
          <Alert severity="info">
            <strong>Provider-Specific Configuration</strong>
            <br />
            Gmail settings and custom SMTP settings are configured in their dedicated sections when selected above.
          </Alert>
        </Box>
      </CardContent>
    </Card>
  );
};

export default EmailSettings;
