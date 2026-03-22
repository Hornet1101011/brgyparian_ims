import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Tag, Spin, Button, Divider, List, Typography, message, Input } from 'antd';
import { useAppointmentDetailsQuery } from '../hooks/useAppointments';
import appointmentsAPI from '../api/appointments';
import AppointmentDetailsModal from './AppointmentDetailsModal';
import { residentsListAPI } from '../services/api';

type Props = {
  visible: boolean;
  inquiryId: string | null;
  onClose: () => void;
  onChanged?: () => void; // called after cancellation/scheduling
};

function InquiryDetailsModal({ visible, inquiryId, onClose, onChanged }: Props) {
  const query = useAppointmentDetailsQuery(inquiryId || undefined);
  const loading = query.isLoading;
  const data = query.data as any | null;
  const [openSchedule, setOpenSchedule] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Resident/contact info state
  const [residentInfo, setResidentInfo] = useState(null);
  const [contactInfo, setContactInfo] = useState(null);
  useEffect(() => {
    let ignore = false;
    async function fetchResidents() {
      try {
        const residents = await residentsListAPI.getAllResidents();
        if (!residents || !Array.isArray(residents)) return;
        let residentBarangayId = data?.createdBy?.barangayID || data?.barangayID;
        let contactBarangayId = data?.contactBarangayID || null;
        if (!contactBarangayId) contactBarangayId = residentBarangayId;
        const foundResident = residents.find((r: any) => r.barangayID === residentBarangayId);
        const foundContact = residents.find((r: any) => r.barangayID === contactBarangayId);
        if (!ignore) {
          setResidentInfo(foundResident || null);
          setContactInfo(foundContact || null);
        }
      } catch (e) {
        if (!ignore) {
          setResidentInfo(null);
          setContactInfo(null);
        }
      }
    }
    if (visible && data) fetchResidents();
    return () => { ignore = true; };
  }, [visible, data]);

  // Helper to render resident name only
  const renderResident = (info: any) => {
    if (!info) return '—';
    return (
      <div>
        {info.fullName && <div><b>{info.fullName}</b></div>}
        {!info.fullName && <div>—</div>}
      </div>
    );
  };
  // Helper to render contact email and contact number
  const renderContact = (info: any) => {
    if (!info) return '—';
    return (
      <div>
        {info.email && <div>Email: {info.email}</div>}
        {info.contactNumber && <div>Contact: {info.contactNumber}</div>}
        {!info.email && !info.contactNumber && <div>—</div>}
      </div>
    );
  };

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
            <Descriptions.Item label="Resident">{renderResident(residentInfo)}</Descriptions.Item>
            <Descriptions.Item label="Contact">{renderContact(contactInfo)}</Descriptions.Item>
            <Descriptions.Item label="Submitted At">{data?.createdAt ? new Date(data.createdAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Message">{data?.message || '—'}</Descriptions.Item>
            {data?.type === 'QUICK_APPOINTMENT' && (
              <>
                <Descriptions.Item label="Quick Appointment Type">{data?.quick_appointment_type || '—'}</Descriptions.Item>
                <Descriptions.Item label="Recipients">{(data?.recipients && data.recipients.length) ? data.recipients.join(', ') : '—'}</Descriptions.Item>
                <Descriptions.Item label="Recipient Emails">{(data?.recipientEmails && data.recipientEmails.length) ? data.recipientEmails.join(', ') : '—'}</Descriptions.Item>
                <Descriptions.Item label="Location Type">{data?.locationType || '—'}</Descriptions.Item>
                <Descriptions.Item label="Address/Location">{data?.location || '—'}</Descriptions.Item>
                <Descriptions.Item label="Description">{data?.description || '—'}</Descriptions.Item>
                <Descriptions.Item label="Urgency">{data?.urgency || '—'}</Descriptions.Item>
              </>
            )}
            {data?.type !== 'QUICK_APPOINTMENT' && (
              <Descriptions.Item label="Requested Dates">{(data?.appointmentDates || []).length ? (data.appointmentDates.map((d: string) => <div key={d}>{d}</div>)) : 'None'}</Descriptions.Item>
            )}
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
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Conversation</div>
          {(data?.responses && data.responses.length) ? (
            <List
              dataSource={data.responses}
              renderItem={(r: any) => (
                <List.Item>
                  <List.Item.Meta title={r.authorName || (r.createdBy ? String(r.createdBy) : 'Staff')} description={<div>{r.text}<div style={{ fontSize: 12, color: '#666' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</div></div>} />
                </List.Item>
              )}
            />
          ) : <div style={{ color: '#666' }}>No conversation entries</div>}

          <Divider />
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Staff Notes</div>
          {(data?.staffNotes && data.staffNotes.length) ? (
            <List
              dataSource={[...data.staffNotes].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
              renderItem={(n: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={n.staffName || (n.createdBy ? String(n.createdBy) : 'Staff')}
                    description={<div>{n.text}<div style={{ fontSize: 12, color: '#666' }}>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div></div>}
                  />
                </List.Item>
              )}
            />
          ) : <div style={{ color: '#666' }}>No staff notes</div>}

          <div style={{ marginTop: 8 }}>
            <Input.TextArea rows={3} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add internal staff note (visible to staff only)" />
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Button type="primary" onClick={async () => {
                if (!inquiryId) return;
                const text = String(newNote || '').trim();
                if (!text || text.length === 0) { message.error('Note cannot be empty'); return; }
                setSavingNote(true);
                try {
                  const resp = await appointmentsAPI.postStaffNote(inquiryId, text);
                  message.success('Note saved');
                  setNewNote('');
                  try { query.refetch(); if (onChanged) onChanged(); } catch (_) {}
                } catch (err: any) {
                  console.error('Failed to save staff note', err);
                  message.error((err && err.message) ? err.message : 'Failed to save note');
                } finally {
                  setSavingNote(false);
                }
              }} loading={savingNote}>Save Note</Button>
            </div>
          </div>

          <Divider />
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Message To Resident</div>
          {(data?.messages && data.messages.length) ? (
            <List
              dataSource={[...data.messages].filter((m: any) => m.visibleToResident === true).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
              renderItem={(m: any) => (
                <List.Item>
                  <List.Item.Meta title={m.staffName || (m.createdBy ? String(m.createdBy) : 'Staff')} description={<div>{m.text}<div style={{ fontSize: 12, color: '#666' }}>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}</div></div>} />
                </List.Item>
              )}
            />
          ) : <div style={{ color: '#666' }}>No messages to resident</div>}

          <div style={{ marginTop: 8 }}>
            <Input.TextArea rows={3} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Compose message to resident" />
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Button type="primary" onClick={async () => {
                if (!inquiryId) return;
                const text = String(newMessage || '').trim();
                if (!text) { message.error('Message cannot be empty'); return; }
                setSendingMessage(true);
                try {
                  await appointmentsAPI.postMessage(inquiryId, text);
                  message.success('Message sent');
                  setNewMessage('');
                  try { query.refetch(); if (onChanged) onChanged(); } catch (_) {}
                } catch (err: any) {
                  console.error('Failed to send message', err);
                  message.error((err && err.message) ? err.message : 'Failed to send message');
                } finally {
                  setSendingMessage(false);
                }
              }} loading={sendingMessage}>Send Message</Button>
            </div>
          </div>

          {openSchedule && data && (
            <AppointmentDetailsModal visible={true} record={data} onClose={() => { setOpenSchedule(false); query.refetch(); if (onChanged) onChanged(); }} />
          )}
        </>
      )}
    </Modal>
  );
}

export default InquiryDetailsModal;
