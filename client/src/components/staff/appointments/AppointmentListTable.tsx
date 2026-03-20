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
      render: (rec: any) => {
        const info = rec.createdBy || {};
        const ln = info.lastName || '';
        const fn = info.firstName || '';
        const mn = info.middleName || '';
        if (ln || fn || mn) {
          return `${ln}, ${fn}${mn ? ', ' + mn : ''}`;
        }
        // fallback to fullName or username
        return info.fullName || rec.username || '—';
      },
      sorter: (a: any, b: any) => {
        const infoA = a.createdBy || {};
        const infoB = b.createdBy || {};
        const nameA = `${infoA.lastName || ''}, ${infoA.firstName || ''}${infoA.middleName ? ', ' + infoA.middleName : ''}` || infoA.fullName || a.username || '';
        const nameB = `${infoB.lastName || ''}, ${infoB.firstName || ''}${infoB.middleName ? ', ' + infoB.middleName : ''}` || infoB.fullName || b.username || '';
        return nameA.localeCompare(nameB);
      },
      sortOrder: undefined
    },
    { title: 'Username', dataIndex: 'username', key: 'username', sorter: (a: any, b: any) => (a.username || '').localeCompare(b.username || ''), sortOrder: undefined },
    { title: 'Requested Dates', dataIndex: 'appointmentDates', key: 'dates', render: (d: any) => (Array.isArray(d) ? d.join(', ') : ''), sorter: (a: any, b: any) => {
      const ad = Array.isArray(a.appointmentDates) ? a.appointmentDates[0] : '';
      const bd = Array.isArray(b.appointmentDates) ? b.appointmentDates[0] : '';
      return ad.localeCompare(bd);
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
      rowKey={(r: any) => r._id}
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
