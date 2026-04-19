import React, { useEffect, useState } from 'react';
import { Modal, Button, Space, DatePicker, InputNumber, Radio, Input, List, Divider, Row, Col, Tag, Select, Spin, Progress, message, Switch, Steps, Card, TimePicker, Input as TextArea } from 'antd';
import { CloseOutlined, CheckCircleOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { isPhilippinesHoliday, PHILIPPINES_HOLIDAYS_2026 } from '../../utils/holidays';
import { contactAPI, residentsListAPI } from '../../services/api';
import ResidentSelectionModal from '../ResidentSelectionModal';
// appointment helpers not required in this modal

// Helpers (small duplicates of StaffCalendar utilities)
const toMinutes = (t: string) => {
  if (!t) return NaN;
  const [hh, mm] = t.split(':').map(s => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

// (helper functions and office ranges omitted in this modal)

type Resident = { 
  _id: string; 
  barangayID: string; 
  username?: string; 
  firstName: string; 
  middleName?: string; 
  lastName: string; 
  nameExtension?: string; 
  age?: number; 
  sex?: string; 
  civilStatus?: string; 
  nationality?: string; 
  religion?: string; 
  bloodType?: string; 
  disabilityStatus?: string; 
  occupation?: string; 
  educationalAttainment?: string; 
  dateOfResidency?: string; 
  businessName?: string; 
  email?: string; 
  contactNumber?: string; 
  address?: string; 
  profileImage?: string;
  // Legacy fields for compatibility
  fullName?: string; 
  residencyYears?: number; 
  disability?: string; 
  education?: string; 
  barangay?: string; 
  singleParent?: boolean; 
};

interface Assignment { resident: Resident; date: string; startTime: string; endTime: string }

// Philippines-specific options
const PHILIPPINE_OPTIONS = {
  civilStatus: ['Single', 'Married', 'Widowed', 'Separated', 'Live-in'],
  bloodType: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  education: ['No Formal Education', 'Elementary', 'High School', 'College Undergraduate', 'College Graduate', 'Vocational', 'Postgraduate'],
  occupation: ['Student', 'Employee', 'Self-Employed', 'Professional', 'Skilled Worker', 'Unskilled Worker', 'Agricultural Worker', 'Business Owner', 'Government Employee', 'Private Sector Employee', 'OFW', 'Retired', 'Unemployed'],
  nationality: ['Filipino', 'American', 'Chinese', 'Japanese', 'Korean', 'Indian', 'British', 'Australian', 'Canadian', 'Singaporean', 'Malaysian', 'Indonesian', 'Thai', 'Vietnamese'],
  religion: ['Roman Catholic', 'Islam', 'Iglesia ni Cristo', 'Protestant', 'Buddhist', 'Hindu', 'Atheist', 'Agnostic', 'Other Christian']
};

const AdvancedAppointmentModal = ({ visible, onClose, defaultMaxDates = 7 }: { visible: boolean; onClose: () => void; defaultMaxDates?: number }) => {
  const [selectedDates, setSelectedDates] = useState([] as string[]);
  const [timeMode, setTimeMode] = useState('unified' as 'unified' | 'individual');
  const [unifiedStart, setUnifiedStart] = useState('08:00');
  const [unifiedEnd, setUnifiedEnd] = useState('09:00');
  const [perDateTimes, setPerDateTimes] = useState({} as Record<string,{start:string;end:string}>);

  const [perDateAssignments, setPerDateAssignments] = useState({} as Record<string, string[]>);

  const [numParticipants, setNumParticipants] = useState(1);
  const [participantDistribution, setParticipantDistribution] = useState('manual' as 'all'|'balanced'|'manual');
  const [intervalMode, setIntervalMode] = useState('off' as 'off'|'individual'|'multiples');
  const [intervalMins, setIntervalMins] = useState(30);
  const [multiplesOf, setMultiplesOf] = useState(1);

  // New fields
  const [locationType, setLocationType] = useState('' as string);
  const [address, setAddress] = useState('' as string);
  const [description, setDescription] = useState('' as string);
  const [urgency, setUrgency] = useState('medium' as string);

  const [residentOptions, setResidentOptions] = useState([] as Resident[]);
  const [selectedResidents, setSelectedResidents] = useState([] as Resident[]);
  const [residentPickerOpen, setResidentPickerOpen] = useState(false);
  const [residentsSelectionMode, setResidentsSelectionMode] = useState('manual' as 'manual'|'auto');
  const [autoMethod, setAutoMethod] = useState('first' as 'first'|'random');
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [filteringModalOpen, setFilteringModalOpen] = useState(false);

  // Advanced filtering states
  const [filters, setFilters] = useState({
    sex: 'none' as 'male'|'female'|'none',
    ageRange: [18, 100] as [number, number],
    civilStatus: [] as string[],
    residencyYears: [0, 50] as [number, number],
    occupation: [] as string[],
    disability: [] as string[],
    bloodType: [] as string[],
    education: [] as string[],
    nationality: [] as string[],
    religion: [] as string[],
    singleParent: 'none' as 'none'|'yes'|'no'
  });
  const [filteredResidents, setFilteredResidents] = useState([] as Resident[]);

  const [loadingResidents, setLoadingResidents] = useState(false);
  const [preview, setPreview] = useState([] as Assignment[]);
  const [computingPreview, setComputingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [submitProgress, setSubmitProgress] = useState(0);
  const previewTimer = React.useRef(null as any);
  const submitTimer = React.useRef(null as any);
  // Staged progress configuration
  const STAGES = [
    { key: 'dates', label: 'Select Dates', weight: 10 },
    { key: 'times', label: 'Set Times', weight: 10 },
    { key: 'participants', label: 'Set Participants', weight: 10 },
    { key: 'residents', label: 'Select Residents', weight: 20 },
    { key: 'distribution', label: 'Assign Distribution', weight: 10 },
    { key: 'preview', label: 'Compute Preview', weight: 20 },
    { key: 'submit', label: 'Submit Scheduling', weight: 20 },
  ];

  const [stageProgresses, setStageProgresses] = useState(() => STAGES.reduce((acc, s) => { acc[s.key] = 0; return acc; }, {} as Record<string, number>));
  const [stageCompleted, setStageCompleted] = useState(() => STAGES.reduce((acc, s) => { acc[s.key] = false; return acc; }, {} as Record<string, boolean>));

  const setStageProgress = (key: string, pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    setStageProgresses(prev => ({ ...prev, [key]: clamped }));
    setStageCompleted(prev => ({ ...prev, [key]: clamped >= 100 }));
  };

  // Aggregated overall progress computed from stage weights and per-stage progress
  const overallProgress = STAGES.reduce((acc, s) => {
    const p = stageProgresses[s.key] ?? 0;
    return acc + (p / 100) * s.weight;
  }, 0);
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
      setPerDateAssignments({});
      setLocationType('');
      setAddress('');
      setDescription('');
      setUrgency('medium');
    }
  }, [visible]);

  // Keep per-date assignment keys in sync with selectedDates
  useEffect(() => {
    setPerDateAssignments(prev => {
      const next: Record<string,string[]> = {};
      for (const ds of selectedDates) {
        next[ds] = prev[ds] ? prev[ds].filter(Boolean) : [];
      }
      return next;
    });
  }, [selectedDates]);

  // When selectedResidents changes, remove any assignments that reference removed residents
  useEffect(() => {
    const usernames = new Set(selectedResidents.map(r => r.username));
    setPerDateAssignments(prev => {
      const next: Record<string,string[]> = {};
      for (const k of Object.keys(prev)) {
        next[k] = (prev[k] || []).filter(u => usernames.has(u));
      }
      return next;
    });
  }, [selectedResidents]);

  // Return residents available for assignment on a given date (exclude those already assigned to other dates)
  const getAvailableResidentsForDate = (ds: string) => {
    const assignedOthers = new Set<string>();
    for (const [k, arr] of Object.entries(perDateAssignments)) {
      if (k === ds) continue;
      (arr || []).forEach(u => assignedOthers.add(u));
    }
    const currentAssigned = new Set(perDateAssignments[ds] || []);
    return selectedResidents.slice(0, numParticipants).filter(r => !assignedOthers.has(r.username) || currentAssigned.has(r.username));
  };

  // Keep the participant count in sync with selected residents
  useEffect(() => {
    // NOTE: removed automatic syncing of participant count when selecting residents.
    // Participants number is now authoritative and selecting residents will not overwrite it.
  }, [selectedResidents, residentsSelectionMode]);

  // Helper: determine whether time settings are configured
  const isTimesConfigured = () => {
    if (timeMode === 'unified') {
      const s = toMinutes(unifiedStart);
      const e = toMinutes(unifiedEnd);
      return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
    }
    // individual per-date mode: ensure each selected date has a valid start/end
    if (!selectedDates || selectedDates.length === 0) return false;
    return selectedDates.every(ds => {
      const tm = perDateTimes[ds] || { start: unifiedStart, end: unifiedEnd };
      const s = toMinutes(tm.start);
      const e = toMinutes(tm.end);
      return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
    });
  };

  // Update stage progress from field changes
  useEffect(() => {
    setStageProgress('dates', selectedDates && selectedDates.length > 0 ? 100 : 0);
  }, [selectedDates]);

  useEffect(() => {
    setStageProgress('times', isTimesConfigured() ? 100 : 0);
  }, [timeMode, unifiedStart, unifiedEnd, perDateTimes, selectedDates]);

  useEffect(() => {
    setStageProgress('participants', (numParticipants && numParticipants > 0) ? 100 : 0);
  }, [numParticipants]);

  useEffect(() => {
    const pct = Math.min(100, Math.floor((selectedResidents.length / Math.max(1, numParticipants)) * 100));
    setStageProgress('residents', pct);
  }, [selectedResidents, numParticipants]);

  useEffect(() => {
    setStageProgress('distribution', (participantDistribution ? 100 : 0));
  }, [participantDistribution]);

  // Map existing preview and submit progress into stage progresses
  useEffect(() => {
    setStageProgress('preview', previewProgress);
  }, [previewProgress]);

  useEffect(() => {
    setStageProgress('submit', submitProgress);
  }, [submitProgress]);

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
      const residents = r || [];
      
      // Apply advanced filtering
      const filtered = residents.filter((resident: Resident) => {
        // Sex filter
        if (filters.sex !== 'none' && resident.sex !== filters.sex) {
          return false;
        }
        
        // Age filter
        if (resident.age && (resident.age < filters.ageRange[0] || resident.age > filters.ageRange[1])) {
          return false;
        }
        
        // Civil status filter
        if (filters.civilStatus.length > 0 && (!resident.civilStatus || !filters.civilStatus.includes(resident.civilStatus))) {
          return false;
        }
        
        // Residency years filter
        if (resident.residencyYears && (resident.residencyYears < filters.residencyYears[0] || resident.residencyYears > filters.residencyYears[1])) {
          return false;
        }
        
        // Occupation filter
        if (filters.occupation.length > 0 && (!resident.occupation || !filters.occupation.includes(resident.occupation))) {
          return false;
        }
        
        // Disability filter
        if (filters.disability.length > 0 && !filters.disability.includes('all')) {
          if (!resident.disability || !filters.disability.includes(resident.disability)) {
            return false;
          }
        }
        
        // Blood type filter
        if (filters.bloodType.length > 0 && (!resident.bloodType || !filters.bloodType.includes(resident.bloodType))) {
          return false;
        }
        
        // Education filter
        if (filters.education.length > 0 && (!resident.education || !filters.education.includes(resident.education))) {
          return false;
        }
        
        // Nationality filter
        if (filters.nationality.length > 0 && (!resident.nationality || !filters.nationality.includes(resident.nationality))) {
          return false;
        }
        
        // Religion filter
        if (filters.religion.length > 0 && (!resident.religion || !filters.religion.includes(resident.religion))) {
          return false;
        }
        
        // Single parent filter
        if (filters.singleParent !== 'none') {
          const isSingleParent = resident.singleParent === true;
          if (filters.singleParent === 'yes' && !isSingleParent) {
            return false;
          }
          if (filters.singleParent === 'no' && isSingleParent) {
            return false;
          }
        }
        
        return true;
      });
      
      setResidentOptions(residents);
      setFilteredResidents(filtered);
    } catch (err) {
      setResidentOptions([]);
      setFilteredResidents([]);
    } finally { setLoadingResidents(false); }
  };

  const openResidentPicker = async () => {
    await fetchResidents();
    setResidentPickerOpen(true);
  };

  const formatHM = (minutes: number) => {
    const hh = Math.floor(minutes/60);
    const mm = minutes % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };

  /** Synchronous schedule builder (also used on submit so we do not rely on async preview state). */
  const buildPreviewAssignments = (participantOverride?: number): Assignment[] => {
    const np = participantOverride ?? numParticipants;
    if (!selectedDates.length || selectedResidents.length < 1) return [];

    const windows: {date:string; start:number; end:number}[] = selectedDates.map(ds => {
      const tm = timeMode === 'unified' ? { start: unifiedStart, end: unifiedEnd } : perDateTimes[ds] || { start: unifiedStart, end: unifiedEnd };
      return { date: ds, start: toMinutes(tm.start), end: toMinutes(tm.end) };
    });

    const assignments: Assignment[] = [];
    const residents = [...selectedResidents].slice(0, np);

    const residentMap: Record<string, Resident> = {};
    for (const r of residents) residentMap[r.username] = r;

    const assignedToDate: Record<string, string[]> = {};
    for (const w of windows) {
      assignedToDate[w.date] = (perDateAssignments[w.date] || []).filter(u => !!residentMap[u]);
    }

    const explicitlyAssigned = new Set(Object.values(assignedToDate).flat());
    const unassigned = residents.filter(r => !explicitlyAssigned.has(r.username));
    for (let i=0;i<unassigned.length;i++) {
      const w = windows[i % windows.length];
      assignedToDate[w.date].push(unassigned[i].username);
    }

    if (intervalMode === 'off') {
      if (participantDistribution === 'all') {
        for (const d of windows) {
          for (const r of residents) assignments.push({ resident: r, date: d.date, startTime: formatHM(d.start), endTime: formatHM(d.end) });
        }
      } else if (participantDistribution === 'balanced') {
        let idx = 0;
        for (const r of residents) {
          const d = windows[idx % windows.length];
          assignments.push({ resident: r, date: d.date, startTime: formatHM(d.start), endTime: formatHM(d.end) });
          idx++;
        }
      } else {
        for (const d of windows) {
          const usernames = assignedToDate[d.date] || [];
          for (const uname of usernames) {
            const r = residentMap[uname];
            if (r) assignments.push({ resident: r, date: d.date, startTime: formatHM(d.start), endTime: formatHM(d.end) });
          }
        }
      }
    } else if (intervalMode === 'individual') {
      if (participantDistribution === 'manual') {
        for (const d of windows) {
          let cursor = d.start;
          const usernames = assignedToDate[d.date] || [];
          for (const uname of usernames) {
            if (cursor + intervalMins > d.end) break;
            if (cursor >= 12*60 && cursor < 13*60) cursor = 13*60;
            const r = residentMap[uname];
            if (!r) continue;
            assignments.push({ resident: r, date: d.date, startTime: formatHM(cursor), endTime: formatHM(cursor + intervalMins) });
            cursor += intervalMins;
          }
        }
      } else {
        let resIdx = 0;
        for (const d of windows) {
          let cursor = d.start;
          while (cursor + intervalMins <= d.end && resIdx < residents.length) {
            if (cursor >= 12*60 && cursor < 13*60) cursor = 13*60;
            if (cursor + intervalMins > d.end) break;
            const r = residents[resIdx];
            assignments.push({ resident: r, date: d.date, startTime: formatHM(cursor), endTime: formatHM(cursor + intervalMins) });
            cursor += intervalMins;
            resIdx++;
          }
        }
      }
    } else if (intervalMode === 'multiples') {
      if (participantDistribution === 'manual') {
        for (const d of windows) {
          const usernames = assignedToDate[d.date] || [];
          const bundles: string[][] = [];
          for (let i=0;i<usernames.length;i+=multiplesOf) bundles.push(usernames.slice(i,i+multiplesOf));
          let cursor = d.start;
          let bundleIdx = 0;
          while (cursor < d.end && bundleIdx < bundles.length) {
            if (cursor >= 12*60 && cursor < 13*60) cursor = 13*60;
            const start = cursor;
            const end = cursor + intervalMins;
            if (end > d.end) break;
            const bundle = bundles[bundleIdx];
            for (const uname of bundle) {
              const r = residentMap[uname];
              if (r) assignments.push({ resident: r, date: d.date, startTime: formatHM(start), endTime: formatHM(end) });
            }
            cursor = end;
            bundleIdx++;
          }
        }
      } else {
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
    }

    return assignments;
  };

  // compute preview schedule based on mode + interval settings
  const computePreview = async () => {
    let participantCount = numParticipants;
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
      if (!proceed) return;
      participantCount = selectedResidents.length;
    }

    setComputingPreview(true);
    setPreviewProgress(1);
    if (previewTimer.current) clearInterval(previewTimer.current);
    previewTimer.current = setInterval(() => {
      setPreviewProgress(p => Math.min(95, p + Math.floor(Math.random() * 10) + 5));
    }, 300);
    try {
      const assignments = buildPreviewAssignments(participantCount);
      setPreview(assignments);
    } finally {
      setComputingPreview(false);
      if (previewTimer.current) { clearInterval(previewTimer.current); previewTimer.current = null; }
      setPreviewProgress(100);
      setTimeout(() => setPreviewProgress(0), 600);
    }
  };

  const submit = async () => {
    if (!selectedDates.length) { alert('Please select at least one date.'); return; }
    if (!selectedResidents.length) { alert('Please select participants.'); return; }
    let participantCount = numParticipants;
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
      if (!proceed) return;
      participantCount = selectedResidents.length;
    }

    const assignments = buildPreviewAssignments(participantCount);
    if (!assignments.length) { if (!window.confirm('No computed assignments. Continue?')) return; }

    setSubmitting(true);
    setSubmitProgress(1);
    if (submitTimer.current) clearInterval(submitTimer.current);
    submitTimer.current = setInterval(() => {
      setSubmitProgress(p => Math.min(95, p + Math.floor(Math.random() * 8) + 2));
    }, 400);
    try {
      const slice = selectedResidents.slice(0, participantCount);
      const recipients = slice.map((r: any) => {
        const label = (r.fullName || r.username || '').toString().trim();
        return r.barangayID ? `${label}(${r.barangayID})` : label;
      });
      const recipientEmails = slice.map((r: any) => r.email).filter(Boolean);
      const payload = {
        subject: `Advanced Appointment (${selectedDates.join(',')})`,
        title: `Advanced Appointment`,
        message: `Advanced appointment scheduled via staff calendar (multi-slot).`,
        username: selectedResidents[0]?.username || 'staff',
        type: 'QUICK_APPOINTMENT',
        status: 'open',
        recipients,
        recipientEmails,
        quick_appointment_type: 'advanced',
        locationType,
        address,
        description,
        urgency,
      } as any;
      const created = await contactAPI.submitInquiry(payload);
      if (!created || !created._id) { alert('Failed to create inquiry'); return; }

      // Group assignments by date/start/end so assignedUsernames is an array per timeslot
      const grouped = new Map<string, { date: string; startTime: string; endTime: string; assignedUsernames: string[] }>();
      for (const a of assignments) {
        const key = `${a.date}|${a.startTime}|${a.endTime}`;
        if (!grouped.has(key)) grouped.set(key, { date: a.date, startTime: a.startTime, endTime: a.endTime, assignedUsernames: [] });
        const entry = grouped.get(key)!;
        const uname = a.resident?.username;
        if (uname && !entry.assignedUsernames.includes(uname)) entry.assignedUsernames.push(uname);
      }
      const scheduledDates = Array.from(grouped.values());

      // Client-side validation: ensure each scheduled slot has valid times and within office hours
      const OFFICE_START = 8 * 60; // 08:00
      const OFFICE_MID = 12 * 60; // 12:00
      const OFFICE_MID_END = 13 * 60; // 13:00
      const OFFICE_END = 17 * 60; // 17:00
      for (const sd of scheduledDates) {
        const s = toMinutes(sd.startTime);
        const e = toMinutes(sd.endTime);
        if (Number.isNaN(s) || Number.isNaN(e) || s >= e) {
          message.error('Start time must be earlier than end time');
          return;
        }
        const withinMorning = s >= OFFICE_START && e <= OFFICE_MID;
        const withinAfternoon = s >= OFFICE_MID_END && e <= OFFICE_END;
        if (!(withinMorning || withinAfternoon)) {
          message.error('Selected time is outside office hours (08:00-12:00 or 13:00-17:00)');
          return;
        }
      }

      const schedulingOptions: Record<string, unknown> = {
        // map local intervalMode into schedulingOptions.mode expected by server
        mode: intervalMode,
        participants: participantCount,
        timeMode,
        participantDistribution,
        intervalMode,
        intervalMins,
        multiplesOf,
        participantCount,
        selectedDates: [...selectedDates].sort(),
        unifiedStart,
        unifiedEnd,
        ...(timeMode === 'individual' ? { perDateTimes: { ...perDateTimes } } : {}),
        ...(participantDistribution === 'manual' ? { perDateAssignments: { ...perDateAssignments } } : {}),
        residentsSelectionMode,
        autoMethod,
        locationType,
        address,
        description,
        urgency,
      };

      try {
        await contactAPI.scheduleInquiry(String(created._id), scheduledDates, schedulingOptions);
      } catch (err: any) {
        console.error('Schedule API error', err?.response || err);
        const msg = err?.response?.data?.message || err?.message || 'Failed to schedule appointments';
        message.error(msg);
        return;
      }
      setPreview(assignments);
      message.success('Advanced appointments scheduled.');
      onClose();
    } catch (err) {
      console.error('Failed to submit advanced appointment', err);
      message.error('Failed to submit advanced appointment.');
    } finally { setSubmitting(false); }
    if (submitTimer.current) { clearInterval(submitTimer.current); submitTimer.current = null; }
    setSubmitProgress(100);
    setTimeout(() => setSubmitProgress(0), 600);
  };

  const handleAutoSelect = async () => {
    setAutoSelecting(true);
    try {
      // Ensure resident options are loaded
      if (!filteredResidents || filteredResidents.length === 0) await fetchResidents();
      const options = filteredResidents || [];
      const available = options.length;
      if (available === 0) {
        message.warning('No residents available to select from');
        return;
      }
      const toSelect = Math.min(numParticipants, available);
      const pickCount = autoMethod === 'first' ? toSelect : Math.min(numParticipants, Math.floor(available / 2));
      const shuffled = [...options].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, pickCount);
      setSelectedResidents(selected);
      message.success(`Auto-selected ${selected.length} resident(s)`);
    } catch (err) {
      console.error('Auto-select failed', err);
      message.error('Failed to auto-select residents');
    } finally {
      setAutoSelecting(false);
    }
  };

  const handleResidentPickerDone = () => {
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
  };

  const stepIndex = STAGES.findIndex(s => !stageCompleted[s.key]);
  const currentStep = stepIndex === -1 ? Math.max(0, STAGES.length - 1) : stepIndex;

  return (
    <Modal title="Advanced Appointment Options" open={visible} onCancel={onClose} footer={null} width={900}>
      <div style={{ margin: '8px 0 12px 0' }}>
        <style>{`.advanced-steps-wrapper{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;-ms-overflow-style:none;scrollbar-width:none}.advanced-steps-wrapper::-webkit-scrollbar{display:none;height:0}.advanced-steps .ant-steps-item{flex:0 0 auto}.advanced-steps .ant-steps-item-title{white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;font-size:12px}.advanced-steps .ant-steps-item-icon{min-width:28px}`}</style>
        <div className="advanced-steps-wrapper">
          <Steps className="advanced-steps" current={currentStep} size="small" style={{ marginBottom: 8 }}>
            {STAGES.map(s => (<Steps.Step key={s.key} title={s.label} />))}
          </Steps>
        </div>
        <Progress percent={Math.round(overallProgress)} showInfo={false} strokeWidth={6} />
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <Card bordered={false} bodyStyle={{ padding: 16 }} style={{ flex: 1 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Select Dates (max {defaultMaxDates})</div>
          <Space style={{ marginBottom: 8 }}>
            <DatePicker onChange={addDate} disabledDate={(cur) => !cur || cur.isBefore(dayjs(), 'day') || cur.day() === 0 || cur.day() === 6 || isPhilippinesHoliday(cur)} />
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
              <Button onClick={openResidentPicker}>Select Residents ({selectedResidents.length})</Button>
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
                    value={perDateAssignments[ds] || []}
                    onChange={(vals:any) => {
                      setPerDateAssignments(prev => {
                        const next: Record<string,string[]> = {};
                        // copy and remove these vals from other dates to keep exclusivity
                        for (const k of Object.keys(prev)) {
                          next[k] = (prev[k] || []).filter(u => !vals.includes(u));
                        }
                        next[ds] = vals;
                        return next;
                      });
                    }}
                  >
                    {getAvailableResidentsForDate(ds).map(r => (
                      <Select.Option key={r.username} value={r.username}>{r.fullName || r.username}</Select.Option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          )}

        </Card>

        <Card bordered={false} bodyStyle={{ padding: 16 }} style={{ width: 420 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Location Type</div>
          <Select
            style={{ width: '100%', marginBottom: 16 }}
            placeholder="Select location type"
            value={locationType || undefined}
            onChange={(val) => setLocationType(val)}
            options={[
              { label: 'Office', value: 'office' },
              { label: 'Virtual', value: 'virtual' },
              { label: 'Home', value: 'home' },
              { label: 'Hybrid', value: 'hybrid' },
              { label: 'Other', value: 'other' },
            ]}
          />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Address/Location</div>
          <Input
            placeholder="Enter address or location details"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ marginBottom: 16 }}
          />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Description</div>
          <Input.TextArea
            placeholder="Enter appointment description or notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ marginBottom: 16 }}
          />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>Urgency</div>
          <Select
            style={{ width: '100%', marginBottom: 16 }}
            value={urgency}
            onChange={(val) => setUrgency(val)}
            options={[
              { label: 'Low', value: 'low' },
              { label: 'Medium', value: 'medium' },
              { label: 'High', value: 'high' },
              { label: 'Critical', value: 'critical' },
            ]}
          />

          <Divider />

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
        </Card>
      </div>

      <ResidentSelectionModal
        visible={residentPickerOpen}
        onClose={() => setResidentPickerOpen(false)}
        onResidentSelect={(residents) => {
          if (Array.isArray(residents)) {
            setSelectedResidents(residents);
          } else {
            // Handle single selection
            setSelectedResidents([residents]);
          }
        }}
        title="Select Residents for Appointment"
        multiSelect={numParticipants > 1}
        selectedResidents={selectedResidents}
      />
    </Modal>
  );
};

export default AdvancedAppointmentModal;
