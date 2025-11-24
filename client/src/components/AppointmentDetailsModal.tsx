import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Descriptions, Divider, Checkbox, Button, Space, message } from 'antd';
import dayjs from 'dayjs';
import TimeRangeSelector from './TimeRangeSelector';
import { contactAPI } from '../services/api';

type Props = {
  visible: boolean;
  record: any;
  onClose: () => void;
};

const AppointmentDetailsModal: React.FC<Props> = ({ visible, record, onClose }) => {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [timeRanges, setTimeRanges] = useState<Record<string, { start?: string; end?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [existingScheduledByDate, setExistingScheduledByDate] = useState<Record<string, Array<{start:string,end:string}>>>({});

  useEffect(() => {
    if (!visible) return;
    // reset
    setSelectedDates([]);
    setTimeRanges({});
    // fetch existing scheduled appointments to avoid double-booking
    (async () => {
      try {
        const all = await contactAPI.getAllInquiries();
        const map: Record<string, Array<{start:string,end:string}>> = {};
        (all || []).forEach((inq: any) => {
          if (inq.scheduledDates && Array.isArray(inq.scheduledDates)) {
            inq.scheduledDates.forEach((sd: any) => {
              const date = sd.date;
              if (!date) return;
              map[date] = map[date] || [];
              map[date].push({ start: sd.startTime, end: sd.endTime });
            });
          }
        });
        setExistingScheduledByDate(map);
      } catch (e) {
        console.warn('Failed to fetch scheduled appointments', e);
      }
    })();
  }, [visible]);

  const requestedDates = useMemo(() => (record && record.appointmentDates) ? record.appointmentDates : [], [record]);

  const toggleDate = (date: string, checked: boolean) => {
    if (checked) setSelectedDates(prev => [...prev, date]);
    else {
      setSelectedDates(prev => prev.filter(d => d !== date));
      setTimeRanges(prev => { const next = {...prev}; delete next[date]; return next; });
    }
  };

  const updateTimeRange = (date: string, start?: string, end?: string) => {
    setTimeRanges(prev => ({ ...prev, [date]: { start, end } }));
  };

  const validateNoOverlap = () => {
    // ensure each selected date has a start and end and doesn't overlap existingScheduledByDate
    for (const d of selectedDates) {
      const range = timeRanges[d];
      if (!range || !range.start || !range.end) return { ok: false, msg: `Please supply time range for ${d}` };
      const s = range.start; const e = range.end;
      const existing = existingScheduledByDate[d] || [];
      for (const ex of existing) {
        // overlap if s < ex.end && e > ex.start
        if (s < ex.end && e > ex.start) {
          return { ok: false, msg: `Selected time ${s}-${e} overlaps existing appointment ${ex.start}-${ex.end} on ${d}` };
        }
      }
    }
    return { ok: true };
  };

  const confirm = async () => {
    const check = validateNoOverlap();
    if (!check.ok) { message.error(check.msg); return; }
    // Build scheduledDates payload
    const scheduledDates = selectedDates.map(d => ({ date: d, startTime: timeRanges[d].start, endTime: timeRanges[d].end }));
    setSaving(true);
    try {
      await contactAPI.resolveInquiry(record._id); // mark resolved? will use patch below
      // Instead of resolveInquiry, call update inquiry to set scheduledDates and status
      await contactAPI.getInquiryById(record._id); // ensure exists
      await (async () => {
        const resp = await (await fetch(`/api/inquiries/${record._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledDates, status: 'scheduled' }) })).json();
        return resp;
      })();
      message.success('Appointment scheduled');
      onClose();
    } catch (e) {
      console.error(e);
      message.error('Failed to schedule appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={visible} onCancel={onClose} footer={null} width={780} title="Appointment Details">
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Resident">{record.createdBy?.fullName || record.username}</Descriptions.Item>
        <Descriptions.Item label="Message">{record.message}</Descriptions.Item>
        <Descriptions.Item label="Requested Dates">
          {requestedDates.length === 0 && <div>No dates requested</div>}
          {requestedDates.map((d: string) => (
            <div key={d} style={{ marginBottom: 8 }}>
              <Checkbox onChange={(e) => toggleDate(d, e.target.checked)}>{dayjs(d).format('MMM DD, YYYY')}</Checkbox>
              {selectedDates.includes(d) && (
                <div style={{ marginTop: 8, marginLeft: 24 }}>
                  <TimeRangeSelector
                    date={d}
                    existingRanges={existingScheduledByDate[d] || []}
                    onChange={(s,e) => updateTimeRange(d, s, e)}
                  />
                </div>
              )}
            </div>
          ))}
        </Descriptions.Item>
      </Descriptions>
      <Divider />
      <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Close</Button>
        <Button type="primary" onClick={confirm} loading={saving} disabled={selectedDates.length === 0}>Confirm Appointment</Button>
      </Space>
    </Modal>
  );
};

export default AppointmentDetailsModal;
