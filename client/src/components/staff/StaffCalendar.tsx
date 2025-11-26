import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Button, Tooltip, Modal, List, Tag, Grid } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { getSlotsForRange, getAppointmentWithSlots, getAppointmentInquiries } from '../../api/appointments';
import AppointmentDetailsModal from '../AppointmentDetailsModal';

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
const BLOCK_MIN = 30;

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

function isoDate(dt: Date) { return dt.toISOString().slice(0,10); }

interface SlotItem { _id: string; date: string; startTime: string; endTime: string; residentName?: string; staffName?: string }

const Legend: React.FC = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Tag color="green">🟩 Available</Tag>
    <Tag color="gold">🟨 Limited Slots</Tag>
    <Tag color="red">🟥 Fully Booked</Tag>
  </div>
);

const StaffCalendar: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

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
    return 'red';
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

  return (
    <Card title="Staff Calendar" extra={<Legend />} style={{ width: '100%' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Button icon={<LeftOutlined />} onClick={() => { const d = new Date(anchorDate); d.setDate(d.getDate() - 7); setAnchorDate(d); }} />
          <Button icon={<RightOutlined />} onClick={() => { const d = new Date(anchorDate); d.setDate(d.getDate() + 7); setAnchorDate(d); }} style={{ marginLeft: 8 }} />
        </Col>
        <Col>
          <strong>{isoDate(weekDates[0])} — {isoDate(weekDates[6])}</strong>
        </Col>
      </Row>

      {isMobile ? (
        // Mobile list view
                      <List loading={loading} dataSource={weekDates} renderItem={(d) => {
          const ds = isoDate(d);
          const status = dayStatus(ds);
          return (
            <List.Item>
              <List.Item.Meta title={<div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div>{ds} {isOfficeClosed(d) ? '(Closed)' : ''}</div>
                <div>
                  <Tag color={dayColor(status)}>{status === 'available' ? 'Available' : status === 'partial' ? 'Limited' : 'Full'}</Tag>
                  <Button size="small" onClick={() => openDetail(ds)} style={{ marginLeft: 8 }}>View</Button>
                </div>
              </div>} description={(() => {
                const list = slotsByDate.get(ds) || [];
                if (!list.length) return 'No appointments';
                return `${list.length} appointment(s)`;
              })()} />
            </List.Item>
          );
        }} />
      ) : (
        // Desktop grid view: day columns with a colored header and tiny block preview
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {weekDates.map((d) => {
            const ds = isoDate(d);
            const status = dayStatus(ds);
            const list = slotsByDate.get(ds) || [];
            return (
              <div key={ds} style={{ border: '1px solid #eee', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ padding: 8, background: dayColor(status), color: '#111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>{ds}</div>
                  <div>
                    <Tag color={dayColor(status)}>{status === 'available' ? 'Available' : status === 'partial' ? 'Limited' : 'Full'}</Tag>
                  </div>
                </div>
                <div style={{ padding: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {DAY_BLOCKS.slice(0, 16).map((b, idx) => {
                      // small preview cell: check any overlap
                      const overlapping = list.some(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime)));
                      return (
                        <Tooltip key={idx} title={overlapping ? list.filter(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime))).map(s => `${s.residentName || 'Resident'} ${s.startTime}-${s.endTime} (${s.staffName || 'staff'})`).join('\n') : `${b.start}-${b.end} free`}>
                          <div onClick={() => {
                            if (isOfficeClosed(d)) return;
                            if (overlapping) {
                              // open editor for first overlapping slot's inquiry
                              const first = list.find(s => rangesOverlap(b.sMin, b.eMin, toMinutes(s.startTime), toMinutes(s.endTime)));
                              if (first && (first as any).inquiryId) openEditorForInquiry((first as any).inquiryId);
                            } else {
                              // open quick-schedule modal prefilled for this free block
                              openQuickSchedule(ds, b.start, b.end);
                            }
                          }} style={{ height: 28, borderRadius: 4, background: overlapping ? '#f5222d' : '#52c41a', opacity: overlapping ? 1 : 0.95, cursor: isOfficeClosed(d) ? 'not-allowed' : 'pointer' }} />
                        </Tooltip>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <small>{list.length} appointment(s)</small>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal title={detailDate ? `Schedule for ${detailDate}` : ''} visible={!!detailDate} onCancel={closeDetail} footer={null} width={720}>
        {detailDate && (
          <List dataSource={slotsByDate.get(detailDate) || []} renderItem={(s: any) => (
              <List.Item onClick={() => s.inquiryId && openEditorForInquiry(s.inquiryId)} style={{ cursor: s.inquiryId ? 'pointer' : 'default' }}>
                <List.Item.Meta title={`${s.startTime} - ${s.endTime}`} description={<div>{s.residentName || 'Resident'} — {s.staffName || 'Staff'}</div>} />
              </List.Item>
          )} locale={{ emptyText: 'No appointments' }} />
        )}
      </Modal>

      <Modal title="Quick Schedule" visible={quickModalVisible} onCancel={closeQuickModal} footer={null} width={720}>
        <div style={{ marginBottom: 8 }}><small>Pick an inquiry to schedule at the selected time. Or create a new appointment from the Inquiries page.</small></div>
        <List loading={quickLoading} dataSource={quickInquiries} renderItem={(inq: any) => (
          <List.Item actions={[<Button key="s" type="primary" onClick={() => scheduleInquiryFromQuick(inq)}>Schedule</Button>]}> 
            <List.Item.Meta title={inq.subject || inq.username || `Inquiry ${inq._id}`} description={<div>{inq.createdBy?.fullName || inq.username || 'Unknown resident'}</div>} />
          </List.Item>
        )} locale={{ emptyText: 'No appointment inquiries available' }} />
      </Modal>

        <AppointmentDetailsModal visible={editorVisible} record={editorRecord} onClose={closeEditor} prefill={editorPrefill} />
    </Card>
  );
};

export default StaffCalendar;
