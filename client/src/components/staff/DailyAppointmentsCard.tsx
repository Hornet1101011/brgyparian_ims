import React from 'react';
import { Card, List, Typography, Spin, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import appointmentsAPI from '../../api/appointments';

type DailySummary = {
  totalScheduledToday: number;
  totalAvailableSlotsToday: number;
  nextAppointments: { residentName: string; startTime: string; endTime: string }[];
  todaysAppointments: { residentName: string; startTime: string; endTime: string }[];
};

const DailyAppointmentsCard = () => {
  const { data, isLoading, error } = useQuery<DailySummary>({
    queryKey: ['appointments', 'dailySummary'],
    queryFn: async () => appointmentsAPI.getDailySummary(),
    refetchInterval: 90_000, // refresh every 90 seconds
    staleTime: 60_000,
  });

  return (
    <>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
      ) : error ? (
        <Typography.Text type="danger">Failed to load</Typography.Text>
      ) : !data ? (
        <Empty description="No data" />
      ) : (
        <div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 16,
            padding: '12px',
            background: '#faf5ff',
            borderRadius: 10
          }}>
            <div style={{ borderRight: '1px solid #ede9fe', paddingRight: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Total Scheduled
              </Typography.Text>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {data.totalScheduledToday}
              </div>
            </div>
            <div style={{ paddingLeft: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Available Slots
              </Typography.Text>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#8b5cf6', marginTop: 4 }}>
                {data.totalAvailableSlotsToday}
              </div>
            </div>
          </div>
          
          <div>
            <Typography.Text strong style={{ fontSize: '12px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              All Scheduled Today
            </Typography.Text>
            {Array.isArray(data.todaysAppointments) && data.todaysAppointments.length > 0 ? (
              <List
                size="small"
                dataSource={data.todaysAppointments}
                split={false}
                style={{ marginTop: 8 }}
                renderItem={item => (
                  <List.Item
                    style={{ 
                      padding: '10px 8px',
                      borderRadius: 8,
                      transition: 'all 0.2s ease',
                      marginBottom: 4,
                      border: '1px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#faf5ff';
                      e.currentTarget.style.borderColor = '#ede9fe';
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(139, 92, 246, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography.Text strong style={{ fontSize: '13px', color: '#0f172a' }}>
                          {item.residentName && item.residentName !== 'Unknown' ? item.residentName : 'TBD'}
                          {item.date ? (
                            <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', marginLeft: 8 }}>
                              ({item.date})
                            </span>
                          ) : null}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: 600 }}>
                          {item.startTime && item.startTime !== 'Unknown' ? item.startTime : ''}
                          {(item.startTime && item.startTime !== 'Unknown' && item.endTime && item.endTime !== 'Unknown') ? '–' : ''}
                          {item.endTime && item.endTime !== 'Unknown' ? item.endTime : ''}
                        </Typography.Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ marginTop: 8, padding: '12px', background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                  No upcoming appointments
                </Typography.Text>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DailyAppointmentsCard;
