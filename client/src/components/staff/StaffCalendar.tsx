import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Button, Tooltip, Modal, List, Grid } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { getSlotsForRange, getAppointmentWithSlots, getAppointmentInquiries } from '../../api/appointments';
import AppointmentDetailsModal from '../AppointmentDetailsModal';
import { contact } from '../../services/api';
import { Input, Space } from 'antd';
import { DISABLED_BG, AVAILABLE_GREEN, BOOKED_RED, LIMITED_GOLD, TODAY_BLUE } from '../../theme/colors';

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

const Legend: React.FC = () => (
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
const SmallBadge: React.FC<{ color: string; label: React.ReactNode; muted?: boolean }> = ({ color, label, muted }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: muted ? '#666' : '#222' }}>
    <div style={{ width: 12, height: 12, background: color, borderRadius: 3, border: '1px solid rgba(0,0,0,0.06)' }} />
    <div>{label}</div>
  </div>
);

const StaffCalendar: React.FC = () => {
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

  const [anchorDate, setAnchorDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorRecord, setEditorRecord] = useState<any | null>(null);
  const [editorPrefill, setEditorPrefill] = useState<{ date?: string; startTime?: string; endTime?: string } | null>(null);
  const [quickModalVisible, setQuickModalVisible] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickInquiries, setQuickInquiries] = useState<any[]>([]);
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
  const [quickCreateUsername, setQuickCreateUsername] = useState('');
  const [quickCreateSubject, setQuickCreateSubject] = useState('Quick appointment');
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [slotDetail, setSlotDetail] = useState<any | null>(null);

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
      const created = await contact.submitInquiry(payload);
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
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Staff Calendar</span>
        </div>
      }
      extra={<Legend />} 
      style={{ width: '100%', borderRadius: 14, border: '1px solid #e0f2f1' }}
      styles={{ body: { padding: 20 } }}
    >
      {/* Navigation Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 20,
        padding: 16,
        background: '#f0fdf4',
        borderRadius: 12,
        border: '1px solid #d1e7dd',
        transition: 'all 0.2s ease'
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button 
            icon={<LeftOutlined />} 
            onClick={() => { const d = new Date(anchorDate); d.setDate(d.getDate() - 7); setAnchorDate(d); }}
            style={{ borderRadius: 8, transition: 'all 0.2s ease' }}
          />
          <Button 
            icon={<RightOutlined />} 
            onClick={() => { const d = new Date(anchorDate); d.setDate(d.getDate() + 7); setAnchorDate(d); }}
            style={{ borderRadius: 8, transition: 'all 0.2s ease' }}
          />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0891b2', letterSpacing: '0.5px' }}>
          {isoDate(weekDates[0])} — {isoDate(weekDates[6])}
        </div>
      </div>

      {isMobile ? (
        // Mobile list view
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
                      {/* Mobile quick-schedule action */}
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
      ) : (
        // Desktop grid view with modern design
        <div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 12 }}>
            {weekDates.map((d, idx) => {
              const short = d.toLocaleDateString(undefined, { weekday: 'short' });
              const closed = isOfficeClosed(d);
              const past = isPastDate(d);
              return (
                <div 
                  key={idx} 
                  style={{ 
                    padding: 12,
                    background: closed || past ? '#f9fafb' : '#faf5ff',
                    borderRadius: 10,
                    textAlign: 'center',
                    border: closed || past ? '1px solid #e5e7eb' : '1px solid #ede9fe',
                    fontSize: 13,
                    fontWeight: 600,
                    color: closed || past ? '#6b7280' : '#7c3aed',
                    boxShadow: closed || past ? 'none' : '0 2px 6px rgba(139, 92, 246, 0.08)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {short}
                </div>
              );
            })}
          </div>

          {/* Day cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 14 }}>
            {weekDates.map((d) => {
              const ds = isoDate(d);
              const isToday = ds === todayIso;
              const status = dayStatus(ds);
              const list = slotsByDate.get(ds) || [];
              const closed = isOfficeClosed(d);
              const past = isPastDate(d);

              return (
                <div
                  key={ds}
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: past ? '#f9fafb' : '#ffffff',
                    border: isToday ? '2px solid #8b5cf6' : '1px solid #ede9fe',
                    borderTop: isToday ? '4px solid #8b5cf6' : '1px solid transparent',
                    boxShadow: isToday 
                      ? '0 8px 24px rgba(139, 92, 246, 0.15)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.06)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    opacity: past ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!past && !closed) {
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = isToday 
                      ? '0 8px 24px rgba(139, 92, 246, 0.15)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Header section */}
                  <div style={{ 
                    padding: 14,
                    background: isToday 
                      ? 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)' 
                      : '#f9fafb',
                    borderBottom: '1px solid #ede9fe',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? '#8b5cf6' : '#0f172a' }}>
                        {ds}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {isToday && (
                            <div style={{ 
                              padding: '4px 10px', 
                              background: '#8b5cf6', 
                              color: '#fff',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: '0.5px'
                            }}>
                              TODAY
                            </div>
                          )}
                          {!closed && !past && status !== 'disabled' && (
                            <div style={{ 
                              padding: '3px 8px',
                              background: dayTokenColor(status),
                              color: '#fff',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600
                            }}>
                              {status === 'available' ? '✓ Available' : status === 'partial' ? '◐ Limited' : '✕ Full'}
                            </div>
                          )}
                        </div>
                        {(closed || past) && (
                          <div style={{ 
                            padding: '3px 8px',
                            background: '#f5f5f5',
                            color: '#999',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            border: '1px solid #e0e0e0',
                            display: 'inline-block',
                            width: 'fit-content'
                          }}>
                            {closed ? 'CLOSED' : 'PAST'}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button 
                      size="small" 
                      onClick={() => { if (!past && !closed) openDetail(ds); }} 
                      disabled={past || closed}
                      style={{ borderRadius: 6 }}
                    >
                      View
                    </Button>
                  </div>

                  {/* Time slots grid */}
                  <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, justifyContent: 'flex-start' }}>
                      {DAY_BLOCKS.map((b, idx) => {
                        const overlapping = list.some(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime)));
                        const cellDisabled = closed || past;
                        const cellBg = cellDisabled ? DISABLED_BG : (overlapping ? BOOKED_RED : AVAILABLE_GREEN);
                        
                        return (
                          <Tooltip 
                            key={idx} 
                            placement="top" 
                            title={
                              <div style={{ fontSize: 12 }}>
                                {overlapping ? (
                                  list.filter(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime))).map((s: any, i: number) => (
                                    <div key={i}>
                                      <strong>{s.residentName || 'Resident'}</strong> {s.startTime}
                                    </div>
                                  ))
                                ) : (
                                  <div>{b.start}-{b.end} Available</div>
                                )}
                              </div>
                            }
                          >
                            <div
                              role="button"
                              tabIndex={cellDisabled ? -1 : 0}
                              aria-disabled={cellDisabled}
                              onClick={() => {
                                if (cellDisabled) return;
                                if (overlapping) {
                                  const first = list.find(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime)));
                                  if (first && (first as any).inquiryId) openEditorForInquiry((first as any).inquiryId);
                                } else {
                                  openQuickSchedule(ds, b.start, b.end);
                                }
                              }}
                              style={{
                                width: 35,
                                height: 35,
                                borderRadius: 10,
                                background: cellBg,
                                opacity: cellDisabled ? 0.5 : 1,
                                cursor: cellDisabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: cellDisabled 
                                  ? '0 2px 4px rgba(0, 0, 0, 0.08)'
                                  : overlapping
                                  ? '0 4px 12px rgba(255, 77, 79, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                                  : '0 4px 12px rgba(82, 196, 26, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
                                border: 'none',
                                fontSize: 11,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                color: overlapping ? '#fff' : 'rgba(0, 0, 0, 0.25)',
                                padding: '4px',
                                position: 'relative',
                                flexShrink: 0
                              }}
                              onMouseEnter={(e) => {
                                if (!cellDisabled) {
                                  e.currentTarget.style.boxShadow = overlapping 
                                    ? '0 8px 16px rgba(255, 77, 79, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.6)' 
                                    : '0 8px 16px rgba(82, 196, 26, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
                                  e.currentTarget.style.transform = 'translateY(-3px)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = cellDisabled 
                                  ? '0 2px 4px rgba(0, 0, 0, 0.08)'
                                  : overlapping
                                  ? '0 4px 12px rgba(255, 77, 79, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                                  : '0 4px 12px rgba(82, 196, 26, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
                                e.currentTarget.style.transform = 'translateY(0)';
                              }}
                            >
                              {overlapping && <span style={{ fontSize: 9, marginBottom: 1 }}>●</span>}
                              <span style={{ fontSize: 7 }}>{b.start.split(':')[0]}:{b.start.split(':')[1]}</span>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', textAlign: 'center' }}>
                      {list.length > 0 ? `${list.length} appointment${list.length !== 1 ? 's' : ''}` : 'No appointments'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
        <div style={{ marginBottom: 8 }}><small>Pick an inquiry to schedule at the selected time. Or create a new appointment from the Inquiries page.</small></div>
        <List loading={quickLoading} dataSource={quickInquiries} renderItem={(inq: any) => (
          <List.Item actions={[<Button key="s" type="primary" onClick={() => scheduleInquiryFromQuick(inq)}>Schedule</Button>]}> 
            <List.Item.Meta title={inq.subject || inq.username || `Inquiry ${inq._id}`} description={<div>{inq.createdBy?.fullName || inq.username || 'Unknown resident'}</div>} />
          </List.Item>
        )} locale={{ emptyText: 'No appointment inquiries available' }} />
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => setQuickCreateVisible(true)}>Create New Inquiry</Button>
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
