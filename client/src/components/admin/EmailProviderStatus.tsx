import React, { useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  Chip,
  Grid,
  Divider,
  CircularProgress,
  Button,
} from '@mui/material';
import { CheckCircle, Error, Warning, Info, Refresh } from '@mui/icons-material';

interface EmailConfig {
  enabled: boolean;
  provider?: string;
  fromName?: string;
  fromEmail?: string;
  host?: string;
  port?: number;
  user?: string;
  gmailAddress?: string;
  gmailAppPassword?: string;
  sendgridApiKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  updatedAt?: string | Date;
}

interface HealthCheckStatus {
  status: 'ok' | 'warning' | 'failed' | 'unknown';
  provider?: string;
  lastCheckAt?: string | Date;
  lastError?: string;
}

interface EmailProviderStatusProps {
  emailConfig?: EmailConfig;
  emailSettings?: {
    enabled: boolean;
  };
  healthStatus?: HealthCheckStatus;
  onHealthCheckClick?: () => void;
  loading?: boolean;
}

const EmailProviderStatus: React.FC<EmailProviderStatusProps> = ({
  emailConfig,
  emailSettings,
  healthStatus,
  onHealthCheckClick,
  loading = false,
}) => {
  // Validate provider configuration completeness
  const validationStatus = useMemo(() => {
    if (!emailConfig || !emailConfig.provider) {
      return {
        isConfigured: false,
        isValid: false,
        missingFields: ['provider'],
        status: 'unconfigured',
        icon: Info,
        color: '#64748b',
        message: 'No email provider selected',
      };
    }

    const missingFields: string[] = [];

    // Check common required fields
    if (!emailConfig.fromEmail) {
      missingFields.push('fromEmail');
    }

    // Check provider-specific required fields
    switch (emailConfig.provider) {
      case 'custom':
        if (!emailConfig.host) missingFields.push('host');
        if (!emailConfig.port) missingFields.push('port');
        if (!emailConfig.user) missingFields.push('user');
        break;

      case 'gmail':
        if (!emailConfig.gmailAddress) missingFields.push('gmailAddress');
        if (!emailConfig.gmailAppPassword) missingFields.push('gmailAppPassword');
        break;

      case 'mailtrap':
        if (!emailConfig.user) missingFields.push('user');
        break;

      case 'sendgrid':
        if (!emailConfig.sendgridApiKey) missingFields.push('sendgridApiKey');
        break;

      case 'aws-ses':
        if (!emailConfig.awsAccessKeyId) missingFields.push('awsAccessKeyId');
        if (!emailConfig.awsSecretAccessKey) missingFields.push('awsSecretAccessKey');
        break;
    }

    const isValid = missingFields.length === 0;
    const isConfigured = emailConfig.enabled && isValid;

    if (isConfigured) {
      return {
        isConfigured: true,
        isValid: true,
        missingFields: [],
        status: 'ready',
        icon: CheckCircle,
        color: '#10b981',
        message: 'Email provider configured and ready',
      };
    } else if (emailConfig.enabled && !isValid) {
      return {
        isConfigured: false,
        isValid: false,
        missingFields,
        status: 'misconfigured',
        icon: Error,
        color: '#ef4444',
        message: `Email provider misconfigured (missing: ${missingFields.join(', ')})`,
      };
    } else if (!emailConfig.enabled) {
      return {
        isConfigured: false,
        isValid: true,
        missingFields: [],
        status: 'disabled',
        icon: Warning,
        color: '#f59e0b',
        message: 'Email sending is disabled',
      };
    } else {
      return {
        isConfigured: false,
        isValid: false,
        missingFields,
        status: 'incomplete',
        icon: Warning,
        color: '#f59e0b',
        message: `Email provider incomplete (missing: ${missingFields.join(', ')})`,
      };
    }
  }, [emailConfig]);

  // Get provider display name
  const getProviderDisplayName = (provider?: string): string => {
    if (!provider) return 'Not Selected';
    const names: Record<string, string> = {
      custom: 'Custom SMTP',
      gmail: 'Gmail',
      mailtrap: 'Mailtrap',
      sendgrid: 'SendGrid',
      'aws-ses': 'AWS SES',
    };
    return names[provider] || provider;
  };

  // Format date
  const formatDate = (date?: string | Date): string => {
    if (!date) return 'Never';
    try {
      return new Date(date).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  const StatusIcon = validationStatus.icon;

  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 2,
        boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
        border: '1px solid #e2e8f0',
        background: '#ffffff',
        borderTop: `4px solid ${validationStatus.color}`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ width: 4, height: 28, background: validationStatus.color, borderRadius: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
          📧 Email Provider Status
        </Typography>
      </Box>

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={40} />
          <Typography sx={{ ml: 2, color: '#64748b' }}>Loading email configuration...</Typography>
        </Box>
      )}

      {!loading && (
        <>
          {/* Status Alert */}
          <Alert
            severity={
              validationStatus.status === 'ready'
                ? 'success'
                : validationStatus.status === 'misconfigured'
                ? 'error'
                : validationStatus.status === 'disabled'
                ? 'warning'
                : 'info'
            }
            icon={<StatusIcon />}
            sx={{ mb: 3, borderRadius: 1 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {validationStatus.message}
            </Typography>
          </Alert>

          {/* Warning: Sending Enabled but Misconfigured */}
          {emailSettings?.enabled && !validationStatus.isValid && (
            <Alert
              severity="warning"
              icon={<Warning />}
              sx={{ mb: 3, borderRadius: 1, background: '#fffbeb', borderColor: '#fcd34d' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#92400e' }}>
                ⚠️ Email sending is enabled but provider is misconfigured. Emails may fail to send.
              </Typography>
              <Typography variant="caption" sx={{ color: '#a16207', display: 'block', mt: 1 }}>
                Configure the provider settings or disable email sending to avoid failures.
              </Typography>
            </Alert>
          )}

          {/* Provider Details Grid */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Provider Name */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  PROVIDER
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                    {getProviderDisplayName(emailConfig?.provider)}
                  </Typography>
                  <Chip
                    label={emailConfig?.enabled ? 'Enabled' : 'Disabled'}
                    color={emailConfig?.enabled ? 'success' : 'default'}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 24,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  />
                </Box>
              </Box>
            </Grid>

            {/* From Email */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  FROM EMAIL
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: emailConfig?.fromEmail ? '#0f172a' : '#cbd5e1',
                    mt: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  {emailConfig?.fromEmail || '(not set)'}
                </Typography>
              </Box>
            </Grid>

            {/* From Name */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  FROM NAME
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: emailConfig?.fromName ? '#0f172a' : '#cbd5e1',
                    mt: 1,
                  }}
                >
                  {emailConfig?.fromName || '(not set)'}
                </Typography>
              </Box>
            </Grid>

            {/* Last Updated */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  LAST UPDATED
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#0f172a',
                    mt: 1,
                    fontSize: '0.875rem',
                  }}
                >
                  {formatDate(emailConfig?.updatedAt)}
                </Typography>
              </Box>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Health Check Status */}
          {healthStatus && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                  Connectivity Health
                </Typography>
                <Button
                  size="small"
                  startIcon={<Refresh />}
                  onClick={onHealthCheckClick}
                  variant="outlined"
                  sx={{ height: 28, fontSize: '0.75rem' }}
                  disabled={!emailConfig?.enabled}
                >
                  Check Now
                </Button>
              </Box>
              
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {healthStatus.status === 'ok' && (
                    <>
                      <Box sx={{ width: 12, height: 12, backgroundColor: '#10b981', borderRadius: '50%' }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#10b981' }}>
                          OK - Provider is operational
                        </Typography>
                        {healthStatus.lastCheckAt && (
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Last checked: {formatDate(healthStatus.lastCheckAt)}
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                  {healthStatus.status === 'warning' && (
                    <>
                      <Box sx={{ width: 12, height: 12, backgroundColor: '#f59e0b', borderRadius: '50%' }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#f59e0b' }}>
                          WARNING - Provider may have issues
                        </Typography>
                        {healthStatus.lastError && (
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            {healthStatus.lastError}
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                  {healthStatus.status === 'failed' && (
                    <>
                      <Box sx={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: '50%' }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#ef4444' }}>
                          FAILED - Provider connectivity lost
                        </Typography>
                        {healthStatus.lastError && (
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Error: {healthStatus.lastError}
                          </Typography>
                        )}
                        {healthStatus.lastCheckAt && (
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                            Last checked: {formatDate(healthStatus.lastCheckAt)}
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                  {healthStatus.status === 'unknown' && (
                    <>
                      <Box sx={{ width: 12, height: 12, backgroundColor: '#94a3b8', borderRadius: '50%' }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#64748b' }}>
                          UNKNOWN - Health check not performed
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          Click "Check Now" to verify provider connectivity
                        </Typography>
                      </Box>
                    </>
                  )}
                </Box>
              </Box>
              <Divider sx={{ my: 2 }} />
            </Box>
          )}

          {/* Configuration Status Details */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
              Configuration Status
            </Typography>

            {validationStatus.isConfigured ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 500 }}>
                  All required fields configured. Email provider is ready to use.
                </Typography>
              </Box>
            ) : validationStatus.missingFields.length > 0 ? (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Error sx={{ color: '#ef4444', fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 500 }}>
                    Missing required fields:
                  </Typography>
                </Box>
                <Box sx={{ ml: 4, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {validationStatus.missingFields.map((field, idx) => (
                    <Chip
                      key={idx}
                      label={field}
                      size="small"
                      variant="outlined"
                      color="error"
                      sx={{
                        height: 28,
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Info sx={{ color: '#0891b2', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: '#0891b2', fontWeight: 500 }}>
                  No provider selected. Configure email provider in the Email Settings section.
                </Typography>
              </Box>
            )}
          </Box>

          {/* Provider-Specific Info */}
          {emailConfig?.provider && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                  {getProviderDisplayName(emailConfig.provider)} Details
                </Typography>

                {emailConfig.provider === 'custom' && (
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        HOST
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: emailConfig.host ? '#0f172a' : '#cbd5e1',
                          mt: 0.5,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {emailConfig.host || '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        PORT
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: emailConfig.port ? '#0f172a' : '#cbd5e1',
                          mt: 0.5,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {emailConfig.port || '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        USER
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: emailConfig.user ? '#0f172a' : '#cbd5e1',
                          mt: 0.5,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {emailConfig.user ? `${emailConfig.user.substring(0, 3)}***` : '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        SECURE
                      </Typography>
                      <Chip
                        label={(emailConfig as any).secure ? 'Yes' : 'No'}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          mt: 0.5,
                          fontSize: '0.7rem',
                        }}
                      />
                    </Grid>
                  </Grid>
                )}

                {emailConfig.provider === 'gmail' && (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        GMAIL ADDRESS
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: emailConfig.gmailAddress ? '#0f172a' : '#cbd5e1',
                          mt: 0.5,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {emailConfig.gmailAddress || '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        APP PASSWORD
                      </Typography>
                      <Chip
                        label={emailConfig.gmailAppPassword ? '••••••••••' : 'Not set'}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          mt: 0.5,
                          fontSize: '0.7rem',
                        }}
                      />
                    </Grid>
                  </Grid>
                )}

                {emailConfig.provider === 'sendgrid' && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                      API KEY
                    </Typography>
                    <Chip
                      label={emailConfig.sendgridApiKey ? '••••••••••' : 'Not set'}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        mt: 0.5,
                        fontSize: '0.7rem',
                      }}
                    />
                  </Box>
                )}

                {emailConfig.provider === 'aws-ses' && (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        ACCESS KEY ID
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: emailConfig.awsAccessKeyId ? '#0f172a' : '#cbd5e1',
                          mt: 0.5,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {emailConfig.awsAccessKeyId ? `${emailConfig.awsAccessKeyId.substring(0, 4)}***` : '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        REGION
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#0f172a',
                          mt: 0.5,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {(emailConfig as any).awsRegion || '—'}
                      </Typography>
                    </Grid>
                  </Grid>
                )}
              </Box>
            </>
          )}

          {/* Info Footer */}
          <Alert
            severity="info"
            sx={{ mt: 3, borderRadius: 1, background: '#ecf0ff' }}
          >
            <Typography variant="caption" sx={{ color: '#4f46e5' }}>
              <strong>Note:</strong> This panel is read-only. To configure email settings, use the
              Email Settings and Advanced SMTP Configuration sections above. This panel updates automatically
              after saving.
            </Typography>
          </Alert>
        </>
      )}
    </Paper>
  );
};

export default EmailProviderStatus;
