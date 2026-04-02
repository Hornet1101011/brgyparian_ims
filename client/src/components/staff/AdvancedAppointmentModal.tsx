import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Space, DatePicker, InputNumber, Radio, Input, List, Divider, Row, Col, Tag, Select, Spin, Progress, message } from 'antd';
import dayjs from 'dayjs';
import { contactAPI, residentsListAPI } from '../../services/api';
import { getScheduledAppointmentsByDate, cancelAppointment } from '../../api/appointments';

// Helpers (small duplicates of StaffCalendar utilities)
const toMinutes = (t: string) => {
  if (!t) return NaN;
  const [hh, mm] = t.split(':').map(s => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
  return aStart < bEnd && bStart < aEnd;
};

const OFFICE_RANGES = [ { start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' } ];

type Resident = { username: string; fullName?: string; email?: string };

interface Assignment { resident: Resident; date: string; startTime: string; endTime: string }

const AdvancedAppointmentModal = ({ visible, onClose, defaultMaxDates = 7 }: { visible: boolean; onClose: () => void; defaultMaxDates?: number }) => {
  const [selectedDates, setSelectedDates] = useState([] as string[]);
  const [timeMode, setTimeMode] = useState('unified' as 'unified' | 'individual');
  const [unifiedStart, setUnifiedStart] = useState('08:00');
  const [unifiedEnd, setUnifiedEnd] = useState('09:00');
  const [perDateTimes, setPerDateTimes] = useState({} as Record<string,{start:string;end:string}>);

  const [numParticipants, setNumParticipants] = useState(1);
  const [participantDistribution, setParticipantDistribution] = useState('manual' as 'all'|'balanced'|'manual');
  const [intervalMode, setIntervalMode] = useState('off' as 'off'|'individual'|'multiples');
  const [intervalMins, setIntervalMins] = useState(30);
  const [multiplesOf, setMultiplesOf] = useState(1);

  const [residentOptions, setResidentOptions] = useState([] as Resident[]);
  const [selectedResidents, setSelectedResidents] = useState([] as Resident[]);
  const [residentPickerOpen, setResidentPickerOpen] = useState(false);

  const [loadingResidents, setLoadingResidents] = useState(false);
  const [preview, setPreview] = useState([] as Assignment[]);
  const [computingPreview, setComputingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [submitProgress, setSubmitProgress] = useState(0);
  const previewTimer = React.useRef(null as any);
  const submitTimer = React.useRef(null as any);

  useEffect(() => {
    if (!visible) {
      // reset modal state when closed
      setSelectedDates([]);
      setPerDateTimes({});
      setUnifiedStart('08:00');
      setUnifiedEnd('09:00');
      setNumParticipants(1);
      setSelectedResidents([]);
      setPreview([]);
    }
  }, [visible]);

  const addDate = (d: dayjs.Dayjs | null) => {
    if (!d) return;
    const ds = d.format('YYYY-MM-DD');
    if (selectedDates.includes(ds)) return;
    if (selectedDates.length >= defaultMaxDates) return;
    setSelectedDates(s => [...s, ds].sort());
  };

  const removeDate = (ds: string) => setSelectedDates(s => s.filter(x => x !== ds));

  const fetchResidents = async () => {
    setLoadingResidents(true);
    try {
      const r = await residentsListAPI.getAllResidents();
      setResidentOptions(r || []);
    } catch (err) {
      setResidentOptions([]);
    } finally { setLoadingResidents(false); }
  };

  const openResidentPicker = async () => {
    await fetchResidents();
    setResidentPickerOpen(true);
  };

  // compute preview schedule based on mode + interval settings
  const computePreview = async () => {
    setComputingPreview(true);
    setPreviewProgress(0);
    if (previewTimer.current) clearInterval(previewTimer.current);
    previewTimer.current = setInterval(() => {
      setPreviewProgress(p => Math.min(95, p + Math.floor(Math.random() * 10) + 5));
    }, 300);
    let aborted = false;
    try {
      // basic validation
      if (!selectedDates.length) { setPreview([]); aborted = true; }
      if (!aborted && selectedResidents.length < 1) { setPreview([]); aborted = true; }
      if (aborted) {
        // allow the progress bar to run briefly, then finish below
        return;
      }

      // build date windows
      const windows: {date:string; start:number; end:number}[] = selectedDates.map(ds => {
        const tm = timeMode === 'unified' ? { start: unifiedStart, end: unifiedEnd } : perDateTimes[ds] || { start: unifiedStart, end: unifiedEnd };
        return { date: ds, start: toMinutes(tm.start), end: toMinutes(tm.end) };
      });

      // generate assignments in resident order
      const assignments: Assignment[] = [];
      const residents = [...selectedResidents].slice(0, numParticipants);

      if (intervalMode === 'off') {
        // all residents get same start/end per their date assignment rules
        if (participantDistribution === 'all') {
          for (const d of windows) {
            for (const r of residents) assignments.push({ resident: r, date: d.date, startTime: formatHM(d.start), endTime: formatHM(d.end) });
          }
        } else if (participantDistribution === 'balanced') {
          // split residents evenly across dates
          let idx = 0;
          for (const r of residents) {
            const d = windows[idx % windows.length];
            assignments.push({ resident: r, date: d.date, startTime: formatHM(d.start), endTime: formatHM(d.end) });
            idx++;
          }
        } else {
          // manual: assume user assigned residents to dates via UI (not assigned yet) => default balanced
          let idx = 0;
          for (const r of residents) {
            const d = windows[idx % windows.length];
            assignments.push({ resident: r, date: d.date, startTime: formatHM(d.start), endTime: formatHM(d.end) });
            idx++;
          }
        }
      } else if (intervalMode === 'individual') {
        // sequential intervals per date, spilling to next date if needed
        let resIdx = 0;
        for (const d of windows) {
          let cursor = d.start;
          while (cursor + intervalMins <= d.end && resIdx < residents.length) {
            // skip lunch
            if (cursor >= 12*60 && cursor < 13*60) cursor = 13*60;
            if (cursor + intervalMins > d.end) break;
            const r = residents[resIdx];
            assignments.push({ resident: r, date: d.date, startTime: formatHM(cursor), endTime: formatHM(cursor + intervalMins) });
            cursor += intervalMins;
            resIdx++;
          }
        }
        // leftover residents ignored in preview (user must add dates or change settings)
      } else if (intervalMode === 'multiples') {
        // group residents into bundles of multiplesOf, each bundle gets an interval
        const bundles: Resident[][] = [];
        for (let i=0;i<residents.length;i+=multiplesOf) bundles.push(residents.slice(i,i+multiplesOf));
        let bundleIdx = 0;
        for (const d of windows) {
          let cursor = d.start;
          while (cursor < d.end && bundleIdx < bundles.length) {
            if (cursor >= 12*60 && cursor < 13*60) cursor = 13*60;
            const start = cursor;
            const end = cursor + intervalMins;
            if (end > d.end) break;
            const bundle = bundles[bundleIdx];
            for (const r of bundle) assignments.push({ resident: r, date: d.date, startTime: formatHM(start), endTime: formatHM(end) });
            cursor = end;
            bundleIdx++;
          }
        }
      }

      setPreview(assignments);
    } finally {
      setComputingPreview(false);
      // finish progress if timer exists
      if (previewTimer.current) { clearInterval(previewTimer.current); previewTimer.current = null; }
      setPreviewProgress(100);
      setTimeout(() => setPreviewProgress(0), 600);
    }
  };

  const formatHM = (minutes: number) => {
    const hh = Math.floor(minutes/60);
    const mm = minutes % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };

  const submit = async () => {
    if (!selectedDates.length) { alert('Please select at least one date.'); return; }
    if (!selectedResidents.length) { alert('Please select participants.'); return; }
    // recompute preview to ensure assigned
    await computePreview();
    if (!preview.length) { if (!window.confirm('No computed assignments. Continue?')) return; }

    setSubmitting(true);
    setSubmitProgress(0);
    if (submitTimer.current) clearInterval(submitTimer.current);
    submitTimer.current = setInterval(() => {
      setSubmitProgress(p => Math.min(95, p + Math.floor(Math.random() * 8) + 2));
    }, 400);
    try {
      // create inquiry
      const recipients = selectedResidents.slice(0, numParticipants).map(r => r.fullName || r.username);
      const recipientEmails = selectedResidents.slice(0, numParticipants).map(r => r.email).filter(Boolean);
      const payload = {
        subject: `Advanced Appointment (${selectedDates.join(',')})`,
        title: `Advanced Appointment`,
        message: `Advanced appointment scheduled via staff calendar.`,
        username: selectedResidents[0]?.username || 'staff',
        type: 'QUICK_APPOINTMENT',
        status: 'scheduled',
        recipients,
        recipientEmails,
        quick_appointment_type: 'advanced'
      } as any;
      const created = await contactAPI.submitInquiry(payload);
      if (!created || !created._id) { alert('Failed to create inquiry'); return; }

      // For each preview assignment, schedule by calling scheduleInquiry(created._id, [{date,startTime,endTime}])
      for (const a of preview) {
        try {
          await contactAPI.scheduleInquiry(created._id, [{ date: a.date, startTime: a.startTime, endTime: a.endTime }]);
        } catch (err) {
          console.warn('Failed scheduling one assignment', a, err);
        }
      }

      alert('Advanced appointments scheduled (partial failures may be in console).');
      onClose();
    } catch (err) {
      console.error('Failed to submit advanced appointment', err);
      alert('Failed to submit advanced appointment.');
    } finally { setSubmitting(false); }
    if (submitTimer.current) { clearInterval(submitTimer.current); submitTimer.current = null; }
    setSubmitProgress(100);
    setTimeout(() => setSubmitProgress(0), 600);
  };

  return (
    <Modal title="Advanced Appointment Options" open={visible} onCancel={onClose} footer={null} width={900}>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Select Dates (max {defaultMaxDates})</div>
          <Space style={{ marginBottom: 8 }}>
            <DatePicker onChange={addDate} disabledDate={(cur) => !cur || cur.isBefore(dayjs(), 'day') || cur.day() === 0 || cur.day() === 6} />
            <div>Selected: {selectedDates.length}</div>
          </Space>
          <List dataSource={selectedDates} renderItem={d => (
            <List.Item actions={[<a key="rm" onClick={() => removeDate(d)}>Remove</a>]}> <List.Item.Meta title={d} /></List.Item>
          )} style={{ maxHeight: 180, overflowY: 'auto' }} />

          <Divider />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Time Mode</div>
          <Radio.Group value={timeMode} onChange={e => setTimeMode(e.target.value)}>
            <Radio value="unified">Unified (same start/end for all dates)</Radio>
            <Radio value="individual">Individual per date</Radio>
          </Radio.Group>

          {timeMode === 'unified' ? (
            <Row gutter={8} style={{ marginTop: 8 }}>
              <Col span={12}><label>Start</label><Input type="time" value={unifiedStart} onChange={e => setUnifiedStart(e.target.value)} /></Col>
              <Col span={12}><label>End</label><Input type="time" value={unifiedEnd} onChange={e => setUnifiedEnd(e.target.value)} /></Col>
            </Row>
          ) : (
            <div style={{ marginTop: 8 }}>
              {selectedDates.map(ds => (
                <div key={ds} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ width: 110 }}>{ds}</div>
                  <Input type="time" style={{ width: 140 }} value={(perDateTimes[ds]?.start) || '08:00'} onChange={e => setPerDateTimes(p => ({ ...p, [ds]: { start: e.target.value, end: p[ds]?.end || '09:00' } }))} />
                  <Input type="time" style={{ width: 140 }} value={(perDateTimes[ds]?.end) || '09:00'} onChange={e => setPerDateTimes(p => ({ ...p, [ds]: { start: p[ds]?.start || '08:00', end: e.target.value } }))} />
                </div>
              ))}
            </div>
          )}

          <Divider />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Participants</div>
          <Row gutter={8} style={{ marginBottom: 8 }}>
            <Col span={8}><InputNumber min={1} max={1000} value={numParticipants} onChange={(v:any) => setNumParticipants(v || 1)} /></Col>
            <Col span={16}>
              <Button onClick={openResidentPicker}>Select Residents ({selectedResidents.length})</Button>
            </Col>
          </Row>

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Participant Distribution</div>
          <Radio.Group value={participantDistribution} onChange={e => setParticipantDistribution(e.target.value)}>
            <Radio value="all">All attend each day</Radio>
            <Radio value="balanced">Balanced clusters</Radio>
            <Radio value="manual">Manual clusters</Radio>
          </Radio.Group>

          {participantDistribution === 'manual' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Assign participants to dates</div>
              {selectedDates.map(ds => (
                <div key={ds} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{ds}</div>
                  <Select mode="multiple" style={{ width: '100%' }} placeholder="Select residents for this date" value={selectedResidents.filter((r:any) => r._assignedToDate === ds).map((r:any)=>r.username)} onChange={(vals:any) => {
                    // simple: no persistent per-date assignment state in this first iteration
                  }}>
                    {residentOptions.map(r => <Select.Option key={r.username} value={r.username}>{r.fullName || r.username}</Select.Option>)}
                  </Select>
                </div>
              ))}
            </div>
          )}

        </div>

        <div style={{ width: 420 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Interval Scheduling</div>
          <Radio.Group value={intervalMode} onChange={e => setIntervalMode(e.target.value)}>
            <Radio value="off">Off (everyone same start/end)</Radio>
            <Radio value="individual">Individual intervals (consecutive per participant)</Radio>
            <Radio value="multiples">Multiples of N (grouped bundles)</Radio>
          </Radio.Group>

          {intervalMode === 'individual' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 6 }}>Interval (minutes)</div>
              <InputNumber min={5} max={480} value={intervalMins} onChange={(v:any) => setIntervalMins(v || 30)} />
            </div>
          )}

          {intervalMode === 'multiples' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 6 }}>Bundle size (N)</div>
              <InputNumber min={1} max={100} value={multiplesOf} onChange={(v:any) => setMultiplesOf(v || 1)} />
              <div style={{ marginTop: 8 }}>Interval (minutes)</div>
              <InputNumber min={5} max={480} value={intervalMins} onChange={(v:any) => setIntervalMins(v || 30)} />
            </div>
          )}

          <Divider />

          <div style={{ fontWeight: 600, marginBottom: 8 }}>Preview</div>
          {previewProgress > 0 && previewProgress < 100 && (
            <div style={{ marginBottom: 8 }}>
              <Progress percent={previewProgress} showInfo={false} />
            </div>
          )}
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #eee', padding: 8 }}>
            {computingPreview ? <Spin /> : (
              preview.length ? (
                <List dataSource={preview} renderItem={p => (
                  <List.Item key={`${p.resident.username}-${p.date}`}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                      <div>{p.resident.fullName || p.resident.username} — {p.date}</div>
                      <div><Tag color="blue">{p.startTime} — {p.endTime}</Tag></div>
                    </div>
                  </List.Item>
                )} />
              ) : <div style={{ color: '#666' }}>No assignments computed yet</div>
            )}
          </div>

          {submitProgress > 0 && submitProgress < 100 && (
            <div style={{ marginBottom: 8 }}>
              <Progress percent={submitProgress} showInfo={false} />
            </div>
          )}
          <Space style={{ marginTop: 12 }}> 
            <Button onClick={computePreview}>Compute Preview</Button>
            <Button type="primary" loading={submitting} onClick={submit}>Submit Schedule</Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        </div>
      </div>

      <Modal title="Select Residents" open={residentPickerOpen} onCancel={() => setResidentPickerOpen(false)} footer={null} width={600}>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {loadingResidents ? <Spin /> : (
            <List dataSource={residentOptions} renderItem={(r: any) => (
              <List.Item onClick={() => {
                setSelectedResidents(s => {
                  if (s.some(x => x.username === r.username)) return s.filter(x => x.username !== r.username);
                  return [...s, r];
                });
              }} style={{ cursor: 'pointer' }}>
                <List.Item.Meta title={r.fullName || r.username} description={r.email} />
                {selectedResidents.some(x => x.username === r.username) && <Tag>Selected</Tag>}
              </List.Item>
            )} />
          )}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => {
              if (selectedResidents.length > numParticipants) {
                // Trim to allowed count and warn
                setSelectedResidents(s => s.slice(0, numParticipants));
                message.warning(`Selected more residents than participant count; trimmed to first ${numParticipants}.`);
              }
              setResidentPickerOpen(false);
            }}>Done ({selectedResidents.length})</Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};

export default AdvancedAppointmentModal;
