import React, { useMemo, useState } from 'react';
import { Table, Button, Card, Tag, Space, Typography, message, Input, Empty, Spin, Tooltip, Modal } from 'antd';
import { useAppointmentsQuery, useDeleteAppointmentMutation } from '../hooks/useAppointments';
import '../components/staff/appointments/scheduling.css';
import dayjs from 'dayjs';
import AppointmentDetailsModal from '../components/AppointmentDetailsModal';
import InquiryDetailsModal from '../components/InquiryDetailsModal';
import RescheduleRequestModal from '../components/staff/RescheduleRequestModal';
import { CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined, SearchOutlined, ClockCircleTwoTone, EyeOutlined, DeleteOutlined, RetweetOutlined } from '@ant-design/icons';

const { Text } = Typography;

const StaffAppointments = () => {
  const [viewIdModal, setViewIdModal] = useState({ visible: false, id: null } as { visible: boolean; id: string | null });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [inquiryModalVisible, setInquiryModalVisible] = useState(false);
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 720);

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { data: inquiries = [], isLoading, isError } = useAppointmentsQuery();
  if (isError) {
    message.error('Failed to fetch appointments');
  }

  const deleteAppointment = useDeleteAppointmentMutation();

  const handleDelete = (record: any) => {
    Modal.confirm({
      title: 'Delete Appointment',
      content: `Are you sure you want to delete the appointment for ${record.createdBy?.fullName || record.username}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteAppointment.mutateAsync(String(record._id));
          message.success('Appointment deleted successfully');
        } catch (err: any) {
          message.error('Failed to delete appointment');
        }
      },
    });
  };

  // Helper to determine if a scheduled appointment is past
  const isPast = (record: any) => {
    if (record.status !== 'scheduled') return false;
    const date = record.appointmentDates && record.appointmentDates.length > 0 ? record.appointmentDates[0] : null;
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
      return (
        name.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q) ||
        status.toLowerCase().includes(q)
      );
    });
  }, [inquiries, query]);

  // CardView component
  const CardView = () => {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
        {filteredInquiries.map(record => {
          const dates = record.appointmentDates || [];
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
          } else if (record.status === 'reschedule_request') {
            statusConfig = { color: '#1890ff', bgColor: '#e6f7ff', border: '#1890ff', text: 'Reschedule Request', icon: <RetweetOutlined /> };
          }
          return (
            <Card
              key={record._id}
              style={{
                borderRadius: 12,
                border: '1px solid rgba(114, 46, 209, 0.12)',
                boxShadow: '0 4px 16px rgba(114, 46, 209, 0.1)',
                transition: 'all 0.3s ease',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(114, 46, 209, 0.2)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(114, 46, 209, 0.1)';
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
                          background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 16,
                          flexShrink: 0,
                          boxShadow: '0 4px 12px rgba(114, 46, 209, 0.25)'
                        }}>
                          {(record.createdBy?.fullName || record.username || 'R').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
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

                    {/* Requested Dates Section */}
                    <div style={{ 
                      background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid rgba(114, 46, 209, 0.15)'
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#722ed1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        📋 Requested Dates
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dates.slice(0, 3).map((d, idx) => (
                          <div key={idx} style={{ fontSize: 12, color: '#1f2937', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CalendarOutlined style={{ fontSize: 12, color: '#1890ff', flexShrink: 0 }} />
                            {dayjs(d).format('MMM DD, YYYY')}
                          </div>
                        ))}
                        {dates.length > 3 && <div style={{ fontSize: 11, color: '#666', marginTop: 4, fontWeight: 600 }}>+{dates.length - 3} more date{dates.length > 4 ? 's' : ''}</div>}
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
                          border: '1px solid rgba(114, 46, 209, 0.2)',
                          color: '#722ed1',
                          height: 36
                        }}
                      >
                        View Details
                      </Button>
                      {record.status === 'reschedule_request' && (
                        <Button 
                          type="primary"
                          block
                          size="small"
                          onClick={() => { setSelectedRecord(record); setRescheduleModalVisible(true); }}
                          icon={<RetweetOutlined />}
                          style={{
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            height: 36
                          }}
                        >
                          Handle Reschedule
                        </Button>
                      )}
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
      title: '👤 Resident Name', 
      dataIndex: ['createdBy', 'fullName'], 
      key: 'resident', 
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(114, 46, 209, 0.2)'
          }}>
            {(record.createdBy?.fullName || record.username || 'R').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 600, color: '#1f2937', background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{record.createdBy?.fullName || record.username}</span>
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
              style={{ color: '#722ed1', cursor: 'pointer', fontSize: 15 }} 
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
      title: '📅 Submitted On', 
      dataIndex: 'createdAt', 
      key: 'createdAt', 
      render: (d: any) => (
        <div style={{ fontSize: 12, color: '#666' }}>
          {dayjs(d).format('MMM DD, YYYY')}
          <div style={{ fontSize: 11, color: '#999' }}>{dayjs(d).format('hh:mm A')}</div>
        </div>
      )
    },
    { 
      title: '📋 Requested Dates', 
      dataIndex: 'appointmentDates', 
      key: 'appointmentDates', 
      render: (dates: string[]) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(dates || []).slice(0, 2).map(d => (
            <div key={d} style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarOutlined style={{ fontSize: 11, color: '#1890ff' }} />
              {dayjs(d).format('MMM DD')}
            </div>
          ))}
          {(dates || []).length > 2 && <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>+{(dates || []).length - 2} more</div>}
        </div>
      )
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
              border: '1px solid rgba(114, 46, 209, 0.2)',
              color: '#722ed1',
              height: 36
            }}
          >
            View Details
          </Button>
          {/* Schedule/Edit moved to View Details modal; omitted from list actions */}
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
  ], []);

  // Main return follows


  return (
    <>
      <Spin spinning={isLoading} tip="Loading appointments...">
        <div style={{ 
          minHeight: '100vh', 
          background: 'linear-gradient(135deg, #fafbfc 0%, #f5f8fc 100%)',
          padding: '16px'
        }}>
          {/* Shiny Container */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(24, 144, 255, 0.1)',
            padding: '24px'
          }}>
            {/* Header Section */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 20px rgba(114, 46, 209, 0.35)',
                  flexShrink: 0
                }}>
                  <CalendarOutlined style={{ fontSize: 32, color: '#ffffff' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>
                    Appointment Requests
                  </h2>
                  <p style={{ margin: '8px 0 0 0', background: 'linear-gradient(90deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 13, fontWeight: 600 }}>
                    Manage and schedule appointment requests
                  </p>
                </div>
              </div>
            </div>

            {/* Search and View Mode Controls */}
            <div style={{
              background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              border: '1px solid rgba(114, 46, 209, 0.15)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: isMobile ? 'wrap' : 'nowrap'
            }}>
              <div style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}>
                <Input
                  allowClear
                  placeholder="🔍 Search resident name, inquiry ID, or status..."
                  prefix={<SearchOutlined style={{ color: '#722ed1' }} />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ 
                    borderRadius: 8,
                    border: '1px solid rgba(114, 46, 209, 0.2)',
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
                    background: viewMode === 'table' ? 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)' : 'transparent',
                    border: viewMode === 'table' ? 'none' : '1px solid rgba(114, 46, 209, 0.2)',
                    color: viewMode === 'table' ? '#fff' : '#722ed1'
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
                    background: viewMode === 'card' ? 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)' : 'transparent',
                    border: viewMode === 'card' ? 'none' : '1px solid rgba(114, 46, 209, 0.2)',
                    color: viewMode === 'card' ? '#fff' : '#722ed1'
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
                border: '2px dashed rgba(114, 46, 209, 0.4)',
                boxShadow: '0 6px 24px rgba(114, 46, 209, 0.12)',
                background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
                padding: 60,
                textAlign: 'center'
              }}>
                <Empty description={query ? "No appointments found" : "No appointment requests"} style={{ color: '#722ed1' }} />
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
              <AppointmentDetailsModal
                visible={modalVisible}
                record={selectedRecord}
                onClose={() => { setModalVisible(false); setSelectedRecord(null); }}
              />
            )}
            {selectedRecord && (
              <InquiryDetailsModal
                visible={inquiryModalVisible}
                inquiryId={selectedRecord?._id || null}
                onClose={() => { setInquiryModalVisible(false); setSelectedRecord(null); }}
                onChanged={() => { window.dispatchEvent(new Event('appointments-updated')); }}
              />
            )}
            {selectedRecord && (
              <RescheduleRequestModal
                visible={rescheduleModalVisible}
                inquiry={selectedRecord}
                onClose={() => { setRescheduleModalVisible(false); setSelectedRecord(null); }}
                onProcessed={() => { window.dispatchEvent(new Event('appointments-updated')); }}
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
          <Text copyable style={{ fontSize: 16, color: '#722ed1', fontFamily: 'monospace', wordBreak: 'break-all' }}>{viewIdModal.id}</Text>
        )}
      </Modal>
    </>
  );
};

export default StaffAppointments;
