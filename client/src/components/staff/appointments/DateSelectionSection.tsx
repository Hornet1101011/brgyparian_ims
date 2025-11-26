import React, { useEffect, useState } from 'react';
import { Checkbox, Select, Tooltip, Tag } from 'antd';
import appointmentsAPI from '../../../api/appointments';
import dayjs from 'dayjs';
import TimeRangeSelector from '../../TimeRangeSelector';
import type { ExistingRange } from './utils';
import type { TimeRange } from '../../../types/appointments';

type Props = {
  requestedDates: string[];
  maxToSchedule: number;
  selectedDates: string[];
  setSelectedDates: (vals: string[]) => void;
  timeRanges: Record<string, TimeRange>;
  updateTimeRange: (date: string, start?: string, end?: string) => void;
  existingScheduledByDate: Record<string, ExistingRange[]>;
};

const DateSelectionSection: React.FC<Props> = ({ requestedDates, maxToSchedule, selectedDates, setSelectedDates, timeRanges, updateTimeRange, existingScheduledByDate }) => {
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Array<{ startTime: string; endTime: string; residentName?: string }>>>({});
  const [statusByDate, setStatusByDate] = useState<Record<string, 'Available'|'Partially Booked'|'Fully Booked'>>({});

  const OFFICE_START = 8 * 60;
  const OFFICE_END = 17 * 60;
  const LUNCH_MIN = 60; // lunch duration minutes

  const computeStatus = (date: string, slots: Array<any>) => {
    // compute total booked minutes
    let booked = 0;
    for (const s of slots) {
      const [sh, sm] = s.startTime.split(':').map((x:any)=>parseInt(x,10));
      const [eh, em] = s.endTime.split(':').map((x:any)=>parseInt(x,10));
      const sMin = sh*60 + sm; const eMin = eh*60 + em;
      booked += Math.max(0, eMin - sMin);
    }
    const total = (OFFICE_END - OFFICE_START) - LUNCH_MIN;
    if (booked === 0) return 'Available';
    if (booked >= total) return 'Fully Booked';
    return 'Partially Booked';
  };

  const fetchSlotsForDate = async (date: string) => {
    try {
      const resp = await appointmentsAPI.getSlotsByDate(date);
      const slots = (resp && resp.slots) ? resp.slots : [];
      setSlotsByDate(prev => ({ ...prev, [date]: slots }));
      setStatusByDate(prev => ({ ...prev, [date]: computeStatus(date, slots) }));
    } catch (e) {
      console.warn('Failed to fetch slots for date', date, e);
    }
  };
  const toggleDate = (date: string, checked: boolean) => {
    if (checked) {
      if (maxToSchedule > 0 && selectedDates.length >= maxToSchedule) return;
      // if fully booked, prevent selection
      if (statusByDate[date] === 'Fully Booked') return;
      setSelectedDates([...selectedDates, date]);
      // fetch slots for date to show blocked times
      if (!slotsByDate[date]) fetchSlotsForDate(date);
    } else {
      setSelectedDates(selectedDates.filter(d => d !== date));
    }
  };

  return (
    <div>
      {requestedDates.length === 0 && <div>No dates requested</div>}
      {requestedDates.map((d: string) => (
        <div key={d} className="dateRow">
          <Checkbox onChange={(e) => toggleDate(d, e.target.checked)} checked={selectedDates.includes(d)} disabled={statusByDate[d] === 'Fully Booked'}>
            {dayjs(d).format('MMM DD, YYYY')}
          </Checkbox>
          <span style={{ marginLeft: 8 }}>
            {statusByDate[d] === 'Available' && <Tag color="green">Available</Tag>}
            {statusByDate[d] === 'Partially Booked' && <Tag color="orange">Partially Booked</Tag>}
            {statusByDate[d] === 'Fully Booked' && <Tag color="default">Fully Booked</Tag>}
          </span>
          {selectedDates.includes(d) && (
            <div className="dateSelectionInner">
              <TimeRangeSelector
                date={d}
                existingRanges={[...(existingScheduledByDate[d] || []), ...(slotsByDate[d] || [])]}
                onChange={(s, e) => {
                  // local validation: prevent choosing ranges overlapping server slots
                  const serverSlots = slotsByDate[d] || [];
                  if (s && e) {
                    const toMin = (t: string) => { const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); return hh*60+mm; };
                    const sMin = toMin(s); const eMin = toMin(e);
                    for (const ss of serverSlots) {
                      const ssMin = toMin(ss.startTime); const seMin = toMin(ss.endTime);
                      if (sMin < seMin && ssMin < eMin) {
                        // overlap - reject silently (caller will see availability error)
                        return;
                      }
                    }
                  }
                  updateTimeRange(d, s, e);
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default DateSelectionSection;
