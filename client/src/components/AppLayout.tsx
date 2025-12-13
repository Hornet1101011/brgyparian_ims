import './responsive-system-title.css';
import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Menu, Button, Space, Dropdown, Drawer } from 'antd';
import {
  LogoutOutlined,
  ClockCircleOutlined,
  NotificationOutlined,
  SettingOutlined,
  HomeOutlined,
  FileTextOutlined,
  MessageOutlined,
  InboxOutlined,
  TeamOutlined,
  BarChartOutlined,
  HistoryOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  MenuOutlined,
  UserOutlined,
  BellOutlined,
  CalendarOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import './AppLayoutSidebar.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AnnouncementsBanner from './AnnouncementsBanner';

// Date and Time display component (smaller, subtle, top-right)
const DateTimeDisplay: React.FC = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return (
    <span style={{ fontSize: 13, color: '#888', fontWeight: 500, letterSpacing: 0.5, marginRight: 8 }}>
      <ClockCircleOutlined style={{ marginRight: 4 }} />
      {date} {time}
    </span>
  );
};
const { Header, Content, Sider } = Layout;

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const HEADER_HEIGHT = 64;

const navConfig: {
  resident: { key: string; icon: React.ReactNode; label: string }[];
  admin: { key: string; icon: React.ReactNode; label: string }[];
  staff: { key: string; icon: React.ReactNode; label: string }[];
} = {
  resident: [
    {
      key: '/home',
      icon: <HomeOutlined />,
      label: 'Home',
    },
    {
      key: '/request',
      icon: <FileTextOutlined />,
      label: 'Request',
    },
    {
      key: '/inquiries',
      icon: <MessageOutlined />,
      label: 'Inquiries',
    },
    {
      key: '/inbox',
      icon: <InboxOutlined />,
      label: 'Inbox',
    },
  ],
  admin: [
    {
      key: '/admin/dashboard',
      icon: <HomeOutlined />,
      label: 'Admin Dashboard',
    },
    {
      key: '/admin/users',
      icon: <TeamOutlined />,
      label: 'User Management',
    },
    // Activity Logs menu removed from admin sidebar per request
    {
      key: '/admin/statistics',
      icon: <BarChartOutlined />,
      label: 'Statistics',
    },
    {
      key: '/admin/settings',
      icon: <SettingOutlined />,
      label: 'System Settings',
    },
    {
      key: '/admin/verification-requests',
      icon: <FileProtectOutlined />,
      label: 'Verification Requests',
    },
    {
      key: '/admin/notifications',
      icon: <BellOutlined />,
      label: 'Notifications',
    },
  ],
  staff: [
    {
      key: '/staff-dashboard',
      icon: <HomeOutlined />,
      label: 'Staff Dashboard',
    },
    {
      key: '/staff/inbox',
      icon: <InboxOutlined />,
      label: 'Staff Inbox',
    },
    {
      key: '/staff/appointments',
      icon: <CalendarOutlined />,
      label: 'Appointments',
    },
    {
      key: '/templates-manager',
      icon: <FileProtectOutlined />,
      label: 'Templates Manager',
    },
    {
      key: '/document-processing',
      icon: <FileDoneOutlined />,
      label: 'Document Processing',
    },
    {
      key: '/document-history',
      icon: <HistoryOutlined />,
      label: 'Document History',
    },
  ],
};



