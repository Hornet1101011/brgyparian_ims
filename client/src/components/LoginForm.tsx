import React, { useEffect, useRef, useState } from 'react';
import { Row, Col, Form, Input, Button, Card, Typography, message, Modal, Radio, notification, Divider, Space, Tag, Alert, Spin } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, MailOutlined, EnvironmentOutlined, BellOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI, axiosPublic, axiosInstance } from '../services/api';
import getOfficialPhotoSrc, { fetchPublicOfficials, PublicOfficial } from '../utils/officials';
import OfficialPhotoImage from './OfficialPhotoImage';
import StatsPanel from './StatsPanel';
import './LoginForm.css';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useSystemSettings, SystemSettingsPublic } from '../hooks/useSystemSettings';
import { useBarangayInfo, BarangayInfoItem } from '../hooks/useBarangayInfo';
import { useContactInfo, ContactInfoItem } from '../hooks/useContactInfo';

/**
 * DO NOT MODIFY:
 * - authentication logic
 * - API calls
 * - form handlers
 * - validation
 * - routes or state
 *
 * ONLY improve:
 * - layout
 * - spacing
 * - alignment
 * - typography
 * - visual hierarchy
 *
 * Preserve:
 * - all colors
 * - gradients
 * - button styles
 */

const LoginForm: React.FC = () => {
    
  const { login, isAuthenticated, user, setUser } = useAuth() as any;
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [forgotPasswordModalVisible, setForgotPasswordModalVisible] = useState(false);
  const [guestForm] = Form.useForm();
  const [forgotPasswordForm] = Form.useForm();
  const [otpForm] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState<'link' | 'otp'>('link');
  const [forgotPasswordSubmittedEmail, setForgotPasswordSubmittedEmail] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [officials, setOfficials] = useState<PublicOfficial[]>([]);
  const [, setOfficialsStatus] = useState<string>('loading');
  const officialsCarouselRef = useRef<HTMLDivElement | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  
  // Use system settings hook - automatically fetches and refreshes every 30 seconds
  const { settings: systemSettings, loading: settingsLoading } = useSystemSettings(true);
  
  // Use barangay info hook - fetches from publicviews collection
  const { items: barangayItems, loading: barangayLoading } = useBarangayInfo(true);
  
  // Use contact info hook - fetches from publicviews collection
  const { items: contactItems, loading: contactLoading } = useContactInfo(true);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'staff') navigate('/staff-dashboard');
      else if ((user as any).role === 'guest') navigate('/guest/dashboard');
      else navigate('/dashboard');
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setOfficialsStatus('fetching public');
        const offs = await fetchPublicOfficials();
        if (mounted && Array.isArray(offs) && offs.length > 0) {
          setOfficials(offs);
          setOfficialsStatus(`public:${offs.length}`);
        } else {
          // fallback attempt to admin endpoint (useful during local dev when auth may be present)
          // Only attempt admin fallback if the current user is authenticated.
          // Public (unauthenticated) visitors should not hit admin endpoints.
          if (isAuthenticated) {
            setOfficialsStatus('trying-admin-fallback');
            try {
              const adminOffs: any[] = await adminAPI.getOfficials();
              if (mounted && Array.isArray(adminOffs) && adminOffs.length > 0) {
                // normalize to PublicOfficial shape
                const mapped = adminOffs.map(a => ({ _id: a._id, name: a.name, title: a.title, term: a.term, hasPhoto: !!a.photo || !!a.photoPath }));
                setOfficials(mapped);
                setOfficialsStatus(`admin:${mapped.length}`);
              } else {
                setOfficialsStatus('no-officials');
              }
            } catch (e) {
              console.warn('Admin fallback failed', e);
              setOfficialsStatus('error');
            }
          } else {
            setOfficialsStatus('no-officials');
          }
        }
      } catch (e) {
        console.warn('Failed to fetch public officials for login preview', e);
        setOfficialsStatus('error');
      }
    })();
    return () => { mounted = false; };
  }, [isAuthenticated]);

  // Fetch system settings on mount and periodically refresh
  // Fetch system settings on mount and periodically refresh
  // (Now handled by useSystemSettings hook above)

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      // Build payload: if the input looks like an email, send it as `email`.
      // Otherwise send as `identifier` so backend can resolve by username.
      const raw = (values.username || '').toString().trim();
      const payload: any = raw.includes('@')
        ? { email: raw, password: values.password }
        : { identifier: raw, password: values.password };

      // Use axiosInstance so runtime API_BASE is respected and credentials are sent
      const resp = await axiosInstance.post('/auth/login', payload);
      const data = resp && resp.data ? resp.data : {};

      if (!resp || resp.status >= 400) {
        console.error('Login response not OK:', { status: resp?.status, data });
        throw new Error(data.message || 'Login failed');
      }

      if (!data.token) {
        console.error('No token in response:', data);
        throw new Error('Login failed - No token received');
      }

      login(data.token);
      message.success(data.message || 'Login successful!');
      // navigation will occur in the useEffect above after auth state updates
    } catch (err: any) {
      // Provide clearer messages based on server response
      const respErr = err?.response;
      if (respErr && respErr.status) {
        if (respErr.status === 401) {
          message.error('Invalid username/email or password');
        } else if (respErr.status === 403) {
          const msg = respErr.data?.message || 'Account is not allowed to login';
          message.error(msg);
        } else if (respErr.status === 404) {
          message.error('Account not found');
        } else {
          message.error(respErr.data?.message || 'Login failed');
        }
      } else {
        message.error(err.message || 'Error logging in');
      }
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const onForgotPasswordFinish = async (values: { email: string }) => {
    setForgotPasswordLoading(true);
    try {
      const res = await axiosPublic.post('/auth/forgot-password', { email: values.email, mode: forgotPasswordMode });
      notification.success({ message: 'Request sent', description: res.data?.message || 'Check your email for instructions.' });
      setForgotPasswordSent(true);
      setForgotPasswordSubmittedEmail(values.email);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to send reset email';
      notification.error({ message: 'Error', description: msg });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const onOtpVerify = async (values: { otp: string }) => {
    setOtpVerifying(true);
    try {
      const res = await axiosPublic.post('/auth/verify-otp-and-reset-password', {
        email: forgotPasswordSubmittedEmail,
        otp: values.otp.replace(/\s/g, '') // Remove spaces
      });
      notification.success({ message: 'Success', description: res.data?.message || 'Your password has been reset. Check your email for the new password.' });
      setOtpVerified(true);
      setTimeout(() => {
        setForgotPasswordModalVisible(false);
        setForgotPasswordSent(false);
        setOtpVerified(false);
        forgotPasswordForm.resetFields();
        otpForm.resetFields();
      }, 1500);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to verify OTP';
      notification.error({ message: 'Error', description: msg });
    } finally {
      setOtpVerifying(false);
    }
  };



  // Component to display barangay information in card carousel format
  // Fetches from publicviews collection via useBarangayInfo hook
  const BarangayInfoCard = () => {
    return (
      <Card 
        className="glass-card info-card barangay-card" 
        variant="outlined"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
          border: '1.5px solid rgba(102, 126, 234, 0.2)',
          borderRadius: 16,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 40px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)',
          padding: 19,
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 13, borderBottom: '1.5px solid rgba(102, 126, 234, 0.1)' }}>
          <div style={{ width: 3, height: 19, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
          <Typography.Title level={5} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>
            <EnvironmentOutlined style={{ marginRight: 6, color: '#667eea', fontSize: 13 }} />
            Barangay Information
          </Typography.Title>
        </div>

        {barangayLoading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Spin size="small" />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>Loading information...</Typography.Text>
          </div>
        ) : (
          <div className="barangay-info-list" style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
            {barangayItems.length === 0 ? (
              <Typography.Text type="secondary" style={{ padding: '20px', textAlign: 'center' }}>No barangay information available</Typography.Text>
            ) : (
              barangayItems.map(item => (
                <div 
                  key={item._id} 
                  className="info-list-item"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)',
                    border: '1.5px solid rgba(102, 126, 234, 0.2)',
                    borderRadius: 10,
                    padding: 13,
                    textAlign: 'center',
                    boxShadow: '0 6px 16px rgba(102, 126, 234, 0.08)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    opacity: item.isPlaceholder ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!item.isPlaceholder) {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 28px rgba(102, 126, 234, 0.25)';
                      (e.currentTarget as HTMLDivElement).style.borderColor = '#667eea';
                      (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 255, 0.7) 100%)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.08)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(102, 126, 234, 0.2)';
                    (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)';
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 8, filter: item.isPlaceholder ? 'grayscale(1) opacity(0.5)' : 'none' }}>
                    {item.icon === 'home' && '🏛️'}
                    {item.icon === 'environment' && '📍'}
                    {item.icon === 'map' && '🗺️'}
                    {item.icon === 'info' && 'ℹ️'}
                  </div>
                  <div style={{ color: '#667eea', fontSize: 9, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.48px' }}>{item.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#0f172a', lineHeight: 1.5 }}>
                    {item.value}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    );
  };

  // Component to display contact information in card carousel format
  const ContactInfoCard = () => {
    return (
      <Card
        className="glass-card contact-card"
        variant="outlined"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
          border: '1.5px solid rgba(102, 126, 234, 0.2)',
          borderRadius: 16,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 40px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)',
          padding: 19,
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 13, borderBottom: '1.5px solid rgba(102, 126, 234, 0.1)' }}>
          <div style={{ width: 3, height: 19, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
          <Typography.Title level={5} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>
            <PhoneOutlined style={{ marginRight: 6, color: '#667eea', fontSize: 13 }} />
            Contact Information
          </Typography.Title>
        </div>

        {contactLoading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Spin size="small" />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>Loading contacts...</Typography.Text>
          </div>
        ) : (
          <div className="contact-info-list" style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
            {contactItems.length === 0 ? (
              <Typography.Text type="secondary" style={{ padding: '20px', textAlign: 'center' }}>No contact information available</Typography.Text>
            ) : (
              contactItems.map(item => (
                <a 
                  key={item._id}
                  href={item.link || '#'}
                  className="contact-list-item"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)',
                    border: '1.5px solid rgba(102, 126, 234, 0.2)',
                    borderRadius: 10,
                    padding: 13,
                    textAlign: 'center',
                    boxShadow: '0 6px 16px rgba(102, 126, 234, 0.08)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: item.isPlaceholder ? 'default' : 'pointer',
                    textDecoration: 'none',
                    color: 'inherit',
                    opacity: item.isPlaceholder ? 0.6 : 1,
                    display: 'block'
                  }}
                  onMouseEnter={(e) => {
                    if (!item.isPlaceholder) {
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 12px 28px rgba(102, 126, 234, 0.25)';
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = '#667eea';
                      (e.currentTarget as HTMLAnchorElement).style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 255, 0.7) 100%)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.08)';
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(102, 126, 234, 0.2)';
                    (e.currentTarget as HTMLAnchorElement).style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)';
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 8, filter: item.isPlaceholder ? 'grayscale(1) opacity(0.5)' : 'none' }}>
                    {item.icon === 'mail' && '📧'}
                    {item.icon === 'phone' && '📱'}
                    {item.icon === 'info' && 'ℹ️'}
                  </div>
                  <div style={{ color: '#667eea', fontSize: 9, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.48px' }}>{item.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#0f172a', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {item.value}
                  </div>
                </a>
              ))
            )}
          </div>
        )}
      </Card>
    );
  };

  // Component to display system notice alert
  const SystemNoticeAlert = () => {
    if (!systemSettings?.systemNotice) return null;
    
    return (
      <Alert
        message={<Typography.Text strong style={{ color: '#0f172a', fontSize: 12, fontWeight: 700 }}>📢 System Notice</Typography.Text>}
        description={
          <Typography.Paragraph style={{ margin: 0, color: '#475569', fontSize: 11, lineHeight: 1.5 }}>
            {systemSettings.systemNotice}
          </Typography.Paragraph>
        }
        type="info"
        icon={<BellOutlined style={{ color: '#667eea', fontSize: 14 }} />}
        showIcon
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
          border: '1.5px solid rgba(102, 126, 234, 0.2)',
          borderRadius: 11,
          padding: '14px 16px',
          boxShadow: '0 10px 22px rgba(102, 126, 234, 0.1)',
          backdropFilter: 'blur(10px)'
        }}
        closable={true}
      />
    );
  };

  return (
    <>
    <div className="login-page three-column" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minHeight: '100vh', width: '100%', padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="login-container three-column-container" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* System Notice Alert - Full Width */}
        {!settingsLoading && <SystemNoticeAlert />}
        
        <Row gutter={[22, 22]} align="stretch" justify="center" className="three-column-row" style={{ height: 'auto', display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          
          {/* LOGIN FORM - Top */}
          <Col xs={24} sm={24} md={24} lg={24} className="pane right-pane" style={{ display: 'flex', minHeight: 0, alignSelf: 'stretch' }}>
            <div className="pane-inner center-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 'auto', width: '100%', minHeight: 0, alignSelf: 'stretch' }}>
              <Card 
                className="glass-card login-card" 
                variant="outlined"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
                  border: '1.5px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: 14,
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 20px 40px rgba(102, 126, 234, 0.2), 0 0 1px rgba(102, 126, 234, 0.4)',
                  padding: 35
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 29 }}>
                  <Typography.Title 
                    level={3} 
                    className="title-blue" 
                    style={{ 
                      textAlign: 'center', 
                      marginBottom: 11,
                      fontSize: 21,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                      letterSpacing: '-0.48px'
                    }}
                  >
                    {systemSettings?.siteName || 'Barangay System'}
                  </Typography.Title>
                  <Typography.Text 
                    style={{ 
                      display: 'block', 
                      color: '#64748b', 
                      fontWeight: 500, 
                      fontSize: 10
                    }}
                  >
                    Sign in to your account
                  </Typography.Text>
                </div>

                <Form 
                  name="login" 
                  layout="vertical" 
                  onFinish={onFinish} 
                  autoComplete="off" 
                  requiredMark={false}
                  style={{ marginBottom: 0 }}
                >
                  <Form.Item 
                    label={<span style={{ fontWeight: 600, color: '#0f172a', fontSize: 11 }}>Email or Username</span>}
                    name="username" 
                    rules={[{ required: true, message: 'Please input your email or username!' }]}
                    style={{ marginBottom: 18 }}
                  >
                    <Input 
                      prefix={<UserOutlined style={{ color: '#667eea' }} />} 
                      placeholder="raymond@example.com" 
                      size="large"
                      style={{
                        borderRadius: 8,
                        border: '1.5px solid #e2e8f0',
                        fontSize: 12,
                        padding: '9px 13px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: 'rgba(248, 250, 255, 0.6)'
                      }}
                      onFocus={(e) => {
                        (e.target as HTMLInputElement).style.borderColor = '#667eea';
                        (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                        (e.target as HTMLInputElement).style.background = 'rgba(248, 250, 255, 1)';
                      }}
                      onBlur={(e) => {
                        (e.target as HTMLInputElement).style.borderColor = '#e2e8f0';
                        (e.target as HTMLInputElement).style.boxShadow = 'none';
                        (e.target as HTMLInputElement).style.background = 'rgba(248, 250, 255, 0.6)';
                      }}
                    />
                  </Form.Item>

                  <Form.Item 
                    label={<span style={{ fontWeight: 600, color: '#0f172a', fontSize: 11 }}>Password</span>}
                    name="password" 
                    rules={[{ required: true, message: 'Please input your password!' }, { min: 6, message: 'Password must be at least 6 characters' }]}
                    style={{ marginBottom: 22 }}
                  >
                    <Input.Password 
                      autoComplete="current-password" 
                      prefix={<LockOutlined style={{ color: '#667eea' }} />} 
                      placeholder="••••••••" 
                      size="large"
                      style={{
                        borderRadius: 8,
                        border: '1.5px solid #e2e8f0',
                        fontSize: 12,
                        padding: '9px 13px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: 'rgba(248, 250, 255, 0.6)'
                      }}
                      onFocus={(e) => {
                        (e.target as HTMLInputElement).style.borderColor = '#667eea';
                        (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                        (e.target as HTMLInputElement).style.background = 'rgba(248, 250, 255, 1)';
                      }}
                      onBlur={(e) => {
                        (e.target as HTMLInputElement).style.borderColor = '#e2e8f0';
                        (e.target as HTMLInputElement).style.boxShadow = 'none';
                        (e.target as HTMLInputElement).style.background = 'rgba(248, 250, 255, 0.6)';
                      }}
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 11 }}>
                    <Button 
                      htmlType="submit" 
                      size="large" 
                      loading={loading} 
                      className="signin-btn"
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 12,
                        borderRadius: 8,
                        height: 38,
                        color: '#ffffff',
                        boxShadow: '0 10px 19px rgba(102, 126, 234, 0.35)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        letterSpacing: '-0.24px'
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 16px 32px rgba(102, 126, 234, 0.45)';
                        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 24px rgba(102, 126, 234, 0.35)';
                        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                      }}
                      block
                    >
                      {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 14, display: 'none' }}>
                    <Button 
                      onClick={() => setGuestModalVisible(true)} 
                      size="large" 
                      className="guest-btn"
                      style={{
                        background: 'rgba(102, 126, 234, 0.1)',
                        border: '2px solid #667eea',
                        color: '#667eea',
                        fontWeight: 700,
                        fontSize: 12,
                        borderRadius: 8,
                        height: 38,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        letterSpacing: '-0.24px'
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = '#667eea';
                        (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(102, 126, 234, 0.1)';
                        (e.currentTarget as HTMLButtonElement).style.color = '#667eea';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                      }}
                      block
                    >
                      Continue as Guest
                    </Button>
                  </Form.Item>

                  <div className="links-section" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 11, paddingBottom: 11, borderBottom: '1.5px solid rgba(102, 126, 234, 0.1)' }}>
                      <Button 
                        type="link" 
                        onClick={() => { setForgotPasswordModalVisible(true); setForgotPasswordSent(false); forgotPasswordForm.resetFields(); }}
                        style={{ padding: 0, color: '#667eea', fontWeight: 600, fontSize: 11, textDecoration: 'none', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#764ba2';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#667eea';
                        }}
                      >
                        Forgot Password?
                      </Button>
                      <RouterLink to="/register" style={{ color: '#667eea', fontWeight: 600, textDecoration: 'none', fontSize: 11, transition: 'all 0.2s' }} onMouseEnter={(e) => (e.currentTarget as HTMLAnchorElement).style.color = '#764ba2'} onMouseLeave={(e) => (e.currentTarget as HTMLAnchorElement).style.color = '#667eea'}>
                        Create Account
                      </RouterLink>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <Button 
                        type="link" 
                        onClick={() => setEmergencyModalVisible(true)}
                        style={{ padding: 0, color: '#ef4444', fontWeight: 700, fontSize: 10, transition: 'all 0.2s', letterSpacing: '-0.16px' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                        }}
                      >
                        🚨 Emergency Hotline
                      </Button>
                    </div>
                  </div>
                </Form>
              </Card>
            </div>
          </Col>

          {/* QUICK STATS - After Login Form */}
          <Col xs={24} sm={24} md={24} lg={24} style={{ display: 'flex', minHeight: 0 }}>
            <StatsPanel />
          </Col>

          {/* BARANGAY OFFICIALS */}
          <Col xs={24} sm={24} md={24} lg={24} className="pane left-pane stats-pane" style={{ display: 'flex', minHeight: 0 }}>
            <div className="pane-inner left-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', width: '100%', minHeight: 0 }}>

              {/* Officials Card */}
              <Card 
                className="glass-card officials-card" 
                variant="outlined"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
                  border: '1.5px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: 13,
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 16px 32px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)',
                  padding: 19,
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 13, borderBottom: '1.5px solid rgba(102, 126, 234, 0.1)' }}>
                  <div style={{ width: 3, height: 19, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
                  <Typography.Title level={5} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>
                    🏛️ Barangay Officials
                  </Typography.Title>
                </div>

                <div className="carousel-wrap vertical" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', flex: 1, minHeight: 0, gap: 10 }}>
                  <div 
                    ref={officialsCarouselRef} 
                    className={`carousel-scroll vertical ${slideDirection ? `slide-${slideDirection}` : ''}`}
                    style={{ 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: 10, 
                      paddingRight: 8,
                      scrollBehavior: 'smooth',
                      minHeight: 0,
                      flex: 1
                    }}>
                    {officials.length === 0 ? (
                      <Typography.Text type="secondary" style={{ padding: '20px', textAlign: 'center' }}>No officials available</Typography.Text>
                    ) : (
                      officials.map(off => (
                        <div 
                          key={off._id} 
                          className="official-card-vertical"
                          style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: 10,
                          textAlign: 'left',
                          boxShadow: '0 3px 10px rgba(0, 0, 0, 0.05)',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          display: 'flex',
                          gap: 8,
                            alignItems: 'flex-start',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 24px rgba(102, 126, 234, 0.15)';
                            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                            (e.currentTarget as HTMLDivElement).style.borderColor = '#667eea';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)';
                            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                            (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
                          }}
                        >
                          <div 
                            className="official-avatar"
                            style={{
                            width: 38,
                            height: 38,
                            borderRadius: 6,
                              overflow: 'hidden',
                              flexShrink: 0,
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '2px solid rgba(102, 126, 234, 0.2)'
                            }}
                          >
                            <OfficialPhotoImage
                              official={off as any}
                              size={48}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, color: '#0f172a', marginBottom: 3, lineHeight: 1.3 }}>{off.name}</div>
                            <div style={{ color: '#64748b', fontSize: 9, marginBottom: 2, fontWeight: 500 }}>{off.title}</div>
                            <div style={{ color: '#94a3b8', fontSize: 8 }}>{off.term}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </Col>

          {/* CENTER COLUMN - Barangay Information & Contact Info */}
          <Col xs={24} sm={24} md={24} lg={24} className="pane center-pane login-pane" style={{ display: 'flex', minHeight: 0 }}>
            <div className="pane-inner right-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', width: '100%', minHeight: 0 }}>
              
              {/* Barangay Information */}
              <BarangayInfoCard />

              {/* Contact Info Card */}
              <div style={{ flexShrink: 0, minHeight: 0 }}><ContactInfoCard /></div>
            </div>
          </Col>

        </Row>
      </div>
  </div>  
  <Modal
      title="Continue as Guest"
      open={guestModalVisible}
      onCancel={() => { setGuestModalVisible(false); guestForm.resetFields(); }}
      onOk={async () => {
        try {
          const vals = await guestForm.validateFields();
          // submit to server to persist in Guest collection
          try {
            // Use public axios instance so the request goes to the configured API base
            // and does not include any auth cookies.
            const resp = await axiosPublic.post('/auth/guest', { name: vals.name, contactNumber: vals.contactNumber, email: vals.email, intent: vals.intent });
            const data = resp && resp.data ? resp.data : {};
            if (!resp || resp.status >= 400) {
              message.error(data.message || 'Failed to create guest');
              return;
            }
            const guestProfile = {
              _id: data._id,
              username: (vals.name || 'guest').toString().toLowerCase().replace(/\s+/g, '_'),
              firstName: vals.name || 'Guest',
              contactNumber: vals.contactNumber || '',
              email: vals.email || '',
              intent: vals.intent || '',
              sessionToken: data.sessionToken,
              expiresAt: data.expiresAt,
              role: 'guest'
            };
            if (typeof setUser === 'function') setUser(guestProfile);
            localStorage.setItem('guestInfo', JSON.stringify(guestProfile));
            // Optionally persist sessionToken separately for server calls
            localStorage.setItem('guestSessionToken', data.sessionToken);
            // If the server returned a JWT token, sign in via auth context so PrivateRoute won't redirect
            if (data.token && typeof login === 'function') {
              try {
                await login(data.token);
              } catch (e) {
                // ignore login failure, but keep guest info available locally
                console.warn('Guest token login failed', e);
              }
            }
            setGuestModalVisible(false);
            guestForm.resetFields();
            navigate('/guest/dashboard');
          } catch (err) {
            console.error('Failed to persist guest', err);
            message.error('Failed to create guest account');
          }
        } catch (err) {
          // validation failed
        }
      }}
    >
      <Form layout="vertical" form={guestModalVisible ? guestForm : undefined}>
        <Form.Item name="name" label="Full name" rules={[{ required: true, message: 'Please enter your name' }]}>
          <Input placeholder="Your full name" />
        </Form.Item>
        <Form.Item name="contactNumber" label="Contact number" rules={[{ required: true, message: 'Please enter a contact number' }]}>
          <Input placeholder="0917..." />
        </Form.Item>
        <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
          <Input placeholder="you@example.com" />
        </Form.Item>
        <Form.Item name="intent" label="Purpose / Intent" rules={[{ required: true, message: 'Please tell us your intent' }]}>
          <Input.TextArea placeholder="Why are you visiting (e.g., check documents, request info)" rows={3} />
        </Form.Item>
      </Form>
    </Modal>
    <Modal
      title="Emergency Hotlines"
      open={emergencyModalVisible}
      onCancel={() => setEmergencyModalVisible(false)}
      footer={null}
    >
      <div style={{ lineHeight: 1.6 }}>
        <Typography.Paragraph>
          For general emergencies: <strong>911</strong>
        </Typography.Paragraph>
        <Typography.Paragraph>
          National Center for Mental Health (Crisis): <strong>0917-899-8727</strong>
        </Typography.Paragraph>
        <Typography.Paragraph>
          Philippine National Police (Emergency Hotline): <strong>9-1-1</strong> / <strong>8723-0401</strong> / <strong>8537-4500</strong>
        </Typography.Paragraph>
      </div>
    </Modal>
    <Modal
      title="Forgot Password"
      open={forgotPasswordModalVisible}
      onCancel={() => { setForgotPasswordModalVisible(false); setForgotPasswordSent(false); setOtpVerified(false); forgotPasswordForm.resetFields(); otpForm.resetFields(); }}
      footer={null}
      centered
      width={500}
    >
      {otpVerified ? (
        <div style={{ textAlign: 'center' }}>
          <Typography.Paragraph style={{ marginBottom: 24, color: '#52c41a' }}>
            ✓ Your password has been reset successfully! Check your email for your new password.
          </Typography.Paragraph>
          <Button
            type="primary"
            block
            onClick={() => {
              setForgotPasswordModalVisible(false);
              setForgotPasswordSent(false);
              setOtpVerified(false);
              forgotPasswordForm.resetFields();
              otpForm.resetFields();
            }}
          >
            Back to Login
          </Button>
        </div>
      ) : forgotPasswordSent && forgotPasswordMode === 'otp' ? (
        <div>
          <Typography.Paragraph style={{ marginBottom: 24 }}>
            We sent a 6-digit code to <strong>{forgotPasswordSubmittedEmail}</strong>. Enter it below to reset your password.
          </Typography.Paragraph>
          <Form
            layout="vertical"
            form={otpForm}
            onFinish={onOtpVerify}
            requiredMark={false}
          >
            <Form.Item
              name="otp"
              label="Enter 6-Digit Code"
              rules={[
                { required: true, message: 'Please enter the code' },
                { pattern: /^\d{6}$/, message: 'Code must be 6 digits' }
              ]}
            >
              <Input placeholder="000000" size="large" maxLength={6} />
            </Form.Item>
            <Form.Item>
              <Button
                htmlType="submit"
                type="primary"
                size="large"
                loading={otpVerifying}
                disabled={otpVerifying}
                block
              >
                Verify & Reset Password
              </Button>
            </Form.Item>
            <Button
              type="link"
              block
              onClick={() => {
                setForgotPasswordSent(false);
                otpForm.resetFields();
              }}
            >
              Back
            </Button>
          </Form>
        </div>
      ) : forgotPasswordSent ? (
        <div style={{ textAlign: 'center' }}>
          <Typography.Paragraph style={{ marginBottom: 24 }}>
            Check your email at <strong>{forgotPasswordSubmittedEmail}</strong> for password reset instructions.
          </Typography.Paragraph>
          <Button
            type="primary"
            block
            onClick={() => {
              setForgotPasswordModalVisible(false);
              setForgotPasswordSent(false);
              forgotPasswordForm.resetFields();
            }}
          >
            Back to Login
          </Button>
        </div>
      ) : (
        <Form
          layout="vertical"
          form={forgotPasswordForm}
          onFinish={onForgotPasswordFinish}
          requiredMark={false}
        >
          <Form.Item label="How would you like to reset your password?">
            <Radio.Group
              value={forgotPasswordMode}
              onChange={(e) => setForgotPasswordMode(e.target.value)}
            >
              <Radio value="link">Send reset link (email)</Radio>
              <Radio value="otp">Send 6-digit code (email)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Enter a valid email' }
            ]}
          >
            <Input placeholder="your@example.com" size="large" />
          </Form.Item>
          <Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              size="large"
              loading={forgotPasswordLoading}
              disabled={forgotPasswordLoading}
              block
            >
              Send Reset Instructions
            </Button>
          </Form.Item>
          <Button
            type="link"
            block
            onClick={() => {
              setForgotPasswordModalVisible(false);
              setForgotPasswordSent(false);
              forgotPasswordForm.resetFields();
            }}
          >
            Cancel
          </Button>
        </Form>
      )}
    </Modal>
    </>
  );
};

export default LoginForm;
