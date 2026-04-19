
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Button, Badge, Modal, Table, Tooltip, Checkbox, Tag, List, Space, Tabs, message, Input, DatePicker, Select, Upload, Alert } from 'antd';
import { FileTextOutlined, MailOutlined, NotificationOutlined, QuestionCircleOutlined, CalendarOutlined, MessageOutlined, EyeOutlined, DeleteOutlined, RetweetOutlined, UploadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useAppointmentsQuery } from '../hooks/useAppointments';
import { isPhilippinesHoliday } from '../utils/holidays';
import dayjs from 'dayjs';
import AvatarImage from './AvatarImage';
import styles from './dashboard.module.css';
import { getAbsoluteApiUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { documentsAPI, contactAPI, verificationAPI } from '../services/api';
import { useNavigate } from 'react-router-dom'

interface DocumentRequest {
  _id: string;
  documentType: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  dateRequested: string;
  requesterId?: {
    fullName?: string;
    username?: string;
  };
}

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [residentImageSrc, setResidentImageSrc] = useState(null as string | null);
  const [, setCurrentTime] = useState(() => new Date().toLocaleString());
  const [documents, setDocuments] = useState([] as DocumentRequest[]);
  const [, setLoading] = useState(true);
  const [announcementsCount, setAnnouncementsCount] = useState(0);
  const [, setAnnouncementsLoading] = useState(false);
  const [announcementsLatestAt, setAnnouncementsLatestAt] = useState(null as string | null);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false);
  const [announcementsUnreadCount, setAnnouncementsUnreadCount] = useState(0);
  const [inquiriesLatestAt, setInquiriesLatestAt] = useState(null as string | null);
  const [hasUnreadInquiries, setHasUnreadInquiries] = useState(false);
  const [inquiriesCount, setInquiriesCount] = useState(0);
  const [inquiriesUnreadCount, setInquiriesUnreadCount] = useState(0);
  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [pendingRequestsList, setPendingRequestsList] = useState([] as any[]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [approvedModalVisible, setApprovedModalVisible] = useState(false);
  const [approvedRequestsList, setApprovedRequestsList] = useState([] as any[]);
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [pendingLatestAt, setPendingLatestAt] = useState(null as string | null);
  const [approvedLatestAt, setApprovedLatestAt] = useState(null as string | null);
  const [hasUnreadPending, setHasUnreadPending] = useState(false);
  const [hasUnreadApproved, setHasUnreadApproved] = useState(false);
  const [pendingUnreadCount, setPendingUnreadCount] = useState(0);
  const [approvedUnreadCount, setApprovedUnreadCount] = useState(0);
  const [tipsModalVisible, setTipsModalVisible] = useState(false);
  const [hideTips, setHideTips] = useState(() => {
    try {
      return localStorage.getItem('residentTips.hide') === 'true';
    } catch (err) {
      return false;
    }
  });
  const [helpHover, setHelpHover] = useState(false);
  // Resident appointments
  const [appointments, setAppointments] = useState([] as any[]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [apptModalVisible, setApptModalVisible] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null as any | null);
  const [appointmentsSortBy, setAppointmentsSortBy] = useState('upcoming' as 'latest' | 'upcoming');
  const [appointmentsScheduledCount, setAppointmentsScheduledCount] = useState(0);
  const [appointmentsPendingCount, setAppointmentsPendingCount] = useState(0);
  const [appointmentsCanceledCount, setAppointmentsCanceledCount] = useState(0);
  const [appointmentsCategoryModalVisible, setAppointmentsCategoryModalVisible] = useState(false);
  const [appointmentsScheduled, setAppointmentsScheduled] = useState([] as any[]);
  const [appointmentsPending, setAppointmentsPending] = useState([] as any[]);
  const [appointmentsCanceled, setAppointmentsCanceled] = useState([] as any[]);
  
  // Reschedule modal states
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);

  const formatDate = (val?: any) => {
    if (!val) return '';
    try {
      return new Date(val).toLocaleString();
    } catch (err) {
      return String(val);
    }
  };

  // Enhanced cancel appointment function
  const handleCancelAppointment = (record: any) => {
    const isAlreadyCancelled = record.status === 'cancelled';
    
    Modal.confirm({
      title: isAlreadyCancelled ? 'Delete Appointment' : 'Cancel Appointment',
      content: isAlreadyCancelled 
        ? `Are you sure you want to permanently delete this cancelled appointment? This action cannot be undone.`
        : `Are you sure you want to cancel your appointment? This action cannot be undone.`,
      okText: isAlreadyCancelled ? 'Delete' : 'Cancel Appointment',
      okType: 'danger',
      cancelText: 'Back',
      onOk: async () => {
        try {
          if (isAlreadyCancelled) {
            // For already cancelled appointments, delete them
            await contactAPI.updateInquiry(String(record._id), { 
              status: 'deleted'
            });
            message.success('Appointment deleted successfully');
          } else {
            // For pending/scheduled appointments, cancel them
            await contactAPI.updateInquiry(String(record._id), { 
              status: 'cancelled',
              cancellationReason: 'Cancelled by resident'
            });
            message.success('Appointment cancelled successfully');
          }
          window.dispatchEvent(new Event('appointments-updated'));
          // Refresh appointments
          const res = await contactAPI.getMyInquiries();
          const list = (Array.isArray(res) ? res : (res && res.data) ? res.data : []).filter((r: any) => r != null && r._id);
          setAppointments(list);
        } catch (err: any) {
          message.error(isAlreadyCancelled ? 'Failed to delete appointment' : 'Failed to cancel appointment');
        }
      },
    });
  };

  // Reschedule appointment function
  const handleRescheduleAppointment = (record: any) => {
    setSelectedRecord(record);
    setSelectedDates([]);
    setRescheduleReason('');
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setRescheduleModalVisible(true);
  };

  // Submit reschedule request
  const handleRescheduleSubmit = async () => {
    if (selectedDates.length === 0) {
      message.error('Please select at least one date');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('status', 'reschedule_request');
      formData.append('requestedDates', JSON.stringify(selectedDates));
      formData.append('rescheduleReason', rescheduleReason);
      
      if (attachmentFile) {
        formData.append('attachment', attachmentFile);
      }

      await contactAPI.updateInquiry(String(selectedRecord._id), formData);
      message.success('Reschedule request submitted successfully');
      setRescheduleModalVisible(false);
      
      window.dispatchEvent(new Event('appointments-updated'));
      // Refresh appointments
      const res = await contactAPI.getMyInquiries();
      const list = (Array.isArray(res) ? res : (res && res.data) ? res.data : []).filter((r: any) => r != null && r._id);
      setAppointments(list);
    } catch (err: any) {
      message.error('Failed to submit reschedule request');
    }
  };

  // Date picker with weekends and holidays disabled
  const disabledDate = (current: dayjs.Dayjs | null) => {
    if (!current) return false;
    const dayOfWeek = current.day();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = isPhilippinesHoliday(current);
    return isWeekend || isHoliday;
  };

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        let response;
        if (user?.role === 'admin' || user?.role === 'staff') {
          response = await documentsAPI.getAllDocuments();
        } else {
          response = await documentsAPI.getMyDocuments();
        }
        setDocuments(response);
        // compute latest timestamps for pending/approved to show unread indicators
        try {
          const list = (Array.isArray(response) ? response : (response && response.data) ? response.data : []).filter((item: any) => item != null);
          // pending
          const pendingItems = (list || []).filter((d: any) => (d.status || '').toString().toLowerCase() === 'pending');
          if (pendingItems.length) {
            const latestPending = pendingItems.reduce((acc: string|null, cur: any) => {
              const created = cur.createdAt || cur.updatedAt || null;
              if (!created) return acc;
              if (!acc) return created;
              return new Date(created) > new Date(acc) ? created : acc;
            }, null as string | null);
            setPendingLatestAt(latestPending);
            try {
              const seen = localStorage.getItem('pending.seenAt');
              const unread = pendingItems.filter((it: any) => {
                const created = it.createdAt || it.updatedAt || it.date || null;
                if (!created) return false;
                if (!seen) return true;
                return new Date(created) > new Date(seen);
              }).length;
              setPendingUnreadCount(unread);
              setHasUnreadPending(unread > 0);
            } catch (e) { setHasUnreadPending(true); setPendingUnreadCount(pendingItems.length); }
          } else {
            setPendingLatestAt(null);
            setHasUnreadPending(false);
            setPendingUnreadCount(0);
          }
          // approved
          const approvedItems = (list || []).filter((d: any) => (d.status || '').toString().toLowerCase() === 'approved');
          if (approvedItems.length) {
            const latestApproved = approvedItems.reduce((acc: string|null, cur: any) => {
              const created = cur.createdAt || cur.updatedAt || null;
              if (!created) return acc;
              if (!acc) return created;
              return new Date(created) > new Date(acc) ? created : acc;
            }, null as string | null);
            setApprovedLatestAt(latestApproved);
            try {
              const seen = localStorage.getItem('approved.seenAt');
              const unread = approvedItems.filter((it: any) => {
                const created = it.createdAt || it.updatedAt || it.date || null;
                if (!created) return false;
                if (!seen) return true;
                return new Date(created) > new Date(seen);
              }).length;
              setApprovedUnreadCount(unread);
              setHasUnreadApproved(unread > 0);
            } catch (e) { setHasUnreadApproved(true); setApprovedUnreadCount(approvedItems.length); }
          } else {
            setApprovedLatestAt(null);
            setHasUnreadApproved(false);
            setApprovedUnreadCount(0);
          }
        } catch (err) {
          // ignore
        }
      } catch (error) {
        console.error('Error fetching documents:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDocuments();
  // Fetch resident personal info image so dashboard can prefer resident container avatar
    (async () => {
      try {
        // Prefer resident personal-info container image (use axios instance so cookies/token are sent)
        try {
          const r1 = await (await import('../services/api')).residentPersonalInfoAPI.getPersonalInfo();
          const data = r1;
          if (data?.profileImage) {
            const url = data.profileImage.startsWith('http') ? data.profileImage : getAbsoluteApiUrl(data.profileImage);
            setResidentImageSrc(url);
            return;
          }
          if (data?.profileImageId) {
            setResidentImageSrc(getAbsoluteApiUrl(`/resident/personal-info/avatar/${data.profileImageId}`));
            return;
          }
        } catch (err) {
          // ignore per-endpoint errors
        }
        // If no resident image, try the user profile endpoint via axios instance
        try {
          const api = await import('../services/api');
          const r2 = await api.axiosInstance.get('/resident/profile');
          const data2 = r2.data;
          if (data2?.profileImage) {
            const url2 = data2.profileImage.startsWith('http') ? data2.profileImage : getAbsoluteApiUrl(data2.profileImage);
            setResidentImageSrc(url2);
          } else if (data2?.profileImageId) {
            setResidentImageSrc(getAbsoluteApiUrl(`/resident/personal-info/avatar/${data2.profileImageId}`));
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        // ignore
      }
    })();
    // Live timestamp updater
    const tick = () => setCurrentTime(new Date().toLocaleString());
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // TODO: Fetch unread notifications count
  }, [user]);

  // Listen for document request creation and refetch
  useEffect(() => {
    const handleDocumentRequestCreated = () => {
      // Refetch documents when a new request is created
      const fetchDocuments = async () => {
        try {
          let response;
          if (user?.role === 'admin' || user?.role === 'staff') {
            response = await documentsAPI.getAllDocuments();
          } else {
            response = await documentsAPI.getMyDocuments();
          }
          setDocuments(response);
          // Recompute pending/approved counts
          const list = Array.isArray(response) ? response : (response && response.data) ? response.data : [];
          const pendingItems = (list || []).filter((d: any) => (d.status || '').toString().toLowerCase() === 'pending');
          setPendingUnreadCount(pendingItems.length);
          setHasUnreadPending(pendingItems.length > 0);
          
          const approvedItems = (list || []).filter((d: any) => (d.status || '').toString().toLowerCase() === 'approved');
          setApprovedUnreadCount(approvedItems.length);
          setHasUnreadApproved(approvedItems.length > 0);
        } catch (error) {
          console.error('Error refetching documents after request:', error);
        }
      };
      fetchDocuments();
    };
    
    window.addEventListener('documentRequestCreated', handleDocumentRequestCreated);
    return () => window.removeEventListener('documentRequestCreated', handleDocumentRequestCreated);
  }, [user]);

  // Fetch resident's inquiries/appointments when role is resident
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user || user.role !== 'resident') return;
      setAppointmentsLoading(true);
      try {
        const res = await contactAPI.getMyInquiries();
        console.info('[Dashboard] getMyInquiries result:', res);
        if (!mounted) return;
        // Get all inquiries
        const allInquiries = (Array.isArray(res) ? res : (res && res.data) ? res.data : []).filter((item: any) => item != null);
        console.info('[Dashboard] allInquiries normalized count:', allInquiries.length, allInquiries);
        
        // Separate appointment types for resident view
        const scheduleAppointmentTypes = ['SCHEDULE_APPOINTMENT', 'APPOINTMENT', 'SCHEDULED_APPOINTMENT'];
        const quickAppointmentTypes = ['QUICK_APPOINTMENT'];
        
        // Filter SCHEDULE_APPOINTMENT types (residents can cancel/reschedule these)
        const scheduleList = allInquiries.filter((r: any) => {
          const type = String(r?.type || '').toUpperCase();
          return scheduleAppointmentTypes.includes(type);
        });

        // Filter QUICK_APPOINTMENT types (staff management only, residents can only view)
        const quickList = allInquiries.filter((r: any) => {
          const type = String(r?.type || '').toUpperCase();
          return quickAppointmentTypes.includes(type);
        });

        // Combine both types for display but handle them differently in actions
        const list = [...scheduleList, ...quickList];

        // Filter scheduled appointments (only SCHEDULE_APPOINTMENT types)
        const scheduledList = allInquiries.filter((r: any) => {
          const type = String(r?.type || '').toUpperCase();
          const status = String(r?.status || '').toLowerCase();
          return scheduleAppointmentTypes.includes(type) && 
          ((status === 'scheduled' || (r.scheduledDates && r.scheduledDates.length)) && status !== 'resolved' && status !== 'canceled')
        });
        
        // Filter pending appointments (only SCHEDULE_APPOINTMENT types)
        const pendingList = allInquiries.filter((r: any) => {
          const type = String(r?.type || '').toUpperCase();
          return scheduleAppointmentTypes.includes(type) && (String(r?.status || '').toLowerCase() === 'pending');
        });
        
        // Filter canceled appointments (only SCHEDULE_APPOINTMENT types)
        const canceledList = allInquiries.filter((r: any) => {
          const type = String(r?.type || '').toUpperCase();
          return scheduleAppointmentTypes.includes(type) && (String(r?.status || '').toLowerCase() === 'canceled');
        });
        
        setAppointmentsScheduledCount(scheduledList.length);
        setAppointmentsPendingCount(pendingList.length);
        setAppointmentsCanceledCount(canceledList.length);
        
        setAppointmentsScheduled(scheduledList);
        setAppointmentsPending(pendingList);
        setAppointmentsCanceled(canceledList);
        
        // normalize and sort by next appointment date
        const normalized = list.map((r: any) => {
          const next = (r.scheduledDates && r.scheduledDates.length) ? r.scheduledDates[0] : null;
          return { ...r, nextAppointment: next };
        }).sort((a: any, b: any) => {
          const da = a.nextAppointment ? new Date(a.nextAppointment.date) : new Date(a.createdAt);
          const db = b.nextAppointment ? new Date(b.nextAppointment.date) : new Date(b.createdAt);
          return da.getTime() - db.getTime();
        });
        setAppointments(normalized);
      } catch (err) {
        console.error('Failed to load resident appointments', err);
        setAppointments([]);
        setAppointmentsScheduledCount(0);
        setAppointmentsPendingCount(0);
        setAppointmentsCanceledCount(0);
        setAppointmentsScheduled([]);
        setAppointmentsPending([]);
        setAppointmentsCanceled([]);
      } finally {
        setAppointmentsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user]);

  // Resident verification status: check backend for pending verification requests
  const [hasPendingVerification, setHasPendingVerification] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (user?.role === 'resident') {
          const reqs = await verificationAPI.getMyRequests();
          if (!mounted) return;
          if (Array.isArray(reqs) && reqs.length > 0) {
            const pending = reqs.some((r: any) => (r.status || '').toString().toLowerCase() === 'pending');
            setHasPendingVerification(pending);
          } else {
            setHasPendingVerification(false);
          }
        }
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    const fetchInquiries = async () => {
      try {
        let res;
        if (user?.role === 'admin' || user?.role === 'staff') {
          res = await contactAPI.getAllInquiries();
        } else {
          res = await contactAPI.getMyInquiries();
        }
        // API may return array or object with count
        if (Array.isArray(res)) {
          // Exclude SCHEDULE_APPOINTMENT type inquiries
          const filteredInquiries = res.filter((r: any) => r.type !== 'SCHEDULE_APPOINTMENT');
          setInquiriesCount(filteredInquiries.length);
          // compute latest inquiry timestamp for unread indicator
          try {
            const list = filteredInquiries;
            if (Array.isArray(list) && list.length) {
              const latest = list.reduce((acc: string|null, cur: any) => {
                const created = cur.createdAt || cur.updatedAt || null;
                if (!created) return acc;
                if (!acc) return created;
                return new Date(created) > new Date(acc) ? created : acc;
              }, null as string | null);
              setInquiriesLatestAt(latest);
              try {
                const seen = localStorage.getItem('inquiries.seenAt');
                const unread = Array.isArray(list) ? list.filter((it: any) => {
                  const created = it.createdAt || it.updatedAt || it.date || null;
                  if (!created) return false;
                  if (!seen) return true;
                  return new Date(created) > new Date(seen);
                }).length : 0;
                setInquiriesUnreadCount(unread);
                setHasUnreadInquiries(unread > 0);
              } catch (e) { setHasUnreadInquiries(true); setInquiriesUnreadCount(list.length || 0); }
            }
          } catch (e) { /* ignore */ }
        } else if (res && typeof res.count === 'number') setInquiriesCount(res.count);
        else setInquiriesCount((res && res.length) || 0);
      } catch (err) {
        console.error('Failed to load inquiries:', err);
        setInquiriesCount(0);
      }
    };
    fetchInquiries();
    // Fetch announcements count for the announcements card
    const fetchAnnouncements = async () => {
      setAnnouncementsLoading(true);
      try {
        const res = await contactAPI.getAnnouncements();
        if (Array.isArray(res)) setAnnouncementsCount(res.length);
        else if (res && typeof res.count === 'number') setAnnouncementsCount(res.count);
        else setAnnouncementsCount((res && res.length) || 0);
        // determine latest announcement timestamp to drive unread badge
        try {
          const list = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
          if (Array.isArray(list) && list.length) {
            const latest = list.reduce((acc: string|null, cur: any) => {
              const created = cur.createdAt || cur.updatedAt || cur.date || null;
              if (!created) return acc;
              if (!acc) return created;
              return new Date(created) > new Date(acc) ? created : acc;
            }, null as string | null);
            setAnnouncementsLatestAt(latest);
            try {
              const seen = localStorage.getItem('announcements.seenAt');
              const unread = Array.isArray(list) ? list.filter((it: any) => {
                const created = it.createdAt || it.updatedAt || it.date || null;
                if (!created) return false;
                if (!seen) return true;
                return new Date(created) > new Date(seen);
              }).length : 0;
              setAnnouncementsUnreadCount(unread);
              setHasUnreadAnnouncements(unread > 0);
            } catch (e) { setHasUnreadAnnouncements(true); setAnnouncementsUnreadCount(list.length || 0); }
          } else {
            setAnnouncementsLatestAt(null);
            setHasUnreadAnnouncements(false);
            setAnnouncementsUnreadCount(0);
          }
        } catch (e) {
          // ignore parsing errors
        }
      } catch (err) {
        console.error('Failed to fetch announcements:', err);
        setAnnouncementsCount(0);
      } finally {
        setAnnouncementsLoading(false);
      }
    };
    fetchAnnouncements();
  }, [user]);

  const getSortedAppointments = () => {
    const sorted = appointments.filter((appt: any) => appt != null);
    if (appointmentsSortBy === 'latest') {
      // Sort by creation date (latest first)
      return sorted.sort((a: any, b: any) => {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        return db - da;
      });
    } else {
      // Sort by upcoming appointment date (soonest first, excluding past dates)
      const now = new Date();
      return sorted
        .map((appt: any) => {
          const apptDate = appt.nextAppointment ? new Date(appt.nextAppointment.date) : null;
          return { appt, apptDate };
        })
        .filter(({ apptDate }) => apptDate && apptDate >= now)
        .sort((a, b) => (a.apptDate?.getTime() || 0) - (b.apptDate?.getTime() || 0))
        .map(({ appt }) => appt)
        .concat(
          // Add past appointments at the end
          sorted.filter((appt: any) => {
            const apptDate = appt.nextAppointment ? new Date(appt.nextAppointment.date) : null;
            return !apptDate || apptDate < now;
          })
        );
    }
  };

  const pendingCount = documents.filter(doc => (doc.status || '').toString().toLowerCase() === 'pending').length;
  const approvedCount = documents.filter(doc => (doc.status || '').toString().toLowerCase() === 'approved').length;

  return (
    <>
      <div style={{ maxWidth: 1200, margin: '40px auto', padding: '0 16px', position: 'relative' }}>
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 18 }}>
          <Row align="middle">
            <Col>
              <Typography.Text style={{ fontSize: 16, color: '#888' }}>
                <span style={{ marginRight: 8 }}>
                  <span style={{ color: '#1890ff', fontWeight: 600 }}>Dashboard</span> {'>'} Home
                </span>
              </Typography.Text>
            </Col>
          </Row>
        </div>
        {/* Hero Card Section */}
        {user?.role === 'resident' && (
          <Card
            className={styles.residentCard}
            style={{
              width: '100%',
              margin: '0 auto 32px',
              borderRadius: 14,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
              background: '#ffffff',
              border: '1px solid #f0f0f0',
              borderTop: '4px solid #1890ff',
              padding: 0,
              position: 'relative',
              overflow: 'hidden',
              minHeight: 170
            }}
            styles={{ body: { padding: 0 } }}
          >
            <Row align="middle" className={styles.heroRow} style={{ minHeight: 170, padding: '32px 32px', position: 'relative', zIndex: 1 }} justify="space-between">
              <Col xs={24} md={14} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div className={styles.avatarContainer}>
                      {residentImageSrc ? (
                        <img className={styles.avatarImg} src={residentImageSrc} alt={user?.fullName || user?.username || 'avatar'} />
                      ) : (
                        <AvatarImage user={(() => {
                          let displayUser = user;
                          if (!displayUser) {
                            try {
                              const stored = localStorage.getItem('userProfile');
                              if (stored) displayUser = JSON.parse(stored);
                            } catch (err) {}
                          }
                          return displayUser;
                        })()} size={96} />
                      )}
                      <button
                        onClick={() => navigate('/profile')}
                        title="Edit profile"
                        className={styles.editButton}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#595959"/>
                          <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#595959"/>
                        </svg>
                      </button>
                      {/* verification tag moved next to name (rendered in userInfo) */}
                    </div>
                    <div className={styles.userInfo}>
                      <div>
                        <Typography.Title level={3} className={styles.userName} style={{ marginBottom: 0, fontWeight: 800 }}>{user?.fullName ?? user?.username ?? user?.email ?? ''}</Typography.Title>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Typography.Text type="secondary" className={styles.userMeta}>
                          Barangay ID: {user?.barangayID ?? (() => {
                            try {
                              const stored = localStorage.getItem('userProfile');
                              if (stored) {
                                const p = JSON.parse(stored);
                                return p?.barangayID || 'N/A';
                              }
                            } catch (e) {}
                            return 'N/A';
                          })()}
                        </Typography.Text>
                      </div>
                      <div style={{ marginTop: 8 }}><Typography.Text type="secondary" className={styles.userMeta}>{new Date().toLocaleString()}</Typography.Text></div>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
            {/* help button moved to floating bottom-right */}
          </Card>
        )}

        {/* Statistics Grid */}
        <Row gutter={[32, 32]} justify="center" style={{ marginBottom: 40 }}>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 14,
                height: 240,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.2s ease',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                border: '1px solid #f5f5f5',
                borderTop: '4px solid #faad14',
                position: 'relative',
                overflow: 'hidden'
              }}
              onClick={async () => {
                setPendingModalVisible(true);
                setPendingLoading(true);
                try {
                  // mark pending as seen when opening
                  try { if (pendingLatestAt) localStorage.setItem('pending.seenAt', pendingLatestAt); } catch (e) {}
                  setHasUnreadPending(false);
                  let res;
                  if (user?.role === 'admin' || user?.role === 'staff') {
                    res = await documentsAPI.getAllDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'pending');
                  } else {
                    res = await documentsAPI.getMyDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'pending');
                  }
                  setPendingRequestsList(res || []);
                } catch (err) {
                  setPendingRequestsList([]);
                } finally {
                  setPendingLoading(false);
                }
              }}
              styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 } }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Badge className={styles.smallBadge} count={pendingUnreadCount} overflowCount={99} offset={[8, -6]} style={{ backgroundColor: '#ff4d4f' }}>
                    <div style={{ background: '#faad14', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MailOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                    </div>
                  </Badge>
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{pendingCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#faad14', fontWeight: 700 }}>Pending Requests</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 14,
                height: 240,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.2s ease',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                border: '1px solid #f5f5f5',
                borderTop: '4px solid #52c41a',
                position: 'relative',
                overflow: 'hidden'
              }}
              styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 } }}
              onClick={async () => {
                setApprovedModalVisible(true);
                setApprovedLoading(true);
                // mark approved as seen when opening
                try { if (approvedLatestAt) localStorage.setItem('approved.seenAt', approvedLatestAt); } catch (e) {}
                setHasUnreadApproved(false);
                try {
                  let res;
                  if (user?.role === 'admin' || user?.role === 'staff') {
                    res = await documentsAPI.getAllDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'approved');
                  } else {
                    res = await documentsAPI.getMyDocuments();
                    res = (res || []).filter((r: any) => (r.status || '').toString().toLowerCase() === 'approved');
                  }
                  setApprovedRequestsList(res || []);
                } catch (err) {
                  setApprovedRequestsList([]);
                } finally {
                  setApprovedLoading(false);
                }
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Badge className={styles.smallBadge} count={approvedUnreadCount} overflowCount={99} offset={[8, -6]} style={{ backgroundColor: '#ff4d4f' }}>
                    <div style={{ background: '#52c41a', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileTextOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                    </div>
                  </Badge>
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{approvedCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#52c41a', fontWeight: 700 }}>Approved Documents</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 14,
                height: 240,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.2s ease',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                border: '1px solid #f5f5f5',
                borderTop: '4px solid #8b5cf6',
                position: 'relative',
                overflow: 'hidden'
              }}
              styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 } }}
              onClick={() => setAppointmentsCategoryModalVisible(true)}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <div style={{ background: '#8b5cf6', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CalendarOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                  </div>
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{appointmentsScheduledCount + appointmentsPendingCount + appointmentsCanceledCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#8b5cf6', fontWeight: 700 }}>Appointments</Typography.Text>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card
              hoverable
              style={{
                borderRadius: 14,
                height: 240,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.2s ease',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                border: '1px solid #f5f5f5',
                borderTop: '4px solid #0891b2',
                position: 'relative',
                overflow: 'hidden'
              }}
              onClick={() => {
                try { if (inquiriesLatestAt) localStorage.setItem('inquiries.seenAt', inquiriesLatestAt); } catch (e) {}
                setHasUnreadInquiries(false);
                navigate('/inbox');
              }}
              styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 } }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Badge className={styles.smallBadge} count={inquiriesUnreadCount} overflowCount={99} offset={[8, -6]} style={{ backgroundColor: '#ff4d4f' }}>
                    <div style={{ background: '#0891b2', borderRadius: '50%', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageOutlined style={{ color: '#fff', fontSize: 28, transition: 'transform 0.2s' }} />
                    </div>
                  </Badge>
                </div>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>{inquiriesCount}</Typography.Title>
                <Typography.Text style={{ fontSize: 18, color: '#0891b2', fontWeight: 700 }}>Active Inquiries</Typography.Text>
                {/* subtitle and action button removed */}
              </div>
            </Card>
          </Col>
        </Row>
        
        {/* Resident Appointments (only for residents) */}
        {user?.role === 'resident' && (
          <div style={{ marginBottom: 28 }}>
            <Card 
              title="Your Appointments" 
              variant="borderless"
              style={{ 
                borderRadius: 14,
                background: '#ffffff',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                border: '1px solid #f5f5f5',
                borderTop: '4px solid #8b5cf6',
                position: 'relative',
                overflow: 'hidden'
              }}
              extra={
                <Space>
                  <span style={{ fontSize: 12, color: '#666' }}>Sort by:</span>
                  <select 
                    value={appointmentsSortBy} 
                    onChange={(e) => setAppointmentsSortBy(e.target.value as 'latest' | 'upcoming')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #d9d9d9',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="latest">Latest</option>
                  </select>
                </Space>
              }
            >
              <List
                loading={appointmentsLoading}
                dataSource={getSortedAppointments()}
                locale={{ emptyText: 'No scheduled appointments' }}
                pagination={{
                  pageSize: 5,
                  showSizeChanger: false,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
                }}
                renderItem={(item: any) => {
                  if (!item || !item._id) return null;
                  const next = item.nextAppointment;
                  const dateLabel = next ? new Date(next.date).toLocaleDateString() : 'N/A';
                  const timeLabel = next ? `${next.startTime} - ${next.endTime}` : '—';
                  const status = item.status || (next ? 'scheduled' : 'pending');
                  return (
                    <List.Item
                      actions={[
                        <Button key="view" type="link" onClick={() => { setSelectedAppt(item); setApptModalVisible(true); }}>View</Button>,
                        ...(item.type !== 'QUICK_APPOINTMENT' ? [
                          <Button key="cancel" type="link" danger onClick={() => handleCancelAppointment(item)}>
                            {item.status === 'canceled' ? 'Delete' : 'Cancel'}
                          </Button>,
                          <Button key="reschedule" type="link" onClick={() => handleRescheduleAppointment(item)}>
                            Reschedule
                          </Button>
                        ] : [])
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<div style={{ width: 52, height: 52, borderRadius: 8, background: '#f5f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalendarOutlined style={{ color: '#722ed1', fontSize: 20 }} /></div>}
                        title={
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
    <strong>{item.subject || 'Appointment'}</strong>
    {item.type === 'QUICK_APPOINTMENT' && (
      <Tag color="purple" style={{ fontSize: '11px' }}>Quick</Tag>
    )}
    <Tag color={status === 'scheduled' ? 'blue' : (status === 'resolved' ? 'default' : (status === 'canceled' ? 'red' : 'orange'))}>
      {status}
    </Tag>
  </div>
}
                        description={<div><div style={{ fontWeight: 600 }}>{dateLabel} · {timeLabel}</div><div style={{ color: '#666', marginTop: 6 }}>{item.message || ''}</div></div>}
                      />
                    </List.Item>
                  );
                }}
              />
            </Card>
          </div>
        )}
        {/* Pending Requests Modal */}
        <Modal
          title="Pending Requests"
          open={pendingModalVisible}
          onCancel={() => setPendingModalVisible(false)}
          footer={null}
          width={800}
        >
          <Table
            dataSource={pendingRequestsList}
            loading={pendingLoading}
            rowKey={(record: any) => record?._id || 'unknown'}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: 'First Name',
                dataIndex: 'fieldValues',
                key: 'firstName',
                render: (fv: any, record: any) => fv?.firstName || record?.username || 'Unknown'
              },
              {
                title: 'Doc Type',
                dataIndex: 'type',
                key: 'type',
                render: (text: string) => text || 'Unknown'
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (text: string) => (text || '').toString().toLowerCase()
              }
            ]}
          />
        </Modal>
        {/* Approved Requests Modal */}
        <Modal
          title="Approved Documents"
          open={approvedModalVisible}
          onCancel={() => setApprovedModalVisible(false)}
          footer={null}
          width={1000}
        >
          <Table
            dataSource={approvedRequestsList}
            loading={approvedLoading}
            rowKey={(record: any) => record?._id || 'unknown'}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: 'First Name',
                dataIndex: 'fieldValues',
                key: 'firstName',
                render: (fv: any, record: any) => fv?.firstName || record?.username || 'Unknown'
              },
              {
                title: 'Doc Type',
                dataIndex: 'type',
                key: 'type',
                render: (text: string) => text || 'Unknown'
              },
              {
                title: 'Date Requested',
                dataIndex: 'dateRequested',
                key: 'dateRequested',
                render: (_: any, record: any) => formatDate(record.dateRequested || record.requestedAt || record.createdAt)
              },
              {
                title: 'Date Approved',
                dataIndex: 'dateApproved',
                key: 'dateApproved',
                render: (_: any, record: any) => formatDate(record.dateApproved || record.approvedAt || record.approvedOn || record.updatedAt)
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (text: string) => (text || '').toString().toLowerCase()
              }
            ]}
          />
        </Modal>
        {/* Resident Tool Tips Modal */}
        <Modal
          title="Resident Tool Tips"
          open={tipsModalVisible}
          onCancel={() => setTipsModalVisible(false)}
          footer={(
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <Checkbox
                checked={hideTips}
                onChange={e => {
                  const val = e.target.checked;
                  setHideTips(val);
                  try { localStorage.setItem('residentTips.hide', val ? 'true' : 'false'); } catch (err) {}
                }}
              >Don't show again</Checkbox>
              <div>
                <Button onClick={() => setTipsModalVisible(false)} style={{ marginRight: 8 }}>Cancel</Button>
                <Button type="primary" onClick={() => { setTipsModalVisible(false); }}>Got it</Button>
              </div>
            </div>
          )}
          width={720}
        >
          <ul style={{ paddingLeft: 20 }}>
            <li>Use the Request Document button to apply for barangay certificates and permits.</li>
            <li>Check your profile information regularly to ensure accuracy.</li>
            <li>Contact barangay staff for assistance with business registration or solo parent certification.</li>
            <li>For lost documents, use the Inquiry form to request help.</li>
            <li>All document requests are processed during office hours only.</li>
          </ul>
        </Modal>

        {/* Floating help button (bottom-right) */}
        <div style={{ position: 'fixed', right: 20, bottom: 24, zIndex: 1050 }}>
          <Tooltip title={hideTips ? 'Tips hidden (will remain hidden if checked)' : 'Resident Tool Tips'}>
            <Button
              type="primary"
              shape="circle"
              size="large"
              onClick={() => setTipsModalVisible(true)}
              onMouseEnter={() => setHelpHover(true)}
              onMouseLeave={() => setHelpHover(false)}
              icon={<QuestionCircleOutlined style={{ color: '#fff', fontSize: 20 }} />}
              style={{
                width: 56,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: helpHover ? '0 10px 30px rgba(24,144,255,0.22)' : '0 6px 18px rgba(0,0,0,0.12)',
                transform: helpHover ? 'translateY(-4px) scale(1.03)' : 'none',
                transition: 'transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 160ms',
              }}
            />
          </Tooltip>
        </div>
        {/* Appointment detail modal */}
        <Modal
          title="Appointment Details"
          open={apptModalVisible}
          onCancel={() => setApptModalVisible(false)}
          footer={null}
          width={720}
        >
          {selectedAppt ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Title level={4} style={{ marginBottom: 4 }}>{selectedAppt.subject || 'Appointment'}</Typography.Title>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ marginBottom: 6 }}>
                    <Tag color={selectedAppt.status === 'canceled' ? 'red' : (selectedAppt.status === 'scheduled' ? 'blue' : 'orange')}>{selectedAppt.status || (selectedAppt.scheduledDates && selectedAppt.scheduledDates.length ? 'scheduled' : 'pending')}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>Created: {formatDate(selectedAppt.createdAt)}</div>
                </div>
              </div>

              {selectedAppt.message && <Typography.Paragraph style={{ marginTop: 8 }}>{selectedAppt.message}</Typography.Paragraph>}

              <div style={{ marginTop: 12 }}>
                <strong>Scheduled Appointment Dates:</strong>
                <ul>
                  {(selectedAppt.scheduledDates || []).map((s: any, i: number) => {
                    const rawDate = s && (s.date || s);
                    const d = rawDate ? new Date(rawDate) : null;
                    const dateLabel = d && !isNaN(d.getTime()) ? d.toLocaleDateString() : 'Invalid Date';
                    const start = s && (s.startTime || s.start || s.time) || '—';
                    const end = s && (s.endTime || s.end) || '—';
                    return (<li key={i}>{dateLabel} — {start} to {end}</li>);
                  })}
                </ul>
              </div>

              {(selectedAppt.appointmentDates && selectedAppt.appointmentDates.length > 0) && (
                <div style={{ marginTop: 12 }}>
                  <strong>Preferred Appointment Dates:</strong>
                  <ul>
                    {(selectedAppt.appointmentDates || []).map((s: any, i: number) => {
                      const rawDate = s && (s.date || s);
                      const d = rawDate ? new Date(rawDate) : null;
                      const dateLabel = d && !isNaN(d.getTime()) ? d.toLocaleDateString() : 'Invalid Date';
                      const timeLabel = s && (s.startTime || s.time || s.start) || '—';
                      return (<li key={i}>{dateLabel} — {timeLabel}</li>);
                    })}
                  </ul>
                </div>
              )}

              {selectedAppt.status === 'canceled' || selectedAppt.cancellationReason ? (
                <div style={{ marginTop: 12 }}>
                  <strong style={{ color: '#d93025' }}>Cancellation</strong>
                  <div style={{ marginTop: 6, color: '#666' }}>Canceled At: {formatDate(selectedAppt.canceledAt || selectedAppt.updatedAt || selectedAppt.cancelledAt)}</div>
                  {selectedAppt.cancellationReason && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ color: '#d93025', fontWeight: 800, fontSize: 14 }}>Reason:</strong>
                        <span style={{ color: '#7a1212', background: '#fff2f2', padding: '6px 10px', borderRadius: 6, fontWeight: 600, boxShadow: 'inset 0 0 0 1px rgba(217,48,37,0.06)' }}>{selectedAppt.cancellationReason}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Messages / Responses */}
              {( (selectedAppt.messages && selectedAppt.messages.length) || (selectedAppt.responses && selectedAppt.responses.length) ) ? (
                <div style={{ marginTop: 16 }}>
                  <strong>Messages</strong>
                  <List
                    dataSource={((selectedAppt.messages && selectedAppt.messages.length) ? selectedAppt.messages : selectedAppt.responses).filter((m: any) => m != null)}
                    renderItem={(m: any, idx: number) => (
                      <List.Item key={idx} style={{ paddingLeft: 0, paddingRight: 0 }}>
                        <div style={{ width: '100%' }}>
                          <div style={{ fontWeight: 600 }}>{m?.username || m?.from || m?.author || (m?.sender && m.sender.username) || 'Staff'}</div>
                          <div style={{ fontSize: 13, color: '#666' }}>{m?.message || m?.body || m?.text || ''}</div>
                          <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>{formatDate(m?.createdAt || m?.date || m?.timestamp)}</div>
                        </div>
                      </List.Item>
                    )}
                  />
                </div>
              ) : null}

              {selectedAppt.attachments && selectedAppt.attachments.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong>Attachments</strong>
                  <ul>
                    {selectedAppt.attachments.map((a: any, i: number) => (
                      <li key={i}><a href={a.url || a} target="_blank" rel="noreferrer">{a.name || a.filename || `Attachment ${i+1}`}</a></li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>Last updated: {formatDate(selectedAppt.updatedAt || selectedAppt.modifiedAt)}</div>
            </div>
          ) : <div>No appointment selected</div>}
        </Modal>

        {/* Appointments Category Modal */}
        <Modal
          title="Appointments"
          open={appointmentsCategoryModalVisible}
          onCancel={() => setAppointmentsCategoryModalVisible(false)}
          footer={null}
          width={700}
          centered
        >
          <Tabs defaultActiveKey="scheduled" type="line">
            <Tabs.TabPane tab={`Scheduled (${appointmentsScheduledCount})`} key="scheduled">
              {appointmentsScheduled.length > 0 ? (
                <List
                  dataSource={appointmentsScheduled.filter((item: any) => item != null && item._id)}
                  renderItem={(item: any) => (
                    <List.Item
                      key={item._id}
                      style={{ paddingLeft: 0, paddingRight: 0, borderBottom: '1px solid #f0f0f0' }}
                      actions={[<Button key="view" type="link" onClick={() => { setSelectedAppt(item); setApptModalVisible(true); }}>View</Button>]}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.subject || 'Appointment'}</div>
                        <div style={{ fontSize: 13, color: '#666' }}>
                          {item.scheduledDates && item.scheduledDates.length > 0
                            ? `${new Date(item.scheduledDates[0].date).toLocaleDateString()} — ${item.scheduledDates[0].startTime}`
                            : 'No date scheduled'
                          }
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Typography.Text type="secondary">No scheduled appointments</Typography.Text>
              )}
            </Tabs.TabPane>

            <Tabs.TabPane tab={`Pending (${appointmentsPendingCount})`} key="pending">
              {appointmentsPending.length > 0 ? (
                <List
                  dataSource={appointmentsPending.filter((item: any) => item != null && item._id)}
                  renderItem={(item: any) => (
                    <List.Item
                      key={item._id}
                      style={{ paddingLeft: 0, paddingRight: 0, borderBottom: '1px solid #f0f0f0' }}
                      actions={[<Button key="view" type="link" onClick={() => { setSelectedAppt(item); setApptModalVisible(true); }}>View</Button>]}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.subject || 'Appointment'}</div>
                        <div style={{ fontSize: 13, color: '#666' }}>
                          Requested: {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Typography.Text type="secondary">No pending appointments</Typography.Text>
              )}
            </Tabs.TabPane>

            <Tabs.TabPane tab={`Canceled (${appointmentsCanceledCount})`} key="canceled">
              {appointmentsCanceled.length > 0 ? (
                <List
                  dataSource={appointmentsCanceled.filter((item: any) => item != null && item._id)}
                  renderItem={(item: any) => (
                    <List.Item
                      key={item._id}
                      style={{ paddingLeft: 0, paddingRight: 0, borderBottom: '1px solid #f0f0f0' }}
                      actions={[<Button key="view" type="link" onClick={() => { setSelectedAppt(item); setApptModalVisible(true); }}>View</Button>]}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.subject || 'Appointment'}</div>
                        <div style={{ fontSize: 13, color: '#666' }}>
                          Canceled: {new Date(item.updatedAt || item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Typography.Text type="secondary">No canceled appointments</Typography.Text>
              )}
            </Tabs.TabPane>
          </Tabs>
        </Modal>

        </div>
        
        {/* Reschedule Modal */}
        <Modal
          title="Reschedule Appointment"
          open={rescheduleModalVisible}
          onCancel={() => setRescheduleModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setRescheduleModalVisible(false)}>
              Cancel
            </Button>,
            <Button key="submit" type="primary" onClick={handleRescheduleSubmit}>
              Submit Request
            </Button>
          ]}
          width={600}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Typography.Text strong>Select Available Dates:</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <DatePicker.RangePicker
                  style={{ width: '100%' }}
                  placeholder={['Start Date', 'End Date']}
                  disabledDate={disabledDate}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      const start = dates[0];
                      const end = dates[1];
                      const dateRange = [];
                      let current = start;
                      while (current.isBefore(end) || current.isSame(end)) {
                        dateRange.push(current.format('YYYY-MM-DD'));
                        current = current.add(1, 'day');
                      }
                      setSelectedDates(dateRange);
                    }
                  }}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary">
                  Weekends and Philippine holidays are disabled
                </Typography.Text>
              </div>
            </div>
            
            <div>
              <Typography.Text strong>Reason for Rescheduling:</Typography.Text>
              <Input.TextArea
                style={{ marginTop: 8 }}
                placeholder="Please provide a reason for rescheduling..."
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                rows={3}
              />
            </div>
            
            <div>
              <Typography.Text strong>Attachment (Optional):</Typography.Text>
              <Upload
                style={{ marginTop: 8 }}
                beforeUpload={(file) => {
                  setAttachmentFile(file);
                  setAttachmentPreview(URL.createObjectURL(file));
                  return false;
                }}
                onRemove={() => {
                  setAttachmentFile(null);
                  setAttachmentPreview(null);
                }}
                maxCount={1}
              >
                <Button icon={<UploadOutlined />}>Select File</Button>
              </Upload>
              {attachmentPreview && (
                <div style={{ marginTop: 8 }}>
                  <Typography.Text>Selected: {attachmentFile?.name}</Typography.Text>
                </div>
              )}
            </div>
          </Space>
        </Modal>
      </>
  );
};

export default Dashboard;
                


