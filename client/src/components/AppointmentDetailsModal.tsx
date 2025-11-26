import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Modal, Descriptions, Divider, Button, Space, message, Typography } from 'antd';
import { Select } from 'antd';
import DateSelectionSection from './staff/appointments/DateSelectionSection';
import AppointmentDetails from './staff/appointments/AppointmentDetails';
import './staff/appointments/scheduling.css';
import appointmentsAPI from '../api/appointments';
import { useAppointmentsQuery, useSubmitScheduleMutation } from '../hooks/useAppointments';
import type { AppointmentInquiry, TimeRange } from '../types/appointments';

type Props = {
  visible: boolean;
  record: AppointmentInquiry;
  onClose: () => void;
  prefill?: { date?: string; startTime?: string; endTime?: string } | null;
};

type ScheduledItem = { start: string; end: string; inquiryId?: string; residentUsername?: string; residentName?: string };

type SchedulingState = {
  selectedDates: string[];
  timeRanges: Record<string, { start?: string; end?: string }>;
  saving: boolean;
  maxToSchedule: number;
  existingScheduledByDate: Record<string, ScheduledItem[]>;
  availabilityOk: boolean;
  availabilityMsg: string;
};

type SchedulingAction =
  | { type: 'SET_SELECTED_DATES'; payload: string[] }
  | { type: 'ADD_SELECTED_DATE'; payload: string }
  | { type: 'REMOVE_SELECTED_DATE'; payload: string }
  | { type: 'SET_TIME_RANGE'; payload: { date: string; start?: string; end?: string } }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_MAX_TO_SCHEDULE'; payload: number }
  | { type: 'SET_EXISTING_SCHEDULED_BY_DATE'; payload: Record<string, ScheduledItem[]> }
  | { type: 'SET_AVAILABILITY'; payload: { ok: boolean; msg?: string } }
  | { type: 'RESET' };

const initialState: SchedulingState = {
  selectedDates: [],
  timeRanges: {},
  saving: false,
  maxToSchedule: 0,
  existingScheduledByDate: {},
  availabilityOk: true,
  availabilityMsg: ''
};

