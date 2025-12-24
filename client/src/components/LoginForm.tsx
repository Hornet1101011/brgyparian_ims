import React, { useEffect, useRef, useState } from 'react';
import { Row, Col, Form, Input, Button, Card, Typography, message, Modal, Radio, notification, Divider, Space, Tag, Alert, Spin } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, MailOutlined, EnvironmentOutlined, BellOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI, axiosPublic, axiosInstance } from '../services/api';
import getOfficialPhotoSrc, { fetchPublicOfficials, PublicOfficial } from '../utils/officials';
import StatsPanel from './StatsPanel';
import './LoginForm.css';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useSystemSettings, SystemSettingsPublic } from '../hooks/useSystemSettings';
import { useBarangayInfo, BarangayInfoItem } from '../hooks/useBarangayInfo';
import { useContactInfo, ContactInfoItem } from '../hooks/useContactInfo';

const LoginForm: React.FC = () => {
    
  const { login, isAuthenticated, user, setUser } = useAuth() as any;
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [forgotPasswordModalVisible, setForgotPasswordModalVisible] = useState(false);
  const [guestForm] = Form.useForm();
  const [forgotPasswordForm] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState<'link' | 'otp'>('link');
  const [forgotPasswordSubmittedEmail, setForgotPasswordSubmittedEmail] = useState<string | null>(null);
  const [officials, setOfficials] = useState<PublicOfficial[]>([]);
  const [, setOfficialsStatus] = useState<string>('loading');
  const officialsCarouselRef = useRef<HTMLDivElement | null>(null);
  const barangayInfoCarouselRef = useRef<HTMLDivElement | null>(null);
  const contactInfoCarouselRef = useRef<HTMLDivElement | null>(null);
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

  const handleCarouselScroll = (direction: 'left' | 'right', ref: React.RefObject<HTMLDivElement>) => {
    if (!ref.current) return;
    
    // Trigger animation
    setSlideDirection(direction);
    
    // Perform scroll
    const scrollAmount = direction === 'left' ? -240 : 240;
    ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    
    // Reset animation state after scroll completes
    setTimeout(() => setSlideDirection(null), 600);
  };

  // Component to display barangay information in card carousel format
  // Fetches from publicviews collection via useBarangayInfo hook
  const BarangayInfoCard = () => {
    return (
      <Card 
        className="glass-card info-card" 
        variant="outlined"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 16,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          padding: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 4, height: 24, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
          <Typography.Title level={5} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            <EnvironmentOutlined style={{ marginRight: 8, color: '#667eea' }} />
            Barangay Information
          </Typography.Title>
        </div>

        {barangayLoading ? (
          <Spin size="small" />
        ) : (
          <div className="carousel-wrap horizontal" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Button
              type="text"
              size="small"
              icon={<LeftOutlined />}
              onClick={() => handleCarouselScroll('left', barangayInfoCarouselRef)}
              style={{ color: '#667eea', minWidth: 32, height: 32, padding: 0 }}
            />
            
            <div 
              ref={barangayInfoCarouselRef} 
              className="carousel-scroll horizontal"
              style={{ 
                overflowX: 'auto', 
                display: 'flex',
                gap: 12, 
                paddingBottom: 8,
                scrollBehavior: 'smooth',
                flex: 1
              }}>
              {barangayItems.length === 0 ? (
                <Typography.Text type="secondary" style={{ padding: '20px' }}>No barangay information available</Typography.Text>
              ) : (
                barangayItems.map(item => (
                  <div 
                    key={item._id} 
                    className="info-card-item"
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 16,
                      minWidth: 220,
                      textAlign: 'center',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                      opacity: item.isPlaceholder ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!item.isPlaceholder) {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 16px rgba(102, 126, 234, 0.15)';
                        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.04)';
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>
                      {item.icon === 'home' && '🏛️'}
                      {item.icon === 'environment' && '📍'}
                      {item.icon === 'map' && '📬'}
                      {item.icon === 'info' && 'ℹ️'}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                      {item.value}
                    </div>
                  </div>
                ))
              )}
            </div>

            <Button
              type="text"
              size="small"
              icon={<RightOutlined />}
              onClick={() => handleCarouselScroll('right', barangayInfoCarouselRef)}
              style={{ color: '#667eea', minWidth: 32, height: 32, padding: 0 }}
            />
          </div>
        )}
      </Card>
    );
  };

  // Component to display contact information in card carousel format
  // Similar to barangay info and officials - scrollable cards with email/phone validation
  const ContactInfoCard = () => {
    return (
      <Card
        className="glass-card contact-card"
        variant="outlined"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 16,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          padding: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 4, height: 24, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
          <Typography.Title level={5} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            <PhoneOutlined style={{ marginRight: 8, color: '#667eea' }} />
            Contact Information
          </Typography.Title>
        </div>

        {contactLoading ? (
          <Spin size="small" />
        ) : (
          <div className="carousel-wrap horizontal" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Button
              type="text"
              size="small"
              icon={<LeftOutlined />}
              onClick={() => handleCarouselScroll('left', contactInfoCarouselRef)}
              style={{ color: '#667eea', minWidth: 32, height: 32, padding: 0 }}
            />
            
            <div 
              ref={contactInfoCarouselRef} 
              className="carousel-scroll horizontal"
              style={{ 
                overflowX: 'auto', 
                display: 'flex',
                gap: 12, 
                paddingBottom: 8,
                scrollBehavior: 'smooth',
                flex: 1
              }}>
              {contactItems.length === 0 ? (
                <Typography.Text type="secondary" style={{ padding: '20px' }}>No contact information available</Typography.Text>
              ) : (
                contactItems.map(item => (
                  <a 
                    key={item._id}
                    href={item.link || '#'}
                    className="contact-card-item"
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 16,
                      minWidth: 220,
                      textAlign: 'center',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.3s ease',
                      cursor: item.isPlaceholder ? 'default' : 'pointer',
                      textDecoration: 'none',
                      color: 'inherit',
                      opacity: item.isPlaceholder ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!item.isPlaceholder) {
                        (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 16px rgba(102, 126, 234, 0.15)';
                        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.04)';
                      (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>
                      {item.icon === 'mail' && '📧'}
                      {item.icon === 'phone' && '📱'}
                      {item.icon === 'info' && 'ℹ️'}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#667eea', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {item.value}
                    </div>
                  </a>
                ))
              )}
            </div>

            <Button
              type="text"
              size="small"
              icon={<RightOutlined />}
              onClick={() => handleCarouselScroll('right', contactInfoCarouselRef)}
              style={{ color: '#667eea', minWidth: 32, height: 32, padding: 0 }}
            />
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
        message={<Typography.Text strong>System Notice</Typography.Text>}
        description={
          <Typography.Paragraph style={{ margin: 0, color: 'inherit' }}>
            {systemSettings.systemNotice}
          </Typography.Paragraph>
        }
        type="warning"
        icon={<BellOutlined />}
        showIcon
        style={{
          marginBottom: 20,
          background: 'rgba(255, 215, 5, 0.1)',
          border: '1px solid rgba(255, 215, 5, 0.3)',
          borderRadius: 10,
          padding: '12px 16px'
        }}
        closeIcon={true}
      />
    );
  };

  return (
    <>
    <div className="login-page three-column" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minHeight: '100vh', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="login-container three-column-container" style={{ width: '100%', maxWidth: '1600px' }}>
        <Row gutter={[24, 24]} align="stretch" justify="center" className="three-column-row" style={{ height: '100%' }}>
          
          {/* LEFT COLUMN - Quick Stats & Barangay Info */}
          <Col xs={24} sm={24} md={8} lg={8} className="pane left-pane stats-pane" style={{ display: 'flex', height: '100%' }}>
            <div className="pane-inner left-inner" style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', width: '100%' }}>
              {/* Quick Stats */}
              <StatsPanel />
              
              {/* System Notice Alert */}
              {!settingsLoading && <SystemNoticeAlert />}

              {/* Barangay Information */}
              <BarangayInfoCard />
            </div>
          </Col>

          {/* CENTER COLUMN - Login Form */}
          <Col xs={24} sm={24} md={8} lg={8} className="pane center-pane login-pane" style={{ display: 'flex', height: '100%' }}>
            <div className="pane-inner center-inner" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', width: '100%' }}>
              <Card 
                className="glass-card login-card" 
                variant="outlined"
                style={{
                  background: 'rgba(255, 255, 255, 0.98)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  borderRadius: 20,
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
                  padding: 36
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <Typography.Title 
                    level={3} 
                    className="title-blue" 
                    style={{ 
                      textAlign: 'center', 
                      marginBottom: 8,
                      fontSize: 24,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent'
                    }}
                  >
                    Barangay Information Management System Parian
                  </Typography.Title>
                  <Typography.Text 
                    style={{ 
                      display: 'block', 
                      color: '#64748b', 
                      fontWeight: 500, 
                      fontSize: 13
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
                    label={<span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>Email or Username</span>}
                    name="username" 
                    rules={[{ required: true, message: 'Please input your email or username!' }]}
                    style={{ marginBottom: 16 }}
                  >
                    <Input 
                      prefix={<UserOutlined style={{ color: '#667eea' }} />} 
                      placeholder="Enter your email or username" 
                      size="large"
                      style={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 14,
                        padding: '10px 14px'
                      }}
                    />
                  </Form.Item>

                  <Form.Item 
                    label={<span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>Password</span>}
                    name="password" 
                    rules={[{ required: true, message: 'Please input your password!' }, { min: 6, message: 'Password must be at least 6 characters' }]}
                    style={{ marginBottom: 20 }}
                  >
                    <Input.Password 
                      autoComplete="current-password" 
                      prefix={<LockOutlined style={{ color: '#667eea' }} />} 
                      placeholder="Enter your password" 
                      size="large"
                      style={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 14,
                        padding: '10px 14px'
                      }}
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 10 }}>
                    <Button 
                      htmlType="submit" 
                      size="large" 
                      loading={loading} 
                      className="signin-btn"
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: 14,
                        borderRadius: 8,
                        height: 42,
                        color: '#ffffff'
                      }}
                      block
                    >
                      {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 14 }}>
                    <Button 
                      onClick={() => setGuestModalVisible(true)} 
                      size="large" 
                      className="guest-warm-btn"
                      style={{
                        background: 'rgba(102, 126, 234, 0.08)',
                        border: '1.5px solid #667eea',
                        color: '#667eea',
                        fontWeight: 500,
                        fontSize: 14,
                        borderRadius: 8,
                        height: 42
                      }}
                      block
                    >
                      Continue as Guest
                    </Button>
                  </Form.Item>

                  <div className="links-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
                    <Button 
                      type="link" 
                      onClick={() => { setForgotPasswordModalVisible(true); setForgotPasswordSent(false); forgotPasswordForm.resetFields(); }}
                      style={{ padding: 0, color: '#667eea', fontWeight: 500, fontSize: 13 }}
                    >
                      Forgot Password?
                    </Button>
                    <RouterLink to="/register" style={{ color: '#667eea', fontWeight: 500, textDecoration: 'none', fontSize: 13 }}>
                      Sign Up
                    </RouterLink>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <Button 
                      type="link" 
                      onClick={() => setEmergencyModalVisible(true)}
                      style={{ padding: 0, color: '#f5222d', fontWeight: 500, fontSize: 13 }}
                    >
                      Emergency Hotline
                    </Button>
                  </div>
                </Form>
              </Card>
            </div>
          </Col>

          {/* RIGHT COLUMN - Barangay Officials & Contact Info */}
          <Col xs={24} sm={24} md={8} lg={8} className="pane right-pane officials-pane" style={{ display: 'flex', height: '100%' }}>
            <div className="pane-inner right-inner" style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', width: '100%', minHeight: 0 }}>
              
              {/* Officials Card */}
              <Card 
                className="glass-card officials-card" 
                variant="outlined"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: 16,
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                  padding: 20,
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 4, height: 24, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
                  <Typography.Title level={5} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    Barangay Officials
                  </Typography.Title>
                </div>

                <div className="carousel-wrap vertical" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', flex: 1, minHeight: 0 }}>
                  <div 
                    ref={officialsCarouselRef} 
                    className={`carousel-scroll vertical ${slideDirection ? `slide-${slideDirection}` : ''}`}
                    style={{ 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: 12, 
                      paddingRight: 8,
                      scrollBehavior: 'smooth',
                      minHeight: 0,
                      flex: 1
                    }}>
                    {officials.length === 0 ? (
                      <Typography.Text type="secondary" style={{ padding: '20px 0', textAlign: 'center' }}>No officials available</Typography.Text>
                    ) : (
                      officials.map(off => (
                        <div 
                          key={off._id} 
                          className="official-card-vertical"
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: 12,
                            textAlign: 'left',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start'
                          }}
                        >
                          <div 
                            className="official-avatar"
                            style={{
                              width: 50,
                              height: 50,
                              borderRadius: 8,
                              overflow: 'hidden',
                              flexShrink: 0,
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <img
                              alt={off.name}
                              src={getOfficialPhotoSrc(off as any)}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                try {
                                  const t = e.currentTarget as HTMLImageElement;
                                  t.onerror = null;
                                  const name = (off.name || 'Official').toString().trim();
                                  t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=667eea&color=fff&size=50`;
                                } catch (err) {}
                              }}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2 }}>{off.name}</div>
                            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 1 }}>{off.title}</div>
                            <div style={{ color: '#94a3b8', fontSize: 10 }}>{off.term}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>

              {/* Contact Info Card */}
              <div style={{ flexShrink: 0 }}><ContactInfoCard /></div>
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
      onCancel={() => { setForgotPasswordModalVisible(false); setForgotPasswordSent(false); forgotPasswordForm.resetFields(); }}
      footer={null}
      centered
      width={500}
    >
      {forgotPasswordSent ? (
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
