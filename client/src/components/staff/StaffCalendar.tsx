import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Button, Tooltip, Modal, List, Grid, Popover, Badge, Empty, Space, Spin, Tag, DatePicker, Descriptions, Divider, Avatar, Timeline, Statistic, Progress, Select } from 'antd';
import { LeftOutlined, RightOutlined, ClockCircleOutlined, UserOutlined, CalendarOutlined, MailOutlined, PhoneOutlined, TeamOutlined } from '@ant-design/icons';
import { getSlotsForRange, getAppointmentWithSlots, getAppointmentInquiries, getScheduledAppointmentsByDate, cancelAppointment } from '../../api/appointments';
import AppointmentDetailsModal from '../AppointmentDetailsModal';
import InquiryDetailsModal from '../InquiryDetailsModal';
import AdvancedAppointmentModal from './AdvancedAppointmentModal';
import { contactAPI, residentsListAPI } from '../../services/api';
import { Input, Space as AntSpace, Calendar as AntCalendar } from 'antd';
import { DISABLED_BG, AVAILABLE_GREEN, BOOKED_RED, LIMITED_GOLD, TODAY_BLUE } from '../../theme/colors';
import dayjs from 'dayjs';

// Simple helpers
const toMinutes = (t: string) => {
  if (!t) return NaN;
  const [hh, mm] = t.split(':').map(s => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
  return aStart < bEnd && bStart < aEnd;
};

// Office hours: two ranges per day
const OFFICE_RANGES = [ { start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' } ];
const BLOCK_MIN = 60;

function buildDayBlocks() {
  const blocks: { start: string; end: string; sMin: number; eMin: number }[] = [];
  for (const r of OFFICE_RANGES) {
    const s = toMinutes(r.start);
    const e = toMinutes(r.end);
    for (let m = s; m < e; m += BLOCK_MIN) {
      const sm = m;
      const em = Math.min(m + BLOCK_MIN, e);
      const sh = String(Math.floor(sm / 60)).padStart(2, '0');
      const smn = String(sm % 60).padStart(2, '0');
      const eh = String(Math.floor(em / 60)).padStart(2, '0');
      const emn = String(em % 60).padStart(2, '0');
      blocks.push({ start: `${sh}:${smn}`, end: `${eh}:${emn}`, sMin: sm, eMin: em });
    }
  }
  return blocks;
}

const DAY_BLOCKS = buildDayBlocks();

// (disabled background is imported from shared theme)

function isoDate(dt: Date) {
  // Return local YYYY-MM-DD (avoid toISOString UTC rollover)
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parse a YYYY-MM-DD string to a local Date at midnight
function parseLocalDate(dateStr: string) {
  const parts = String(dateStr).split('-').map(p => parseInt(p, 10));
  if (parts.length < 3 || parts.some(isNaN)) return new Date(dateStr);
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

interface SlotItem { _id: string; date: string; startTime: string; endTime: string; residentName?: string; staffName?: string }

const Legend = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ width: 12, height: 12, background: AVAILABLE_GREEN, borderRadius: 3, border: '1px solid rgba(0,0,0,0.06)' }} />
      <div style={{ fontSize: 13 }}>Available</div>
    </div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ width: 12, height: 12, background: LIMITED_GOLD, borderRadius: 3, border: '1px solid rgba(0,0,0,0.06)' }} />
      <div style={{ fontSize: 13 }}>Limited Slots</div>
    </div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ width: 12, height: 12, background: BOOKED_RED, borderRadius: 3, border: '1px solid rgba(0,0,0,0.06)' }} />
      <div style={{ fontSize: 13 }}>Fully Booked</div>
    </div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Tooltip title="Gray Disabled"><div style={{ width: 12, height: 12, background: DISABLED_BG, borderRadius: 3, border: '1px solid #d9d9d9' }} /></Tooltip>
      <div style={{ fontSize: 13 }}>Disabled</div>
    </div>
  </div>
);

// Small square + label badge used for legend and per-column status
const SmallBadge = ({ color, label, muted }: { color: string; label: any; muted?: boolean }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: muted ? '#666' : '#222' }}>
    <div style={{ width: 12, height: 12, background: color, borderRadius: 3, border: '1px solid rgba(0,0,0,0.06)' }} />
    <div>{label}</div>
  </div>
);

