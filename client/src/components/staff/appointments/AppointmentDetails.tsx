import React from 'react';
import { Descriptions } from 'antd';


type Props = {
  record: any;
  residentInfo?: any;
  contactInfo?: any;
};


const AppointmentDetails = ({ record, residentInfo, contactInfo }: Props) => {
  // Helper to render resident/contact info
  const renderPerson = (info: any, fallback: string) => {
    if (!info) return fallback;
    // Only show username if fullName is not available
    return (
      <div>
        <div><b>{info.fullName ? info.fullName : (info.email || info.contactNumber ? '' : fallback)}</b></div>
        {info.email && <div>Email: {info.email}</div>}
        {info.contactNumber && <div>Contact: {info.contactNumber}</div>}
      </div>
    );
  };
  return (
    <>
      <Descriptions.Item label="Resident">{renderPerson(residentInfo, '—')}</Descriptions.Item>
      <Descriptions.Item label="Contact">{renderPerson(contactInfo, '—')}</Descriptions.Item>
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
