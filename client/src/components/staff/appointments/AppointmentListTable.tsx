import React, { useEffect, useState } from 'react';
import { Table, Button, Space } from 'antd';
import appointmentsAPI from '../../../api/appointments';
import type { AppointmentInquiry } from '../../../types/appointments';

type Props = {
  onSelect: (rec: any) => void;
};

const AppointmentListTable: React.FC<Props> = ({ onSelect }) => {
  const [data, setData] = useState<AppointmentInquiry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await appointmentsAPI.getAppointmentInquiries();
      setData(Array.isArray(res) ? res : []);
    } catch (e) {
      console.warn('Failed to fetch inquiries', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const cols = [
    { title: 'Resident', dataIndex: ['createdBy','fullName'], key: 'resident' },
    { title: 'Username', dataIndex: 'username', key: 'username' },
    { title: 'Requested Dates', dataIndex: 'appointmentDates', key: 'dates', render: (d: any) => (Array.isArray(d) ? d.join(', ') : '') },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Actions', key: 'actions', render: (_: any, rec: any) => (
      <Space>
        <Button size="small" onClick={() => onSelect(rec)}>Details</Button>
      </Space>
    ) }
  ];

  return (
    <Table
      rowKey={(r: any) => r._id}
      dataSource={data}
      columns={cols}
      loading={loading}
      pagination={{ pageSize: 10 }}
    />
  );
};

export default AppointmentListTable;