const StaffCalendar = () => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  // Today's date at local midnight for past-date comparisons
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayIso = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, [today]);

  const [anchorDate, setAnchorDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailDate, setDetailDate] = useState(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [showInquiryDetailsModal, setShowInquiryDetailsModal] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorRecord, setEditorRecord] = useState(null);
  const [editorPrefill, setEditorPrefill] = useState(null);
  const [quickModalVisible, setQuickModalVisible] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickInquiries, setQuickInquiries] = useState([]);
  const [quickSelected, setQuickSelected] = useState([]);
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
  // Multiple appointment modal state
  const [multipleModalVisible, setMultipleModalVisible] = useState(false);
  const [multipleResidents, setMultipleResidents] = useState([]);
  const [multipleStartTime, setMultipleStartTime] = useState('08:00 AM');
  const [multipleEndTime, setMultipleEndTime] = useState('09:00 AM');
  const [multipleLocationType, setMultipleLocationType] = useState('on-site');
  const [multipleLocation, setMultipleLocation] = useState('');
  const [multipleDescription, setMultipleDescription] = useState('');
  const [multipleUrgency, setMultipleUrgency] = useState('normal');
  const [multipleDate, setMultipleDate] = useState('');
  const [multipleTitle, setMultipleTitle] = useState('');
  const [multipleLoading, setMultipleLoading] = useState(false);
  const [multipleProgress, setMultipleProgress] = useState(0);
  const [multipleResidentSearch, setMultipleResidentSearch] = useState('');
    // Single appointment modal state
  const [singleModalVisible, setSingleModalVisible] = useState(false);
  const [singleTitle, setSingleTitle] = useState('');
  const [singleResident, setSingleResident] = useState(null);
  const [singleStartTime, setSingleStartTime] = useState('08:00 AM');
  const [singleEndTime, setSingleEndTime] = useState('09:00 AM');
  const [singleLocationType, setSingleLocationType] = useState('on-site');
  const [singleLocation, setSingleLocation] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [singleUrgency, setSingleUrgency] = useState('normal');
  const [singleDate, setSingleDate] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleProgress, setSingleProgress] = useState(0);
  const [residentOptions, setResidentOptions] = useState([]);
  const [residentSelectModal, setResidentSelectModal] = useState(false);
  const [residentSearch, setResidentSearch] = useState('');

    // Fetch residents for selection
  // Retrieve from MongoDB users collection via API
  const fetchResidents = async () => {
    try {
      console.log('Fetching residents list...');
      const residents = await residentsListAPI.getAllResidents();
      console.log('Retrieved residents:', residents);
      setResidentOptions(residents);
    } catch (err) {
      console.error('Failed to fetch residents:', err);
      setResidentOptions([]);
    }
  };

  // Open multiple appointment modal (move to top-level)
  const openMultipleAppointment = (dateStr: string) => {
    setMultipleDate(dateStr);
    setMultipleModalVisible(true);
    fetchResidents();
  };

  // Validate and save multiple appointments
  const saveMultipleAppointments = async () => {
        if (!multipleDate || !multipleTitle || !multipleResidents.length || !multipleStartTime || !multipleEndTime || !multipleLocation || !multipleDescription) {
          alert('Please fill all required fields including appointment date, title, and at least one resident.');
          return;
        }
        setMultipleLoading(true);
        setMultipleProgress(0);
        
        // Reuse normalizeTime from single
        const normalizeTime = (t: string) => {
          if (!t || typeof t !== 'string') return null;
          const raw = t.trim();
          if (raw === '') return null;
          const match = raw.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*([aApP][mM])?\s*$/);
          if (!match) return null;
          let hrMinSec = match[1];
          const meridiem = match[2] ? match[2].toUpperCase() : undefined;
          const parts = hrMinSec.split(':').map(Number);
          if (parts.length < 2) return null;
          let [hour, minute] = parts;
          if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
          if (meridiem) {
            if (meridiem === 'PM' && hour < 12) hour += 12;
            if (meridiem === 'AM' && hour === 12) hour = 0;
          }
          hour = ((hour % 24) + 24) % 24;
          return {
            minutes: hour * 60 + minute,
            iso: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
          };
        };
        const startObj = normalizeTime(multipleStartTime);
        const endObj = normalizeTime(multipleEndTime);
        if (!startObj || !endObj) {
          alert('Please supply valid start and end time values (e.g. 08:00 AM).');
          return;
        }
        if (endObj.minutes <= startObj.minutes) {
          alert('End time must be after start time.');
          setMultipleLoading(false);
          setMultipleProgress(0);
          return;
        }
        if (startObj.minutes < 8 * 60 || endObj.minutes > 17 * 60) {
          alert('Time must be between 8:00 AM and 5:00 PM.');
          setMultipleLoading(false);
          setMultipleProgress(0);
          return;
        }
        // Pre-flight conflict scan for each resident
        setMultipleProgress(20);
        try {
          // Check for conflicts for all residents
          const conflictMap = new Map();
          for (const resident of multipleResidents) {
            const scheduledAppointments = await getScheduledAppointmentsByDate(multipleDate);
            const targetStart = toMinutes(startObj.iso);
            const targetEnd = toMinutes(endObj.iso);
            const conflicts = (scheduledAppointments || []).filter((existing: any) => {
              if (existing.username !== resident.username) return false;
              const exStart = toMinutes(existing.startTime);
              const exEnd = toMinutes(existing.endTime);
              return rangesOverlap(targetStart, targetEnd, exStart, exEnd);
            });
            if (conflicts.length > 0) {
              conflictMap.set(resident.username, conflicts);
            }
          }

          // Show conflicts if any and ask for confirmation
          if (conflictMap.size > 0) {
            const conflictDetails = Array.from(conflictMap.entries())
              .map(([username, conflicts]) => {
                const summary = conflicts.map((c: any) => `${c.date} ${c.startTime}-${c.endTime}`).join(', ');
                return `${username}: ${summary}`;
              })
              .join('\n');
            const overwrite = window.confirm(`Conflicts found for these residents:\n${conflictDetails}\n\nPress OK to overwrite (cancel conflicting slot(s)), or Cancel to abort.`);
            if (!overwrite) {
              setMultipleLoading(false);
              setMultipleProgress(0);
              return;
            }

            // Cancel all conflicting appointments
            const conflictsList = Array.from(conflictMap.values());
            for (const conflicts of conflictsList) {
              for (const conflict of conflicts) {
                if (conflict.inquiryId) {
                  try {
                    await cancelAppointment(conflict.inquiryId, 'Replaced by staff calendar quick appointment (multiple)');
                  } catch (cancelErr) {
                    console.warn('Failed to cancel existing conflicting inquiry', conflict.inquiryId, cancelErr);
                  }
                }
              }
            }
          }

          setMultipleProgress(40);

          // Step 1: Create single inquiry with all residents as recipients
          const appointmentDate = dayjs(multipleDate).format('MMMM DD, YYYY');
          const recipientsList = multipleResidents.map(r => (r.fullName || r.username) + (r.barangayId ? `(${r.barangayId})` : '')).filter(Boolean);
          const recipientEmailsList = multipleResidents.map(r => r.email);
          const payload = {
            subject: multipleTitle,
            title: multipleTitle,
            message: `Appointment scheduled at ${multipleLocation}. Time: ${multipleStartTime} - ${multipleEndTime}.`,
            username: multipleResidents[0].username, // For API validation/inquiry ownership only
            type: 'QUICK_APPOINTMENT',
            status: 'scheduled',
            locationType: multipleLocationType,
            location: multipleLocation,
            description: multipleDescription,
            urgency: multipleUrgency,
            recipients: recipientsList,
            recipientEmails: recipientEmailsList,
            quick_appointment_type: 'multiple',
          };
          console.log('[StaffCalendar] Creating group inquiry with payload:', payload);
          const created = await contactAPI.submitInquiry(payload);
          console.log('[StaffCalendar] Inquiry created:', created);
          
          if (!created || !created._id) {
            alert('Failed to create appointment inquiry.');
            setMultipleLoading(false);
            setMultipleProgress(0);
            return;
          }

          setMultipleProgress(60);

          // Step 2: Schedule appointment for each resident (create AppointmentSlots)
          for (const resident of multipleResidents) {
            console.log('[StaffCalendar] Scheduling appointment for resident:', resident.username);
            const scheduledDates = [{ date: multipleDate, startTime: startObj.iso, endTime: endObj.iso }];
            await contactAPI.scheduleInquiry(created._id, scheduledDates);
          }

          setMultipleProgress(100);
          alert('Group appointment scheduled for all residents. Notifications will be sent to all email addresses.');
          setMultipleModalVisible(false);
          // Reset form
          setMultipleResidents([]);
          setMultipleTitle('');
          setMultipleDate('');
          setMultipleStartTime('08:00 AM');
          setMultipleEndTime('09:00 AM');
          setMultipleLocationType('on-site');
          setMultipleLocation('');
          setMultipleDescription('');
          setMultipleUrgency('normal');
          setMultipleResidentSearch('');
        } catch (err: any) {
          console.error('[StaffCalendar] Error scheduling multiple appointments:', err);
          alert('Failed to schedule one or more appointments. ' + (err?.response?.data?.message || (err instanceof Error ? err.message : '')));
        } finally {
          setMultipleLoading(false);
          // Reset progress after a short delay
          setTimeout(() => setMultipleProgress(0), 500);
        }
      };


    // Open single appointment modal
    const openSingleAppointment = (dateStr: string) => {
      setSingleDate(dateStr);
      setSingleModalVisible(true);
      fetchResidents();
    };

    // Validate and save single appointment
    const saveSingleAppointment = async () => {
      if (!singleDate || !singleTitle || !singleResident || !singleStartTime || !singleEndTime || !singleLocation || !singleDescription) {
        alert('Please fill all required fields including appointment date and title.');
        return;
      }
      setSingleLoading(true);
      setSingleProgress(0);
      
      // Validate/normalize time input from TimePicker:
      // supports "08:00 AM", "08:00:00 am", "08:00", "08:00:00", etc.
      const normalizeTime = (t: string) => {
        if (!t || typeof t !== 'string') return null;
        const raw = t.trim();
        if (raw === '') return null;

        // Break into time and optional AM/PM (case-insensitive)
        const match = raw.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*([aApP][mM])?\s*$/);
        if (!match) return null;

        let hrMinSec = match[1];
        const meridiem = match[2] ? match[2].toUpperCase() : undefined;

        const parts = hrMinSec.split(':').map(Number);
        if (parts.length < 2) return null;
        let [hour, minute] = parts;

        if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

        if (meridiem) {
          if (meridiem === 'PM' && hour < 12) hour += 12;
          if (meridiem === 'AM' && hour === 12) hour = 0;
        }

        // Ensure hour in 0..23 range
        hour = ((hour % 24) + 24) % 24;

        return {
          minutes: hour * 60 + minute,
          iso: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        };
      };
      const startObj = normalizeTime(singleStartTime);
      const endObj = normalizeTime(singleEndTime);
      if (!startObj || !endObj) {
        alert('Please supply valid start and end time values (e.g. 08:00 AM).');
        setSingleLoading(false);
        setSingleProgress(0);
        return;
      }
      if (endObj.minutes <= startObj.minutes) {
        alert('End time must be after start time.');
        setSingleLoading(false);
        setSingleProgress(0);
        return;
      }
      if (startObj.minutes < 8 * 60 || endObj.minutes > 17 * 60) {
        alert('Time must be between 8:00 AM and 5:00 PM.');
        setSingleLoading(false);
        setSingleProgress(0);
        return;
      }
      // Pre-flight conflict scan using existing scheduled slots by day
      setSingleProgress(20);
      const scheduledAppointments = await getScheduledAppointmentsByDate(singleDate);
      const targetStart = toMinutes(startObj.iso);
      const targetEnd = toMinutes(endObj.iso);
      const conflicts = (scheduledAppointments || []).filter((existing: any) => {
        const exStart = toMinutes(existing.startTime);
        const exEnd = toMinutes(existing.endTime);
        return rangesOverlap(targetStart, targetEnd, exStart, exEnd);
      });

      if (conflicts.length > 0) {
        const summary = conflicts.map((c: any) => `${c.date} ${c.startTime}-${c.endTime} (${c.residentName || c.residentUsername || 'unknown'})`).join('\n');
        const overwrite = window.confirm(`An existing schedule overlaps this timeslot:\n${summary}\n\nPress OK to overwrite (cancel conflicting slot(s)), or Cancel to abort.`);
        if (!overwrite) {
          setSingleLoading(false);
          setSingleProgress(0);
          return;
        }

        // auto-cancel conflicting schedule(s) before saving
        for (const conflict of conflicts) {
          if (conflict.inquiryId) {
            try {
              await cancelAppointment(conflict.inquiryId, 'Replaced by staff calendar quick appointment');
            } catch (cancelErr) {
              console.warn('Failed to cancel existing conflicting inquiry', conflict.inquiryId, cancelErr);
            }
          }
        }
      }

      setSingleProgress(40);
      try {
        // Step 1: Create inquiry for appointment
        const appointmentDate = dayjs(singleDate).format('MMMM DD, YYYY');
        const payload = {
          subject: singleTitle,
          title: singleTitle,
          message: `Appointment scheduled at ${singleLocation}. Time: ${singleStartTime} - ${singleEndTime}.`,
          username: singleResident.username,
          residentName: singleResident.fullName || singleResident.username,
          residentEmail: singleResident.email,
          residentPhone: singleResident.contactNumber,
          type: 'QUICK_APPOINTMENT',
          status: 'scheduled',
          // Quick appointment specific fields
          locationType: singleLocationType,
          location: singleLocation,
          description: singleDescription,
          urgency: singleUrgency,
          // Recipients as arrays (for future multi-recipient support)
          recipients: [(singleResident.fullName || singleResident.username) + (singleResident.barangayId ? `(${singleResident.barangayId})` : '')],
          recipientEmails: [singleResident.email],
          // Quick appointment mode (single, multiple, mass)
          quick_appointment_type: 'single',
        };
        console.log('[StaffCalendar] Creating inquiry with payload:', payload);
        const created = await contactAPI.submitInquiry(payload);
        console.log('[StaffCalendar] Inquiry created:', created);
        
        if (!created || !created._id) {
          alert('Failed to create appointment inquiry.');
          setSingleLoading(false);
          setSingleProgress(0);
          return;
        }

        setSingleProgress(60);

        // Step 2: Schedule appointment (create AppointmentSlots)
        console.log('[StaffCalendar] Scheduling appointment with inquiry ID:', created._id);
        const scheduledDates = [{ date: singleDate, startTime: startObj.iso, endTime: endObj.iso }];
        console.log('[StaffCalendar] Scheduling payload:', scheduledDates);
        const scheduled = await contactAPI.scheduleInquiry(created._id, scheduledDates);
        console.log('[StaffCalendar] Appointment scheduled:', scheduled);

        setSingleProgress(100);
        alert('Appointment scheduled and resident will be notified by email.');
        setSingleModalVisible(false);
        setSingleTitle('');
        setSingleResident(null);
        setSingleDate('');
        setSingleStartTime('08:00 AM');
        setSingleEndTime('09:00 AM');
        setSingleLocationType('on-site');
        setSingleLocation('');
        setSingleDescription('');
        setSingleUrgency('normal');
        setResidentSearch('');
      } catch (err: any) {
        console.error('[StaffCalendar] Error scheduling appointment:', err);
        if (err?.response?.data) {
          console.error('[StaffCalendar] Error details', err.response.data);
        }
        alert('Failed to schedule appointment. ' + (err?.response?.data?.message || (err instanceof Error ? err.message : '')));
      } finally {
        setSingleLoading(false);
        // Reset progress after a short delay
        setTimeout(() => setSingleProgress(0), 500);
      }
    };
  const [quickCreateUsername, setQuickCreateUsername] = useState('');
  const [quickCreateSubject, setQuickCreateSubject] = useState('Quick appointment');
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);

  // Compute week range (Mon..Sun) containing anchorDate
  const weekStart = useMemo(() => {
    const d = new Date(anchorDate);
    const day = d.getDay();
    // Convert Sunday(0) to 6 shift; week start Monday
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
  }, [anchorDate]);

  const weekDates = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const s = isoDate(weekDates[0]);
        const e = isoDate(weekDates[6]);
        const resp = await getSlotsForRange(s, e);
        setSlots(resp as any);
      } catch (err) {
        console.error('Failed to load slots for week', err);
      } finally { setLoading(false); }
    })();
  }, [weekStart]);

  const slotsByDate = useMemo(() => {
    const m = new Map<string, SlotItem[]>();
    for (const s of slots || []) {
      const d = s.date;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(s as SlotItem);
    }
    return m;
  }, [slots]);

  const dayStatus = (dateStr: string) => {
    // Treat past dates and weekends as disabled (use local-date parsing)
    const dt = parseLocalDate(dateStr);
    const wk = dt.getDay();
    // compare local midnights
    const isPast = dt.setHours(0,0,0,0) < today.getTime();
    if (isPast || wk === 0 || wk === 6) return 'disabled';
    const list = slotsByDate.get(dateStr) || [];
    const totalBlocks = DAY_BLOCKS.length;
    let bookedBlocks = 0;
    for (const b of DAY_BLOCKS) {
      const overlapping = list.some(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime)));
      if (overlapping) bookedBlocks++;
    }
    if (bookedBlocks === 0) return 'available';
    if (bookedBlocks >= totalBlocks) return 'full';
    return 'partial';
  };

  const dayColor = (status: string) => {
    if (status === 'available') return 'green';
    if (status === 'partial') return 'gold';
    if (status === 'disabled') return 'default';
    return 'red';
  };

  // Map status -> theme token color
  const dayTokenColor = (status: string) => {
    if (status === 'available') return AVAILABLE_GREEN;
    if (status === 'partial') return LIMITED_GOLD;
    if (status === 'disabled') return DISABLED_BG;
    return BOOKED_RED;
  };

  const openDetail = (dateStr: string) => setDetailDate(dateStr);
  const openInquiryDetailsModal = (inquiryId: string) => {
    setSelectedInquiryId(inquiryId);
    setShowInquiryDetailsModal(true);
  };
  const closeInquiryDetailsModal = () => {
    setShowInquiryDetailsModal(false);
    setSelectedInquiryId(null);
  };
  const openEditorForInquiry = async (inquiryId?: string) => {
    if (!inquiryId) return;
    try {
      const resp = await getAppointmentWithSlots(inquiryId);
      if (!resp || !resp.inquiry) return;
      setEditorRecord(resp.inquiry);
      setEditorVisible(true);
    } catch (err) {
      console.error('Failed to open editor for inquiry', err);
    }
  };
  const closeEditor = () => { setEditorVisible(false); setEditorRecord(null); };
  const closeDetail = () => setDetailDate(null);

  const openQuickSchedule = async (dateStr: string, startTime: string, endTime: string) => {
    setQuickModalVisible(true);
    setQuickLoading(true);
    try {
      const inqs = await getAppointmentInquiries();
      // filter to appointment-related inquiries and those not already scheduled
      const candidates = (inqs || []).filter((q: any) => q && (q.type === 'SCHEDULE_APPOINTMENT' || q.type === 'Appointment' || q.status !== 'scheduled'));
      setQuickInquiries(candidates);
    } catch (err) {
      console.error('Failed to load appointment inquiries for quick schedule', err);
      setQuickInquiries([]);
    } finally {
      setQuickLoading(false);
      // store prefill so when selected we open editor with it
      setEditorPrefill({ date: dateStr, startTime, endTime });
    }
  };

  const openQuickCreate = (dateStr: string, startTime: string, endTime: string) => {
    setEditorPrefill({ date: dateStr, startTime, endTime });
    setQuickCreateUsername('');
    setQuickCreateSubject(`Quick appointment ${dateStr} ${startTime}`);
    setQuickCreateVisible(true);
  };

  const [advancedModalVisible, setAdvancedModalVisible] = useState(false);

  const submitQuickCreate = async () => {
    if (!quickCreateUsername) return;
    setQuickCreateLoading(true);
    try {
      const payload = { 
        subject: quickCreateSubject, 
        message: 'Created from calendar quick-schedule', 
        type: 'QUICK_APPOINTMENT', 
        username: quickCreateUsername,
        // Recipients as arrays (use full name where available via server mapping)
        recipients: [quickCreateUsername],
        recipientEmails: [],
        // Quick appointment mode
        quick_appointment_type: 'single',
      };
      const created = await contactAPI.submitInquiry(payload);
      if (created && created._id) {
        // open editor for created inquiry
        const resp = await getAppointmentWithSlots(created._id);
        if (resp && resp.inquiry) {
          setEditorRecord(resp.inquiry);
          setEditorVisible(true);
        }
      }
    } catch (err) {
      console.error('Failed to create inquiry', err);
    } finally {
      setQuickCreateLoading(false);
      setQuickCreateVisible(false);
      setQuickModalVisible(false);
    }
  };

  const closeQuickModal = () => { setQuickModalVisible(false); setQuickInquiries([]); setEditorPrefill(null); };

  const scheduleInquiryFromQuick = (inq: any) => {
    if (!inq) return;
    setEditorRecord(inq);
    setEditorVisible(true);
    // editorPrefill already set
    setQuickModalVisible(false);
  };

  // Mass schedule selected inquiries (open each in editor one by one)
  const massScheduleSelected = async () => {
    if (!quickSelected.length) return;
    // For demo: open the first, then remove from selection as each is scheduled
    for (const id of quickSelected) {
      const inq = quickInquiries.find((q: any) => q._id === id);
      if (inq) {
        setEditorRecord(inq);
        setEditorVisible(true);
        // Wait for modal to close before continuing (user must close to proceed)
        // In real app, you might want to batch schedule via API
        break;
      }
    }
    // After all, clear selection
    // setQuickSelected([]);
  };

  // Disabled dates: weekend
  const isOfficeClosed = (d: Date) => {
    const wk = d.getDay();
    return wk === 0 || wk === 6;
  };

  const isPastDate = (d: Date) => {
    const dd = new Date(d);
    dd.setHours(0,0,0,0);
    return dd < today;
  };

  // Month view state
  const [viewMode, setViewMode] = useState('month');
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [showWeekView, setShowWeekView] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Get day status color for calendar cell
  const getDateStatusColor = (dateStr: string) => {
    const status = dayStatus(dateStr);
    if (status === 'available') return { color: AVAILABLE_GREEN, label: 'Available', bg: '#f0fdf4' };
    if (status === 'partial') return { color: LIMITED_GOLD, label: 'Limited', bg: '#fffbeb' };
    if (status === 'full') return { color: BOOKED_RED, label: 'Full', bg: '#fef2f2' };
    return { color: DISABLED_BG, label: 'Disabled', bg: '#f5f5f5' };
  };

  // Render month calendar grid
  const renderMonthCalendar = () => {
    const year = currentMonth.year();
    const month = currentMonth.month();
    const firstDay = dayjs(`${year}-${String(month + 1).padStart(2, '0')}-01`);
    const lastDay = firstDay.endOf('month');
    const daysInMonth = lastDay.date();
    const startOfWeek = firstDay.day();

    const days = [];
    for (let i = 0; i < startOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Quick Schedule Buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Button type="primary" onClick={() => openSingleAppointment(todayIso)}>Single Appointment</Button>
          <Button onClick={() => openMultipleAppointment(todayIso)}>Multiple Appointments</Button>
          <Button onClick={() => setAdvancedModalVisible(true)}>Advanced Appointment Options</Button>
        </div>
        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} style={{ textAlign: 'center', fontWeight: 600, color: '#6b7280', fontSize: 12, paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {weeks.map((week, weekIdx) =>
            week.map((dayNum, dayIdx) => {
              if (!dayNum) {
                return <div key={`empty-${weekIdx}-${dayIdx}`} />;
              }

              const dateStr = dayjs(`${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`).format('YYYY-MM-DD');
              const dateObj = dayjs(dateStr).toDate();
              const isToday = dateStr === todayIso;
              const isPast = isPastDate(dateObj);
              const isClosed = isOfficeClosed(dateObj);
              const statusInfo = getDateStatusColor(dateStr);
              const appointmentsCount = (slotsByDate.get(dateStr) || []).length;

              return (
                <Popover
                  key={dateStr}
                  title={`${dateStr} (${dayjs(dateStr).format('dddd')})`}
                  content={
                    isClosed ? (
                      <div style={{ fontSize: 13, color: '#666' }}>Office Closed</div>
                    ) : isPast ? (
                      <div style={{ fontSize: 13, color: '#666' }}>Past Date</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {appointmentsCount} Appointment{appointmentsCount !== 1 ? 's' : ''}
                        </div>
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Button size="small" type="primary" block onClick={() => { openDetail(dateStr); }} disabled={isClosed || isPast}>
                            View Details
                          </Button>
                          <Button size="small" block onClick={() => { openSingleAppointment(dateStr); }} disabled={isClosed || isPast}>
                            Single Appointment
                          </Button>
                        </Space>
                      </div>
                    )
                  }
                  trigger="hover"
                >
                  <div
                    onClick={() => !isClosed && !isPast && openDetail(dateStr)}
                    style={{
                      padding: 8,
                      minHeight: 80,
                      border: isToday ? `2px solid ${TODAY_BLUE}` : `1px solid #e5e7eb`,
                      borderRadius: 8,
                      background: isToday ? `${TODAY_BLUE}08` : statusInfo.bg,
                      cursor: isClosed || isPast ? 'not-allowed' : 'pointer',
                      opacity: isClosed || isPast ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}
                    onMouseEnter={(e) => {
                      if (!isClosed && !isPast) {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px ${statusInfo.color}20`;
                        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                      {dayNum}
                    </div>
                    {isToday && (
                      <Tag color="blue" style={{ width: 'fit-content', fontSize: 10 }}>Today</Tag>
                    )}
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: statusInfo.color,
                        marginTop: 4
                      }}
                    />
                    {appointmentsCount > 0 && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 'auto' }}>
                        {appointmentsCount} slot{appointmentsCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </Popover>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#cffafe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(8, 145, 178, 0.1)',
            fontSize: 18
          }}>
            📅
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Staff Calendar & Appointments</span>
        </div>
      }
      extra={<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Legend /></div>}
      style={{ width: '100%', borderRadius: 14, border: '1px solid #e0f2f1' }}
      styles={{ body: { padding: 20 } }}
    >
      {/* Month Navigation */}
      {/* Single Appointment Modal */}
      <Modal
        open={singleModalVisible}
        onCancel={() => {
          setSingleModalVisible(false);
          // Reset form
          setSingleResident(null);
          setSingleTitle('');
          setSingleDate('');
          setSingleStartTime('08:00 AM');
          setSingleEndTime('09:00 AM');
          setSingleLocationType('on-site');
          setSingleLocation('');
          setSingleDescription('');
          setSingleUrgency('normal');
          setResidentSearch('');
        }}
        title={<span style={{ fontWeight: 700, fontSize: 18 }}>Schedule Single Appointment</span>}
        footer={null}
        width={480}
        bodyStyle={{ padding: 32 }}
      >
        <div style={{ maxWidth: 420, margin: '0 auto' }}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <label style={{ fontWeight: 600 }}>Appointment Date</label>
              <br />
              <DatePicker
                value={singleDate ? dayjs(singleDate) : null}
                onChange={(date) => setSingleDate(date ? date.format('YYYY-MM-DD') : '')}
                style={{ width: '100%', marginBottom: 12 }}
                format="YYYY-MM-DD"
                placeholder="Select appointment date"
                disabledDate={(current) => {
                  if (!current) return false;
                  const day = current.day();
                  const isPast = current.isBefore(dayjs(), 'day');
                  return isPast || day === 0 || day === 6; // Disable past dates and weekends
                }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Title</label>
              <Input
                value={singleTitle}
                onChange={e => setSingleTitle(e.target.value)}
                placeholder="Enter appointment title"
                style={{ width: '100%', marginBottom: 12 }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Resident</label>
              <br />
              <Button
                icon={<UserOutlined />}
                style={{ width: '100%', textAlign: 'left', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 15, background: '#fff', height: 'auto', whiteSpace: 'normal' }}
                onClick={() => setResidentSelectModal(true)}
              >
                <div style={{ textAlign: 'left' }}>
                  <div>{singleResident ? (singleResident.fullName || singleResident.username) : 'Select resident'}</div>
                  {singleResident && singleResident.email && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{singleResident.email}</div>
                  )}
                </div>
              </Button>
              <Modal
                open={residentSelectModal}
                onCancel={() => setResidentSelectModal(false)}
                title="Select Resident"
                footer={null}
                width={400}
              >
                <Input
                  placeholder="Search resident by name, username, or email..."
                  value={residentSearch}
                  onChange={e => setResidentSearch(e.target.value)}
                  style={{ marginBottom: 12 }}
                  allowClear
                />
                <List
                  dataSource={residentOptions.filter(r =>
                    r.fullName?.toLowerCase().includes(residentSearch.toLowerCase()) ||
                    r.username?.toLowerCase().includes(residentSearch.toLowerCase()) ||
                    r.email?.toLowerCase().includes(residentSearch.toLowerCase())
                  )}
                  renderItem={r => (
                    <List.Item
                      key={r.username}
                      style={{ cursor: 'pointer', padding: '8px 0' }}
                      onClick={() => {
                        setSingleResident(r);
                        setResidentSelectModal(false);
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UserOutlined />
                          <span style={{ fontWeight: 500 }}>{r.fullName || r.username}</span>
                        </div>
                        {r.email && (
                          <div style={{ fontSize: 12, color: '#666', marginLeft: 28, marginTop: 4 }}>{r.email}</div>
                        )}
                      </div>
                    </List.Item>
                  )}
                  locale={{ emptyText: 'No residents found' }}
                  style={{ maxHeight: 300, overflowY: 'auto' }}
                />
              </Modal>
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <label style={{ fontWeight: 600 }}>Start Time</label>
                <Input
                  type="time"
                  value={singleStartTime.replace(' AM','').replace(' PM','')}
                  onChange={e => setSingleStartTime(e.target.value + (parseInt(e.target.value.split(':')[0]) < 12 ? ' AM' : ' PM'))}
                  min="08:00"
                  max="17:00"
                  step="1"
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={12}>
                <label style={{ fontWeight: 600 }}>End Time</label>
                <Input
                  type="time"
                  value={singleEndTime.replace(' AM','').replace(' PM','')}
                  onChange={e => setSingleEndTime(e.target.value + (parseInt(e.target.value.split(':')[0]) < 12 ? ' AM' : ' PM'))}
                  min="08:00"
                  max="17:00"
                  step="1"
                  style={{ width: '100%' }}
                />
              </Col>
            </Row>
            <div>
              <label style={{ fontWeight: 600 }}>Location Type</label>
              <Select
                value={singleLocationType}
                onChange={(val) => setSingleLocationType(val)}
                style={{ width: '100%' }}
                options={[
                  { label: 'On-site', value: 'on-site' },
                  { label: 'Online', value: 'online' }
                ]}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>{singleLocationType === 'online' ? 'Meeting Link' : 'Address'}</label>
              <Input
                value={singleLocation}
                onChange={e => setSingleLocation(e.target.value)}
                placeholder={singleLocationType === 'online' ? 'Enter meeting link' : 'Enter address'}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Description</label>
              <Input.TextArea
                value={singleDescription}
                onChange={e => setSingleDescription(e.target.value)}
                rows={3}
                style={{ width: '100%' }}
                placeholder="Enter appointment description"
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Urgency</label>
              <Select
                value={singleUrgency}
                onChange={(val) => setSingleUrgency(val)}
                style={{ width: '100%' }}
                options={[
                  { label: 'Normal', value: 'normal' },
                  { label: 'Urgent', value: 'urgent' },
                  { label: 'Emergency', value: 'emergency' }
                ]}
              />
            </div>
            {singleProgress > 0 && singleProgress < 100 && (
              <div style={{ marginBottom: 12 }}>
                <Progress percent={singleProgress} showInfo={false} />
              </div>
            )}
            <Button
              type="primary"
              loading={singleLoading}
              onClick={saveSingleAppointment}
              style={{ width: '100%', height: 44, fontSize: 16, fontWeight: 600, borderRadius: 8 }}
            >
              Save Appointment
            </Button>
          </Space>
        </div>
      </Modal>

      {/* Multiple Appointment Modal */}
      <Modal
        open={multipleModalVisible}
        onCancel={() => {
          setMultipleModalVisible(false);
          setMultipleResidents([]);
          setMultipleTitle('');
          setMultipleDate('');
          setMultipleStartTime('08:00 AM');
          setMultipleEndTime('09:00 AM');
          setMultipleLocationType('on-site');
          setMultipleLocation('');
          setMultipleDescription('');
          setMultipleUrgency('normal');
          setMultipleResidentSearch('');
        }}
        title={<span style={{ fontWeight: 700, fontSize: 18 }}>Schedule Multiple Appointments</span>}
        footer={null}
        width={520}
        bodyStyle={{ padding: 32 }}
      >
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <label style={{ fontWeight: 600 }}>Appointment Date</label>
              <br />
              <DatePicker
                value={multipleDate ? dayjs(multipleDate) : null}
                onChange={(date) => setMultipleDate(date ? date.format('YYYY-MM-DD') : '')}
                style={{ width: '100%', marginBottom: 12 }}
                format="YYYY-MM-DD"
                placeholder="Select appointment date"
                disabledDate={(current) => {
                  if (!current) return false;
                  const day = current.day();
                  const isPast = current.isBefore(dayjs(), 'day');
                  return isPast || day === 0 || day === 6;
                }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Title</label>
              <Input
                value={multipleTitle}
                onChange={e => setMultipleTitle(e.target.value)}
                placeholder="Enter appointment title"
                style={{ width: '100%', marginBottom: 12 }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Residents</label>
              <br />
              <Button
                icon={<UserOutlined />}
                style={{ width: '100%', textAlign: 'left', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 15, background: '#fff', height: 'auto', whiteSpace: 'normal' }}
                onClick={() => setResidentSelectModal(true)}
              >
                <div style={{ textAlign: 'left' }}>
                  <div>{multipleResidents.length ? `${multipleResidents.length} resident(s) selected` : 'Select residents'}</div>
                </div>
              </Button>
              <Modal
                open={residentSelectModal}
                onCancel={() => setResidentSelectModal(false)}
                onOk={() => setResidentSelectModal(false)}
                okText="Confirm"
                title="Select Residents"
                width={400}
              >
                <Input
                  placeholder="Search resident by name, username, or email..."
                  value={multipleResidentSearch}
                  onChange={e => setMultipleResidentSearch(e.target.value)}
                  style={{ marginBottom: 12 }}
                  allowClear
                />
                <List
                  dataSource={residentOptions.filter(r =>
                    r.fullName?.toLowerCase().includes(multipleResidentSearch.toLowerCase()) ||
                    r.username?.toLowerCase().includes(multipleResidentSearch.toLowerCase()) ||
                    r.email?.toLowerCase().includes(multipleResidentSearch.toLowerCase())
                  )}
                  renderItem={r => {
                    const checked = multipleResidents.some((res: any) => res.username === r.username);
                    return (
                      <List.Item
                        key={r.username}
                        style={{ cursor: 'pointer', padding: '8px 0' }}
                        onClick={() => {
                          setMultipleResidents(sel => checked ? sel.filter((res: any) => res.username !== r.username) : [...sel, r]);
                        }}
                      >
                        <input type="checkbox" checked={checked} readOnly style={{ marginRight: 8 }} />
                        <span style={{ fontWeight: 500 }}>{r.fullName || r.username}</span>
                        {r.email && (
                          <div style={{ fontSize: 12, color: '#666', marginLeft: 12 }}>{r.email}</div>
                        )}
                      </List.Item>
                    );
                  }}
                  locale={{ emptyText: 'No residents found' }}
                  style={{ maxHeight: 300, overflowY: 'auto' }}
                />
              </Modal>
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <label style={{ fontWeight: 600 }}>Start Time</label>
                <Input
                  type="time"
                  value={multipleStartTime.replace(' AM','').replace(' PM','')}
                  onChange={e => setMultipleStartTime(e.target.value + (parseInt(e.target.value.split(':')[0]) < 12 ? ' AM' : ' PM'))}
                  min="08:00"
                  max="17:00"
                  step="1"
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={12}>
                <label style={{ fontWeight: 600 }}>End Time</label>
                <Input
                  type="time"
                  value={multipleEndTime.replace(' AM','').replace(' PM','')}
                  onChange={e => setMultipleEndTime(e.target.value + (parseInt(e.target.value.split(':')[0]) < 12 ? ' AM' : ' PM'))}
                  min="08:00"
                  max="17:00"
                  step="1"
                  style={{ width: '100%' }}
                />
              </Col>
            </Row>
            <div>
              <label style={{ fontWeight: 600 }}>Location Type</label>
              <Select
                value={multipleLocationType}
                onChange={(val) => setMultipleLocationType(val)}
                style={{ width: '100%' }}
                options={[
                  { label: 'On-site', value: 'on-site' },
                  { label: 'Online', value: 'online' }
                ]}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>{multipleLocationType === 'online' ? 'Meeting Link' : 'Address'}</label>
              <Input
                value={multipleLocation}
                onChange={e => setMultipleLocation(e.target.value)}
                placeholder={multipleLocationType === 'online' ? 'Enter meeting link' : 'Enter address'}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Description</label>
              <Input.TextArea
                value={multipleDescription}
                onChange={e => setMultipleDescription(e.target.value)}
                rows={3}
                style={{ width: '100%' }}
                placeholder="Enter appointment description"
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Urgency</label>
              <Select
                value={multipleUrgency}
                onChange={(val) => setMultipleUrgency(val)}
                style={{ width: '100%' }}
                options={[
                  { label: 'Normal', value: 'normal' },
                  { label: 'Urgent', value: 'urgent' },
                  { label: 'Emergency', value: 'emergency' }
                ]}
              />
            </div>
            {multipleProgress > 0 && multipleProgress < 100 && (
              <div style={{ marginBottom: 12 }}>
                <Progress percent={multipleProgress} showInfo={false} />
              </div>
            )}
            <Button
              type="primary"
              loading={multipleLoading}
              onClick={saveMultipleAppointments}
              style={{ width: '100%', height: 44, fontSize: 16, fontWeight: 600, borderRadius: 8 }}
            >
              Save Appointments
            </Button>
          </Space>
        </div>
      </Modal>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 24,
        padding: 16,
        background: 'linear-gradient(135deg, #f0fdf4 0%, #f0f9ff 100%)',
        borderRadius: 12,
        border: '1px solid #d1e7dd',
        transition: 'all 0.2s ease'
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button 
            icon={<LeftOutlined />} 
            onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}
            style={{ borderRadius: 8, transition: 'all 0.2s ease' }}
          >
            Previous
          </Button>
          <Popover
            content={
              <DatePicker 
                picker="month"
                value={currentMonth}
                onChange={(date) => {
                  if (date) {
                    setCurrentMonth(date);
                    setDatePickerOpen(false);
                  }
                }}
                style={{ width: 200 }}
              />
            }
            title="Select Month and Year"
            trigger="click"
            open={datePickerOpen}
            onOpenChange={setDatePickerOpen}
          >
            <div 
              style={{ 
                fontSize: 16, 
                fontWeight: 700, 
                color: '#0891b2', 
                letterSpacing: '0.5px',
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 6,
                transition: 'all 0.2s ease',
                backgroundColor: datePickerOpen ? '#e0f7fa' : 'transparent'
              }}
              onClick={() => setDatePickerOpen(!datePickerOpen)}
            >
              {currentMonth.format('MMMM YYYY')}
            </div>
          </Popover>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 'auto' }}>
          <Button onClick={() => setCurrentMonth(dayjs())} size="small">Today</Button>
          <Button 
            type={showWeekView ? 'primary' : 'default'}
            onClick={() => setShowWeekView(!showWeekView)}
            size="small"
          >
            {showWeekView ? 'Hide Week View' : 'Show Week View'}
          </Button>
          <Button 
            icon={<RightOutlined />} 
            onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}
            style={{ borderRadius: 8, transition: 'all 0.2s ease' }}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Loading state */}
      <Spin spinning={loading} tip="Loading appointments...">
        {/* Month Calendar Grid View */}
        {renderMonthCalendar()}
      </Spin>

      {/* Week View Section - Toggleable */}
      {showWeekView && (
        <div style={{ marginTop: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Week View</div>
        
        {/* Week Navigation Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 16,
          padding: 12,
          background: '#f0fdf4',
          borderRadius: 8,
          border: '1px solid #d1e7dd'
        }}>
          <Button 
            icon={<LeftOutlined />} 
            onClick={() => { const d = new Date(anchorDate); d.setDate(d.getDate() - 7); setAnchorDate(d); }}
            size="small"
            style={{ borderRadius: 6 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0891b2' }}>
            {isoDate(weekDates[0])} — {isoDate(weekDates[6])}
          </span>
          <Button 
            icon={<RightOutlined />} 
            onClick={() => { const d = new Date(anchorDate); d.setDate(d.getDate() + 7); setAnchorDate(d); }}
            size="small"
            style={{ borderRadius: 6 }}
          />
        </div>

        {/* Week list view */}
      <List loading={loading} dataSource={weekDates} renderItem={(d) => {
        const ds = isoDate(d);
        const isToday = ds === todayIso;
        const status = dayStatus(ds);
        return (
          <List.Item>
            <List.Item.Meta title={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div>{ds}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isToday && <SmallBadge color={TODAY_BLUE} label="Today" />}
                    {status !== 'disabled' && <SmallBadge color={dayTokenColor(status)} label={status === 'available' ? 'Available' : status === 'partial' ? 'Limited' : 'Full'} />}
                  </div>
                  {status === 'disabled' && <div style={{ marginTop: 6 }}><SmallBadge color={DISABLED_BG} label="Disabled" muted /></div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div>
                    <Button size="small" onClick={() => { if (!isPastDate(d) && !isOfficeClosed(d)) openDetail(ds); }} style={{ marginLeft: 8 }} disabled={isPastDate(d) || isOfficeClosed(d)}>View</Button>
                    {/* Quick-schedule action */}
                    <Button size="small" onClick={async () => {
                      if (isPastDate(d) || isOfficeClosed(d)) return;
                      // find first free block
                      const list = slotsByDate.get(ds) || [];
                      const free = DAY_BLOCKS.find(b => !list.some(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime))));
                      if (!free) {
                        // open detail if no free block
                        openDetail(ds);
                      } else {
                        openQuickSchedule(ds, free.start, free.end);
                      }
                    }} style={{ marginLeft: 8 }} disabled={isPastDate(d) || isOfficeClosed(d)}>Quick Schedule</Button>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{isOfficeClosed(d) ? 'Closed' : (isPastDate(d) ? 'Past' : '')}</div>
                </div>
              </div>
            } description={(() => {
              const list = slotsByDate.get(ds) || [];
              if (!list.length) return 'No appointments';
              return `${list.length} appointment(s)`;
            })()} />
          </List.Item>
        );
      }} />
        </div>
      )}

      <Modal 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined />
            <span>Schedule for {detailDate}</span>
          </div>
        } 
        open={!!detailDate} 
        onCancel={closeDetail} 
        footer={null} 
        width={800}
        bodyStyle={{ padding: '20px' }}
      >
        {detailDate && (
          <div>
            {(slotsByDate.get(detailDate) || []).length > 0 ? (
              <List 
                dataSource={slotsByDate.get(detailDate) || []} 
                renderItem={(s: any) => (
                  <Card 
                    style={{ marginBottom: 16 }} 
                    hoverable
                  >
                    <Row gutter={16} align="middle">
                      <Col flex="auto">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <ClockCircleOutlined style={{ fontSize: 18, color: '#1890ff' }} />
                            <span style={{ fontSize: 16, fontWeight: 600 }}>{s.startTime} - {s.endTime}</span>
                            {s.status && <Tag color={s.status === 'scheduled' ? 'green' : 'orange'}>{s.status}</Tag>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar icon={<UserOutlined />} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {s.title || s.subject || s.residentName || s.residentUsername || 'Untitled Appointment'}
                              </div>
                              {s.location ? (
                                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                                  {s.location}
                                </div>
                              ) : null}
                              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                                {s.description || (s.subject ? s.subject : 'No description')}
                              </div>
                            </div>
                          </div>
                          {s.staffName && (
                            <div style={{ fontSize: 12, color: '#999' }}>
                              Assigned by: <strong>{s.staffName}</strong>
                            </div>
                          )}
                          {s.notes && (
                            <div style={{ fontSize: 12, color: '#666', padding: '8px', background: '#fafafa', borderRadius: 4, borderLeft: '3px solid #1890ff' }}>
                              {s.notes}
                            </div>
                          )}
                        </div>
                      </Col>
                      <Col>
                        <Space direction="vertical">
                          {s.inquiryId && (
                            <Button 
                              type="primary" 
                              onClick={(e) => { e.stopPropagation(); openInquiryDetailsModal(s.inquiryId); }}
                            >
                              View Details
                            </Button>
                          )}
                        </Space>
                      </Col>
                    </Row>
                  </Card>
                )} 
                locale={{ emptyText: <Empty description="No appointments scheduled" style={{ marginTop: 40 }} /> }} 
              />
            ) : (
              <Empty description="No appointments scheduled for this date" style={{ marginTop: 40 }} />
            )}
          </div>
        )}
      </Modal>

      <Modal title="Quick Schedule" visible={quickModalVisible} onCancel={closeQuickModal} footer={null} width={720}>
        <div style={{ marginBottom: 8 }}><small>Select one or more inquiries to schedule at the selected time. You can also create a new appointment from the Inquiries page.</small></div>
        <List
          loading={quickLoading}
          dataSource={quickInquiries}
          renderItem={(inq: any) => {
            const checked = quickSelected.includes(inq._id);
            return (
              <List.Item
                actions={[
                  <Button key="s" type="primary" onClick={() => scheduleInquiryFromQuick(inq)}>Schedule</Button>
                ]}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => {
                    setQuickSelected(sel => e.target.checked
                      ? [...sel, inq._id]
                      : sel.filter(id => id !== inq._id)
                    );
                  }}
                  style={{ marginRight: 12 }}
                />
                <List.Item.Meta
                  title={inq.subject || inq.username || `Inquiry ${inq._id}`}
                  description={<div>{inq.createdBy?.fullName || inq.username || 'Unknown resident'}</div>}
                />
              </List.Item>
            );
          }}
          locale={{ emptyText: 'No appointment inquiries available' }}
        />
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Button onClick={() => setQuickCreateVisible(true)}>Create New Inquiry</Button>
          <Button type="primary" disabled={!quickSelected.length} onClick={massScheduleSelected}>Schedule Selected ({quickSelected.length})</Button>
        </div>
      </Modal>

      <Modal title="Create New Inquiry" visible={quickCreateVisible} onCancel={() => setQuickCreateVisible(false)} okText="Create" confirmLoading={quickCreateLoading} onOk={submitQuickCreate}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="Resident username (required)" value={quickCreateUsername} onChange={e => setQuickCreateUsername(e.target.value)} />
          <Input placeholder="Subject" value={quickCreateSubject} onChange={e => setQuickCreateSubject(e.target.value)} />
          <div style={{ fontSize: 12, color: '#666' }}>The created inquiry will open in the appointment editor with date/time prefilled.</div>
        </Space>
      </Modal>

        <AppointmentDetailsModal visible={editorVisible} record={editorRecord} onClose={closeEditor} prefill={editorPrefill} />
        <InquiryDetailsModal visible={showInquiryDetailsModal} inquiryId={selectedInquiryId} onClose={closeInquiryDetailsModal} onChanged={() => { closeInquiryDetailsModal(); setDetailDate(null); }} />
        <AdvancedAppointmentModal visible={advancedModalVisible} onClose={() => setAdvancedModalVisible(false)} />
    </Card>
  );
};

export default StaffCalendar;
