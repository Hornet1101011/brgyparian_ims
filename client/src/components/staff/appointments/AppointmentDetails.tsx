import React from 'react';
import { Descriptions } from 'antd';

type Props = {
  record: any;
};

const AppointmentDetails: React.FC<Props> = ({ record }) => {
  return (
    <>
      <Descriptions.Item label="Resident">{record?.createdBy?.fullName || record?.username}</Descriptions.Item>
      <Descriptions.Item label="Message">{record?.message}</Descriptions.Item>
      <Descriptions.Item label="Requested Dates">{(record?.appointmentDates || []).join(', ') || 'None'}</Descriptions.Item>
    </>
  );
};

export default AppointmentDetails;
