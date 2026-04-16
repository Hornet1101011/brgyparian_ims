import React, { useEffect, useRef, useState } from 'react';
import { Row, Col, Form, Input, Button, Card, Typography, message, Modal, Radio, notification, Divider, Space, Tag, Alert, Spin } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, MailOutlined, EnvironmentOutlined, BellOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI, axiosPublic, axiosInstance } from '../services/api';
import getOfficialPhotoSrc, { fetchPublicOfficials, PublicOfficial } from '../utils/officials';
import OfficialPhotoImage from './OfficialPhotoImage';
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

  // Component to display merged barangay and contact information in a single card
  const MergedInfoCard = () => {
    return (
      <Card
        className="glass-card merged-info-card"
        variant="outlined"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)',
          border: '1.5px solid rgba(102, 126, 234, 0.2)',
          borderRadius: 16,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 40px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', gap: 18, flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '1.25px solid rgba(102, 126, 234, 0.08)' }}>
              <div style={{ width: 3, height: 16, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
              <Typography.Title level={5} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                <EnvironmentOutlined style={{ marginRight: 6, color: '#667eea', fontSize: 13 }} />
                Barangay Information
              </Typography.Title>
            </div>

            {barangayLoading ? (
              <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                <Spin size="small" />
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>Loading information...</Typography.Text>
              </div>
            ) : (
              <div className="barangay-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
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
          </div>

          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '1.25px solid rgba(102, 126, 234, 0.08)' }}>
              <div style={{ width: 3, height: 16, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
              <Typography.Title level={5} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                <PhoneOutlined style={{ marginRight: 6, color: '#667eea', fontSize: 13 }} />
                Contact Information
              </Typography.Title>
            </div>

            {contactLoading ? (
              <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                <Spin size="small" />
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>Loading contacts...</Typography.Text>
              </div>
            ) : (
              <div className="contact-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 10 }}>
                {contactItems.length === 0 ? (
                  <Typography.Text type="secondary" style={{ padding: '20px', textAlign: 'center' }}>No contact information available</Typography.Text>
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
          </div>
        </div>
      </Card>
    );
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

          {/* Enhanced Header Section */}
          <div className="login-header">
            <div className="header-content">
              <div className="header-logo-section">
                <div className="header-logo-wrapper">
                  <img
                    src={`${process.env.PUBLIC_URL}/logo-parian2.png`}
                    alt={systemSettings?.siteName || 'Logo'}
                    className="header-logo"
                  />
                </div>
                <div className="header-text">
                  <Typography.Title level={1} className="header-title">
                    {systemSettings?.siteName || 'Barangay Information System'}
                  </Typography.Title>
                  <Typography.Text className="header-subtitle">
                    Secure Access Portal
                  </Typography.Text>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area: Login Form at Top, then Stats and Officials */}
          <Row className="three-column-row" gutter={[32, 32]} align="stretch" justify="center" style={{ marginTop: 24 }}>
            <Col xs={24} sm={24} md={12} lg={12} className="login-col" style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', height: '100%' }}>
              <div className="pane-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Card 
                  className="glass-card login-card" 
                  variant="outlined"
                >
                  <div className="login-card-header">
                    <div className="login-card-icon">
                      <UserOutlined />
                    </div>
                    <div className="login-card-title-section">
                      <Typography.Title level={3} className="login-card-title">
                        Welcome Back
                      </Typography.Title>
                      <Typography.Text className="login-card-subtitle">
                        Sign in to access your account
                      </Typography.Text>
                    </div>
                  </div>

                  <div className="login-form-container">
                    <Form 
                      name="login" 
                      layout="vertical" 
                      onFinish={onFinish} 
                      autoComplete="off" 
                      requiredMark={false}
                      className="login-form"
                    >
                      <div className="form-fields-group">
                        <Form.Item 
                          label="Email or Username"
                          name="username" 
                          rules={[{ required: true, message: 'Please input your email or username!' }]}
                          className="login-form-item"
                        >
                          <Input 
                            prefix={<UserOutlined className="input-icon" />} 
                            placeholder="Enter your email or username" 
                            size="large"
                            className="login-input"
                          />
                        </Form.Item>

                        <Form.Item 
                          label="Password"
                          name="password" 
                          rules={[{ required: true, message: 'Please input your password!' }, { min: 6, message: 'Password must be at least 6 characters' }]}
                          className="login-form-item"
                        >
                          <Input.Password 
                            autoComplete="current-password" 
                            prefix={<LockOutlined className="input-icon" />} 
                            placeholder="Enter your password" 
                            size="large"
                            className="login-input"
                          />
                        </Form.Item>
                      </div>

                      <div className="form-actions-group">
                        <Form.Item className="login-button-item">
                          <Button 
                            htmlType="submit" 
                            size="large" 
                            loading={loading} 
                            className="signin-btn"
                            block
                          >
                            {loading ? 'Signing In...' : 'Sign In'}
                          </Button>
                        </Form.Item>

                        <div className="login-links">
                          <div className="primary-links">
                            <Button 
                              type="link" 
                              onClick={() => { setForgotPasswordModalVisible(true); setForgotPasswordSent(false); forgotPasswordForm.resetFields(); }}
                              className="login-link"
                            >
                              Forgot Password?
                            </Button>
                            <RouterLink to="/register" className="login-link register-link">
                              Create Account
                            </RouterLink>
                          </div>
                          <Button 
                            type="link" 
                            onClick={() => setEmergencyModalVisible(true)}
                            className="emergency-link"
                          >
                            ð Emergency Hotline
                          </Button>
                        </div>
                      </div>
                    </Form>
                  </div>
                </Card>
              </div>
            </Col>

            <Col xs={24} sm={24} md={12} lg={12} className="left-col" style={{ display: 'flex', justifyContent: 'center', height: '100%' }}>
              <div className="pane-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        ð Barangay Officials
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

                <div style={{ width: '100%', marginTop: 12 }}>
                  <MergedInfoCard />
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
