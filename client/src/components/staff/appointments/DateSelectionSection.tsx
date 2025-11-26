import React from 'react';
import { Checkbox, Select } from 'antd';
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
  const toggleDate = (date: string, checked: boolean) => {
    if (checked) {
      if (maxToSchedule > 0 && selectedDates.length >= maxToSchedule) return;
      setSelectedDates([...selectedDates, date]);
    } else {
      setSelectedDates(selectedDates.filter(d => d !== date));
    }
  };

  return (
    <div>
      {requestedDates.length === 0 && <div>No dates requested</div>}
      {requestedDates.map((d: string) => (
        <div key={d} className="dateRow">
          <Checkbox onChange={(e) => toggleDate(d, e.target.checked)} checked={selectedDates.includes(d)}>{dayjs(d).format('MMM DD, YYYY')}</Checkbox>
          {selectedDates.includes(d) && (
            <div className="dateSelectionInner">
              <TimeRangeSelector
                date={d}
                existingRanges={existingScheduledByDate[d] || []}
                onChange={(s, e) => updateTimeRange(d, s, e)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default DateSelectionSection;
