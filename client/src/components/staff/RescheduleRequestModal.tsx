import React, { useState, useEffect } from 'react';
import { Modal, Button, Space, Typography, DatePicker, Select, Input, Alert, Tag, Upload, Divider, Card, Row, Col, TimePicker, message, Spin } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseOutlined, EyeOutlined, UploadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { isPhilippinesHoliday } from '../../utils/holidays';
import { contactAPI } from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface RescheduleRequest {
  requestedDates: string[];
  reason: string;
  attachment?: string;
  requestedAt: string;
}

interface AppointmentInquiry {
  _id: string;
  type: 'SCHEDULE_APPOINTMENT' | 'QUICK_APPOINTMENT';
  status: string;
  appointmentDates?: string[];
  scheduledDates?: Array<{ date: string; startTime: string; endTime: string }>;
  username?: string;
  createdBy?: { fullName?: string; username?: string };
  recipient?: string;
  rescheduleRequest?: RescheduleRequest;
  cancellationReason?: string;
}

interface RescheduleRequestModalProps {
  visible: boolean;
  inquiry: AppointmentInquiry | null;
  onClose: () => void;
  onProcessed: () => void;
}

const RescheduleRequestModal: React.FC<RescheduleRequestModalProps> = ({
  visible,
  inquiry,
  onClose,
  onProcessed
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [timeMode, setTimeMode] = useState<'unified' | 'individual'>('unified');
  const [unifiedStartTime, setUnifiedStartTime] = useState('08:00');
  const [unifiedEndTime, setUnifiedEndTime] = useState('09:00');
  const [perDateTimes, setPerDateTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);

  useEffect(() => {
    if (visible && inquiry?.rescheduleRequest) {
      // Initialize with requested dates
      setSelectedDates(inquiry.rescheduleRequest.requestedDates || []);
      setUnifiedStartTime('08:00');
      setUnifiedEndTime('09:00');
      setPerDateTimes({});
      setShowRejectionForm(false);
      setRejectionReason('');
      
      // Load attachment if available
      if (inquiry.rescheduleRequest.attachment) {
        setAttachmentUrl(inquiry.rescheduleRequest.attachment);
      }
    }
  }, [visible, inquiry]);

  // Date picker with weekends and holidays disabled
  const disabledDate = (current: dayjs.Dayjs | null) => {
    if (!current) return false;
    const isPast = current.isBefore(dayjs(), 'day');
    const isWeekend = current.day() === 0 || current.day() === 6;
    const isHoliday = isPhilippinesHoliday(current);
    return isPast || isWeekend || isHoliday;
  };

  // Handle date selection
  const handleDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      const dateRange: string[] = [];
      let current = dates[0];
      while (current.isBefore(dates[1]) || current.isSame(dates[1])) {
        dateRange.push(current.format('YYYY-MM-DD'));
        current = current.add(1, 'day');
        if (dateRange.length >= 3) break; // Limit to 3 dates
      }
      setSelectedDates(dateRange);
    } else {
      setSelectedDates([]);
    }
  };

  // Handle time changes
  const handleTimeChange = (date: string, type: 'start' | 'end', time: dayjs.Dayjs | null) => {
    if (!time) return;
    const timeStr = time.format('HH:mm');
    
    if (timeMode === 'unified') {
      if (type === 'start') {
        setUnifiedStartTime(timeStr);
      } else {
        setUnifiedEndTime(timeStr);
      }
    } else {
      setPerDateTimes(prev => ({
        ...prev,
        [date]: {
          ...prev[date],
          [type]: timeStr
        }
      }));
    }
  };

  // Approve reschedule request
  const handleApprove = async () => {
    if (!inquiry || selectedDates.length === 0) return;

    setLoading(true);
    try {
      // Create scheduled dates array
      const scheduledDates = selectedDates.map(date => {
        if (timeMode === 'unified') {
          return {
            date,
            startTime: unifiedStartTime,
            endTime: unifiedEndTime
          };
        } else {
          const timeData = perDateTimes[date];
          return {
            date,
            startTime: timeData?.start || unifiedStartTime,
            endTime: timeData?.end || unifiedEndTime
          };
        }
      });

      // Update inquiry with scheduled dates
      await contactAPI.updateInquiry(String(inquiry._id), {
        status: 'scheduled',
        scheduledDates,
        rescheduleRequest: undefined // Clear the reschedule request
      });

      message.success('Reschedule request approved and appointment scheduled successfully');
      onProcessed();
      onClose();
    } catch (error) {
      message.error('Failed to approve reschedule request');
    } finally {
      setLoading(false);
    }
  };

  // Reject reschedule request
  const handleReject = async () => {
    if (!inquiry || !rejectionReason.trim()) {
      message.error('Please provide a reason for rejection');
      return;
    }

    setLoading(true);
    try {
      // Update inquiry with rejection
      await contactAPI.updateInquiry(String(inquiry._id), {
        status: 'cancelled',
        cancellationReason: rejectionReason,
        rescheduleRequest: undefined // Clear the reschedule request
      });

      message.success('Reschedule request rejected');
      onProcessed();
      onClose();
    } catch (error) {
      message.error('Failed to reject reschedule request');
    } finally {
      setLoading(false);
    }
  };

  if (!inquiry) return null;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarOutlined />
          <span>Reschedule Request - {inquiry.createdBy?.fullName || inquiry.username}</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Close
        </Button>,
        !showRejectionForm ? (
          <>
            <Button key="reject" danger onClick={() => setShowRejectionForm(true)}>
              Reject Request
            </Button>,
            <Button 
              key="approve" 
              type="primary" 
              onClick={handleApprove}
              loading={loading}
              disabled={selectedDates.length === 0}
            >
              Approve & Schedule
            </Button>
          </>
        ) : (
          <>
            <Button key="back" onClick={() => setShowRejectionForm(false)}>
              Back
            </Button>,
            <Button 
              key="confirm-reject" 
              danger 
              onClick={handleReject}
              loading={loading}
            >
              Confirm Rejection
            </Button>
          </>
        )
      ]}
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {!showRejectionForm ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Request Details */}
            <Card title="Reschedule Request Details" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>Requested Dates:</Text>
                  <div style={{ marginTop: 4 }}>
                    {inquiry.rescheduleRequest?.requestedDates.map(date => (
                      <Tag key={date} color="blue">
                        {dayjs(date).format('MMM DD, YYYY')}
                      </Tag>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Text strong>Reason:</Text>
                  <div style={{ marginTop: 4, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                    {inquiry.rescheduleRequest?.reason}
                  </div>
                </div>
                
                <div>
                  <Text strong>Requested At:</Text>
                  <div style={{ marginTop: 4 }}>
                    {inquiry.rescheduleRequest?.requestedAt && 
                      dayjs(inquiry.rescheduleRequest.requestedAt).format('MMM DD, YYYY HH:mm')
                    }
                  </div>
                </div>
                
                {attachmentUrl && (
                  <div>
                    <Text strong>Attachment:</Text>
                    <div style={{ marginTop: 4 }}>
                      <Button 
                        icon={<EyeOutlined />} 
                        size="small"
                        onClick={() => window.open(attachmentUrl, '_blank')}
                      >
                        View Attachment
                      </Button>
                    </div>
                  </div>
                )}
              </Space>
            </Card>

            {/* Schedule Selection */}
            <Card title="Select New Schedule" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  message="Select new dates for the resident's appointment"
                  description="Choose up to 3 preferred dates. Weekends and Philippine holidays are automatically disabled."
                  type="info"
                  showIcon
                />
                
                <div>
                  <Text strong>Select Dates:</Text>
                  <DatePicker.RangePicker
                    style={{ width: '100%', marginTop: 8 }}
                    format="YYYY-MM-DD"
                    placeholder={['Start Date', 'End Date']}
                    disabledDate={disabledDate}
                    onChange={handleDateChange}
                  />
                  {selectedDates.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <Text>Selected dates:</Text>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {selectedDates.map(date => (
                          <Tag key={date} color="green">
                            {dayjs(date).format('MMM DD, YYYY')}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedDates.length > 0 && (
                  <>
                    <Divider />
                    <div>
                      <Text strong>Time Mode:</Text>
                      <Select
                        value={timeMode}
                        onChange={setTimeMode}
                        style={{ width: '100%', marginTop: 8 }}
                      >
                        <Select.Option value="unified">Unified (same time for all dates)</Select.Option>
                        <Select.Option value="individual">Individual times per date</Select.Option>
                      </Select>
                    </div>

                    {timeMode === 'unified' ? (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Text strong>Start Time:</Text>
                          <TimePicker
                            style={{ width: '100%', marginTop: 8 }}
                            format="HH:mm"
                            value={dayjs(unifiedStartTime, 'HH:mm')}
                            onChange={(time) => handleTimeChange('', 'start', time)}
                          />
                        </Col>
                        <Col span={12}>
                          <Text strong>End Time:</Text>
                          <TimePicker
                            style={{ width: '100%', marginTop: 8 }}
                            format="HH:mm"
                            value={dayjs(unifiedEndTime, 'HH:mm')}
                            onChange={(time) => handleTimeChange('', 'end', time)}
                          />
                        </Col>
                      </Row>
                    ) : (
                      <div>
                        <Text strong>Individual Times:</Text>
                        {selectedDates.map(date => (
                          <Row key={date} gutter={16} style={{ marginTop: 8 }}>
                            <Col span={8}>
                              <Text>{dayjs(date).format('MMM DD')}</Text>
                            </Col>
                            <Col span={8}>
                              <TimePicker
                                style={{ width: '100%' }}
                                format="HH:mm"
                                placeholder="Start"
                                value={perDateTimes[date]?.start ? dayjs(perDateTimes[date].start, 'HH:mm') : null}
                                onChange={(time) => handleTimeChange(date, 'start', time)}
                              />
                            </Col>
                            <Col span={8}>
                              <TimePicker
                                style={{ width: '100%' }}
                                format="HH:mm"
                                placeholder="End"
                                value={perDateTimes[date]?.end ? dayjs(perDateTimes[date].end, 'HH:mm') : null}
                                onChange={(time) => handleTimeChange(date, 'end', time)}
                              />
                            </Col>
                          </Row>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Space>
            </Card>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              message="Reject Reschedule Request"
              description="Please provide a reason for rejecting this reschedule request. The resident will be notified."
              type="warning"
              showIcon
            />
            
            <div>
              <Text strong>Rejection Reason:</Text>
              <TextArea
                rows={4}
                placeholder="Enter the reason for rejecting this reschedule request..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                maxLength={500}
                showCount
                style={{ marginTop: 8 }}
              />
            </div>
            
            {rejectionReason && (
              <Alert
                message="This rejection will be visible to the resident"
                description="The resident will see this reason in bright red in their appointment details."
                type="error"
                showIcon
              />
            )}
          </Space>
        )}
      </div>
    </Modal>
  );
};

export default RescheduleRequestModal;
