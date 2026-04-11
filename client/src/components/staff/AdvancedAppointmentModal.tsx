import React, { useEffect, useState } from 'react';
import { Modal, Button, Space, DatePicker, InputNumber, Radio, Input, List, Divider, Row, Col, Tag, Select, Spin, Progress, message, Switch } from 'antd';
import dayjs from 'dayjs';
import { contactAPI, residentsListAPI } from '../../services/api';
// appointment helpers not required in this modal

// Helpers (small duplicates of StaffCalendar utilities)
const toMinutes = (t: string) => {
  if (!t) return NaN;
  const [hh, mm] = t.split(':').map(s => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

// (helper functions and office ranges omitted in this modal)

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
  const [residentsSelectionMode, setResidentsSelectionMode] = useState('manual' as 'manual'|'auto');
  const [autoMethod, setAutoMethod] = useState('first' as 'first'|'random');
  const [autoSelecting, setAutoSelecting] = useState(false);

  const [loadingResidents, setLoadingResidents] = useState(false);
  const [preview, setPreview] = useState([] as Assignment[]);
  const [computingPreview, setComputingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [submitProgress, setSubmitProgress] = useState(0);
  const previewTimer = React.useRef(null as any);
  const submitTimer = React.useRef(null as any);
  const overallProgress = computingPreview ? previewProgress : (submitting ? submitProgress : 0);
  const timeModeTitle = timeMode === 'unified' ? 'Unified (same start/end for all dates)' : 'Individual per date';
  const timeModeHint = timeMode === 'unified' ? 'Toggle to switch to Individual per date' : 'Toggle to switch to Unified (same start/end for all dates)';

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

  // Keep the participant count in sync with selected residents
  useEffect(() => {
    // NOTE: removed automatic syncing of participant count when selecting residents.
    // Participants number is now authoritative and selecting residents will not overwrite it.
  }, [selectedResidents, residentsSelectionMode]);

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

  const handleAutoSelect = async () => {
    setAutoSelecting(true);
    try {
      // Ensure resident options are loaded
      if (!residentOptions || residentOptions.length === 0) await fetchResidents();
      const options = residentOptions || [];
      const available = options.length;
      if (available === 0) {
        message.warning('No residents available to auto-select');
        return;
      }
      const desired = Math.max(1, Math.floor(Number(numParticipants) || 1));
      const pickCount = Math.min(desired, available);
      let selected: Resident[] = [];
      if (autoMethod === 'first') {
        selected = options.slice(0, pickCount);
      } else {
        // random selection
        const shuffled = [...options].sort(() => Math.random() - 0.5);
        selected = shuffled.slice(0, pickCount);
      }
      setSelectedResidents(selected);
      if (pickCount < desired) message.warning(`Only ${available} residents available; selected ${pickCount}.`);
      // Update participants count to reflect actual selected count
      setNumParticipants(pickCount);
    } catch (err) {
      console.error('Auto-select failed', err);
      message.error('Failed to auto-select residents');
    } finally {
      setAutoSelecting(false);
    }
  };

  // compute preview schedule based on mode + interval settings
  const computePreview = async () => {
    // If in manual mode, ensure selected residents match participant count
    if (residentsSelectionMode === 'manual' && selectedResidents.length < numParticipants) {
      const proceed = await new Promise((resolve: (v: boolean) => void) => {
        Modal.confirm({
          title: 'Selected residents do not match participant count',
          content: `You set Participants = ${numParticipants} but selected only ${selectedResidents.length} residents. Adjust participants to ${selectedResidents.length}?`,
          okText: `Adjust to ${selectedResidents.length}`,
          cancelText: 'Cancel',
          onOk: () => { setNumParticipants(selectedResidents.length); resolve(true); },
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) return; // user cancelled — abort preview
    }

    setComputingPreview(true);
    setPreviewProgress(1);
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
    // If in manual mode and selected residents fewer than participants, confirm with user
    if (residentsSelectionMode === 'manual' && selectedResidents.length < numParticipants) {
      const proceed = await new Promise((resolve: (v: boolean) => void) => {
        Modal.confirm({
          title: 'Selected residents do not match participant count',
          content: `You set Participants = ${numParticipants} but selected only ${selectedResidents.length} residents. Adjust participants to ${selectedResidents.length}?`,
          okText: `Adjust to ${selectedResidents.length}`,
          cancelText: 'Cancel',
          onOk: () => { setNumParticipants(selectedResidents.length); resolve(true); },
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) return; // user cancelled submission
    }
    // recompute preview to ensure assigned
    await computePreview();
    if (!preview.length) { if (!window.confirm('No computed assignments. Continue?')) return; }

    setSubmitting(true);
    setSubmitProgress(1);
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
      {overallProgress > 0 && overallProgress < 100 && (
        <div style={{ margin: '8px 0 12px 0' }}>
          <Progress percent={overallProgress} showInfo={false} strokeWidth={6} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Select Dates (max {defaultMaxDates})</div>
          <Space style={{ marginBottom: 8 }}>
            <DatePicker onChange={addDate} disabledDate={(cur) => !cur || cur.isBefore(dayjs(), 'day') || cur.day() === 0 || cur.day() === 6} />
            <div>Selected: {selectedDates.length}</div>
          </Space>
          <div style={{ minHeight: 56, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {selectedDates.length === 0 ? (
              <div style={{ textAlign: 'center', width: '100%', color: '#999' }}>
                <div style={{ height: 36 }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedDates.map(ds => (
                  <Tag key={ds} closable onClose={() => removeDate(ds)}>{ds}</Tag>
                ))}
              </div>
            )}
          </div>

          <Divider />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Time Mode</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{timeModeTitle}</div>
              <div style={{ color: '#666', fontSize: 12 }}>{timeModeHint}</div>
            </div>
            <Switch checked={timeMode === 'individual'} onChange={(checked) => setTimeMode(checked ? 'individual' : 'unified')} checkedChildren="Individual" unCheckedChildren="Unified" />
          </div>

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
          <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <InputNumber style={{ width: 140 }} min={1} max={1000} value={numParticipants} onChange={(v:any) => setNumParticipants(v || 1)} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Radio.Group value={residentsSelectionMode} onChange={(e) => setResidentsSelectionMode(e.target.value)}>
                <Radio value="manual">Manual</Radio>
                <Radio value="auto">Auto</Radio>
              </Radio.Group>
              {residentsSelectionMode === 'manual' ? (
                <Button onClick={openResidentPicker}>Select Residents ({selectedResidents.length})</Button>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Select value={autoMethod} onChange={(v:any) => setAutoMethod(v)} style={{ width: 150 }} options={[{ label: 'First N', value: 'first' }, { label: 'Random N', value: 'random' }]} />
                  <Button loading={autoSelecting} onClick={handleAutoSelect}>Auto Select</Button>
                  <Button onClick={() => { setSelectedResidents([]); message.info('Cleared selected residents'); }}>Clear</Button>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Participant Distribution</div>
          <Radio.Group value={participantDistribution} onChange={e => setParticipantDistribution(e.target.value)}>
            <Radio value="all">All attend each day</Radio>
            <Radio value="balanced">Balanced clusters</Radio>
            <Radio value="manual">Manual clusters</Radio>
          </Radio.Group>

          {participantDistribution === 'manual' && selectedDates.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Assign participants to dates</div>
              {selectedDates.map(ds => (
                <div key={ds} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{ds}</div>
                  <Select
                    mode="multiple"
                    style={{ width: '100%' }}
                    placeholder={selectedResidents.length === 0 ? 'Select residents first' : 'Select residents for this date'}
                    disabled={selectedResidents.length === 0}
                    value={selectedResidents.filter((r:any) => r._assignedToDate === ds).map((r:any)=>r.username)}
                    onChange={(vals:any) => {
                      // simple: no persistent per-date assignment state in this first iteration
                    }}
                  >
                    {selectedResidents.slice(0, numParticipants).map(r => (
                      <Select.Option key={r.username} value={r.username}>{r.fullName || r.username}</Select.Option>
                    ))}
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
                setResidentPickerOpen(false);
                return;
              }
              if (residentsSelectionMode === 'manual' && selectedResidents.length < numParticipants) {
                // Warn the staff that selected residents are fewer than the entered participants.
                // Do NOT close the resident picker so they can select more residents.
                Modal.confirm({
                  title: 'Selected residents do not match participant count',
                  content: `You set Participants = ${numParticipants} but selected only ${selectedResidents.length} residents. Please select additional residents or adjust the Participants number.`,
                  okText: 'Select more',
                  cancelText: `Adjust to ${selectedResidents.length}`,
                  onOk: () => {
                    // keep resident picker open for further selection
                  },
                  onCancel: () => {
                    // adjust participants to the number actually selected and close picker
                    setNumParticipants(selectedResidents.length);
                    setResidentPickerOpen(false);
                  }
                });
                return;
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
