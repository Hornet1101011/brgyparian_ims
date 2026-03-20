import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Button, Tooltip, Modal, List, Grid, Popover, Badge, Empty, Space, Spin, Tag, DatePicker } from 'antd';
import { LeftOutlined, RightOutlined, ClockCircleOutlined, UserOutlined, CalendarOutlined } from '@ant-design/icons';
import { getSlotsForRange, getAppointmentWithSlots, getAppointmentInquiries } from '../../api/appointments';
import AppointmentDetailsModal from '../AppointmentDetailsModal';
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
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorRecord, setEditorRecord] = useState(null);
  const [editorPrefill, setEditorPrefill] = useState(null);
  const [quickModalVisible, setQuickModalVisible] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickInquiries, setQuickInquiries] = useState([]);
  const [quickSelected, setQuickSelected] = useState([]);
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
    // Single appointment modal state
  const [singleModalVisible, setSingleModalVisible] = useState(false);
  const [singleResident, setSingleResident] = useState(null);
  const [singleStartTime, setSingleStartTime] = useState('08:00 AM');
  const [singleEndTime, setSingleEndTime] = useState('09:00 AM');
  const [singleLocationType, setSingleLocationType] = useState('on-site');
  const [singleLocation, setSingleLocation] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [singleUrgency, setSingleUrgency] = useState('normal');
  const [singleDate, setSingleDate] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
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
      // Fallback to empty list on error
      setResidentOptions([]);
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
      if (!singleDate || !singleResident || !singleStartTime || !singleEndTime || !singleLocation || !singleDescription) {
        alert('Please fill all required fields including appointment date.');
        return;
      }
      // Validate time
      const parseTime = (t: string) => {
        const [time, meridian] = t.split(' ');
        let [h, m] = time.split(':').map(Number);
        if (meridian === 'PM' && h !== 12) h += 12;
        if (meridian === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      const startMin = parseTime(singleStartTime);
      const endMin = parseTime(singleEndTime);
      if (endMin <= startMin) {
        alert('End time must be after start time.');
        return;
      }
      if (startMin < 8 * 60 || endMin > 17 * 60) {
        alert('Time must be between 8:00 AM and 5:00 PM.');
        return;
      }
      setSingleLoading(true);
      try {
        // Create inquiry for appointment
        const payload = {
          username: singleResident.username,
          type: 'SCHEDULE_APPOINTMENT',
          status: 'scheduled',
          scheduledDates: [{ date: singleDate, startTime: singleStartTime, endTime: singleEndTime }],
          locationType: singleLocationType,
          location: singleLocation,
          description: singleDescription,
          urgency: singleUrgency,
        };
        const created = await contactAPI.submitInquiry(payload);
        if (created && created._id) {
          // Optionally, call scheduleAppointment or scheduleInquiry if needed
          alert('Appointment scheduled and resident will be notified by email.');
          setSingleModalVisible(false);
        }
      } catch (err) {
        alert('Failed to schedule appointment.');
      } finally {
        setSingleLoading(false);
      }
    };
  const [quickCreateUsername, setQuickCreateUsername] = useState('');
  const [quickCreateSubject, setQuickCreateSubject] = useState('Quick appointment');
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [slotDetail, setSlotDetail] = useState(null);

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

  const submitQuickCreate = async () => {
    if (!quickCreateUsername) return;
    setQuickCreateLoading(true);
    try {
      const payload = { subject: quickCreateSubject, message: 'Created from calendar quick-schedule', type: 'SCHEDULE_APPOINTMENT', username: quickCreateUsername };
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
          <Button onClick={() => alert('Multiple appointment scheduling coming soon!')}>Multiple Appointments</Button>
          <Button onClick={() => alert('Mass appointment scheduling coming soon!')}>Mass Appointments</Button>
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
              <label style={{ fontWeight: 600 }}>Resident</label>
              <br />
              <Button
                icon={<UserOutlined />}
                style={{ width: '100%', textAlign: 'left', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 15, background: '#fff' }}
                onClick={() => setResidentSelectModal(true)}
              >
                {singleResident ? (singleResident.fullName || singleResident.username) : 'Select resident'}
              </Button>
              <Modal
                open={residentSelectModal}
                onCancel={() => setResidentSelectModal(false)}
                title="Select Resident"
                footer={null}
                width={400}
              >
                <Input
                  placeholder="Search resident..."
                  value={residentSearch}
                  onChange={e => setResidentSearch(e.target.value)}
                  style={{ marginBottom: 12 }}
                  allowClear
                />
                <List
                  dataSource={residentOptions.filter(r =>
                    r.fullName?.toLowerCase().includes(residentSearch.toLowerCase()) ||
                    r.username?.toLowerCase().includes(residentSearch.toLowerCase())
                  )}
                  renderItem={r => (
                    <List.Item
                      key={r.username}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSingleResident(r);
                        setResidentSelectModal(false);
                      }}
                    >
                      <UserOutlined style={{ marginRight: 8 }} />
                      {r.fullName || r.username}
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
              <br />
              <select
                value={singleLocationType}
                onChange={e => setSingleLocationType(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 15 }}
              >
                <option value="on-site">On-site</option>
                <option value="online">Online</option>
              </select>
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
              <br />
              <select
                value={singleUrgency}
                onChange={e => setSingleUrgency(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 15 }}
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
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

      <Modal title={detailDate ? `Schedule for ${detailDate}` : ''} visible={!!detailDate} onCancel={closeDetail} footer={null} width={720}>
        {detailDate && (
          <List dataSource={slotsByDate.get(detailDate) || []} renderItem={(s: any) => (
              <List.Item actions={[
                s.inquiryId ? <Button key="open" onClick={() => openEditorForInquiry(s.inquiryId)}>Open</Button>
                : <Button key="details" onClick={() => setSlotDetail(s)}>Details</Button>
              ]}>
                <List.Item.Meta
                  title={`${s.startTime} - ${s.endTime}`}
                  description={(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div><strong>{s.residentName || s.residentUsername || 'Resident'}</strong> — {s.staffName || 'Staff'}</div>
                      {s.subject && <div><em>{s.subject}</em></div>}
                      {s.status && <div>Status: {s.status}</div>}
                      {s.notes && <div style={{ color: '#444' }}>{s.notes}</div>}
                    </div>
                  )}
                />
              </List.Item>
          )} locale={{ emptyText: 'No appointments' }} />
        )}
      </Modal>

      <Modal title={slotDetail ? `Appointment Details` : ''} visible={!!slotDetail} onCancel={() => setSlotDetail(null)} footer={null} width={640}>
        {slotDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><strong>Time</strong>: {slotDetail.startTime} — {slotDetail.endTime}</div>
            <div><strong>Resident</strong>: {slotDetail.residentName || slotDetail.residentUsername || 'Unknown'}</div>
            {slotDetail.residentPhone && <div><strong>Phone</strong>: {slotDetail.residentPhone}</div>}
            {slotDetail.residentEmail && <div><strong>Email</strong>: {slotDetail.residentEmail}</div>}
            <div><strong>Staff</strong>: {slotDetail.staffName || 'Staff'}</div>
            {slotDetail.subject && <div><strong>Subject</strong>: {slotDetail.subject}</div>}
            {slotDetail.status && <div><strong>Status</strong>: {slotDetail.status}</div>}
            {slotDetail.notes && <div><strong>Notes</strong>: <div style={{ whiteSpace: 'pre-wrap' }}>{slotDetail.notes}</div></div>}
            <div style={{ fontSize: 12, color: '#666' }}>Slot ID: {slotDetail._id}{slotDetail.inquiryId ? ` — Inquiry: ${slotDetail.inquiryId}` : ''}</div>
            {slotDetail.inquiryId && <div><Button type="primary" onClick={() => { setSlotDetail(null); openEditorForInquiry(slotDetail.inquiryId); }}>Open Inquiry</Button></div>}
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
    </Card>
  );
};

export default StaffCalendar;
