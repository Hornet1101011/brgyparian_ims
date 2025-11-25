import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Descriptions, Divider, Checkbox, Button, Space, message } from 'antd';
import dayjs from 'dayjs';
import { Select } from 'antd';
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
  const [resolving, setResolving] = useState(false);
  const [maxToSchedule, setMaxToSchedule] = useState<number>(0);
  const [existingScheduledByDate, setExistingScheduledByDate] = useState<Record<string, Array<{start:string,end:string,inquiryId?:string,residentUsername?:string,residentName?:string}>>>({});
  const [availabilityOk, setAvailabilityOk] = useState<boolean>(true);
  const [availabilityMsg, setAvailabilityMsg] = useState<string>('');
  const fetchExistingScheduled = async () => {
    try {
      const all = await contactAPI.getAllInquiries();
      const map: Record<string, Array<{start:string,end:string,inquiryId?:string,residentUsername?:string,residentName?:string}>> = {};
      (all || []).forEach((inq: any) => {
        // ignore entries for the same inquiry we're editing — they are not conflicts
        if (record && inq && String(inq._id) === String(record._id)) return;
        if (inq.scheduledDates && Array.isArray(inq.scheduledDates)) {
          inq.scheduledDates.forEach((sd: any) => {
            const date = sd.date;
            if (!date) return;
            map[date] = map[date] || [];
            map[date].push({ start: sd.startTime, end: sd.endTime, inquiryId: inq._id, residentUsername: inq.username, residentName: inq.createdBy?.fullName });
          });
        }
      });
      setExistingScheduledByDate(map);
    } catch (e) {
      console.warn('Failed to fetch scheduled appointments', e);
      message.warning('Could not refresh existing bookings.');
    }
  };

  // Preflight availability check: refresh bookings and validate current selections
  const requestedDates = useMemo(() => (record && record.appointmentDates) ? record.appointmentDates : [], [record]);

  const toggleDate = (date: string, checked: boolean) => {
    if (checked) {
      if (maxToSchedule > 0 && selectedDates.length >= maxToSchedule) {
        message.warning(`You may only select up to ${maxToSchedule} date(s) to schedule`);
        return;
      }
      setSelectedDates(prev => [...prev, date]);
    } else {
      setSelectedDates(prev => prev.filter(d => d !== date));
      setTimeRanges(prev => { const next: any = { ...prev }; delete next[date]; return next; });
    }
  };

  const handleMaxChange = (val: number) => {
    const newMax = Number(val) || 0;
    setMaxToSchedule(newMax);
    if (newMax > 0 && selectedDates.length > newMax) {
      const keep = selectedDates.slice(0, newMax);
      setSelectedDates(keep);
      setTimeRanges(prev => {
        const next: any = {};
        for (const d of keep) if (prev[d]) next[d] = prev[d];
        return next;
      });
    }
  };

  const updateTimeRange = (date: string, start?: string, end?: string) => {
    setTimeRanges(prev => ({ ...prev, [date]: { start, end } }));
  };

  const validateNoOverlap = () => {
    const normalizeToMinutes = (t?: string) => {
      if (!t) return NaN;
      const parts = String(t).split(':');
      if (parts.length < 2) return NaN;
      const hh = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
      return hh * 60 + mm;
    };

    const OFFICE_START = 8 * 60; // 480
    const OFFICE_END = 17 * 60; // 1020
    const LUNCH_START = 12 * 60; // 720
    const LUNCH_END = 13 * 60; // 780

    for (const d of selectedDates) {
      const range = timeRanges[d];
      if (!range || !range.start || !range.end) return { ok: false, msg: `Please supply time range for ${d}` };
      const sMin = normalizeToMinutes(range.start);
      const eMin = normalizeToMinutes(range.end);
      if (Number.isNaN(sMin) || Number.isNaN(eMin) || sMin >= eMin) return { ok: false, msg: `Invalid time range for ${d}` };
      if (sMin < OFFICE_START || eMin > OFFICE_END) return { ok: false, msg: `Time range for ${d} must be within office hours 08:00-17:00` };
      if (sMin < LUNCH_END && eMin > LUNCH_START) return { ok: false, msg: `Time range for ${d} must not overlap lunch break 12:00-13:00` };

      const existing = existingScheduledByDate[d] || [];
      for (const ex of existing) {
        const exS = normalizeToMinutes((ex as any).start);
        const exE = normalizeToMinutes((ex as any).end);
        if (!Number.isNaN(exS) && !Number.isNaN(exE) && sMin < exE && eMin > exS) {
          return { ok: false, msg: `Selected time ${range.start}-${range.end} overlaps existing appointment ${ (ex as any).start }-${ (ex as any).end } on ${d}` };
        }
      }
    }
    return { ok: true };
  };
  const runPreflightCheck = async () => {
    await fetchExistingScheduled();
    const v = validateNoOverlap();
    if (!v.ok) {
      setAvailabilityOk(false);
      setAvailabilityMsg(v.msg || 'Selected time conflicts with existing bookings');
    } else {
      setAvailabilityOk(true);
      setAvailabilityMsg('');
    }
  };

  // Run preflight when selectedDates or timeRanges change
  useEffect(() => {
    if (selectedDates.length === 0) { setAvailabilityOk(true); setAvailabilityMsg(''); return; }
    // fire and forget
    runPreflightCheck().catch(err => console.warn('Preflight check failed', err));
  }, [selectedDates, timeRanges]);

  useEffect(() => {
    if (!visible) return;
    // reset
    setSelectedDates([]);
    setTimeRanges({});
    // default the maxToSchedule to the number of requested dates (cap at 3)
    try {
      const count = (record && record.appointmentDates && Array.isArray(record.appointmentDates)) ? record.appointmentDates.length : 0;
      setMaxToSchedule(count > 0 ? Math.min(3, count) : 0);
    } catch (e) {
      // ignore
    }
    // fetch existing scheduled appointments to avoid double-booking
    fetchExistingScheduled();
  }, [visible]);

  const confirm = async () => {
    const check = validateNoOverlap();
    if (!check.ok) { message.error(check.msg); return; }
    const scheduledDates = selectedDates.map(d => ({ date: d, startTime: timeRanges[d].start!, endTime: timeRanges[d].end! }));
    setSaving(true);
    try {
      // First try availability endpoint (may return null if 404)
      let availability: any = null;
      try {
        availability = await contactAPI.checkAvailability(record._id, scheduledDates);
      } catch (availErr: any) {
        // If availability endpoint exists but errors (non-404), surface a warning and fall back to direct scheduling
        if (availErr && availErr.response && availErr.response.status !== 404) {
          console.warn('Availability check failed, will fallback to scheduling:', availErr);
        }
        availability = null;
      }

      // If availability returned explicit conflicts, show them and abort scheduling
      if (availability) {
        const conflicts = Array.isArray(availability.conflicts) ? availability.conflicts : (Array.isArray(availability.conflictItems) ? availability.conflictItems : null);
        const availableFlag = typeof availability.available === 'boolean' ? availability.available : (conflicts ? conflicts.length === 0 : true);
        if (!availableFlag) {
          // If server provided conflicts show them, else try to refresh and compute local conflicts
          let conflictItems = conflicts;
          if (!conflictItems) {
            try { await fetchExistingScheduled(); } catch (e) { /* ignore */ }
            const localConflicts: any[] = [];
            try {
              const normalizeToMinutes = (t?: string) => {
                if (!t) return NaN;
                const parts = String(t).split(':');
                if (parts.length < 2) return NaN;
                const hh = parseInt(parts[0], 10);
                const mm = parseInt(parts[1], 10);
                if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
                return hh * 60 + mm;
              };
              for (const sd of scheduledDates) {
                const date = sd.date;
                const sMin = normalizeToMinutes(sd.startTime);
                const eMin = normalizeToMinutes(sd.endTime);
                const existing = (existingScheduledByDate && existingScheduledByDate[date]) || [];
                for (const ex of existing) {
                  const exS = normalizeToMinutes((ex as any).start);
                  const exE = normalizeToMinutes((ex as any).end);
                  if (!Number.isNaN(exS) && !Number.isNaN(exE) && sMin < exE && eMin > exS) {
                    localConflicts.push({ date, startTime: ex.start, endTime: ex.end, inquiryId: ex.inquiryId, residentUsername: ex.residentUsername, residentName: ex.residentName });
                  }
                }
              }
            } catch (computeErr) {
              console.warn('Failed to compute local conflicts', computeErr);
            }
            conflictItems = localConflicts.length > 0 ? localConflicts : null;
          }

          Modal.confirm({
            title: 'Scheduling conflict',
            content: (
              <div>
                <p>{(availability && availability.message) || 'One or more time slots are already taken.'}</p>
                {conflictItems && conflictItems.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ marginBottom: 6 }}><strong>Conflicting bookings:</strong></p>
                    <ul>
                      {conflictItems.map((c: any, idx: number) => (
                        <li key={idx}>{c.date} {c.startTime}-{c.endTime} — {c.residentUsername || c.residentName || c.inquiryId}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p>You can refresh current bookings to see the latest scheduled appointments, or choose a different time.</p>
              </div>
            ),
            okText: 'Refresh Bookings',
            cancelText: 'Close',
            onOk: async () => {
              await fetchExistingScheduled();
              message.info('Refreshed existing bookings');
            }
          });
          message.error((availability && availability.message) || 'Scheduling conflict: one or more time slots already taken');
          return;
        }
      }

      // Proceed to schedule (server is authoritative). If availability endpoint was not present, this is the primary attempt.
      try {
        await contactAPI.scheduleInquiry(record._id, scheduledDates);
        message.success('Appointment scheduled');
        onClose();
      } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const serverText = (data && (data.message || JSON.stringify(data))) || err?.message || String(err);
        console.error('Scheduling failed:', status, serverText);
        if (status === 409) {
          try { await fetchExistingScheduled(); } catch (refreshErr) { console.warn('Failed to refresh bookings after 409', refreshErr); }

          let conflictItems = data && Array.isArray(data.conflicts) ? data.conflicts : null;
          if (!conflictItems) {
            const localConflicts: any[] = [];
            try {
              const normalizeToMinutes = (t?: string) => {
                if (!t) return NaN;
                const parts = String(t).split(':');
                if (parts.length < 2) return NaN;
                const hh = parseInt(parts[0], 10);
                const mm = parseInt(parts[1], 10);
                if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
                return hh * 60 + mm;
              };
              for (const sd of scheduledDates) {
                const date = sd.date;
                const sMin = normalizeToMinutes(sd.startTime);
                const eMin = normalizeToMinutes(sd.endTime);
                const existing = (existingScheduledByDate && existingScheduledByDate[date]) || [];
                for (const ex of existing) {
                  const exS = normalizeToMinutes((ex as any).start);
                  const exE = normalizeToMinutes((ex as any).end);
                  if (!Number.isNaN(exS) && !Number.isNaN(exE) && sMin < exE && eMin > exS) {
                    localConflicts.push({ date, startTime: ex.start, endTime: ex.end, inquiryId: ex.inquiryId, residentUsername: ex.residentUsername, residentName: ex.residentName });
                  }
                }
              }
            } catch (computeErr) {
              console.warn('Failed to compute local conflicts', computeErr);
            }
            conflictItems = localConflicts.length > 0 ? localConflicts : null;
          }

          Modal.confirm({
            title: 'Scheduling conflict',
            content: (
              <div>
                <p>{serverText || 'One or more time slots are already taken.'}</p>
                {conflictItems && conflictItems.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ marginBottom: 6 }}><strong>Conflicting bookings:</strong></p>
                    <ul>
                      {conflictItems.map((c: any, idx: number) => (
                        <li key={idx}>{c.date} {c.startTime}-{c.endTime} — {c.residentUsername || c.residentName || c.inquiryId}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p>You can refresh current bookings to see the latest scheduled appointments, or choose a different time.</p>
              </div>
            ),
            okText: 'Refresh Bookings',
            cancelText: 'Close',
            onOk: async () => {
              await fetchExistingScheduled();
              message.info('Refreshed existing bookings');
            }
          });
          message.error(serverText || 'Scheduling conflict: one or more time slots already taken');
          return;
        }
        if (status === 401 || status === 403) {
          Modal.confirm({
            title: 'Authentication required',
            content: (
              <div>
                <p>{serverText || 'You are not authenticated to perform this action on the remote server.'}</p>
                <p>Please sign in to continue.</p>
              </div>
            ),
            okText: 'Go to Login',
            cancelText: 'Cancel',
            onOk: () => { try { window.location.href = '/login'; } catch (e) {} }
          });
          message.error(serverText || `Authentication required (${status})`);
          return;
        }
        message.error(serverText || `Server error ${status || 'unknown'}`);
        return;
      }

    } catch (e) {
      console.error(e);
      message.error('Failed to schedule appointment');
    } finally {
      setSaving(false);
    }

  };

  const handleResolve = async () => {
    if (!record || !record._id) return;
    setResolving(true);
    try {
      const resp = await contactAPI.resolveInquiry(record._id);
      message.success('Inquiry resolved');
      // Optionally close modal or refresh parent; we'll close the modal to reflect change
      onClose();
    } catch (err) {
      console.error('Failed to resolve inquiry', err);
      message.error('Failed to resolve inquiry');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Modal open={visible} onCancel={onClose} footer={null} width={780} title="Appointment Details">
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Resident">{record.createdBy?.fullName || record.username}</Descriptions.Item>
        <Descriptions.Item label="Message">{record.message}</Descriptions.Item>
        <Descriptions.Item label="Number to Schedule">
          <Select
            value={maxToSchedule || undefined}
            onChange={(v) => handleMaxChange(Number(v))}
            style={{ width: 140 }}
          >
            {(requestedDates || []).map((_: any, idx: number) => (
              <Select.Option key={idx + 1} value={idx + 1}>{idx + 1}</Select.Option>
            ))}
          </Select>
        </Descriptions.Item>
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
      {!availabilityOk && (
        <div style={{ marginBottom: 8, color: '#d4380d' }}>{availabilityMsg}</div>
      )}
      <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={handleResolve} loading={resolving} disabled={resolving}>Resolve</Button>
        <Button onClick={runPreflightCheck} disabled={selectedDates.length === 0}>Refresh Availability</Button>
        <Button type="primary" onClick={confirm} loading={saving} disabled={selectedDates.length === 0 || !availabilityOk}>Confirm Appointment</Button>
      </Space>
    </Modal>
  );
};

export default AppointmentDetailsModal;
