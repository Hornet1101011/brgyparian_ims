import React, { useEffect, useState, useRef } from 'react';
import { Card, Typography, Row, Col, Spin } from 'antd';
import { UserOutlined, CrownOutlined, TeamOutlined, HomeOutlined, FileTextOutlined, NotificationOutlined } from '@ant-design/icons';
import { adminAPI, documentsAPI, contactAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const StatsPanel: React.FC = () => {
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth() as any;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Fetch supporting public resources in parallel (files, documents, announcements)
        const [filesRes, docRequestsRes, announcementsRes] = await Promise.all([
          documentsAPI.listFiles().catch(() => ([])),
          (isAuthenticated ? documentsAPI.getAllDocuments().catch(() => ([])) : Promise.resolve([])),
          contactAPI.getAnnouncements().catch(() => ([]))
        ]);

        // Attempt to fetch admin statistics, but tolerate 401/unauthenticated errors
        let resStats: any = null;
        try {
          resStats = await adminAPI.getSystemStatistics();
        } catch (statErr) {
          console.warn('Could not fetch admin statistics (likely unauthenticated):', String(statErr));
          resStats = null;
        }

        if (mounted) {
          // attach filesCount, docRequestsCount and announcementsCount to stats for display
          const filesCount = Array.isArray(filesRes) ? filesRes.length : (filesRes && filesRes.length) || 0;
          const docRequestsCount = Array.isArray(docRequestsRes) ? docRequestsRes.length : (docRequestsRes && docRequestsRes.length) || 0;
          const announcementsCount = Array.isArray(announcementsRes) ? announcementsRes.length : (announcementsRes && announcementsRes.length) || 0;
          setStats({ ...(resStats || {}), filesCount, docRequestsCount, announcementsCount });
        }
      } catch (err) {
        console.error('Failed to load system statistics', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div style={{ width: '100%', textAlign: 'center', padding: '40px 20px' }}><Spin /></div>;
  if (!stats) return <div style={{ textAlign: 'center', padding: '20px' }}><Typography.Text type="secondary">No statistics available</Typography.Text></div>;

  const users = stats.users || {};
  const filesCount = stats.filesCount ?? 0;

  // Arrange items so that with a 3-column layout the Documents tile falls under Admins
  const items: any[] = [
    { key: 'users', title: 'Total Users', value: users.total ?? 0, icon: <UserOutlined style={{ color: '#667eea', fontSize: 24 }} />, bgColor: 'rgba(102, 126, 234, 0.08)', borderColor: '#667eea' },
    { key: 'admins', title: 'Admins', value: users.byRole?.admin ?? 0, icon: <CrownOutlined style={{ color: '#f59e0b', fontSize: 24 }} />, bgColor: 'rgba(245, 158, 11, 0.08)', borderColor: '#f59e0b' },
    { key: 'staff', title: 'Staff', value: users.byRole?.staff ?? 0, icon: <TeamOutlined style={{ color: '#ec4899', fontSize: 24 }} />, bgColor: 'rgba(236, 72, 153, 0.08)', borderColor: '#ec4899' },
    { key: 'residents', title: 'Residents', value: users.byRole?.resident ?? 0, icon: <HomeOutlined style={{ color: '#10b981', fontSize: 24 }} />, bgColor: 'rgba(16, 185, 129, 0.08)', borderColor: '#10b981' },
    { key: 'announcements', title: 'Announcements', value: stats.announcementsCount ?? 0, icon: <NotificationOutlined style={{ color: '#f97316', fontSize: 24 }} />, bgColor: 'rgba(249, 115, 22, 0.08)', borderColor: '#f97316' },
    { key: 'docFiles', title: 'Documents', value: filesCount, icon: <FileTextOutlined style={{ color: '#0ea5e9', fontSize: 24 }} />, bgColor: 'rgba(14, 165, 233, 0.08)', borderColor: '#0ea5e9' },
  ];

  return (
    <Card 
      className="glass-card stats-card" 
      variant="outlined"
      style={{ 
        width: '100%',
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 16,
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        padding: 0
      }}
    >
      <div style={{ padding: '20px 20px 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0 }}>
          <div style={{ width: 4, height: 24, background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)', borderRadius: 2 }} />
          <Typography.Title level={4} style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
            Quick Stats
          </Typography.Title>
        </div>
      </div>

      <div style={{ padding: '0 20px 20px 20px', overflowX: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'stretch', width: '100%' }}>
          {items.map((it: any) => (
            <div
              key={it.key}
              role="button"
              tabIndex={0}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'translateY(-6px)';
                el.style.boxShadow = '0 14px 30px ' + it.borderColor + '22';
                el.style.background = (it.bgColor || '').toString().replace('0.08', '0.14');
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = 'none';
                el.style.background = it.bgColor;
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 80,
                width: '100%',
                background: it.bgColor,
                border: '1px solid ' + it.borderColor + '22',
                borderRadius: 14,
                padding: '10px 12px',
                boxSizing: 'border-box',
                transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
              } as React.CSSProperties}
            >
              <div style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: 12, boxShadow: '0 8px 18px rgba(2,6,23,0.06)', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                {it.icon}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'none' }}>{it.title}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>{it.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default StatsPanel;
