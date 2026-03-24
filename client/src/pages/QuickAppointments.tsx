import React, { useMemo, useState } from 'react';
import { Table, Button, Card, Tag, Space, Typography, message, Input, Empty, Spin, Tooltip, Modal } from 'antd';
import { useDeleteAppointmentMutation } from '../hooks/useAppointments';
import '../components/staff/appointments/scheduling.css';
import dayjs from 'dayjs';
import InquiryDetailsModal from '../components/InquiryDetailsModal';
import { CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined, SearchOutlined, ClockCircleTwoTone, EyeOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { contactAPI } from '../services/api';

const { Text } = Typography;

const QuickAppointments = () => {
  const [viewIdModal, setViewIdModal] = useState({ visible: false, id: null } as { visible: boolean; id: string | null });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [inquiryModalVisible, setInquiryModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 720);
  const [inquiries, setInquiries] = useState([] as any[]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch quick appointments on mount and when updated
  React.useEffect(() => {
    const fetchQuickAppointments = async () => {
      try {
        setIsLoading(true);
        const allInquiries = await contactAPI.getAllInquiries();
        // Filter for QUICK_APPOINTMENT type only
        const quickAppointments = (allInquiries || []).filter((inq: any) => inq && inq.type === 'QUICK_APPOINTMENT');
        setInquiries(quickAppointments);
      } catch (err) {
        console.error('Failed to fetch quick appointments:', err);
        message.error('Failed to fetch quick appointments');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuickAppointments();

    // Listen for updates from other pages
    const handleUpdate = () => fetchQuickAppointments();
    window.addEventListener('appointments-updated', handleUpdate);
    return () => window.removeEventListener('appointments-updated', handleUpdate);
  }, []);

  const deleteAppointment = useDeleteAppointmentMutation();

  const handleDelete = (record: any) => {
    Modal.confirm({
      title: 'Delete Quick Appointment',
      content: `Are you sure you want to delete the quick appointment for ${record.createdBy?.fullName || record.username}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteAppointment.mutateAsync(String(record._id));
          message.success('Quick appointment deleted successfully');
          setInquiries(prev => prev.filter(i => i._id !== record._id));
        } catch (err: any) {
          message.error('Failed to delete quick appointment');
        }
      },
    });
  };

  // Helper to determine if a scheduled appointment is past
  const isPast = (record: any) => {
    if (record.status !== 'scheduled') return false;
    const date = record.scheduledDates && record.scheduledDates.length > 0 ? record.scheduledDates[0]?.date : null;
    if (!date) return false;
    return dayjs(date).isBefore(dayjs(), 'day');
  };

  // Filtered inquiries based on search query
  const filteredInquiries = useMemo(() => {
    const q = query.toLowerCase();
    return inquiries.filter((record: any) => {
      if (!record) return false; // Filter out null records
      const name = record.createdBy?.fullName || record.username || '';
      const id = record._id || '';
      const status = record.status || '';
      const location = record.location || '';
      return (
        name.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q) ||
        status.toLowerCase().includes(q) ||
        location.toLowerCase().includes(q)
      );
    });
  }, [inquiries, query]);

  // CardView component
  const CardView = () => {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
        {filteredInquiries.map(record => {
          const scheduledDates = record.scheduledDates || [];
          let statusConfig = { color: '#0a66c2', bgColor: '#e6f4ff', border: '#0a66c2', text: 'Pending', icon: <ClockCircleOutlined /> };
          if (record.status === 'scheduled') {
            if (isPast(record)) {
              statusConfig = { color: '#888', bgColor: '#f5f5f5', border: '#bdbdbd', text: 'Past', icon: <ClockCircleTwoTone twoToneColor="#bdbdbd" /> };
            } else {
              statusConfig = { color: '#52c41a', bgColor: '#f6ffed', border: '#52c41a', text: 'Scheduled', icon: <CheckCircleOutlined /> };
            }
          } else if (record.status === 'resolved') {
            statusConfig = { color: '#8c8c8c', bgColor: '#fafafa', border: '#8c8c8c', text: 'Resolved', icon: <CheckCircleOutlined /> };
          } else if (record.status === 'canceled') {
            statusConfig = { color: '#cf1322', bgColor: '#fff2f0', border: '#cf1322', text: 'Canceled', icon: <ClockCircleOutlined /> };
          }
          return (
            <Card
              key={record._id}
              style={{
                borderRadius: 12,
                border: '1px solid rgba(255, 128, 0, 0.12)',
                boxShadow: '0 4px 16px rgba(255, 128, 0, 0.1)',
                transition: 'all 0.3s ease',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(255, 128, 0, 0.2)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(255, 128, 0, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #ff8000 0%, #ffa940 50%, #ffc069 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 16,
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(255, 128, 0, 0.25)'
                    }}>
                      {(record.createdBy?.fullName || record.username || 'R').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, background: 'linear-gradient(135deg, #ff8000 0%, #ffa940 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                        {record.createdBy?.fullName || record.username}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                        📅 {dayjs(record.createdAt).format('MMM DD, YYYY')}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 12px',
                    background: statusConfig.bgColor,
                    color: statusConfig.color,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    flexShrink: 0,
                    border: `2px solid ${statusConfig.border}`,
                    whiteSpace: 'nowrap',
                    minWidth: 100,
                    height: 28
                  }}>
                    {statusConfig.icon}
                    {statusConfig.text}
                  </div>
                </div>

                {/* Quick Appointment Info */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #fff7e6 0%, #ffe7ba 50%, #ffe7ba 100%)',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(255, 128, 0, 0.15)'
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ff8000', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    ⚡ Quick Appointment Details
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {record.location && (
                      <div style={{ fontSize: 12, color: '#1f2937', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>📍</span> {record.location}
                      </div>
                    )}
                    {scheduledDates.length > 0 && (
                      <div style={{ fontSize: 12, color: '#1f2937', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ClockCircleOutlined style={{ fontSize: 12, color: '#ff8000', flexShrink: 0 }} />
                        {dayjs(scheduledDates[0].date).format('MMM DD, YYYY')} {scheduledDates[0].startTime} - {scheduledDates[0].endTime}
                      </div>
                    )}
                    {record.urgency && (
                      <div style={{ fontSize: 12, color: '#1f2937', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>⚠️</span> {record.urgency}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Button 
                    block
                    size="small"
                    onClick={() => { setSelectedRecord(record); setInquiryModalVisible(true); }}
                    style={{
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      border: '1px solid rgba(255, 128, 0, 0.2)',
                      color: '#ff8000',
                      height: 36
                    }}
                  >
                    View Details
                  </Button>
                  <Button 
                    danger
                    block
                    size="small"
                    onClick={() => handleDelete(record)}
                    icon={<DeleteOutlined />}
                    style={{
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      height: 36
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const columns = useMemo(() => [
    { 
      title: '👤 Organizer', 
      dataIndex: ['createdBy', 'fullName'], 
      key: 'resident', 
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #ff8000 0%, #ffa940 50%, #ffc069 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(255, 128, 0, 0.2)'
          }}>
            {(record.createdBy?.fullName || record.username || 'R').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 600, color: '#1f2937', background: 'linear-gradient(135deg, #ff8000 0%, #ffa940 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{record.createdBy?.fullName || record.username}</span>
        </div>
      )
    },
    { 
      title: '🔖 Inquiry ID', 
      dataIndex: '_id', 
      key: '_id', 
      render: (id: string) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Text copyable style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{id.substring(0, 8)}...</Text>
          <Tooltip title="View full ID" placement="top">
            <EyeOutlined 
              style={{ color: '#ff8000', cursor: 'pointer', fontSize: 15 }} 
              onClick={e => {
                e.stopPropagation();
                setViewIdModal({ visible: true, id });
              }}
            />
          </Tooltip>
        </span>
      )
    },
    { 
      title: '📍 Location', 
      dataIndex: 'location', 
      key: 'location', 
      render: (location: string) => (
        <div style={{ fontSize: 12, color: '#666' }}>
          {location || '—'}
        </div>
      )
    },
    { 
      title: '📅 Scheduled Date & Time', 
      dataIndex: 'scheduledDates', 
      key: 'scheduledDates', 
      render: (dates: any[]) => {
        if (!dates || dates.length === 0) return <span style={{ color: '#999' }}>—</span>;
        const first = dates[0];
        return (
          <div style={{ fontSize: 12, color: '#666', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarOutlined style={{ fontSize: 11, color: '#ff8000' }} />
              {dayjs(first.date).format('MMM DD, YYYY')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#666' }}>
              <ClockCircleOutlined style={{ fontSize: 11, color: '#ff8000' }} />
              {first.startTime} - {first.endTime}
            </div>
            {dates.length > 1 && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>+{dates.length - 1} more</div>}
          </div>
        );
      }
    },
    { 
      title: '✓ Status', 
      dataIndex: 'status', 
      key: 'status', 
      render: (_: string, record: any) => {
        let config = { color: '#0a66c2', bgColor: '#e6f4ff', border: '#0a66c2', text: 'Pending', icon: <ClockCircleOutlined /> };
        if (record.status === 'scheduled') {
          if (isPast(record)) {
            config = { color: '#888', bgColor: '#f5f5f5', border: '#bdbdbd', text: 'Past', icon: <ClockCircleTwoTone twoToneColor="#bdbdbd" /> };
          } else {
            config = { color: '#52c41a', bgColor: '#f6ffed', border: '#52c41a', text: 'Scheduled', icon: <CheckCircleOutlined /> };
          }
        } else if (record.status === 'resolved') {
          config = { color: '#8c8c8c', bgColor: '#fafafa', border: '#8c8c8c', text: 'Resolved', icon: <CheckCircleOutlined /> };
        } else if (record.status === 'canceled') {
          config = { color: '#cf1322', bgColor: '#fff2f0', border: '#cf1322', text: 'Canceled', icon: <ClockCircleOutlined /> };
        }
        return (
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 12px',
            background: config.bgColor, 
            color: config.color,
            border: `2px solid ${config.border}`,
            borderRadius: 6,
            fontSize: 12
          }}>
            {config.icon}
            {config.text}
          </div>
        );
      }
    },
    {
      title: '⚡ Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button 
            block
            size="small"
            onClick={() => { setSelectedRecord(record); setInquiryModalVisible(true); }}
            style={{
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid rgba(255, 128, 0, 0.2)',
              color: '#ff8000',
              height: 36
            }}
          >
            View Details
          </Button>
          <Button 
            danger
            block
            size="small"
            onClick={() => handleDelete(record)}
            icon={<DeleteOutlined />}
            style={{
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              height: 36
            }}
          >
            Delete
          </Button>
        </div>
      )
    }
  ]);

  // Main return
  return (
    <>
      <Spin spinning={isLoading} tip="Loading quick appointments...">
        <div style={{ 
          minHeight: '100vh', 
          background: 'linear-gradient(135deg, #fafbfc 0%, #fffaf0 100%)',
          padding: '16px'
        }}>
          {/* Shiny Container */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(255, 128, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(255, 128, 0, 0.1)',
            padding: '24px'
          }}>
            {/* Header Section */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #ff8000 0%, #ffa940 50%, #ffc069 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 20px rgba(255, 128, 0, 0.35)',
                  flexShrink: 0
                }}>
                  <ThunderboltOutlined style={{ fontSize: 32, color: '#ffffff' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, background: 'linear-gradient(135deg, #ff8000 0%, #ffa940 50%, #ffc069 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>
                    Quick Appointments
                  </h2>
                  <p style={{ margin: '8px 0 0 0', background: 'linear-gradient(90deg, #ff8000 0%, #ffa940 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 13, fontWeight: 600 }}>
                    Staff-created fast-track appointments
                  </p>
                </div>
              </div>
            </div>

            {/* Search and View Mode Controls */}
            <div style={{
              background: 'linear-gradient(135deg, #fff7e6 0%, #ffe7ba 50%, #fff7e6 100%)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              border: '1px solid rgba(255, 128, 0, 0.15)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: isMobile ? 'wrap' : 'nowrap'
            }}>
              <div style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}>
                <Input
                  allowClear
                  placeholder="🔍 Search resident name, location, or status..."
                  prefix={<SearchOutlined style={{ color: '#ff8000' }} />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ 
                    borderRadius: 8,
                    border: '1px solid rgba(255, 128, 0, 0.2)',
                    fontSize: 13
                  }}
                  size="large"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button 
                  onClick={() => setViewMode('table')}
                  type={viewMode === 'table' ? 'primary' : 'default'}
                  style={{ 
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 12,
                    background: viewMode === 'table' ? 'linear-gradient(135deg, #ff8000 0%, #ffa940 100%)' : 'transparent',
                    border: viewMode === 'table' ? 'none' : '1px solid rgba(255, 128, 0, 0.2)',
                    color: viewMode === 'table' ? '#fff' : '#ff8000'
                  }}
                >
                  📊 Table
                </Button>
                <Button 
                  onClick={() => setViewMode('card')}
                  type={viewMode === 'card' ? 'primary' : 'default'}
                  style={{ 
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 12,
                    background: viewMode === 'card' ? 'linear-gradient(135deg, #ff8000 0%, #ffa940 100%)' : 'transparent',
                    border: viewMode === 'card' ? 'none' : '1px solid rgba(255, 128, 0, 0.2)',
                    color: viewMode === 'card' ? '#fff' : '#ff8000'
                  }}
                >
                  📇 Cards
                </Button>
              </div>
            </div>

            {/* Content */}
            {filteredInquiries.length === 0 ? (
              <Card style={{
                borderRadius: 12,
                border: '2px dashed rgba(255, 128, 0, 0.4)',
                boxShadow: '0 6px 24px rgba(255, 128, 0, 0.12)',
                background: 'linear-gradient(135deg, #fff7e6 0%, #ffe7ba 50%, #fff7e6 100%)',
                padding: 60,
                textAlign: 'center'
              }}>
                <Empty description={query ? "No quick appointments found" : "No quick appointments"} style={{ color: '#ff8000' }} />
              </Card>
            ) : viewMode === 'table' ? (
              <Table 
                rowKey={(r:any) => r?._id || 'unknown'}
                dataSource={filteredInquiries} 
                columns={columns} 
                loading={isLoading}
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 10 }}
                style={{
                  background: '#ffffff',
                  borderRadius: 8
                }}
              />
            ) : (
              <CardView />
            )}

            {selectedRecord && (
              <InquiryDetailsModal
                visible={inquiryModalVisible}
                inquiryId={selectedRecord?._id || null}
                onClose={() => { setInquiryModalVisible(false); setSelectedRecord(null); }}
                onChanged={() => { window.dispatchEvent(new Event('appointments-updated')); }}
              />
            )}
          </div> {/* End shiny container */}
        </div> {/* End outer gradient container */}
      </Spin>
      <Modal
        open={viewIdModal.visible}
        onCancel={() => setViewIdModal({ visible: false, id: null })}
        footer={null}
        centered
        width={420}
        title={<span style={{ fontWeight: 700 }}>Full Inquiry ID</span>}
        bodyStyle={{ textAlign: 'center', padding: 24 }}
      >
        {viewIdModal.id && (
          <Text copyable style={{ fontSize: 16, color: '#ff8000', fontFamily: 'monospace', wordBreak: 'break-all' }}>{viewIdModal.id}</Text>
        )}
      </Modal>
    </>
  );
};

export default QuickAppointments;
