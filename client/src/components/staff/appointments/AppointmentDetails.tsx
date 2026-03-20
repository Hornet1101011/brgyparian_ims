import React from 'react';
import { Descriptions } from 'antd';

type Props = {
  record: any;
};

const AppointmentDetails = ({ record }: Props) => {
  return (
    <>
      <Descriptions.Item label="Resident">{record?.createdBy?.fullName || record?.username}</Descriptions.Item>
      <Descriptions.Item label="Message">{record?.message}</Descriptions.Item>
      <Descriptions.Item label="Requested Dates">{(record?.appointmentDates || []).join(', ') || 'None'}</Descriptions.Item>
      <Descriptions.Item label="Status">{(record?.status || '').toString()}</Descriptions.Item>
      {record?.status === 'canceled' && (
        <Descriptions.Item label="Cancellation Reason">{record?.cancellationReason || '—'}</Descriptions.Item>
      )}
    </>
  );
};

export default AppointmentDetails;
