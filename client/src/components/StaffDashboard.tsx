import React, { useState, useEffect, useCallback } from 'react';
import { Tabs } from 'antd';
import AppointmentListTable from './staff/appointments/AppointmentListTable';
// If you want to use React.FC, uncomment the next line:
// import type { FC } from 'react';
import { Card, Row, Col, Statistic, List, Typography, Space, Spin, Button, Modal, Input, Collapse, Tag, Empty, Badge, Drawer, Table, notification, Grid } from 'antd';
import AppAvatar from './AppAvatar';
import styles from './StaffDashboard.module.css';
import {
  HourglassOutlined,
  CaretUpOutlined,
  FolderOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  InboxOutlined,
  RightOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  ProfileOutlined,
  FileSearchOutlined,
  MailOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { documentsAPI, contactAPI, getAbsoluteApiUrl, axiosInstance } from '../services/api';
import DailyAppointmentsCard from './staff/DailyAppointmentsCard';
import StaffCalendar from './staff/StaffCalendar';
import AppointmentDetailsModal from './AppointmentDetailsModal';


interface DocumentRequest {
  _id?: string;
  type?: string;
  title?: string;
  description?: string;
  username?: string;
  barangayID?: string;
  dateRequested?: string;
  status?: string;
  [key: string]: any;
}

const StaffDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [documentRequests, setDocumentRequests] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [inboxInquiries, setInboxInquiries] = useState([]);
  const [viewedInquiryIds, setViewedInquiryIds] = useState(() => {
    try {
      const raw = localStorage.getItem('viewedInquiries');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(arr || []);
    } catch (e) {
      return new Set();
    }
  });

  const markInquiryViewed = (id?: string) => {
    if (!id) return;
    setViewedInquiryIds(prev => {
      const next = new Set(Array.from(prev));
      next.add(String(id));
      try { localStorage.setItem('viewedInquiries', JSON.stringify(Array.from(next))); } catch (e) {}
      return next;
    });
  };

  // Handle responding to an inquiry from the Inquiry Response modal
  const handleInquiryResponse = async () => {
    if (!selectedInquiry) return;
    const id = selectedInquiry._id || selectedInquiry.id;
    if (!id) return;
    try {
      notification.info({ message: 'Sending response', description: 'Posting your reply...', duration: 1.2 });
      await contactAPI.respondToInquiry(id, { response: responseText });
      // Update local inquiries list if present
      setInquiries(prev => (prev || []).map(q => (q && (q._id === id || q.id === id)) ? { ...q, status: 'resolved' } : q));
      notification.success({ message: 'Response sent', description: 'Inquiry has been updated' });
      setSelectedInquiry(null);
      setResponseText('');
    } catch (err: any) {
      console.error('Failed to send inquiry response', err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to send response';
      notification.error({ message: 'Error', description: msg });
    }
  };
  
  // Mini announcements (replace Recent Activity)
  const [miniAnns, setMiniAnns] = useState([]);
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniSelected, setMiniSelected] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [manageTableData, setManageTableData] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [responding] = useState(false);
  const [completedModalVisible, setCompletedModalVisible] = useState(false);
  // Documents modal state
  const [docsModalVisible, setDocsModalVisible] = useState(false);
  const [allDocuments, setAllDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [docsSearch, setDocsSearch] = useState('');
  const screens = Grid.useBreakpoint();
  // Group document requests by type for processing
  const requestsByCategory: { [type: string]: DocumentRequest[] } = {};
  documentRequests.forEach((req) => {
    const docType = req.type || 'Unknown';
    if (!requestsByCategory[docType]) requestsByCategory[docType] = [];
    requestsByCategory[docType].push(req);
  });

  // Example stats for staff
  const [stats, setStats] = useState({
    pendingRequests: 0,
    totalDocuments: 0,
    templatesCount: 0,
    processedDocuments: 0,
    completedRequests: 0,
  });

  // Group requests by category
  const categorizeRequests = (requests: DocumentRequest[]) => {
    const categories = {
      'Certificates': {
        icon: <SafetyCertificateOutlined style={{ fontSize: '20px', color: '#0891b2' }} />,
        items: [] as DocumentRequest[],
        color: '#0891b2',
        description: 'Birth, Death, Residency Certificates and more'
      },
      'Permits': {
        icon: <ProfileOutlined style={{ fontSize: '20px', color: '#52c41a' }} />,
        items: [] as DocumentRequest[],
        color: '#52c41a',
        description: 'Building, Business, and Special Event Permits'
      },
      'Complete': {
        icon: <FileDoneOutlined style={{ fontSize: '20px', color: '#52c41a' }} />,
        items: [] as DocumentRequest[],
        color: '#52c41a',
        description: 'All completed and approved document requests'
      }
    };

    requests.forEach(req => {
      const type = (req.type || '').toLowerCase();
      const status = (req.status || '').toLowerCase();
      if (type.includes('certificate') || type.includes('certification')) {
        categories['Certificates'].items.push(req);
      } else if (type.includes('permit')) {
        categories['Permits'].items.push(req);
      }

      // Add to Complete category if status is approved/completed
      if (status === 'approved' || status === 'completed') {
        categories['Complete'].items.push(req);
      }
    });

    return categories;
  };

  // Download processed document (handles both metadata id and direct GridFS file id)
  const handleDownloadProcessed = async (rec: any) => {
    try {
      // Follow TemplatesManager behavior: fetch the raw endpoint, convert to blob, and save using the server-provided filename when available.
      // Try metadata id first, then fall back to gridFsFileId if present and the first attempt 404s.
      const normalizeId = (v: any): string | null => {
        if (!v && v !== 0) return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') {
          // Mongoose ObjectId-like objects may expose $oid (BSON) or toString()
          if (typeof v.$oid === 'string') return v.$oid;
          try {
            const s = (v as any).toString();
            if (s && s !== '[object Object]') return s;
          } catch (e) {}
          return null;
        }
        return String(v);
      };

      const tryIds = [] as string[];
      const nid = normalizeId(rec && rec._id);
      const ngfid = normalizeId(rec && rec.gridFsFileId);
      if (nid) tryIds.push(nid);
      if (ngfid) tryIds.push(ngfid);
      // de-dupe
      const ids = Array.from(new Set(tryIds));
      
      let usedId: string | null = null;
      let lastError: any = null;

      console.debug('[handleDownloadProcessed] record:', rec, 'candidateIds:', ids);
      let finalBlob: Blob | null = null;
      let finalHeaders: any = null;
      for (const id of ids) {
        try {
          console.debug('[handleDownloadProcessed] attempting id=', id);
          const r = await (await import('../services/api')).axiosInstance.get(`/processed-documents/${id}/raw`, { responseType: 'blob' });
          if (r && r.status >= 200 && r.status < 300) {
            finalBlob = r.data as Blob;
            finalHeaders = r.headers || {};
            usedId = id;
            break;
          }
        } catch (err: any) {
          const status = err && err.response && err.response.status ? err.response.status : null;
          if (status === 404) {
            lastError = { status: 404, body: err.response && err.response.data ? err.response.data : null };
            continue;
          }
          notification.error({ message: 'Download failed', description: status ? `Server returned ${status}` : String(err) });
          return;
        }
      }

      if (!finalBlob) {
        const msg = lastError && lastError.body && lastError.body.message ? lastError.body.message : (lastError && lastError.message) ? lastError.message : 'File not found';
        notification.error({ message: 'Download failed', description: msg });
        return;
      }

      const blob = finalBlob;

      // Prefer filename from Content-Disposition header if provided
      let filename: string | null = null;
      const cd = (finalHeaders && (finalHeaders['content-disposition'] || finalHeaders['Content-Disposition'])) || null;
      if (cd) {
        const m = cd.match(/filename\*=UTF-8''([^;\n\r]+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1]);
        else {
          const m2 = cd.match(/filename="?([^";]+)"?/i);
          if (m2 && m2[1]) filename = m2[1];
        }
      }
      // Fallback to X-Processed headers or record fields
      if (!filename) filename = (finalHeaders && (finalHeaders['x-processed-transactioncode'] || finalHeaders['X-Processed-TransactionCode'])) || rec.filename || rec.name || `document_${usedId || rec._id}.docx`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const downloadName = filename || `document_${usedId || rec._id}.docx`;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error', err);
      notification.error({ message: 'Download error', description: String(err) });
    }
  };

  const getStatusTag = (status?: string) => {
    const statusColors: { [key: string]: string } = {
      'pending': 'gold',
      'approved': 'success',
      'rejected': 'error',
      'processing': 'processing'
    };

    return (
      <Tag color={statusColors[status?.toLowerCase() || 'default']}>
        {status?.toUpperCase() || 'UNKNOWN'}
      </Tag>
    );
  };

  

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch document records from /documents (not /document-requests/all)
      const [docRecords, inq] = await Promise.all([
        documentsAPI.getDocumentRecords(),
        contactAPI.getAllInquiries()
      ]);
      setDocumentRequests(docRecords);
      setInquiries(inq);
      // Filter for inbox: assignedRole matches user.role or assignedTo includes user._id, exclude SCHEDULE_APPOINTMENT
      const filtered = inq.filter((inq: any) =>
        inq.type !== 'SCHEDULE_APPOINTMENT' &&
        ((inq.assignedRole && user && inq.assignedRole === user.role) ||
        (inq.assignedTo && Array.isArray(inq.assignedTo) && user && inq.assignedTo.includes(user._id)))
      );
      setInboxInquiries(filtered);
      
      // Get total documents count from both 'documents' and 'processed_documents' buckets
      let totalDocuments = 0;
      let templatesCount = 0;
      let processedDocuments = 0;
      try {
        const resp = await axiosInstance.get('/analytics/total-documents-count');
        if (resp && resp.data) {
          totalDocuments = resp.data.totalCount || 0;
          templatesCount = resp.data.documentsCount || 0;  // Templates in 'documents' bucket
          processedDocuments = resp.data.processedCount || 0;  // Processed documents
        }
      } catch (e) {
        console.warn('Failed to fetch total documents count:', e);
      }

      setStats({
        pendingRequests: docRecords.filter((d: any) => d.status === 'pending').length,
        totalDocuments: totalDocuments,
        templatesCount: templatesCount,
        processedDocuments: processedDocuments,
        completedRequests: docRecords.filter((d: any) => d.status === 'approved').length,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchMiniAnnouncements = useCallback(async () => {
    setMiniLoading(true);
    try {
      const data = await contactAPI.getAnnouncements();
      setMiniAnns(Array.isArray(data) ? data.slice(0, 6) : []);
    } catch (err) {
      console.error('Failed to load mini announcements', err);
      setMiniAnns([]);
    } finally {
      setMiniLoading(false);
    }
  }, []);

  const fetchPastAppointments = useCallback(async () => {
    setMiniLoading(true);
    try {
      const data = await contactAPI.getAnnouncements();
      setMiniAnns(Array.isArray(data) ? data.slice(0, 6) : []);
    } catch (err) {
      console.error('Failed to load mini announcements', err);
      setMiniAnns([]);
    } finally {
      setMiniLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchMiniAnnouncements();
    fetchPastAppointments(); // Fetch past appointments
  }, [fetchData, fetchMiniAnnouncements]);

  // Fetch processed documents (from documents collection) and open modal
  const fetchAllProcessedDocuments = async () => {
    setDocsLoading(true);
    try {
      // Prefer processed_documents metadata endpoint; fallback to older documents listing
      let processedItems: any[] = [];
      try {
        const resp = await axiosInstance.get('/processed-documents', { params: { page: 1, limit: 200 } });
        const j = resp && resp.data ? resp.data : null;
        if (j && Array.isArray(j.items)) {
          processedItems = j.items;
        } else if (Array.isArray(j)) {
          processedItems = j as any[];
        }
      } catch (e) {
        // fallback to older endpoints
        try {
          const files: any = await documentsAPI.listFiles();
          const arr = Array.isArray(files) ? files : (files && files.data) ? files.data : [];
          processedItems = arr.filter((d: any) => {
            const s = (d.status || '').toString().toLowerCase();
            return ['processed', 'approved', 'completed'].includes(s) || d.processed === true;
          });
        } catch (e2) {
          processedItems = [];
        }
      }

      setAllDocuments(processedItems || []);
    } catch (err) {
      console.error('Failed to fetch documents for modal', err);
      setAllDocuments([]);
    } finally {
      setDocsLoading(false);
      setDocsModalVisible(true);
    }
  };

  

  // Handle approve/reject/other document actions from Document Response modal
  const handleDocumentAction = async () => {
    if (!selectedDocument) return;
    const id = selectedDocument._id || selectedDocument.id;
    if (!id) return;
    try {
      // Use documentsAPI to update status; server expects lowercase status strings
      const payload = { status: (documentStatus || '').toString().toLowerCase(), notes: responseText };
      // Show a short in-UI indicator using notification
      notification.info({ message: 'Processing', description: `Updating document status to ${payload.status}...`, duration: 1.2 });
      await documentsAPI.updateDocumentStatus(id, payload);
      // Update local list if present
      setDocumentRequests(prev => (prev || []).map(d => d && (d._id === id || d.id === id) ? { ...d, status: payload.status } : d));
      notification.success({ message: 'Success', description: `Document marked ${payload.status}` });
      // Clear modal and fields
      setSelectedDocument(null);
      setResponseText('');
      setDocumentStatus('');
    } catch (err: any) {
      console.error('Failed to update document status', err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to update document';
      notification.error({ message: 'Error', description: msg });
    }
  };

  // Format helpers
  // Helper to format document type for display
  function formatDocumentType(type?: string) {
    if (!type) return 'Unknown';
    // If you have a typeToCategory mapping, use it here
    // let name = typeToCategory[type] || type;
    let name = type;
    // Remove 'Other' prefix and extra spaces
    name = name.replace(/^Other\s*/i, '').trim();
    // Replace underscores with spaces and capitalize each word
    return name
      .split('_')
      .map(word => {
        const w = word || '';
        return w.length > 0 ? (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : '';
      })
      .filter(Boolean)
      .join(' ');
  }

  // Helper to format date for display
  function formatDate(dateString?: string) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  // Sort an array of inquiries/documents by createdAt descending (newest first)
  const sortByDateDesc = (arr: any[] = []) => {
    return (arr || []).slice().sort((a: any, b: any) => {
      const ta = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  };

  // Only one List for Document Categories will be rendered below in the Card section
  // (Card/Col/Row structure continues below)

  const goWithState = (path: string, state?: any) => {
    navigate(path, { state });
  };

  const go = (path: string) => {
    try {
      navigate(path);
    } catch (e) {
      window.location.href = path;
    }
  };

  // No replacement needed - removing the duplicate function

  return (
    <Spin spinning={loading} tip="Loading...">
      <div style={{ padding: '24px', background: '#f8fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <Typography.Title level={2} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
            Staff Dashboard
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 14, marginTop: 4, display: 'block' }}>
            Welcome back. Here's your overview for today.
          </Typography.Text>
        </div>

        {/* KPI Stats Row - Modern Card Design */}
        <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
          <Col xs={24} sm={12} md={6}>
            <Card 
              hoverable 
              bordered={false}
              onClick={() => {
                const pending = documentRequests.find(d => d.status === 'pending');
                if (pending && pending._id) {
                  goWithState('/document-processing', { openRequestId: pending._id });
                } else {
                  goWithState('/document-processing');
                }
              }} 
              style={{ 
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(250, 173, 20, 0.08)',
                background: '#ffffff',
                border: '1px solid #fef3c7',
                borderTop: '4px solid #faad14',
                borderRadius: 12,
                height: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(250, 173, 20, 0.15), 0 8px 24px rgba(250, 173, 20, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(250, 173, 20, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Requests</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#faad14', marginBottom: 12, lineHeight: 1 }}>{stats.pendingRequests}</div>
                  <Typography.Link style={{ fontSize: 12, color: '#faad14', fontWeight: 500 }}>
                    View details <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                  </Typography.Link>
                </div>
                <AppAvatar size={56} background="#fef3c7" color="#faad14" icon={<HourglassOutlined style={{ fontSize: 24 }} />} />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card 
              hoverable 
              bordered={false}
              onClick={() => fetchAllProcessedDocuments()} 
              style={{ 
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(8, 145, 178, 0.08)',
                background: '#ffffff',
                border: '1px solid #cffafe',
                borderTop: '4px solid #0891b2',
                borderRadius: 12,
                height: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(8, 145, 178, 0.15), 0 8px 24px rgba(8, 145, 178, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(8, 145, 178, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Documents</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#0891b2', marginBottom: 16, lineHeight: 1 }}>{stats.totalDocuments}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Templates: <span style={{ fontWeight: 600, color: '#0891b2' }}>{stats.templatesCount}</span></div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Processed: <span style={{ fontWeight: 600, color: '#0891b2' }}>{stats.processedDocuments}</span></div>
                  <Typography.Link style={{ fontSize: 12, color: '#0891b2', fontWeight: 500 }}>
                    Browse all <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                  </Typography.Link>
                </div>
                <AppAvatar size={56} background="#cffafe" color="#0891b2" icon={<FolderOutlined style={{ fontSize: 24 }} />} />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card 
              hoverable 
              bordered={false}
              onClick={() => setCompletedModalVisible(true)} 
              style={{ 
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(82, 196, 26, 0.08)',
                background: '#ffffff',
                border: '1px solid #dcfce7',
                borderTop: '4px solid #52c41a',
                borderRadius: 12,
                height: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(82, 196, 26, 0.15), 0 8px 24px rgba(82, 196, 26, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(82, 196, 26, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#52c41a', marginBottom: 12, lineHeight: 1 }}>{stats.completedRequests}</div>
                  <Typography.Link style={{ fontSize: 12, color: '#52c41a', fontWeight: 500 }}>
                    View completed <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                  </Typography.Link>
                </div>
                <AppAvatar size={56} background="#dcfce7" color="#52c41a" icon={<CheckCircleOutlined style={{ fontSize: 24 }} />} />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card 
              hoverable 
              bordered={false}
              onClick={() => go('/staff/inbox')} 
              style={{ 
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(220, 38, 38, 0.08)',
                background: '#ffffff',
                border: '1px solid #fee2e2',
                borderTop: '4px solid #dc2626',
                borderRadius: 12,
                height: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(220, 38, 38, 0.15), 0 8px 24px rgba(220, 38, 38, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(220, 38, 38, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Inbox Messages</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#dc2626', marginBottom: 12, lineHeight: 1 }}>{inboxInquiries.length}</div>
                  <Typography.Link style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                    Open inbox <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                  </Typography.Link>
                </div>
                <AppAvatar size={56} background="#fee2e2" color="#dc2626" icon={<InboxOutlined style={{ fontSize: 24 }} />} />
              </div>
            </Card>
          </Col>
        </Row>
        {/* Staff Calendar */}
        <Row style={{ marginBottom: 32 }}>
          <Col xs={24}>
            <Card
              bordered={false}
              style={{
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                borderRadius: 14,
                border: '1px solid #ede9fe',
                borderTop: '4px solid #8b5cf6',
                background: '#ffffff',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { padding: 20 } }}
            >
              <StaffCalendar />
              {/* Overhauled Appointments Section */}
              <div style={{ marginTop: 32 }}>
                <Typography.Title level={4}>Appointments Overview</Typography.Title>
                <Tabs defaultActiveKey="scheduled" style={{ marginBottom: 16 }}>
                  <Tabs.TabPane tab="Scheduled" key="scheduled">
                    <AppointmentListTable
                      onSelect={rec => setSelectedDocument(rec)}
                      data={documentRequests.filter(dr => dr.status === 'scheduled')}
                    />
                  </Tabs.TabPane>
                  <Tabs.TabPane tab="Past" key="past">
                    <AppointmentListTable
                      onSelect={rec => setSelectedDocument(rec)}
                      data={documentRequests.filter(dr => dr.status === 'completed' || dr.status === 'approved')}
                    />
                  </Tabs.TabPane>
                  <Tabs.TabPane tab="Canceled" key="canceled">
                    <AppointmentListTable
                      onSelect={rec => setSelectedDocument(rec)}
                      data={documentRequests.filter(dr => dr.status === 'canceled')}
                    />
                  </Tabs.TabPane>
                </Tabs>
                <AppointmentDetailsModal
                  visible={!!selectedDocument}
                  record={selectedDocument}
                  onClose={() => setSelectedDocument(null)}
                />
              </div>
            </Card>
          </Col>
        </Row>

        {/* Main Content Grid */}
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={7}>
            <Card 
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#f0f9f8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(15, 118, 110, 0.1)'
                  }}>
                    <FileSearchOutlined style={{ fontSize: 18, color: '#0f766e' }} />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Document Categories</span>
                </div>
              }
              hoverable
              bordered={false}
              size="small"
              className="dashboard-card"
              style={{ 
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(15, 118, 110, 0.08)',
                borderRadius: 14,
                border: '1px solid #e0f2f1',
                borderTop: '4px solid #0f766e',
                background: '#ffffff',
                height: '100%',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 118, 110, 0.15), 0 12px 32px rgba(15, 118, 110, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(15, 118, 110, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { 
                padding: '16px',
                height: 'calc(100% - 60px)',
                maxHeight: 'calc(100% - 60px)',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column'
              } }}
            >
              <Collapse
                defaultActiveKey={['Certificates']}
                expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} style={{ color: '#0f766e', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', fontSize: 16 }} />}
                style={{ 
                  background: 'transparent',
                  border: 'none',
                  flex: 1,
                  overflow: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                {Object.entries(categorizeRequests(documentRequests)).map(([category, data]) => {
                  const pendingCount = data.items.filter((req: DocumentRequest) => req.status?.toLowerCase() === 'pending').length;
                  return (
                    <Collapse.Panel
                      key={category}
                      header={
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 12, padding: '4px 0' }}>
                          <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            background: `${data.color}10`,
                            border: `1.5px solid ${data.color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: `0 2px 8px ${data.color}12`,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            flexShrink: 0
                          }}>
                            {data.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', letterSpacing: '0.3px' }}>{category}</span>
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: 2 }}>{data.items.length} items</div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            {pendingCount > 0 && (
                              <Tag color="gold" style={{ marginRight: 0, fontWeight: 600, borderRadius: 4, fontSize: '11px' }}>
                                {pendingCount}
                              </Tag>
                            )}
                          </div>
                        </div>
                      }
                    >
                      <div style={{ marginBottom: '12px', padding: '8px 0' }}>
                        <Typography.Text type="secondary" style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
                          {data.description}
                        </Typography.Text>
                      </div>
                      
                      <List
                        size="small"
                        dataSource={data.items.slice(0, 5)}
                        split={false}
                        style={{ marginTop: 8 }}
                        renderItem={request => {
                          const statusColors = {
                            PENDING: { color: '#faad14', bg: '#fff7e6' },
                            APPROVED: { color: '#52c41a', bg: '#f6ffed' },
                            REJECTED: { color: '#ff4d4f', bg: '#fff1f0' },
                            DEFAULT: { color: '#8c8c8c', bg: '#f5f5f5' }
                          };
                          
                          const status = request.status?.toUpperCase() || 'DEFAULT';
                          const statusStyle = statusColors[status as keyof typeof statusColors] || statusColors.DEFAULT;

                          return (
                            <List.Item
                              onClick={() => navigate('/document-processing', { state: { openRequestId: request._id } })}
                              actions={[
                                request.status === 'PENDING' && (
                                  <Space size={6} style={{ display: 'flex', gap: 2 }}>
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<CheckOutlined style={{ color: '#52c41a', fontSize: 16, fontWeight: 600 }} />}
                                      onClick={(e) => { e.stopPropagation(); setSelectedDocument(request); setDocumentStatus('APPROVED'); }}
                                      title="Approve this request"
                                      style={{
                                        width: 32,
                                        height: 32,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 6,
                                        transition: 'all 0.2s ease',
                                        background: 'transparent'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#f0fdf4';
                                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(82, 196, 26, 0.12)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.boxShadow = 'none';
                                      }}
                                    />
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16, fontWeight: 600 }} />}
                                      onClick={(e) => { e.stopPropagation(); setSelectedDocument(request); setDocumentStatus('REJECTED'); }}
                                      title="Reject this request"
                                      style={{
                                        width: 32,
                                        height: 32,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 6,
                                        transition: 'all 0.2s ease',
                                        background: 'transparent'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#fef2f2';
                                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(255, 77, 79, 0.12)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.boxShadow = 'none';
                                      }}
                                    />
                                  </Space>
                                )
                              ].filter(Boolean)}
                              style={{ padding: '10px 8px', borderRadius: 8, transition: 'all 0.2s ease', marginBottom: 4 }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f9fafb';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <List.Item.Meta
                                avatar={
                                  <AppAvatar
                                    size={40}
                                    background={statusStyle.bg}
                                    color={statusStyle.color}
                                    icon={<FileTextOutlined style={{ fontSize: 18 }} />}
                                  />
                                }
                                title={
                                  <div style={{ marginBottom: 4 }}>
                                    <Typography.Text strong style={{ fontSize: '13px', color: '#0f172a' }}>
                                      {formatDocumentType(request.type || request.title)}
                                    </Typography.Text>
                                    <Tag
                                      color={statusStyle.color}
                                      style={{ 
                                        marginLeft: 8,
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        lineHeight: '16px',
                                        fontWeight: 600,
                                        borderRadius: 4
                                      }}
                                    >
                                      {status}
                                    </Tag>
                                  </div>
                                }
                                description={
                                  <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>
                                    <div>{request.username || 'Unknown'}</div>
                                    <div style={{ color: '#9ca3af', marginTop: 2 }}>{formatDate(request.dateRequested || '')}</div>
                                  </div>
                                }
                              />
                            </List.Item>
                          );
                        }}
                        locale={{ 
                          emptyText: (
                            <Empty 
                              image={Empty.PRESENTED_IMAGE_SIMPLE} 
                              description={
                                <Typography.Text type="secondary">
                                  No {category.toLowerCase()} requests
                                </Typography.Text>
                              }
                            />
                          )
                        }}
                      />
                      {data.items.length > 0 && (
                        <div style={{ 
                          textAlign: 'center', 
                          marginTop: '16px',
                          paddingTop: '16px',
                          borderTop: '1px solid #f0f0f0'
                        }}>
                          <Button
                            type="link"
                            size="small"
                            icon={data.icon}
                            onClick={() => go('/documents')}
                          >
                            View All {category}
                          </Button>
                        </div>
                      )}
                    </Collapse.Panel>
                  );
                })}
              </Collapse>
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
              <div style={{ flex: 1 }}>
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: '#faf5ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(139, 92, 246, 0.1)'
                      }}>
                        📅
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Today's Appointments</span>
                    </div>
                  }
                  bordered={false}
                  style={{
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    borderRadius: 14,
                    border: '1px solid #ede9fe',
                    borderTop: '4px solid #8b5cf6',
                    background: '#ffffff',
                    height: '100%',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  styles={{ body: { padding: 16 } }}
                  size="small"
                >
                  <DailyAppointmentsCard />
                </Card>
              </div>
              <div>
                {/* Announcements card */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: '#f0f9f8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(8, 145, 178, 0.1)'
                      }}>
                        <FileTextOutlined style={{ fontSize: 18, color: '#0891b2' }} />
                      </div>
                      <span>Announcements</span>
                    </div>
                  }
                  style={{ 
                    marginTop: 0,
                    background: '#ffffff',
                    borderRadius: 14,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    border: '1px solid #e0f2f1',
                    borderTop: '4px solid #0891b2',
                    height: '100%',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  styles={{ body: { padding: 16, minHeight: 200, display: 'flex', flexDirection: 'column' } }}
                  size="small"
                  hoverable={false}
                >
                  {miniAnns.length === 0 ? (
                    <Empty
                      image={<FileTextOutlined style={{ fontSize: 42, color: '#d9d9d9' }} />}
                      description={<span style={{ color: '#888' }}>No announcements</span>}
                    />
                  ) : (
                    <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 6 }}>
                      <List
                        loading={miniLoading}
                        dataSource={miniAnns}
                        split={false}
                        renderItem={(item) => (
                          <List.Item 
                            style={{ 
                              cursor: 'pointer',
                              padding: '10px 8px',
                              borderRadius: 8,
                              transition: 'all 0.2s ease',
                              marginBottom: 4,
                              border: '1px solid transparent',
                              alignItems: 'center'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f0f9f8';
                              e.currentTarget.style.borderColor = '#d0ebe9';
                              e.currentTarget.style.boxShadow = '0 2px 6px rgba(8, 145, 178, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.borderColor = 'transparent';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                            onClick={() => { setMiniSelected(item); setDrawerVisible(true); }}
                          >
                            <List.Item.Meta
                              title={<div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4em' }}>{item.text || 'Untitled'}</div>
                                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: 6 }}>{new Date(item.createdAt).toLocaleString()}</div>
                                </div>
                              </div>}
                              description={null}
                            />
                            {item.imagePath && (
                              <div style={{ marginLeft: 12, width: 92, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                                <img loading="lazy" className="rounded-img" src={getAbsoluteApiUrl(`/announcements/${item._id}/image`)} alt="ann" style={{ width: 92, height: 60, objectFit: 'cover', borderRadius: 8, background: '#f0f0f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)' }} />
                              </div>
                            )}
                          </List.Item>
                        )}
                        size="small"
                      />
                    </div>
                  )}
                  <Button 
                    type="primary"
                    size="small"
                    style={{ 
                      position: 'absolute', 
                      right: 16, 
                      bottom: 16,
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#0891b2',
                      borderColor: '#0891b2',
                      height: 32,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#0678a0';
                      e.currentTarget.style.borderColor = '#0678a0';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#0891b2';
                      e.currentTarget.style.borderColor = '#0891b2';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    View All Announcements
                  </Button>
                </Card>
                <Drawer 
                  open={drawerVisible} 
                  onClose={() => { setDrawerVisible(false); setMiniSelected(null); }} 
                  title={null}
                  width={720} 
                  placement="right"
                  closeIcon={false}
                  styles={{ 
                    header: { padding: 0, height: 0, borderBottom: 'none' },
                    body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }
                  }}
                >
                  {miniSelected && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
                      {/* Header with close button */}
                      <div style={{ 
                        background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                        padding: '24px 24px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        color: '#ffffff'
                      }}>
                        <div style={{ flex: 1 }}>
                          <Typography.Title level={3} style={{ margin: 0, color: '#ffffff', fontWeight: 700 }}>
                            Announcement
                          </Typography.Title>
                          <Typography.Text style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, marginTop: 4, display: 'block' }}>
                            {new Date(miniSelected.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </Typography.Text>
                        </div>
                        <button 
                          onClick={() => { setDrawerVisible(false); setMiniSelected(null); }}
                          style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: 'none',
                            color: '#ffffff',
                            cursor: 'pointer',
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            flexShrink: 0
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px' }}>
                        {/* Image if available */}
                        {miniSelected.imagePath && (
                          <div style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' }}>
                            <img 
                              loading="lazy" 
                              src={getAbsoluteApiUrl(`/announcements/${miniSelected._id}/image`)} 
                              alt="announcement" 
                              style={{ width: '100%', height: 'auto', display: 'block' }} 
                            />
                          </div>
                        )}

                        {/* Text content */}
                        <Typography.Paragraph 
                          style={{ 
                            fontSize: 15, 
                            lineHeight: 1.8,
                            color: '#0f172a',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            marginBottom: 0
                          }}
                        >
                          {miniSelected.text}
                        </Typography.Paragraph>
                      </div>

                      {/* Footer */}
                      <div style={{ 
                        padding: '20px 28px',
                        borderTop: '1px solid #e5e7eb',
                        background: '#f9fafb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12, color: '#6b7280' }}>
                          Posted {new Date(miniSelected.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </Typography.Text>
                        <Button 
                          type="primary" 
                          onClick={() => {
                            setDrawerVisible(false);
                            setMiniSelected(null);
                            navigate('/announcements');
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                            border: 'none',
                            fontSize: 13,
                            fontWeight: 500,
                            height: 32,
                            paddingTop: 6
                          }}
                        >
                          View All
                        </Button>
                      </div>
                    </div>
                  )}
                </Drawer>
              </div>
            </div>
          </Col>
          <Col xs={24} lg={7}>
              <Card 
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.1)'
                  }}>
                    <MailOutlined style={{ fontSize: 18, color: '#dc2626' }} />
                  </div>
                  <span>Inquiries Inbox</span>
                  <Badge 
                    count={inboxInquiries.filter(i => i.status === 'open' || i.status === 'PENDING').length} 
                    style={{ backgroundColor: '#dc2626' }}
                  />
                </div>
              }
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12, color: '#6b7280' }}>
                  {inboxInquiries.length} total
                </Typography.Text>
              }
              hoverable
              bordered={false}
              size="small"
              className="dashboard-card"
              style={{ 
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                borderRadius: 14,
                border: '1px solid #e0f2f1',
                borderTop: '4px solid #dc2626',
                background: '#ffffff',
                position: 'relative',
                height: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              styles={{ body: { 
                height: 'calc(100% - 57px)',
                maxHeight: 'calc(100% - 57px)',
                padding: 16,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              } }}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Collapse
                  accordion={false}
                  defaultActiveKey={[ 'open' ]}
                  expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} style={{ color: '#dc2626', transition: 'all 0.2s ease', fontSize: 14 }} />}
                  style={{ background: 'transparent', border: 'none', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}
                  items={[
                    {
                      key: 'open',
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: '#fee2e2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 4px rgba(220, 38, 38, 0.08)'
                          }}>
                            <MailOutlined style={{ color: '#dc2626', fontSize: '14px' }} />
                          </div>
                          <Typography.Text strong style={{ fontSize: '13px', color: '#0f172a' }}>
                            Open Inquiries
                          </Typography.Text>
                          <Badge count={inboxInquiries.filter(i => i.status === 'PENDING' || i.status === 'open').length} style={{ backgroundColor: '#dc2626' }} />
                        </div>
                      ),
                      children: (
                        <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 8 }}>
                          {inboxInquiries.filter(i => i.status === 'PENDING' || i.status === 'open').length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">No open inquiries</Typography.Text>} />
                          ) : (
                <List
                    size="large"
                  dataSource={sortByDateDesc(inboxInquiries.filter(i => i.status === 'PENDING' || i.status === 'open'))}
                    split={false}
                    style={{ marginTop: 8 }}
                              renderItem={inquiry => {
                      const isOpen = inquiry.status === 'PENDING' || inquiry.status === 'open';
              const avatarColor = isOpen ? '#dc2626' : '#6b7280';
              const avatarBg = isOpen ? '#fee2e2' : '#f3f4f6';
              const isViewed = inquiry._id && viewedInquiryIds.has(String(inquiry._id));

              const displayName = inquiry.username || inquiry.residentName || inquiry.subject || 'Unknown';
              const letter = (displayName && displayName !== 'Unknown' && displayName.length > 0) ? displayName.charAt(0).toUpperCase() : '?';

                          return (
                            <List.Item
                          style={{ 
                            padding: '12px 10px',
                            borderRadius: 8,
                            transition: 'all 0.2s ease',
                            marginBottom: 4,
                            border: '1px solid transparent',
                            cursor: 'pointer',
                            backgroundColor: 'transparent'
                          }}
                          onClick={() => {
                            // mark as viewed locally so the dot color changes (persisted)
                            if (inquiry._id) markInquiryViewed(String(inquiry._id));
                            navigate('/staff/inbox', { state: { openInquiryId: inquiry._id } });
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                            e.currentTarget.style.borderColor = '#f3e8e8';
                            e.currentTarget.style.boxShadow = '0 2px 6px rgba(220, 38, 38, 0.06)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'transparent';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          
                          >
                          <List.Item.Meta
                            avatar={
                              <Badge dot={isOpen} color={isOpen && !isViewed ? '#fbbf24' : '#dc2626'} offset={[-6, 6]}>
                                <AppAvatar
                                  size={40}
                                  style={{
                                    backgroundColor: avatarBg,
                                    color: avatarColor,
                                    fontSize: '15px',
                                    fontWeight: 600
                                  }}
                                >
                                  {letter}
                                </AppAvatar>
                              </Badge>
                            }
                            title={
                              <div style={{ 
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: 4
                              }}>
                                <div style={{ 
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: '#0f172a'
                                }}>
                                  {inquiry.username || 'Unknown User'}
                                </div>
                                <Tag 
                                  color={isOpen ? 'gold' : 'success'}
                                  style={{ 
                                    margin: 0,
                                    fontSize: '11px',
                                    lineHeight: '18px',
                                    height: '20px',
                                    padding: '0 8px',
                                    fontWeight: 600,
                                    borderRadius: '4px'
                                  }}
                                >
                                  {isOpen ? 'PENDING' : 'RESOLVED'}
                                </Tag>
                              </div>
                            }
                            description={
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                <Typography.Text
                                  style={{ 
                                    fontSize: '12px',
                                    color: '#6b7280',
                                    flexGrow: 1,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    lineHeight: '1.4'
                                  }}
                                >
                                  {inquiry.message}
                                </Typography.Text>
                                <Typography.Text 
                                  type="secondary" 
                                  style={{ 
                                    fontSize: '11px', 
                                    flexShrink: 0,
                                    color: '#9ca3af'
                                  }}
                                >
                                  {formatDate(inquiry.createdAt)}
                                </Typography.Text>
                              </div>
                            }
                          />
                        </List.Item>
                          );
                        }}
                      />
                    )}
                  </div>
                      ),
                    },
                    {
                      key: 'resolved',
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: '#d1fae5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.08)'
                          }}>
                            <MailOutlined style={{ color: '#10b981', fontSize: '14px' }} />
                          </div>
                          <Typography.Text strong style={{ fontSize: '13px', color: '#0f172a' }}>
                            Resolved Inquiries
                          </Typography.Text>
                          <Badge count={inboxInquiries.filter(i => !(i.status === 'PENDING' || i.status === 'open')).length} style={{ backgroundColor: '#10b981' }} />
                        </div>
                      ),
                      children: (
                        <div style={{ maxHeight: 220, overflowY: 'auto', paddingRight: 8 }}>
                          {inboxInquiries.filter(i => !(i.status === 'PENDING' || i.status === 'open')).length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">No resolved inquiries</Typography.Text>} />
                          ) : (
                            <List
                              size="small"
                              dataSource={sortByDateDesc(inboxInquiries.filter(i => !(i.status === 'PENDING' || i.status === 'open')))}
                              split={false}
                              style={{ marginTop: 8 }}
                              renderItem={inquiry => {
                                const avatarColor = '#6b7280';
                                const avatarBg = '#f3f4f6';

                                return (
                                  <List.Item
                                    style={{ 
                                      padding: '10px 8px',
                                      borderRadius: 8,
                                      transition: 'all 0.2s ease',
                                      marginBottom: 4,
                                      border: '1px solid transparent',
                                      cursor: 'pointer'
                                    }}
                                  onClick={() => {
                                    if (inquiry._id) markInquiryViewed(String(inquiry._id));
                                    setSelectedInquiry(inquiry);
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f0fdf4';
                                    e.currentTarget.style.borderColor = '#d1e7dd';
                                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(16, 185, 129, 0.06)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.borderColor = 'transparent';
                                    e.currentTarget.style.boxShadow = 'none';
                                  }}
                                  >
                                    <List.Item.Meta
                                      avatar={<AppAvatar size={40} style={{ backgroundColor: avatarBg, color: avatarColor, fontSize: 14 }}>{(inquiry.username || 'Unknown').charAt(0).toUpperCase()}</AppAvatar>}
                                      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{inquiry.username || 'Unknown User'}</div>
                                        <Tag color="success" style={{ margin: 0, fontSize: '11px', fontWeight: 600, lineHeight: '18px', height: '20px', padding: '0 8px', borderRadius: 4 }}>{'RESOLVED'}</Tag>
                                      </div>}
                                      description={<div style={{ fontSize: '12px', color: '#6b7280' }}>{inquiry.message}</div>}
                                    />
                                  </List.Item>
                                );
                              }}
                            />
                          )}
                        </div>
                      ),
                    }
                  ]}
                />
              </div>
            </Card>
          </Col>
          
        </Row>
        {/* Documents Modal - shows processed documents from documents collection */}
        <Modal
          open={docsModalVisible}
          title={`Processed Documents (${allDocuments.length})`}
          onCancel={() => { setDocsModalVisible(false); }}
          footer={null}
          width={screens.xs ? '95%' : screens.md ? 1000 : 1200}
          styles={{ body: { padding: '12px 18px' } }}
        >
          <Spin spinning={docsLoading}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexDirection: screens.xs ? 'column' : 'row', alignItems: screens.xs ? 'stretch' : 'center' }}>
              <Input.Search
                placeholder="Search by title, filename, transaction code or uploader"
                allowClear
                enterButton={false}
                onSearch={(v) => setDocsSearch(String(v || '').trim())}
                onChange={(e) => setDocsSearch(e.target.value)}
                style={{ maxWidth: 420, flex: 1 }}
                value={docsSearch}
              />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button onClick={() => { setDocsSearch(''); }}>Clear</Button>
                <Button type="primary" onClick={() => { setAllDocuments(allDocuments.slice().sort((a,b) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime())); }}>Sort Newest</Button>
              </div>
            </div>

            <Table
              dataSource={allDocuments.filter(d => {
                if (!docsSearch) return true;
                const q = docsSearch.toLowerCase();
                const candidates = [d.title, d.filename, d.name, d.transactionCode, d.transactioncode, (d.uploadedBy && (d.uploadedBy.username || d.uploadedBy.name)) || d.uploadedBy || ''];
                return candidates.some((c: any) => c && String(c).toLowerCase().includes(q));
              })}
              rowKey={(r: any) => r._id || r.id || r.filename}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Title',
                  dataIndex: 'title',
                  key: 'title',
                  render: (t: any, r: any) => (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <AppAvatar size={36} icon={<FileTextOutlined />} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t || r.filename || r.name || 'Untitled'}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{r.sourceTemplateName || r.templateName || ''}</div>
                      </div>
                    </div>
                  )
                },
                { title: 'Transaction', dataIndex: 'transactionCode', key: 'transactionCode', responsive: ['sm'], render: (v: any) => v || '-' },
                { title: 'Uploaded By', dataIndex: 'uploadedBy', key: 'uploadedBy', responsive: ['md'], render: (u: any) => (u && (u.username || u.name)) || (typeof u === 'string' ? u : '-') },
                { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', responsive: ['sm'], render: (d: any) => formatDate(d) },
                {
                  title: 'Actions',
                  key: 'action',
                  width: 220,
                  render: (_: any, rec: any) => (
                    <Space>
                      <Button size="small" onClick={() => handleDownloadProcessed(rec)}>Download</Button>
                      <Button size="small" onClick={() => { setPreviewDoc(rec); setPreviewVisible(true); }}>Preview</Button>
                      { (rec.transactionCode || rec.transactioncode) && (
                        <Button size="small" onClick={() => { navigator.clipboard?.writeText(rec.transactionCode || rec.transactioncode || ''); notification.success({ message: 'Copied', description: 'Transaction code copied to clipboard' }); }}>Copy TX</Button>
                      ) }
                    </Space>
                  )
                }
              ]}
            />
          </Spin>
          {/* Preview Drawer for a processed document */}
          <Drawer
            title={previewDoc ? (previewDoc.title || previewDoc.filename || 'Document') : 'Document'}
            placement="right"
            onClose={() => { setPreviewVisible(false); setPreviewDoc(null); }}
            open={previewVisible}
            width={screens.xs ? '95%' : 560}
          >
            {previewDoc ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{previewDoc.title || previewDoc.filename || 'Untitled'}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{previewDoc.sourceTemplateName || previewDoc.templateName || ''}</div>
                  </div>
                  <div>
                    <Button onClick={() => handleDownloadProcessed(previewDoc)} type="primary">Download</Button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Tag color="blue">Created: {formatDate(previewDoc.createdAt)}</Tag>
                  {previewDoc.transactionCode && <Tag color="purple">TX: {previewDoc.transactionCode}</Tag>}
                  {previewDoc.uploadedBy && <Tag>By: {(previewDoc.uploadedBy.username || previewDoc.uploadedBy.name) || previewDoc.uploadedBy}</Tag>}
                </div>

                <div style={{ color: '#444', fontSize: 13 }}>
                  <div style={{ marginBottom: 8 }}>{previewDoc.description || previewDoc.notes || ''}</div>
                  <div style={{ marginTop: 8 }}>
                    <Button type="link" onClick={() => { navigator.clipboard?.writeText(previewDoc.transactionCode || ''); notification.success({ message: 'Copied', description: 'Transaction code copied' }); }}>Copy Transaction Code</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>No document selected</div>
            )}
          </Drawer>
          <Modal
            title="Manage Inquiries"
            open={manageModalVisible}
            onCancel={() => { setManageModalVisible(false); setManageTableData(null); }}
            footer={null}
            width={900}
          >
            <Table
              dataSource={manageTableData !== null ? manageTableData : sortByDateDesc(inquiries)}
              rowKey={(r: any) => r._id}
              pagination={{ pageSize: 10 }}
              onRow={(record) => ({
                onClick: () => {
                  // mark viewed and navigate to the thread
                  if (record && record._id) markInquiryViewed(String(record._id));
                  setManageModalVisible(false);
                  navigate('/staff/inbox', { state: { openInquiryId: record._id } });
                }
              })}
            >
              <Table.Column
                title="Name"
                dataIndex="username"
                key="username"
                render={(v: any, r: any) => v || r.residentName || r.subject || 'Unknown'}
              />
              <Table.Column
                title="Type of Inquiry"
                dataIndex="type"
                key="type"
                render={(t: any) => (t ? String(t) : 'General')}
              />
              <Table.Column
                title="Status"
                dataIndex="status"
                key="status"
                render={(s: any) => getStatusTag(s)}
              />
              <Table.Column
                title="Date Inquired"
                dataIndex="createdAt"
                key="createdAt"
                render={(d: any) => formatDate(d)}
              />
            </Table>
          </Modal>
        </Modal>

        {/* Document Response Modal */}
        <Modal
          open={!!selectedDocument}
          title={selectedDocument ? `${documentStatus} Document Request` : ''}
          onCancel={() => { setSelectedDocument(null); setResponseText(''); setDocumentStatus(''); }}
          footer={selectedDocument ? [
            <Input.TextArea
              key="notes"
              rows={4}
              value={responseText}
              onChange={e => setResponseText(e.target.value)}
              placeholder="Type notes..."
            />,
            <Button
              key="submit"
              type="primary"
              disabled={!responseText.trim()}
              onClick={handleDocumentAction}
            >Submit</Button>
          ] : null}
        >
          {selectedDocument && (
            <div>
              <Typography.Text strong>Type:</Typography.Text> {formatDocumentType(selectedDocument.type || selectedDocument.title)}<br />
              <Typography.Text strong>Description:</Typography.Text> {selectedDocument.description || ''}<br />
              <Typography.Text strong>Requested by:</Typography.Text> {selectedDocument.username || 'Unknown'}<br />
              <Typography.Text strong>Barangay ID:</Typography.Text> {selectedDocument.barangayID || 'Unknown'}<br />
              <Typography.Text strong>Date:</Typography.Text> {formatDate(selectedDocument.dateRequested || '')}<br />
            </div>
          )}
        </Modal>
        {/* Inquiry Response Modal */}
        <Modal
          open={!!selectedInquiry}
          title={selectedInquiry ? `Reply to Inquiry` : ''}
          onCancel={() => { setSelectedInquiry(null); setResponseText(''); }}
          footer={selectedInquiry ? [
            <Button
              key="cancel"
              onClick={() => { setSelectedInquiry(null); setResponseText(''); }}
            >Cancel</Button>,
            <Button
              key="send"
              type="primary"
              loading={responding}
              disabled={!responseText.trim()}
              onClick={handleInquiryResponse}
            >Send Reply</Button>
          ] : null}
          centered
          className="professional-modal"
        >
          {selectedInquiry && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8, borderLeft: '3px solid #0891b2' }}>
                <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 4 }}>FROM</Typography.Text>
                <Typography.Text style={{ fontSize: 14, color: '#0f172a' }}>{selectedInquiry.username || 'Unknown User'}</Typography.Text>
              </div>
              <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8, borderLeft: '3px solid #7c3aed' }}>
                <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 4 }}>TYPE</Typography.Text>
                <Typography.Text style={{ fontSize: 14, color: '#0f172a' }}>{selectedInquiry.type || 'General'}</Typography.Text>
              </div>
              <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 4 }}>MESSAGE</Typography.Text>
                <Typography.Paragraph style={{ fontSize: 14, color: '#0f172a', marginBottom: 0, whiteSpace: 'pre-wrap' }}>{selectedInquiry.message}</Typography.Paragraph>
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 8 }}>YOUR REPLY</Typography.Text>
                <Input.TextArea
                  rows={4}
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  placeholder="Type your response here..."
                  disabled={responding}
                  style={{ borderRadius: 6, fontSize: 13 }}
                />
              </div>
            </div>
          )}
        </Modal>
        {/* Completed Requests Modal */}
        <Modal
          open={completedModalVisible}
          title={`Completed Requests (${stats.completedRequests || 0})`}
          onCancel={() => setCompletedModalVisible(false)}
          footer={null}
          width={1100}
          styles={{ body: { padding: 12 } }}
        >
          <div style={{ overflowX: 'auto' }}>
            {/* Table of completed document requests (horizontally scrollable) */}
            <Table
              dataSource={documentRequests.filter(d => (d.status || '').toLowerCase() === 'approved' || (d.status || '').toLowerCase() === 'completed')}
              rowKey={(record: any) => record._id}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1000 }}
              columns={[
                {
                  title: 'Requester',
                  dataIndex: 'username',
                  key: 'username',
                  width: 200,
                  render: (val: any, rec: any) => val || rec.requesterId?.fullName || 'Unknown'
                },
                {
                  title: 'Document',
                  dataIndex: 'type',
                  key: 'type',
                  width: 220,
                  render: (val: any, rec: any) => formatDocumentType(val || rec.title)
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  width: 300,
                  render: (val: any) => val || '-'
                },
                {
                  title: 'Date Requested',
                  dataIndex: 'dateRequested',
                  key: 'dateRequested',
                  width: 180,
                  render: (val: any) => formatDate(val)
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (val: any) => getStatusTag(val)
                },
                {
                  title: 'Action',
                  key: 'action',
                  width: 120,
                  render: (_: any, rec: any) => (
                    <Button type="link" onClick={() => { setSelectedDocument(rec); setCompletedModalVisible(false); setDocumentStatus(''); }}>
                      View
                    </Button>
                  )
                }
              ]}
            />
          </div>
        </Modal>
      </div>
    </Spin>

  );
}

export default StaffDashboard;
