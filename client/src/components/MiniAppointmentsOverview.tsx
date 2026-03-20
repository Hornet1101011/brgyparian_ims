

import React, { useContext } from 'react';
import { Card, Row, Col, Typography, Tag, List, Avatar, Skeleton, Empty, Space, Button } from 'antd';
import { CalendarOutlined, UserOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, ArrowRightOutlined, ClockCircleTwoTone } from '@ant-design/icons';
import { useAppointmentsQuery } from '../hooks/useAppointments';
import { useNavigate } from 'react-router-dom';
import { CalendarScrollContext } from './StaffDashboard';
import dayjs from 'dayjs';


const statusMeta = {
  scheduled: { color: 'green', icon: <CheckCircleOutlined /> },
  pending: { color: 'orange', icon: <ClockCircleOutlined /> },
  canceled: { color: 'red', icon: <CloseCircleOutlined /> },
  past: { color: 'default', icon: <ClockCircleTwoTone twoToneColor="#bdbdbd" /> },
};

const MiniAppointmentsOverview = () => {
  const { data: inquiries = [], isLoading } = useAppointmentsQuery();

  // Helper to determine if a scheduled appointment is past
  const isPast = (a: any) => {
    if (a.status !== 'scheduled') return false;
    const date = a.appointmentDates && a.appointmentDates.length > 0 ? a.appointmentDates[0] : null;
    if (!date) return false;
    return dayjs(date).isBefore(dayjs(), 'day');
  };

  const scheduled = inquiries.filter((a: any) => a.status === 'scheduled' && !isPast(a)).length;
  const past = inquiries.filter((a: any) => a.status === 'scheduled' && isPast(a)).length;
  const pending = inquiries.filter((a: any) => a.status === 'pending').length;
  const canceled = inquiries.filter((a: any) => a.status === 'canceled').length;
  const total = inquiries.length;
  const recent = inquiries.slice(0, 3);
  const navigate = useNavigate();

  const { scrollToCalendar } = useContext(CalendarScrollContext);

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 14,
        boxShadow: '0 2px 8px rgba(24, 144, 255, 0.08)',
        background: 'linear-gradient(135deg, #f9f5ff 0%, #e6f7ff 100%)',
        border: '1px solid #e0e7ff',
        marginBottom: 28,
        minHeight: 170,
      }}
      bodyStyle={{ padding: 24 }}
    >
      <Row align="middle" gutter={24}>
        <Col flex="auto">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Typography.Title level={4} style={{ color: '#4f46e5', margin: 0, fontWeight: 700 }}>Appointments Overview</Typography.Title>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="primary"
                size="small"
                icon={<ArrowRightOutlined />}
                style={{ background: '#6366f1', borderColor: '#6366f1', fontWeight: 600 }}
                onClick={() => navigate('/staff/appointments')}
              >
                Go to Appointments
              </Button>
              <Button
                size="small"
                icon={<CalendarOutlined />}
                style={{ background: '#e0e7ff', borderColor: '#e0e7ff', color: '#4f46e5', fontWeight: 600 }}
                onClick={scrollToCalendar}
              >
                Go to Calendar
              </Button>
            </div>
          </div>
          <Row gutter={16} style={{ margin: '12px 0 8px 0' }}>
            <Col>
              <Tag color="#6366f1" style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px' }}>{total} Total</Tag>
            </Col>
            <Col>
              <Tag color="green" style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px' }}>{scheduled} Scheduled</Tag>
            </Col>
            <Col>
              <Tag color="default" style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px', color: '#888' }}>{past} Past</Tag>
            </Col>
            <Col>
              <Tag color="orange" style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px' }}>{pending} Pending</Tag>
            </Col>
            <Col>
              <Tag color="red" style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px' }}>{canceled} Canceled</Tag>
            </Col>
          </Row>
          <Typography.Text style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Recent Requests:</Typography.Text>
          <List
            itemLayout="horizontal"
            dataSource={recent}
            style={{ marginTop: 6 }}
            locale={{ emptyText: <Empty description="No recent appointments" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            renderItem={(a: any) => {
              let statusLabel = a.status;
              let statusKey = a.status;
              if (a.status === 'scheduled' && isPast(a)) {
                statusLabel = 'past';
                statusKey = 'past';
              }
              return (
                <List.Item style={{ padding: '6px 0' }}>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} style={{ background: '#e0e7ff', color: '#4f46e5' }} />}
                    title={
                      <Space>
                        <Typography.Text strong>{a.createdBy?.fullName || a.username || 'Resident'}</Typography.Text>
                        <Tag color={statusMeta[statusKey]?.color || 'default'} icon={statusMeta[statusKey]?.icon} style={{ marginLeft: 4, fontSize: 12, fontWeight: 500, textTransform: 'capitalize', color: statusKey === 'past' ? '#888' : undefined }}>{statusLabel}</Tag>
                      </Space>
                    }
                    description={
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {(['scheduled', 'past', 'canceled'].includes(statusKey) && a.scheduledDates && a.scheduledDates.length > 0)
                          ? a.scheduledDates.map((d: any, idx: number) => (
                              <span key={d.date + d.startTime + d.endTime}>
                                Scheduled: {dayjs(d.date + 'T' + d.startTime).format('YYYY-MM-DD HH:mm')} - {dayjs(d.date + 'T' + d.endTime).format('HH:mm')}{idx < a.scheduledDates.length - 1 ? <br /> : null}
                              </span>
                            ))
                          : (!['scheduled', 'past', 'canceled'].includes(statusKey) && a.appointmentDates && a.appointmentDates.length > 0)
                            ? a.appointmentDates.map((d: string, idx: number) => (
                                <span key={d}>
                                  Requested: {dayjs(d).format('YYYY-MM-DD')}{idx < a.appointmentDates.length - 1 ? <br /> : null}
                                </span>
                              ))
                            : ''}
                      </Typography.Text>
                    }
                  />
                </List.Item>
              );
            }}
            loading={isLoading}
          />
        </Col>
        <Col flex="none">
          <CalendarOutlined style={{ fontSize: 54, color: '#6366f1', opacity: 0.16 }} />
        </Col>
      </Row>
    </Card>
  );
};

export default MiniAppointmentsOverview;