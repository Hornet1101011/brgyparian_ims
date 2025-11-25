import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Descriptions, Divider, Checkbox, Button, Space, message } from 'antd';
import dayjs from 'dayjs';
import { Select } from 'antd';
import TimeRangeSelector from './TimeRangeSelector';
import { contactAPI, axiosInstance } from '../services/api';

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
      setTimeRanges(prev => { const next = { ...prev }; delete next[date]; return next; });
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
      // Instead of auto-resolving, only update inquiry with scheduledDates/status
      await contactAPI.getInquiryById(record._id); // ensure exists
      // Use POST-only for inquiry updates to work around hosts that block PATCH.
      // In local development, call backend directly to avoid CRA proxy ECONNREFUSED issues.
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      // Try local backend first (short timeout) then fallback to Render deployment if unreachable.
      const localUrl = `http://localhost:5000/api/inquiries/${record._id}`;
      const remoteUrl = `https://alphaversion.onrender.com/api/inquiries/${record._id}`;
      const body = JSON.stringify({ scheduledDates, status: 'scheduled' });

      const doFetchWithTimeout = async (url: string, timeoutMs = 3000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal as any });
          clearTimeout(id);
          return r;
        } catch (err) {
          clearTimeout(id);
          throw err;
        }
      };

      let resp: Response | null = null;
      if (isLocal) {
        try {
          // Try local absolute URL quickly (may be offline)
          await axiosInstance.post(localUrl, JSON.parse(body), { timeout: 2500 });
          // Construct a synthetic successful response shape to keep downstream logic same
          resp = { ok: true } as any;
        } catch (err) {
          console.warn('Local backend unreachable or timed out, retrying remote with auth:', (err as any)?.message || err);
          try {
            const r = await axiosInstance.post(remoteUrl, JSON.parse(body), { timeout: 8000 });
            resp = { ok: true, data: r.data } as any;
          } catch (err2: any) {
            // If remote responded with 401/403, rethrow so existing error handling runs
            const status = err2?.response?.status;
            const msg = err2?.response?.data?.message || err2?.message || String(err2);
            const fakeResp: any = { ok: false, status: status || 500, text: async () => msg };
            resp = fakeResp;
          }
        }
      } else {
        try {
          const r = await axiosInstance.post(remoteUrl, JSON.parse(body), { timeout: 8000 });
          resp = { ok: true, data: r.data } as any;
        } catch (err2: any) {
          const status = err2?.response?.status;
          const msg = err2?.response?.data?.message || err2?.message || String(err2);
          const fakeResp: any = { ok: false, status: status || 500, text: async () => msg };
          resp = fakeResp;
        }
      }
      if (!resp || !(resp as any).ok) {
        // Read the body as text first (avoids body stream already-read errors),
        // then attempt to parse JSON out of it.
        let serverText: string | null = null;
        let parsedJson: any = null;
        try {
          // resp may be an object returned from axios stub or a Fetch-like Response.
          const anyResp: any = resp;
          let txt = '';
          if (anyResp && typeof anyResp.text === 'function') {
            txt = await anyResp.text();
          } else if (anyResp && anyResp.data) {
            try { txt = JSON.stringify(anyResp.data); } catch (_) { txt = String(anyResp.data); }
          } else {
            txt = String(anyResp || '');
          }
          try {
            const j = JSON.parse(txt);
            parsedJson = j;
            serverText = j && j.message ? j.message : JSON.stringify(j);
          } catch (parseErr) {
            serverText = txt;
          }
        } catch (readErr) {
          serverText = String(readErr);
        }
        const statusCode = (resp && (resp as any).status) ? (resp as any).status : 'unknown';
        console.error('Scheduling failed:', statusCode, serverText);
        // If this is a 409 conflict specifically, show a helpful dialog with a refresh option
        if (statusCode === 409) {
          // Build conflict content: if server returned conflicts array, enumerate them
          const conflictItems = (parsedJson && Array.isArray(parsedJson.conflicts)) ? parsedJson.conflicts : null;
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
          // Surface the error to caller flow as well (so confirm() shows failure)
          message.error(serverText || 'Scheduling conflict: one or more time slots already taken');
          throw new Error(serverText || `Request failed with status ${statusCode}`);
        }

        message.error(serverText || `Server error ${statusCode}`);
        throw new Error(serverText || `Request failed with status ${statusCode}`);
      }
      // Do not auto-resolve here. Use the manual Resolve button instead.
      message.success('Appointment scheduled');
      onClose();
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
        <Button type="primary" onClick={confirm} loading={saving} disabled={selectedDates.length === 0 || !availabilityOk}>Confirm Appointment</Button>
      </Space>
    </Modal>
  );
};

export default AppointmentDetailsModal;
