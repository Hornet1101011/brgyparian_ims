import React, { useMemo, useState } from 'react';
import { TimePicker, Row, Col, Typography, Tooltip } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { Text } = Typography;

type Props = {
  date: string; // YYYY-MM-DD
  existingRanges?: Array<{ start: string; end: string; inquiryId?: string; residentUsername?: string; residentName?: string }>; // times as HH:mm
  onChange: (start?: string, end?: string) => void;
};

// Convert HH:mm to minutes since midnight
const toMinutes = (t: string) => {
  const [hh, mm] = String(t || '').split(':').map(x => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

const TimeRangeSelector: React.FC<Props> = ({ date, existingRanges = [], onChange }) => {
  const [start, setStart] = useState<Dayjs | null>(null);
  const [end, setEnd] = useState<Dayjs | null>(null);

  // build minute-level blocks
  const blocks = useMemo(() => {
    return existingRanges.map(r => {
      const s = toMinutes(r.start);
      const e = toMinutes(r.end);
      if (Number.isNaN(s) || Number.isNaN(e)) return null;
      return { start: s, end: e, meta: { inquiryId: r.inquiryId, residentUsername: r.residentUsername, residentName: r.residentName } };
    }).filter(Boolean) as Array<{ start: number; end: number; meta?: any }>;
  }, [existingRanges]);

  const OFFICE_START = 8 * 60; // 480
  const OFFICE_END = 17 * 60; // 1020
  const LUNCH_START = 12 * 60; // 720
  const LUNCH_END = 13 * 60; // 780

  // disabledHours: block hours outside office window entirely
  const disabledHours = () => {
    const arr: number[] = [];
    for (let h = 0; h < 24; h++) {
      const hStart = h * 60;
      const hEnd = hStart + 59;
      if (hEnd < OFFICE_START || hStart >= OFFICE_END) arr.push(h);
    }
    return arr;
  };

  // disabledMinutes: for a given hour, disable minutes that fall inside any blocked range or lunch
  const disabledMinutesForHour = (hour: number) => {
    const mins: number[] = [];
    for (let m = 0; m < 60; m++) {
      const abs = hour * 60 + m;
      // outside office
      if (abs < OFFICE_START || abs >= OFFICE_END) { mins.push(m); continue; }
      // lunch
      if (abs >= LUNCH_START && abs < LUNCH_END) { mins.push(m); continue; }
      // if within any existing block, disable
      for (const b of blocks) {
        if (abs >= b.start && abs < b.end) { mins.push(m); break; }
      }
    }
    return mins;
  };

  const onStartChange = (val?: Dayjs | null) => {
    setStart(val || null);
    const s = val ? val.format('HH:mm') : undefined;
    const e = end ? end.format('HH:mm') : undefined;
    onChange(s, e);
  };
  const onEndChange = (val?: Dayjs | null) => {
    setEnd(val || null);
    const s = start ? start.format('HH:mm') : undefined;
    const e = val ? val.format('HH:mm') : undefined;
    onChange(s, e);
  };

  // timeline rendering: visualizes office window 8:00-17:00 and blocked ranges
  const timelineSegments = useMemo(() => {
    // Each segment as percentage of office window
    const total = OFFICE_END - OFFICE_START;
    return blocks.map(b => {
      const left = Math.max(0, ((b.start - OFFICE_START) / total) * 100);
      const width = Math.max(0, ((Math.min(b.end, OFFICE_END) - Math.max(b.start, OFFICE_START)) / total) * 100);
      return { left, width, start: b.start, end: b.end, meta: (b as any).meta };
    });
  }, [blocks]);

  return (
    <div>
      <Row gutter={12} align="middle">
        <Col>
          <Text strong>Start</Text>
          <div>
            <TimePicker
              value={start as any}
              onChange={onStartChange}
              format="HH:mm"
              disabledHours={disabledHours}
              disabledMinutes={(hour) => disabledMinutesForHour(hour)}
              minuteStep={5}
            />
          </div>
        </Col>
        <Col>
          <Text strong>End</Text>
          <div>
            <TimePicker
              value={end as any}
              onChange={onEndChange}
              format="HH:mm"
              disabledHours={disabledHours}
              disabledMinutes={(hour) => disabledMinutesForHour(hour)}
              minuteStep={5}
            />
          </div>
        </Col>
      </Row>
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 10, background: '#f0f0f0', position: 'relative', borderRadius: 4 }}>
          {timelineSegments.map((s, i) => (
            <Tooltip key={i} title={<div style={{ fontSize: 12 }}>{s.meta?.residentName ? `${s.meta.residentName}` : 'Booked'}<div style={{ fontSize: 11, color: '#999' }}>{`${Math.floor(s.start/60).toString().padStart(2,'0')}:${(s.start%60).toString().padStart(2,'0')} - ${Math.floor(s.end/60).toString().padStart(2,'0')}:${(s.end%60).toString().padStart(2,'0')}`}</div></div>} mouseEnterDelay={0.1} mouseLeaveDelay={0.1} trigger={['hover','click']}>
              <div
                style={{ position: 'absolute', left: `${s.left}%`, width: `${s.width}%`, top: 0, bottom: 0, background: 'rgba(110,110,110,0.8)', borderRadius: 4 }} />
            </Tooltip>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
          <span style={{ marginRight: 12 }}>Office hours: 08:00–17:00</span>
          <span style={{ marginRight: 12 }}>Lunch: 12:00–13:00</span>
          <span>Blocked intervals shown in gray</span>
        </div>
      </div>
    </div>
  );
};

export default TimeRangeSelector;
