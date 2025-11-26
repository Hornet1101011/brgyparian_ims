import React from 'react';
import { Card, List, Typography, Spin, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import appointmentsAPI from '../../api/appointments';

const DailyAppointmentsCard: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['appointments', 'dailySummary'],
    queryFn: async () => appointmentsAPI.getDailySummary(),
    refetchInterval: 90_000, // refresh every 90 seconds
    staleTime: 60_000,
  });

  return (
    <Card title="Today's Appointments" size="small" className="dashboard-card">
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
      ) : error ? (
        <Typography.Text type="danger">Failed to load</Typography.Text>
      ) : !data ? (
        <Empty description="No data" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <Typography.Text strong>Total scheduled: </Typography.Text>
              <Typography.Text>{data.totalScheduledToday}</Typography.Text>
            </div>
            <div>
              <Typography.Text strong>Open slots left: </Typography.Text>
              <Typography.Text>{data.totalAvailableSlotsToday}</Typography.Text>
            </div>
          </div>
          <div>
            <Typography.Text strong>Upcoming (2 hrs)</Typography.Text>
            {Array.isArray(data.nextAppointments) && data.nextAppointments.length > 0 ? (
              <List
                size="small"
                dataSource={data.nextAppointments}
                renderItem={item => (
                  <List.Item>
                    <Typography.Text>{`${item.startTime}–${item.endTime} – ${item.residentName}`}</Typography.Text>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ marginTop: 8 }}><Typography.Text type="secondary">No upcoming appointments</Typography.Text></div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default DailyAppointmentsCard;
