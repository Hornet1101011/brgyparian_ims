import React from 'react';
import { Alert } from 'antd';
import type { ConflictItem } from './utils';

type Props = {
  conflicts?: ConflictItem[] | null;
  message?: string;
};

const ConflictWarning: React.FC<Props> = ({ conflicts, message }) => {
  if (!conflicts || conflicts.length === 0) return null;
  const text = message || 'One or more time slots are already taken.';
  return (
    <Alert
      type="error"
      showIcon
      message={text}
      description={(
        <div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {conflicts.map((c, i) => (
              <li key={i}>{c.date} {c.startTime}-{c.endTime} — {c.residentName || c.username || c.inquiryId}</li>
            ))}
          </ul>
        </div>
      )}
    />
  );
};

export default ConflictWarning;
