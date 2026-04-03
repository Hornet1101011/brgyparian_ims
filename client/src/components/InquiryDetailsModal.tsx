import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { UserOutlined } from '@ant-design/icons';
import { Modal, Descriptions, Tag, Spin, Button, Divider, List, Typography, message, Input, Space, DatePicker } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useAppointmentDetailsQuery } from '../hooks/useAppointments';
import appointmentsAPI from '../api/appointments';
import AppointmentDetailsModal from './AppointmentDetailsModal';
import { residentsListAPI, contactAPI } from '../services/api';

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
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditLoading, setQuickEditLoading] = useState(false);
  const [quickEditTitle, setQuickEditTitle] = useState('');
  const [quickEditLocationType, setQuickEditLocationType] = useState('on-site');
  const [quickEditLocation, setQuickEditLocation] = useState('');
  const [quickEditDescription, setQuickEditDescription] = useState('');
  const [quickEditUrgency, setQuickEditUrgency] = useState('normal');

  const [selectedResidents, setSelectedResidents] = useState([] as any[]);
  const [residentOptions, setResidentOptions] = useState([] as any[]);
  const [residentSearch, setResidentSearch] = useState('');
  const [residentSelectModalVisible, setResidentSelectModalVisible] = useState(false);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [recipientPage, setRecipientPage] = useState(0);

  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStart, setRescheduleStart] = useState('08:00');
  const [rescheduleEnd, setRescheduleEnd] = useState('09:00');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [busySlots, setBusySlots] = useState([] as any[]);

  // Resident/contact info state
  const [residentInfo, setResidentInfo] = useState(null);
  const [contactInfo, setContactInfo] = useState(null);
  useEffect(() => {
    let ignore = false;
    async function fetchResidents() {
      try {
        const residents = await residentsListAPI.getAllResidents();
        if (!residents || !Array.isArray(residents)) return;
        setResidentOptions(residents);
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
    if (visible && data) {
      setRecipientPage(0);
      fetchResidents();
    }
    return () => { ignore = true; };
  }, [visible, data]);

  useEffect(() => {
    if (!data || residentOptions.length === 0) return;
    const recipients = Array.isArray(data.recipients) ? data.recipients : [];
    const matched = residentOptions.filter((r: any) => {
      const label = `${r.fullName || r.username || ''}`.toString().trim();
      return recipients.some((rec: string) => rec.toString().toLowerCase().includes((r.fullName||r.username||'').toString().toLowerCase()));
    });
    if (matched.length) setSelectedResidents(matched);
  }, [data, residentOptions]);

  useEffect(() => {
    if (!data) return;
    setQuickEditTitle(data.title || data.subject || '');
    setQuickEditLocationType(data.locationType || 'on-site');
    setQuickEditLocation(data.location || '');
    setQuickEditDescription(data.description || '');
    setQuickEditUrgency(data.urgency || 'normal');
    // selectedResidents are resolved by residentOptions effect
  }, [data]);

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

  // Render recipients and emails with pagination (max 10 per page)
  const renderRecipientsWithPagination = (recipients: any[], emails: any[]) => {
    if (!recipients || !emails || recipients.length === 0) {
      return <div>—</div>;
    }

    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(recipients.length / ITEMS_PER_PAGE);
    const startIdx = recipientPage * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, recipients.length);
    const pageRecipients = recipients.slice(startIdx, endIdx);
    const pageEmails = emails.slice(startIdx, endIdx);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Recipients</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {pageRecipients.map((recipient, idx) => (
                <li key={startIdx + idx} style={{ marginBottom: 4 }}>
                  {recipient}
                </li>
              ))}
            </ol>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Emails</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {pageEmails.map((email, idx) => (
                <li key={startIdx + idx} style={{ marginBottom: 4 }}>
                  {email}
                </li>
              ))}
            </ol>
          </div>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            <Button 
              size="small" 
              disabled={recipientPage === 0} 
              onClick={() => setRecipientPage(Math.max(0, recipientPage - 1))}
            >
              Previous
            </Button>
            <span style={{ alignSelf: 'center', fontSize: 12 }}>
              Page {recipientPage + 1} of {totalPages}
            </span>
            <Button 
              size="small" 
              disabled={recipientPage === totalPages - 1} 
              onClick={() => setRecipientPage(Math.min(totalPages - 1, recipientPage + 1))}
            >
              Next
            </Button>
          </div>
        )}
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

  const fetchBusySlots = async (date: string) => {
    if (!date) {
      setBusySlots([]);
      return;
    }
    try {
      const result = await appointmentsAPI.getSlotsByDate(date);
      setBusySlots((result && result.slots) || []);
    } catch (err) {
      console.warn('Failed to load busy slots for date', date, err);
      setBusySlots([]);
    }
  };

  const openRescheduleModal = () => {
    const firstScheduled = (data?.scheduledDates && data.scheduledDates.length > 0) ? data.scheduledDates[0] : null;
    const date = firstScheduled?.date || dayjs().add(0, 'day').format('YYYY-MM-DD');
    const start = firstScheduled?.startTime || '08:00';
    const end = firstScheduled?.endTime || '09:00';

    setRescheduleDate(date);
    setRescheduleStart(start);
    setRescheduleEnd(end);
    setRescheduleModalVisible(true);
    fetchBusySlots(date);
  };

  const closeRescheduleModal = () => {
    setRescheduleModalVisible(false);
    setBusySlots([]);
  };

  const handleRescheduleSave = async () => {
    if (!inquiryId) return;
    if (!rescheduleDate) {
      message.error('Please choose a date.');
      return;
    }
    if (!rescheduleStart || !rescheduleEnd || rescheduleEnd <= rescheduleStart) {
      message.error('Please choose valid start and end times.');
      return;
    }

    setRescheduleLoading(true);
    try {
      await contactAPI.scheduleInquiry(inquiryId, [{ date: rescheduleDate, startTime: rescheduleStart, endTime: rescheduleEnd }]);
      message.success('Appointment schedule updated successfully');
      closeRescheduleModal();
      query.refetch();
      if (onChanged) onChanged();
    } catch (err: any) {
      console.error('Failed to reschedule appointment', err);
      message.error((err && err.message) ? err.message : 'Failed to reschedule appointment');
    } finally {
      setRescheduleLoading(false);
    }
  };

  const openScheduleEditor = () => {
    openRescheduleModal();
  };

  const closeScheduleEditor = () => {
    closeRescheduleModal();
  };

  const handleQuickEditSave = async () => {
    if (!inquiryId) return;
    if (!quickEditTitle.trim()) {
      message.error('Title is required for quick appointment');
      return;
    }
    if (selectedResidents.length === 0) {
      message.error('Please select at least one resident participant');
      return;
    }
    setQuickEditLoading(true);
    try {
      const payload: any = {
        title: quickEditTitle,
        subject: quickEditTitle,
        locationType: quickEditLocationType,
        location: quickEditLocation,
        description: quickEditDescription,
        urgency: quickEditUrgency,
        recipients: selectedResidents.map((r: any) => {
          const label = (r.fullName || r.username || '').toString();
          return r.barangayID ? `${label}(${r.barangayID})` : label;
        }),
        recipientEmails: selectedResidents.map((r: any) => r.email).filter(Boolean),
      };
      await contactAPI.updateInquiry(inquiryId, payload);
      message.success('Quick appointment information updated');
      setQuickEditVisible(false);
      query.refetch();
      if (onChanged) onChanged();
    } catch (err: any) {
      console.error('Failed to update quick appointment', err);
      message.error((err && err.message) ? err.message : 'Failed to update quick appointment');
    } finally {
      setQuickEditLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>{data?.title || data?.subject || 'Inquiry Details'}</Typography.Title>
          <div>
            <Button icon={<MailOutlined />} onClick={async () => {
              if (!inquiryId) return;
              if (!window.confirm('Send invites/notifications for this quick appointment now?')) return;
              try {
                await contactAPI.sendInvite(inquiryId);
                message.success('Invites sent (if configured)');
                try { query.refetch(); if (onChanged) onChanged(); } catch (_) {}
              } catch (err: any) {
                console.error('Failed to send invite', err);
                message.error((err && err.message) ? err.message : 'Failed to send invite');
              }
            }} style={{ marginRight: 8 }}>
              Send Invite
            </Button>
          </div>
        </div>
      )}
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
                <Descriptions.Item label="Recipients & Emails">{renderRecipientsWithPagination(data?.recipients || [], data?.recipientEmails || [])}</Descriptions.Item>
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
                <Button type="primary" onClick={openRescheduleModal} style={{ marginRight: 8 }}>Schedule</Button>
              )}
              {data && data.status === 'scheduled' && (
                <>
                  {data.type === 'QUICK_APPOINTMENT' ? (
                    <Button type="default" onClick={() => setQuickEditVisible(true)} style={{ marginRight: 8 }}>Edit Info</Button>
                  ) : null}
                  <Button type="default" onClick={openRescheduleModal} style={{ marginRight: 8 }}>Reschedule</Button>
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

          {quickEditVisible && data && (
            <Modal
              title={`Edit Quick Appointment (${data.quick_appointment_type || 'single'})`}
              open={quickEditVisible}
              onCancel={() => setQuickEditVisible(false)}
              onOk={handleQuickEditSave}
              confirmLoading={quickEditLoading}
              width={640}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <label style={{ fontWeight: 600 }}>Title</label>
                  <Input value={quickEditTitle} onChange={(e) => setQuickEditTitle(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontWeight: 600 }}>Participants</label>
                  <Button
                    icon={<UserOutlined />}
                    type="default"
                    style={{ width: '100%', textAlign: 'left', padding: 10, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14, background: '#fff' }}
                    onClick={() => setResidentSelectModalVisible(true)}
                  >
                    {selectedResidents.length ? `${selectedResidents.length} resident(s) selected` : 'Select residents'}
                  </Button>
                  {selectedResidents.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {selectedResidents.map((r: any) => (
                        <Tag key={r.username || r._id} style={{ marginBottom: 4 }}>
                          {r.fullName || r.username}
                          {r.email && ` (${r.email})`}
                        </Tag>
                      ))}
                    </div>
                  )}
                  <Modal
                    open={residentSelectModalVisible}
                    onCancel={() => setResidentSelectModalVisible(false)}
                    title="Select Participants"
                    footer={null}
                    width={420}
                  >
                    <Input
                      placeholder="Search resident by name, username, or email..."
                      value={residentSearch}
                      onChange={(e) => setResidentSearch(e.target.value)}
                      style={{ marginBottom: 12 }}
                      allowClear
                    />
                    <List
                      dataSource={residentOptions.filter(r =>
                        (r.fullName || r.username || r.email || '').toLowerCase().includes(residentSearch.toLowerCase())
                      )}
                      renderItem={(r: any) => {
                        const selected = selectedResidents.some((s: any) => String(s._id) === String(r._id));
                        return (
                          <List.Item
                            key={String(r._id)}
                            style={{ cursor: 'pointer', padding: '8px 0', opacity: selected ? 0.7 : 1 }}
                            onClick={() => {
                              setSelectedResidents(prev => selected ? prev.filter((s: any) => String(s._id) !== String(r._id)) : [...prev, r]);
                            }}
                          >
                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: 500 }}>{r.fullName || r.username}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>{r.email || r.username}</div>
                              </div>
                              {selected && <span style={{ color: '#1890ff', fontWeight: 700 }}>✓</span>}
                            </div>
                          </List.Item>
                        );
                      }}
                      locale={{ emptyText: 'No residents found' }}
                      style={{ maxHeight: 300, overflowY: 'auto' }}
                    />
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <Button onClick={() => setResidentSelectModalVisible(false)}>Done</Button>
                    </div>
                  </Modal>
                </div>
                <div>
                  <label style={{ fontWeight: 600 }}>Location Type</label>
                  <select value={quickEditLocationType} onChange={(e) => setQuickEditLocationType(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="on-site">On-site</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 600 }}>Location / Address</label>
                  <Input value={quickEditLocation} onChange={(e) => setQuickEditLocation(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontWeight: 600 }}>Description</label>
                  <Input.TextArea value={quickEditDescription} onChange={(e) => setQuickEditDescription(e.target.value)} rows={3} />
                </div>
                <div>
                  <label style={{ fontWeight: 600 }}>Urgency</label>
                  <select value={quickEditUrgency} onChange={(e) => setQuickEditUrgency(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </Space>
            </Modal>
          )}

          <Modal
            title={data?.status === 'scheduled' ? 'Reschedule Appointment' : 'Schedule Appointment'}
            open={rescheduleModalVisible}
            onCancel={closeRescheduleModal}
            onOk={handleRescheduleSave}
            confirmLoading={rescheduleLoading}
            width={640}
          >
            <div style={{ maxWidth: 560 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600 }}>Select Date</label>
                <DatePicker
                  value={rescheduleDate ? dayjs(rescheduleDate, 'YYYY-MM-DD') : null}
                  onChange={(value) => {
                    const newDate = value ? value.format('YYYY-MM-DD') : '';
                    setRescheduleDate(newDate);
                    fetchBusySlots(newDate);
                  }}
                  format="YYYY-MM-DD"
                  disabledDate={(current) => {
                    if (!current) return false;
                    const today = dayjs().startOf('day');
                    const day = current.day();
                    return current.isBefore(today, 'day') || day === 0 || day === 6;
                  }}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600 }}>Start Time</label>
                  <Input
                    type="time"
                    value={rescheduleStart}
                    onChange={(e) => setRescheduleStart(e.target.value)}
                    min="08:00"
                    max="17:00"
                    style={{ width: '100%', marginTop: 8 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600 }}>End Time</label>
                  <Input
                    type="time"
                    value={rescheduleEnd}
                    onChange={(e) => setRescheduleEnd(e.target.value)}
                    min="08:00"
                    max="17:00"
                    style={{ width: '100%', marginTop: 8 }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>Busy Slots</div>
                {busySlots.length === 0 ? (
                  <div style={{ color: '#666', marginTop: 6 }}>No busy slots.</div>
                ) : (
                  <ul style={{ marginTop: 6, paddingLeft: 20 }}>
                    {busySlots.map((slot, idx) => (
                      <li key={idx}>{slot.startTime} - {slot.endTime} {slot.residentName ? `(${slot.residentName})` : ''}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                A staff mini calendar is provided via the date selector, which prevents weekends/past dates. Use the time pickers to set the exact range.
              </div>
            </div>
          </Modal>

          {openSchedule && data && (
            <AppointmentDetailsModal visible={true} record={data} onClose={() => { closeScheduleEditor(); query.refetch(); if (onChanged) onChanged(); }} />
          )}
        </>
      )}
    </Modal>
  );
}

export default InquiryDetailsModal;