function reducer(state: SchedulingState, action: SchedulingAction): SchedulingState {
  switch (action.type) {
    case 'SET_SELECTED_DATES':
      return { ...state, selectedDates: action.payload };
    case 'ADD_SELECTED_DATE':
      if (state.selectedDates.includes(action.payload)) return state;
      return { ...state, selectedDates: [...state.selectedDates, action.payload] };
    case 'REMOVE_SELECTED_DATE': {
      const next = state.selectedDates.filter(d => d !== action.payload);
      const nextRanges: Record<string, { start?: string; end?: string }> = { ...state.timeRanges };
      delete nextRanges[action.payload];
      return { ...state, selectedDates: next, timeRanges: nextRanges };
    }
    case 'SET_TIME_RANGE':
      return { ...state, timeRanges: { ...state.timeRanges, [action.payload.date]: { start: action.payload.start, end: action.payload.end } } };
    case 'SET_SAVING':
      return { ...state, saving: action.payload };
    
    case 'SET_MAX_TO_SCHEDULE':
      return { ...state, maxToSchedule: action.payload };
    case 'SET_EXISTING_SCHEDULED_BY_DATE':
      return { ...state, existingScheduledByDate: action.payload };
    case 'SET_AVAILABILITY':
      return { ...state, availabilityOk: action.payload.ok, availabilityMsg: action.payload.msg || '' };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

const AppointmentDetailsModal: React.FC<Props> = ({ visible, record, onClose, prefill }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const appointmentsQuery = useAppointmentsQuery();
  const submitSchedule = useSubmitScheduleMutation();
  

  // derive existing scheduled map from appointments query data
  useEffect(() => {
    const all = Array.isArray(appointmentsQuery.data) ? appointmentsQuery.data : [];
    const map: Record<string, Array<{start:string,end:string,inquiryId?:string,residentUsername?:string,residentName?:string}>> = {};
    (all || []).forEach((inq: any) => {
      if (record && inq && String(inq._id) === String(record._id)) return;
      if (inq.scheduledDates && Array.isArray(inq.scheduledDates)) {
        inq.scheduledDates.forEach((sd: any) => {
          const date = sd.date;
          if (!date) return;
          map[date] = map[date] || [];
          map[date].push({ start: sd.startTime, end: sd.endTime, inquiryId: String(inq._id), residentUsername: inq.username, residentName: inq.createdBy?.fullName });
        });
      }
    });
    dispatch({ type: 'SET_EXISTING_SCHEDULED_BY_DATE', payload: map });
  }, [appointmentsQuery.data, record && record._id]);

  // Preflight availability check: refresh bookings and validate current selections
  const requestedDates = useMemo(() => (record && record.appointmentDates) ? record.appointmentDates : [], [record]);

  const toggleDate = (date: string, checked: boolean) => {
    if (checked) {
      if (state.maxToSchedule > 0 && state.selectedDates.length >= state.maxToSchedule) {
        message.warning(`You may only select up to ${state.maxToSchedule} date(s) to schedule`);
        return;
      }
      dispatch({ type: 'ADD_SELECTED_DATE', payload: date });
    } else {
      dispatch({ type: 'REMOVE_SELECTED_DATE', payload: date });
    }
  };

  const handleMaxChange = (val: number) => {
    const newMax = Number(val) || 0;
    dispatch({ type: 'SET_MAX_TO_SCHEDULE', payload: newMax });
    if (newMax > 0 && state.selectedDates.length > newMax) {
      const keep = state.selectedDates.slice(0, newMax);
      const prunedRanges: Record<string, { start?: string; end?: string }> = {};
      for (const d of keep) if (state.timeRanges[d]) prunedRanges[d] = state.timeRanges[d];
      dispatch({ type: 'SET_SELECTED_DATES', payload: keep });
      // set each kept range explicitly
      for (const d of Object.keys(prunedRanges)) {
        dispatch({ type: 'SET_TIME_RANGE', payload: { date: d, start: prunedRanges[d].start, end: prunedRanges[d].end } });
      }
    }
  };

  const updateTimeRange = (date: string, start?: string, end?: string) => {
    dispatch({ type: 'SET_TIME_RANGE', payload: { date, start, end } });
  };

  const validateNoOverlap = () => {
    // replace inline minute math with centralized validation
    try {
      // lazy require to avoid circular import issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const svc = require('../services/appointmentSchedulingService');
      return svc.validateSelections(state.selectedDates, state.timeRanges, state.existingScheduledByDate);
    } catch (e) {
      console.warn('Failed to run centralized validation', e);
      // fallback to permissive result so UX doesn't block scheduling unnecessarily
      return { ok: true };
    }
  };
  const runPreflightCheck = async () => {
    const v = validateNoOverlap();
    if (!v.ok) {
      dispatch({ type: 'SET_AVAILABILITY', payload: { ok: false, msg: v.msg || 'Selected time conflicts with existing bookings' } });
    } else {
      dispatch({ type: 'SET_AVAILABILITY', payload: { ok: true } });
    }
  };

  // Run preflight when selectedDates or timeRanges change
  useEffect(() => {
    if (state.selectedDates.length === 0) { dispatch({ type: 'SET_AVAILABILITY', payload: { ok: true } }); return; }
    // fire and forget
    runPreflightCheck().catch(err => console.warn('Preflight check failed', err));
  }, [state.selectedDates, JSON.stringify(state.timeRanges)]);

  useEffect(() => {
    if (!visible) return;
    // reset
    dispatch({ type: 'RESET' });
    // default the maxToSchedule to the number of requested dates (cap at 3)
    try {
      const count = (record && record.appointmentDates && Array.isArray(record.appointmentDates)) ? record.appointmentDates.length : 0;
      dispatch({ type: 'SET_MAX_TO_SCHEDULE', payload: count > 0 ? Math.min(3, count) : 0 });
    } catch (e) {
      // ignore
    }
    // Prefill local status and, if scheduled, prefill selected dates and ranges
    try {
      setLocalStatus(record?.status || undefined);
      if (record && record.status === 'scheduled' && Array.isArray(record.scheduledDates) && record.scheduledDates.length > 0) {
        const dates = record.scheduledDates.map((sd: any) => sd.date);
        dispatch({ type: 'SET_SELECTED_DATES', payload: dates });
        for (const sd of record.scheduledDates) {
          if (sd && sd.date) dispatch({ type: 'SET_TIME_RANGE', payload: { date: sd.date, start: sd.startTime, end: sd.endTime } });
        }
      }
      // Apply prefill if provided (create mode from calendar)
      if (prefill) {
        const pf = prefill as { date?: string; startTime?: string; endTime?: string };
        if (pf.date) {
          dispatch({ type: 'SET_SELECTED_DATES', payload: [pf.date] });
          dispatch({ type: 'SET_TIME_RANGE', payload: { date: pf.date, start: pf.startTime, end: pf.endTime } });
        }
      }
    } catch (e) {
      // ignore prefill errors
    }
    // ensure appointments query is fresh when modal opens
    try { appointmentsQuery.refetch(); } catch (e) { /* ignore */ }
  }, [visible]);

  const handleCancelConfirm = async () => {
    if (!record || !record._id) return;
    const reason = String(cancelReason || '').trim();
    if (!reason || reason.length < 10) {
      message.error('Please provide a cancellation reason (minimum 10 characters).');
      return;
    }
    setCancelLoading(true);
    try {
      const resp = await (await import('../api/appointments')).cancelAppointment(String(record._id), reason);
      try { await appointmentsQuery.refetch(); } catch (_) {}
      // update local status
      setLocalStatus('canceled');
      message.success('Appointment canceled');
      setCancelVisible(false);
      setCancelReason('');
      // close modal or keep open to show cancellation reason — we'll refresh details
    } catch (err: any) {
      console.error('Failed to cancel appointment', err);
      message.error((err && err.message) ? err.message : 'Failed to cancel appointment');
    } finally {
      setCancelLoading(false);
    }
  };

  const [localStatus, setLocalStatus] = useState<string | undefined>(undefined);

  const confirm = async () => {
    const check = validateNoOverlap();
    if (!check.ok) { message.error(check.msg); return; }
    const scheduledDates = state.selectedDates.map(d => ({ date: d, startTime: state.timeRanges[d].start!, endTime: state.timeRanges[d].end! }));
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      // First try availability endpoint (may return null if 404)
      let availability: any = null;
      try {
        availability = await appointmentsAPI.getAppointmentDetails(String(record._id));
        // If endpoint provides availability info under a different path, fall back to contact API pattern
        if (availability && typeof availability === 'object' && ('available' in availability || 'conflicts' in availability)) {
          // keep as availability object
        } else {
          // not an availability response; set to null so scheduling call proceeds
          availability = null;
        }
      } catch (availErr: any) {
        // If availability endpoint doesn't exist or errors, just fallback and schedule
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
            try { await appointmentsQuery.refetch(); } catch (e) { /* ignore */ }
            const localConflicts: any[] = [];
            try {
              // use centralized conflict finder
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const svc = require('../services/appointmentSchedulingService');
                const lc = svc.findConflicts(scheduledDates, state.existingScheduledByDate, record && record._id);
                if (Array.isArray(lc) && lc.length > 0) localConflicts.push(...lc as any[]);
              } catch (e) {
                console.warn('Failed to compute local conflicts via service', e);
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
              try { await appointmentsQuery.refetch(); } catch (_) {}
              message.info('Refreshed existing bookings');
            }
          });
          message.error((availability && availability.message) || 'Scheduling conflict: one or more time slots already taken');
          return;
        }
      }

      // Proceed to schedule (server is authoritative). If availability endpoint was not present, this is the primary attempt.
        try {
          await submitSchedule.mutateAsync({ id: String(record._id), scheduledDates });
          message.success('Appointment scheduled');
          // update UI state: mark as scheduled and change button label
          setLocalStatus('scheduled');
          // refresh appointment slots from server for accurate prefill
          try {
            const resp = await appointmentsAPI.getAppointmentWithSlots(String(record._id));
            if (resp && resp.slots && Array.isArray(resp.slots)) {
              const slots = resp.slots;
              const dates = slots.map((s: any) => s.date).filter(Boolean);
              dispatch({ type: 'SET_SELECTED_DATES', payload: dates });
              // reset timeRanges based on server slots
              for (const s of slots) {
                dispatch({ type: 'SET_TIME_RANGE', payload: { date: s.date, start: s.startTime, end: s.endTime } });
              }
            }
          } catch (fetchErr) {
            console.warn('Failed to refetch appointment slots after scheduling', fetchErr);
            // best-effort: continue
          }
          // refresh main appointments query so parent list updates
          try { await appointmentsQuery.refetch(); } catch (_) {}
          onClose();
        } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const serverText = (data && (data.message || JSON.stringify(data))) || err?.message || String(err);
        console.error('Scheduling failed:', status, serverText);
        if (status === 409) {
          try { await appointmentsQuery.refetch(); } catch (refreshErr) { console.warn('Failed to refresh bookings after 409', refreshErr); }

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
                const existing = (state.existingScheduledByDate && state.existingScheduledByDate[date]) || [];
                for (const ex of existing) {
                  const exS = normalizeToMinutes((ex as any).start);
                  const exE = normalizeToMinutes((ex as any).end);
                  if (!Number.isNaN(exS) && !Number.isNaN(exE) && sMin < exE && eMin > exS) {
                    localConflicts.push({ date, startTime: (ex as any).start, endTime: (ex as any).end, inquiryId: ex.inquiryId, residentUsername: ex.residentUsername, residentName: ex.residentName });
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
              try { await appointmentsQuery.refetch(); } catch (_) {}
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
      dispatch({ type: 'SET_SAVING', payload: false });
    }

  };

  // Note: resolve action removed for staff appointments per UX request

  return (
    <Modal open={visible} onCancel={onClose} footer={null} width={720} className="schedulingModal" title={<Typography.Title level={4}>Appointment Details</Typography.Title>}>
      <Descriptions column={1} bordered>
        <AppointmentDetails record={record} />
        <Descriptions.Item label="Number to Schedule">
          <Select
            value={state.maxToSchedule || undefined}
            onChange={(v) => handleMaxChange(Number(v))}
            className="selectSmall"
          >
            {(requestedDates || []).map((_: any, idx: number) => (
              <Select.Option key={idx + 1} value={idx + 1}>{idx + 1}</Select.Option>
            ))}
          </Select>
        </Descriptions.Item>
        <Descriptions.Item label="Requested Dates">
          <DateSelectionSection
            requestedDates={requestedDates}
            maxToSchedule={state.maxToSchedule}
            selectedDates={state.selectedDates}
            setSelectedDates={(d) => dispatch({ type: 'SET_SELECTED_DATES', payload: d })}
            timeRanges={state.timeRanges}
            updateTimeRange={updateTimeRange}
            existingScheduledByDate={state.existingScheduledByDate}
          />
        </Descriptions.Item>
      </Descriptions>
      <Divider />
      {!state.availabilityOk && (
        <div style={{ marginBottom: 8, color: '#d4380d' }}>{state.availabilityMsg}</div>
      )}
      <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Close</Button>
        {/* Cancel Appointment button - show only for scheduled or not canceled */}
        {((localStatus || record?.status) !== 'canceled') && (
          <Button danger style={{ marginRight: 8 }} onClick={() => setCancelVisible(true)}>Cancel Appointment</Button>
        )}
        <Button type="primary" onClick={confirm} loading={state.saving} disabled={state.selectedDates.length === 0 || !state.availabilityOk || (localStatus || record?.status) === 'canceled'}>{(localStatus || record?.status) === 'scheduled' ? 'Save Changes' : 'Confirm Appointment'}</Button>
      </Space>

      <Modal title="Cancel Appointment" open={cancelVisible} onCancel={() => { setCancelVisible(false); setCancelReason(''); }} footer={null}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Reason for Cancellation</label>
          <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ width: '100%', minHeight: 120, padding: 8 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setCancelVisible(false); setCancelReason(''); }}>Close</Button>
            <Button danger type="primary" loading={cancelLoading} onClick={handleCancelConfirm}>Confirm</Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};

export default AppointmentDetailsModal;
