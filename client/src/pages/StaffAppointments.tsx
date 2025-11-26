import React, { useMemo, useState } from 'react';
import { Table, Button, Card, Tag, Space, Typography, message } from 'antd';
import { useAppointmentsQuery } from '../hooks/useAppointments';
import '../components/staff/appointments/scheduling.css';
import dayjs from 'dayjs';
import AppointmentDetailsModal from '../components/AppointmentDetailsModal';

const { Text } = Typography;

const StaffAppointments: React.FC = () => {
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const { data: inquiries = [], isLoading, isError } = useAppointmentsQuery();
  if (isError) {
    // keep existing message behavior
    message.error('Failed to fetch appointments');
  }

  const columns = useMemo(() => [
    { title: 'Resident Name', dataIndex: ['createdBy', 'fullName'], key: 'resident', render: (_: any, record: any) => record.createdBy?.fullName || record.username },
    { title: 'Inquiry ID', dataIndex: '_id', key: '_id', render: (id: string) => <Text copyable>{id}</Text> },
    { title: 'Submitted On', dataIndex: 'createdAt', key: 'createdAt', render: (d: any) => dayjs(d).format('MMM DD, YYYY hh:mm A') },
    { title: 'Requested Dates', dataIndex: 'appointmentDates', key: 'appointmentDates', render: (dates: string[]) => (dates || []).map(d => <div key={d}>{dayjs(d).format('MMM DD, YYYY')}</div>) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => {
      const color = s === 'scheduled' ? 'green' : s === 'resolved' ? 'gray' : 'orange';
      return <Tag color={color} className="capitalize">{s || 'open'}</Tag>;
    }},
    { title: 'Actions', key: 'actions', render: (_: any, record: any) => (
      <Space>
        <Button onClick={() => { setSelectedRecord(record); setModalVisible(true); }}>View</Button>
        <Button type="primary" onClick={() => { setSelectedRecord(record); setModalVisible(true); }}>Schedule</Button>
      </Space>
    )}
  ], []);

  return (
    <Card className="cardRounded" title={<Typography.Title level={4}>Staff — Appointments</Typography.Title>}>
      <Table rowKey={(r:any) => r._id} dataSource={inquiries} columns={columns} loading={isLoading} scroll={{ x: 'max-content' }} />

      {selectedRecord && (
        <AppointmentDetailsModal
          visible={modalVisible}
          record={selectedRecord}
          onClose={() => { setModalVisible(false); setSelectedRecord(null); }}
        />
      )}
    </Card>
  );
};

export default StaffAppointments;