type AppLayoutProps = {
  children: React.ReactNode;
};

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Prefer the richer persisted full profile in localStorage when available.
  // AuthContext keeps a token-decoded user in context; the full profile fetched
  // from the server is stored in `localStorage.userProfile`. Merge them so
  // components like this can access avatar/profileImage fields.
  let displayUser: any = user;
  try {
    const stored = localStorage.getItem('userProfile');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge token-decoded user with persisted profile, preferring stored values
      displayUser = { ...(user || {}), ...(parsed || {}) };
    }
  } catch (err) {
    // ignore parse errors and fall back to token-decoded `user`
  }

  // Utility bar quick actions removed: online/status and dark-mode switch removed
  // Start collapsed by default so the navigation is compact on initial load.
  const [collapsed] = useState(true);

    // avatar icons are used instead of image Avatars; keep residentImageSrc for
    // potential future uses but header will show icons (Menu and Person).

  // SSE for verification/profile updates is disabled while feature is paused

  // Detect screen size for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1200) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu when navigation happens
  const handleNavigate = useCallback((key: string) => {
    if (location.pathname !== key) {
      navigate(key);
      setMobileMenuOpen(false);
    }
  }, [location.pathname, navigate]);

  // Determine sidebar configuration based on screen size
  const sidebarWidth = screenSize === 'mobile' ? 0 : SIDEBAR_WIDTH;
  const sidebarCollapsedWidth = screenSize === 'mobile' ? 0 : SIDEBAR_COLLAPSED_WIDTH;
  const marginLeft = user ? (screenSize === 'mobile' ? 0 : (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH)) : 0;

  // Close dropdown on outside click
  // Removed notification dropdown logic

  return (
    <Layout style={{ minHeight: '100vh', background: '#000' }}>
      {user && screenSize !== 'mobile' && (
        <Sider
          width={SIDEBAR_WIDTH}
          collapsed={collapsed}
          collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
          style={{
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            background: 'linear-gradient(180deg, #40c9ff 0%, #e81cff 100%)', // Original vibrant blue to purple
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            zIndex: 100,
            boxShadow: '2px 0 16px 0 rgba(64,201,255,0.10)',
            borderRight: 'none',
            overflowX: 'hidden',
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '24px 0 0 0',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Menu
              theme="light"
              mode="inline"
              selectedKeys={[location.pathname]}
              style={{
                background: 'transparent',
                fontWeight: 600,
                fontSize: 17,
                border: 'none',
              }}
              inlineCollapsed={collapsed}
              items={
                navConfig[
                  user?.role === 'admin'
                    ? 'admin'
                    : user?.role === 'staff'
                    ? 'staff'
                    : 'resident'
                ].map(item => ({
                  ...item,
                  className: location.pathname === item.key ? 'ant-menu-item-active-custom' : undefined
                }))
              }
              onClick={({ key }) => {
                if (location.pathname !== key) {
                  navigate(key);
                }
              }}
            />
          </div>
        </Sider>
      )}

      {/* Mobile Navigation Drawer */}
      {user && screenSize === 'mobile' && (
        <Drawer
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff' }}>
              <img 
                src={`${process.env.PUBLIC_URL}/logo-parian2.png`} 
                alt="Logo" 
                style={{ width: 28, height: 28 }} 
              />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Menu</span>
            </div>
          }
          placement="left"
          onClose={() => setMobileMenuOpen(false)}
          open={mobileMenuOpen}
          bodyStyle={{ padding: 0, background: '#f8f9fa' }}
          headerStyle={{
            background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
            borderBottom: 'none',
            padding: '12px 16px',
          }}
          closeIcon={<CloseOutlined style={{ color: '#fff', fontSize: 20 }} />}
          width={280}
        >
          <div style={{ padding: '8px 0' }}>
            <Menu
              theme="light"
              mode="vertical"
              selectedKeys={[location.pathname]}
              style={{
                background: 'transparent',
                fontWeight: 500,
                fontSize: 15,
                border: 'none',
                padding: '8px 0',
              }}
              items={
                navConfig[
                  user?.role === 'admin'
                    ? 'admin'
                    : user?.role === 'staff'
                    ? 'staff'
                    : 'resident'
                ].map(item => ({
                  ...item,
                  className: location.pathname === item.key ? 'mobile-menu-item-active' : 'mobile-menu-item'
                }))
              }
              onClick={({ key }) => handleNavigate(key)}
            />
          </div>
        </Drawer>
      )}

  <Layout style={{ marginLeft }}>
        <Header
          className="app-header"
          style={{
            height: screenSize === 'mobile' ? 56 : HEADER_HEIGHT,
            background: '#fff',
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: screenSize === 'mobile' ? '0 12px' : '0 32px',
            position: 'fixed',
            left: marginLeft,
            right: 0,
            top: 0,
            zIndex: 101,
            boxShadow: '0 2px 8px #e3e6f3',
          }}
        >
          {/* Mobile Menu Toggle Button */}
          {user && screenSize === 'mobile' && (
            <Button
              type="default"
              shape="circle"
              size="small"
              icon={<MenuOutlined />}
              onClick={() => setMobileMenuOpen(true)}
              style={{ marginRight: 8 }}
            />
          )}

          <div
            className="responsive-system-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: screenSize === 'mobile' ? 8 : 12,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Logo icon (served from public/) */}
            <img 
              src={`${process.env.PUBLIC_URL}/logo-parian2.png`} 
              alt="Logo" 
              style={{ 
                width: screenSize === 'mobile' ? 28 : 36, 
                height: screenSize === 'mobile' ? 28 : 36, 
                marginRight: screenSize === 'mobile' ? 0 : 4,
                flexShrink: 0,
              }} 
            />
            {screenSize !== 'mobile' && (
              <span style={{
                fontSize: screenSize === 'tablet' ? 18 : 26,
                fontWeight: 400,
                letterSpacing: 1,
                background: 'linear-gradient(90deg, #40c9ff, #e81cff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                Barangay Information <span style={{ fontWeight: 800 }}>Management System</span>
              </span>
            )}
          </div>
          <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: screenSize === 'mobile' ? 8 : 16, position: 'relative', marginRight: screenSize === 'mobile' ? 0 : 48, flexShrink: 0 }}>
            {screenSize !== 'mobile' && (
              <span style={{ marginRight: 8 }}>
                <DateTimeDisplay />
              </span>
            )}
            {/* Utility bar: quick actions */}
            {screenSize !== 'mobile' && (
              <Space size={12}>
                {displayUser && (
                  // Route admins to admin management, others to public announcements
                  <Button size="small" onClick={() => navigate(displayUser?.role === 'admin' ? '/admin/announcements' : '/announcements')}
                    icon={<NotificationOutlined />}
                  />
                )}
              </Space>
            )}
            {/* Verification status indicator removed while feature is paused */}
            {/* profile/menu icons (uses icons instead of Avatar) */}
            {(() => {
              const items: any[] = [
                { key: 'profile', icon: <UserOutlined />, label: 'Profile' },
                ...(user?.role === 'admin' ? [{ key: 'settings', icon: <SettingOutlined />, label: 'Settings' }] : []),
                { type: 'divider', key: 'divider-1' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Logout' },
              ];
              return (
                <Dropdown
                  menu={{ items, onClick: ({ key }) => {
                    if (key === 'profile') navigate('/profile');
                    else if (key === 'settings') navigate('/admin/settings');
                    else if (key === 'logout') navigate('/logout');
                  }}}
                  placement="bottomRight"
                  trigger={["click"]}
                >
                  <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, padding: 2 }}>
                    <Button type="default" shape="circle" size={screenSize === 'mobile' ? 'small' : 'small'} icon={<UserOutlined />} />
                  </div>
                </Dropdown>
              );
            })()}
            {/* Verification modal removed while feature is paused */}
          </div>
  </Header>
  {/* Divider line below header */}
  <div style={{ height: 1, background: '#f0f0f0', width: '100%', margin: 0, boxShadow: 'none' }} />
        <Content
          style={{
            marginTop: screenSize === 'mobile' ? 56 : HEADER_HEIGHT,
            padding: screenSize === 'mobile' ? 12 : screenSize === 'tablet' ? 16 : 32,
            background: 'linear-gradient(135deg, #e3f6fd 0%, #b3e0ff 60%,  #b3e0ff 100%)',
            minHeight: `calc(100vh - ${screenSize === 'mobile' ? 56 : HEADER_HEIGHT}px)`,
          }}
        >
          {(user?.role === 'resident' || user?.role === 'staff') && <AnnouncementsBanner />}
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
