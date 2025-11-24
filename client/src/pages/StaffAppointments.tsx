import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Card, Tag, Space, Modal, Typography, message } from 'antd';
import { contactAPI } from '../services/api';
import dayjs from 'dayjs';
import AppointmentDetailsModal from '../components/AppointmentDetailsModal';

const { Text } = Typography;

const StaffAppointments: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const data = await contactAPI.getAllInquiries();
      // Filter to only schedule appointment type
      const appointments = Array.isArray(data) ? data.filter((i: any) => (i.type === 'SCHEDULE_APPOINTMENT')) : [];
      setInquiries(appointments);
    } catch (e) {
      console.error(e);
      message.error('Failed to fetch appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const columns = useMemo(() => [
    { title: 'Resident Name', dataIndex: ['createdBy', 'fullName'], key: 'resident', render: (_: any, record: any) => record.createdBy?.fullName || record.username },
    { title: 'Inquiry ID', dataIndex: '_id', key: '_id', render: (id: string) => <Text copyable>{id}</Text> },
    { title: 'Submitted On', dataIndex: 'createdAt', key: 'createdAt', render: (d: any) => dayjs(d).format('MMM DD, YYYY hh:mm A') },
    { title: 'Requested Dates', dataIndex: 'appointmentDates', key: 'appointmentDates', render: (dates: string[]) => (dates || []).map(d => <div key={d}>{dayjs(d).format('MMM DD, YYYY')}</div>) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => {
      const color = s === 'scheduled' ? 'green' : s === 'resolved' ? 'gray' : 'orange';
      return <Tag color={color} style={{ textTransform: 'capitalize' }}>{s || 'open'}</Tag>;
    }},
    { title: 'Actions', key: 'actions', render: (_: any, record: any) => (
      <Space>
        <Button onClick={() => { setSelectedRecord(record); setModalVisible(true); }}>View</Button>
        <Button type="primary" onClick={() => { setSelectedRecord(record); setModalVisible(true); }}>Schedule</Button>
      </Space>
    )}
  ], []);

  return (
    <Card title="Staff — Appointments" style={{ borderRadius: 12 }}>
      <Table rowKey={(r:any) => r._id} dataSource={inquiries} columns={columns} loading={loading} />

      {selectedRecord && (
        <AppointmentDetailsModal
          visible={modalVisible}
          record={selectedRecord}
          onClose={() => { setModalVisible(false); setSelectedRecord(null); fetch(); }}
        />
      )}
    </Card>
  );
};

export default StaffAppointments;
