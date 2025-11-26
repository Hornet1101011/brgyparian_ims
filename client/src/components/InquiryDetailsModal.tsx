import React, { useState } from 'react';
import { Modal, Descriptions, Tag, Spin, Button, Divider, List, Typography, message } from 'antd';
import { useAppointmentDetailsQuery } from '../hooks/useAppointments';
import appointmentsAPI from '../api/appointments';
import AppointmentDetailsModal from './AppointmentDetailsModal';

type Props = {
  visible: boolean;
  inquiryId: string | null;
  onClose: () => void;
  onChanged?: () => void; // called after cancellation/scheduling
};

const InquiryDetailsModal: React.FC<Props> = ({ visible, inquiryId, onClose, onChanged }) => {
  const query = useAppointmentDetailsQuery(inquiryId || undefined);
  const loading = query.isLoading;
  const data = query.data as any | null;
  const [openSchedule, setOpenSchedule] = useState(false);

  const handleCancel = async () => {
    if (!inquiryId) return;
    // open a simple prompt modal for reason
    const reason = window.prompt('Please enter reason for cancellation (min 10 chars):');
    if (!reason || reason.trim().length < 10) {
      message.error('Cancellation reason is required (minimum 10 characters).');
      return;
    }
    try {
      await appointmentsAPI.cancelAppointment(inquiryId, reason.trim());
      message.success('Appointment canceled');
      try { if (onChanged) onChanged(); } catch (_) {}
      query.refetch();
    } catch (err: any) {
      console.error('Failed to cancel', err);
      message.error((err && err.message) ? err.message : 'Failed to cancel appointment');
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      title={<Typography.Title level={4}>Inquiry Details</Typography.Title>}
    >
      {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> : (
        <>
          <Descriptions bordered column={1} size="middle">
            <Descriptions.Item label="Type">{data?.type || '—'}</Descriptions.Item>
            <Descriptions.Item label="Resident">{data?.createdBy?.fullName || data?.username}</Descriptions.Item>
            <Descriptions.Item label="Contact">{data?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="Submitted At">{data?.createdAt ? new Date(data.createdAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Message">{data?.message || '—'}</Descriptions.Item>
            <Descriptions.Item label="Requested Dates">{(data?.appointmentDates || []).length ? (data.appointmentDates.map((d: string) => <div key={d}>{d}</div>)) : 'None'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              {data?.status ? <Tag color={data.status === 'scheduled' ? 'green' : data.status === 'canceled' ? 'red' : 'orange'}>{String(data.status)}</Tag> : '—'}
            </Descriptions.Item>
            {data?.status === 'canceled' && (
              <Descriptions.Item label="Cancellation Reason">{data?.cancellationReason || '—'}</Descriptions.Item>
            )}
            <Descriptions.Item label="Attachments">
              {(data?.attachments && data.attachments.length) ? (
                <List
                  dataSource={data.attachments}
                  renderItem={(a: any) => (
                    <List.Item>
                      <a href={a.url || a.path} target="_blank" rel="noreferrer">{a.filename || a.name || 'attachment'}</a>
                    </List.Item>
                  )}
                />
              ) : 'None'}
            </Descriptions.Item>
          </Descriptions>

          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Appointment</div>
            <div>
              {data && data.status !== 'scheduled' && (
                <Button type="primary" onClick={() => setOpenSchedule(true)} style={{ marginRight: 8 }}>Schedule</Button>
              )}
              {data && data.status === 'scheduled' && (
                <>
                  <Button onClick={() => setOpenSchedule(true)} style={{ marginRight: 8 }}>Edit</Button>
                  <Button danger onClick={handleCancel}>Cancel</Button>
                </>
              )}
            </div>
          </div>

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Scheduled Dates">{(data?.scheduledDates && data.scheduledDates.length) ? data.scheduledDates.map((sd: any, idx: number) => <div key={idx}>{sd.date} {sd.startTime} - {sd.endTime}</div>) : 'None'}</Descriptions.Item>
          </Descriptions>

          <Divider />
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Conversation / Staff Notes</div>
          {(data?.responses && data.responses.length) ? (
            <List
              dataSource={data.responses}
              renderItem={(r: any) => (
                <List.Item>
                  <List.Item.Meta title={r.authorName || (r.createdBy ? String(r.createdBy) : 'Staff')} description={<div>{r.text}<div style={{ fontSize: 12, color: '#666' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</div></div>} />
                </List.Item>
              )}
            />
          ) : <div style={{ color: '#666' }}>No staff notes</div>}

          {openSchedule && data && (
            <AppointmentDetailsModal visible={true} record={data} onClose={() => { setOpenSchedule(false); query.refetch(); if (onChanged) onChanged(); }} />
          )}
        </>
      )}
    </Modal>
  );
};

export default InquiryDetailsModal;
