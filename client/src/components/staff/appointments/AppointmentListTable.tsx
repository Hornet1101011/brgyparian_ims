import React, { useState } from 'react';
import { Table, Button, Space } from 'antd';
import type { AppointmentInquiry } from '../../../types/appointments';

type Props = {
  onSelect: (rec: any) => void;
  data?: AppointmentInquiry[];
};

const AppointmentListTable = ({ onSelect, data = [] }: Props) => {
  const [sortOrder, setSortOrder] = useState('descend');
  const [filterStatus, setFilterStatus] = useState(undefined);
  const [filterDate, setFilterDate] = useState(undefined);
  const [loading, setLoading] = useState(false);

  // Enhanced columns
  const cols = [
    {
      title: 'Resident',
      key: 'resident',
      render: (rec: any) => rec.createdBy?.fullName || rec.username || '—',
      sorter: (a: any, b: any) => ((a.createdBy?.fullName || a.username || '').localeCompare(b.createdBy?.fullName || b.username || '')),
      sortOrder: undefined
    },
    { title: 'Username', dataIndex: 'username', key: 'username', sorter: (a: any, b: any) => (a.username || '').localeCompare(b.username || ''), sortOrder: undefined },
    { title: 'Scheduled Dates', dataIndex: 'scheduledDates', key: 'scheduledDates', render: (d: any) => {
      if (Array.isArray(d)) {
        return d.map((s: any) => s.date ? `${s.date} (${s.startTime || ''}${s.endTime ? '–' + s.endTime : ''})` : '').join(', ');
      }
      return '';
    }, sorter: (a: any, b: any) => {
      const ad = Array.isArray(a.scheduledDates) && a.scheduledDates[0] ? a.scheduledDates[0].date : '';
      const bd = Array.isArray(b.scheduledDates) && b.scheduledDates[0] ? b.scheduledDates[0].date : '';
      return (ad || '').localeCompare(bd || '');
    }, sortOrder: undefined },
    { title: 'Status', dataIndex: 'status', key: 'status', filters: [
      { text: 'Scheduled', value: 'scheduled' },
      { text: 'Completed', value: 'completed' },
      { text: 'Approved', value: 'approved' },
      { text: 'Canceled', value: 'canceled' }
    ],
      onFilter: (value, record) => record.status === value,
      sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || ''), sortOrder: undefined },
    { title: 'Actions', key: 'actions', render: (_: any, rec: any) => (
      <Space>
        <Button size="small" onClick={() => onSelect(rec)}>Details</Button>
        {rec.status === 'scheduled' && (
          <Button size="small" danger onClick={() => {/* TODO: implement cancel logic */}}>Cancel</Button>
        )}
        {rec.status === 'canceled' && (
          <Button size="small" type="primary" onClick={() => {/* TODO: implement restore logic */}}>Restore</Button>
        )}
      </Space>
    ) }
  ];

  return (
    <Table
      rowKey={(r: any) => r?._id || 'unknown'}
      dataSource={data}
      columns={cols}
      loading={loading}
      pagination={{ pageSize: 10 }}
      onChange={(pagination, filters, sorter) => {
        setSortOrder(sorter.order as any);
        setFilterStatus(filters.status ? String(filters.status) : undefined);
      }}
    />
  );
};

export default AppointmentListTable;
