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

const LoginForm = () => {
    
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
  const [forgotPasswordMode, setForgotPasswordMode] = useState('otp' as 'link' | 'otp');
  const [forgotPasswordSubmittedEmail, setForgotPasswordSubmittedEmail] = useState(null as string | null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [officials, setOfficials] = useState([] as PublicOfficial[]);
  const [, setOfficialsStatus] = useState('loading' as string);
  const officialsCarouselRef = useRef(null as any);
  const [slideDirection, setSlideDirection] = useState(null as 'left' | 'right' | null);
  
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

  // Pause state for CSS-based auto-scroll (used below)
  const [autoPaused, setAutoPaused] = useState(false);

  // JS-based auto-scroll for officials list (seamless loop without DOM duplication)
  useEffect(() => {
    const el = officialsCarouselRef.current as HTMLElement | null;
    if (!el) return;

    let rafId: number = 0;
    let last = performance.now();
    let paused = false;
    const speed = 28; // px per second

    const onEnter = () => { paused = true; setAutoPaused(true); };
    const onLeave = () => { paused = false; setAutoPaused(false); last = performance.now(); };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('touchstart', onEnter, { passive: true });
    el.addEventListener('touchend', onLeave, { passive: true });

    const step = (time: number) => {
      const dt = Math.max(0, time - last);
      last = time;

      if (!paused && el.scrollHeight > el.clientHeight) {
        const delta = (speed * dt) / 1000;
        el.scrollTop = el.scrollTop + delta;

        // When the first child has completely scrolled out of view,
        // move it to the end and reduce scrollTop accordingly to create a seamless loop.
        // Use a while loop in case dt causes multiple items to pass.
        while (el.firstElementChild && el.scrollTop >= (el.firstElementChild as HTMLElement).offsetHeight) {
          const first = el.firstElementChild as HTMLElement;
          const h = first.offsetHeight || 0;
          // Move the item to the end and keep visual continuity
          el.scrollTop = el.scrollTop - h;
          el.appendChild(first);
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('touchstart', onEnter);
      el.removeEventListener('touchend', onLeave);
    };
  }, [officials]);

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
          minHeight: 320,
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
          <div className="barangay-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
            {barangayItems.length === 0 ? (
              <Typography.Text type="secondary" style={{ padding: '20px', textAlign: 'center' }}>No barangay information available</Typography.Text>
            ) : (
              barangayItems.map(item => (
                <div
                  key={item._id}
                  className="info-grid-item"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)',
                    border: '1px solid rgba(102, 126, 234, 0.12)',
                    borderRadius: 12,
                    padding: 20,
                    textAlign: 'center',
                    boxShadow: '0 8px 20px rgba(102, 126, 234, 0.04)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    minHeight: 120,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 8 }}>
                    {item.icon === 'home' && '🏛️'}
                    {item.icon === 'environment' && '📍'}
                    {item.icon === 'map' && '🗺️'}
                    {item.icon === 'info' && 'ℹ️'}
                  </div>
                  <div style={{ color: '#667eea', fontSize: 11, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{item.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.4 }}>
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
          minHeight: 220,
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
          <div className="contact-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, flex: 1 }}>
              {contactItems.length === 0 ? (
                <Typography.Text type="secondary" style={{ padding: '20px', textAlign: 'center', gridColumn: '1 / -1' }}>No contact information available</Typography.Text>
              ) : (
                contactItems.map(item => (
                  <a
                    key={item._id}
                    href={item.link || '#'}
                    className={`contact-grid-item ${item.isPlaceholder ? 'placeholder' : ''}`}
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
                    <div className="contact-item-head">
                      <span className="contact-item-icon">{item.icon === 'mail' ? '📧' : item.icon === 'phone' ? '📱' : 'ℹ️'}</span>
                      <div className="contact-item-label">{item.label}</div>
                    </div>
                    <div className="contact-item-value">{item.value}</div>
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
      <div className="login-page three-column">
        <div className="login-container">
          {/* System Notice Alert - Full Width */}
          {!settingsLoading && <SystemNoticeAlert />}

          {/* Top area: three columns per wireframe - Quick Stats, Barangay Officials, Sign In */}
          <Row className="three-column-row" gutter={[22, 22]} align="stretch" justify="center" style={{ marginTop: 18 }}>
            <Col xs={24} sm={24} md={12} lg={12} className="left-col" style={{ display: 'flex', justifyContent: 'center', height: '100%' }}>
              <div className="pane-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <StatsPanel />
                </div>

                <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Card 
                    className="glass-card officials-card" 
                    variant="outlined"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
                      border: '1.5px solid rgba(102, 126, 234, 0.2)',
                      borderRadius: 13,
                      backdropFilter: 'blur(20px)',
                      boxShadow: '0 16px 32px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)',
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 3, height: 16, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
                      <Typography.Title level={5} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                        🏛️ Barangay Officials
                      </Typography.Title>
                    </div>
                    <div className="officials-list-wrap" ref={officialsCarouselRef} style={{ paddingRight: 6, flex: 1 }} onMouseEnter={() => setAutoPaused(true)} onMouseLeave={() => setAutoPaused(false)} onTouchStart={() => setAutoPaused(true)} onTouchEnd={() => setAutoPaused(false)}>
                      {officials.length === 0 ? (
                        <Typography.Text type="secondary" style={{ padding: '12px', display: 'block' }}>No officials available</Typography.Text>
                      ) : (
                        <div className="carousel-scroll vertical" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {officials.map(off => (
                            <div key={off._id} className="official-card-vertical">
                              <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <OfficialPhotoImage official={off as any} size={56} />
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{off.name}</div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>{off.title}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={24} md={12} lg={12} className="login-col" style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', height: '100%' }}>
              <div className="pane-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Card 
                  className="glass-card login-card" 
                  variant="outlined"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
                    border: '1.5px solid rgba(102, 126, 234, 0.2)',
                    borderRadius: 14,
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 20px 40px rgba(102, 126, 234, 0.2), 0 0 1px rgba(102, 126, 234, 0.4)',
                    padding: 32,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <img
                      src={`${process.env.PUBLIC_URL}/logo-parian2.png`}
                      alt={systemSettings?.siteName || 'Logo'}
                      className="login-logo"
                    />
                    <Typography.Title
                      level={2}
                      style={{
                        textAlign: 'center',
                        marginBottom: 8,
                        fontSize: 28,
                        fontWeight: 800,
                        color: '#0f172a'
                      }}
                    >
                      {systemSettings?.siteName || 'Barangay Information System'}
                    </Typography.Title>
                    <Typography.Text
                      style={{
                        display: 'block',
                        color: '#64748b',
                        fontWeight: 500,
                        fontSize: 12
                      }}
                    >
                      Sign In
                    </Typography.Text>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Form 
                      name="login" 
                      layout="vertical" 
                      onFinish={onFinish} 
                      autoComplete="off" 
                      requiredMark={false}
                      style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}
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
                        block
                      >
                        {loading ? 'Signing In...' : 'Sign In'}
                      </Button>
                    </Form.Item>

                    <div className="links-section" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 11, paddingBottom: 11, borderBottom: '1.5px solid rgba(102, 126, 234, 0.1)' }}>
                        <Button 
                          type="link" 
                          onClick={() => { setForgotPasswordModalVisible(true); setForgotPasswordSent(false); forgotPasswordForm.resetFields(); }}
                          style={{ padding: 0, color: '#667eea', fontWeight: 600, fontSize: 11, textDecoration: 'none', transition: 'all 0.2s' }}
                        >
                          Forgot Password?
                        </Button>
                        <Button 
                          type="link" 
                          onClick={() => setEmergencyModalVisible(true)}
                          style={{ padding: 0, color: '#ef4444', fontWeight: 700, fontSize: 10, transition: 'all 0.2s', letterSpacing: '-0.16px' }}
                        >
                          🚨 Emergency Hotline
                        </Button>
                        <RouterLink to="/register" style={{ color: '#667eea', fontWeight: 600, textDecoration: 'none', fontSize: 11, transition: 'all 0.2s' }}>
                          Create Account
                        </RouterLink>
                      </div>
                    </div>
                    </Form>
                  </div>
                </Card>
              </div>
            </Col>
          </Row>

          {/* Bottom full-width: barangay information and contact details (stacked) */}
          <Row gutter={[22, 22]} style={{ marginTop: 28 }}>
            <Col xs={24}>
              <div className="pane-inner" style={{ width: '100%' }}>
                <BarangayInfoCard />
              </div>
            </Col>
          </Row>

          <Row gutter={[22, 22]} style={{ marginTop: 18, marginBottom: 40 }}>
            <Col xs={24}>
              <div className="pane-inner" style={{ width: '100%' }}>
                <ContactInfoCard />
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
              Send 6-Digit Code
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
