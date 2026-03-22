import React from 'react';
import { Descriptions } from 'antd';


type Props = {
  record: any;
  residentInfo?: any;
  contactInfo?: any;
};


const AppointmentDetails = ({ record, residentInfo, contactInfo }: Props) => {
  // Helper to render resident/contact info
  const renderPerson = (info: any) => {
    if (!info) return '—';
    // Only show fullName, email, and contactNumber. Never show username.
    return (
      <div>
        {info.fullName && <div><b>{info.fullName}</b></div>}
        {info.email && <div>Email: {info.email}</div>}
        {info.contactNumber && <div>Contact: {info.contactNumber}</div>}
        {!info.fullName && !info.email && !info.contactNumber && <div>—</div>}
      </div>
    );
  };
  return (
    <>
      <Descriptions.Item label="Resident">{renderPerson(residentInfo)}</Descriptions.Item>
      <Descriptions.Item label="Contact">{renderPerson(contactInfo)}</Descriptions.Item>
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
