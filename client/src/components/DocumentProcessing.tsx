import { useRef } from 'react';
import React, { useEffect, useState } from 'react';
import './DocumentProcessingHighlight.css';
import styles from './DocumentProcessing.module.css';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Typography, Modal, Spin, Table, Input, Tooltip, Tag, Space, Button, Radio, Select, notification } from 'antd';
import { SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { FileWordOutlined, FilePdfOutlined, FileImageOutlined, EyeOutlined } from '@ant-design/icons';
import { documentsAPI, API_URL } from '../services/api';
import { formatDate as formatDateUtil } from '../utils/formatDate';
import { generateFilledDocx } from '../services/generateFilledDocx';

const DocumentProcessing: React.FC = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [requestedTypes, setRequestedTypes] = useState<string[]>([]);
  const [fileRequestMap, setFileRequestMap] = useState<Record<string, any>>({});
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRequests, setPreviewRequests] = useState<any[]>([]);
  const [previewTemplateHtml, setPreviewTemplateHtml] = useState<string>('');
  const [previewSelectedRequestId, setPreviewSelectedRequestId] = useState<string | null>(null);
  const [showPreviewRequests, setShowPreviewRequests] = useState<boolean>(true);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [prioritizeModalVisible, setPrioritizeModalVisible] = useState(false);
  const [prioritizeCandidates] = useState<any[]>([]);
  const [selectedPriorityRequest, setSelectedPriorityRequest] = useState<string | null>(null);
  const [prioritizeTargetFileId, setPrioritizeTargetFileId] = useState<string | null>(null);
  const [generatedCopyId, setGeneratedCopyId] = useState<string | null>(null);
  const [generatedModalVisible, setGeneratedModalVisible] = useState(false);
  const [processedDocId, setProcessedDocId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [documentCreationDates, setDocumentCreationDates] = useState<Record<string, Date>>({});
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [generateLoading, setGenerateLoading] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();
  const openRequestIdFromNav = (location && (location.state as any) && (location.state as any).openRequestId) ? (location.state as any).openRequestId : null;

  // Helpers to work with fileRequestMap which stores arrays per file id
  const getRequestsForFile = React.useCallback((fileId: string) => {
    const v = fileRequestMap[fileId];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }, [fileRequestMap]);

  // Check for unclaimed documents and send follow-up emails
  React.useEffect(() => {
    const checkUnclaimedDocuments = async () => {
      const now = new Date();
      Object.entries(documentCreationDates).forEach(([requestId, creationDate]) => {
        const daysSinceCreation = Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Send follow-up email after 3 days if document is still pending
        if (daysSinceCreation === 3) {
          const requests = getRequestsForFile(selectedFile?._id || '');
          const request = requests?.find((r: any) => (r._id || r.requestId) === requestId);
          if (request && request.status === 'approved') {
            documentsAPI.sendPickupReminder(
              requestId,
              request.username || request.requesterName || 'Unknown',
              selectedFile?.filename || 'document'
            ).catch(err => {
              console.error('Failed to send pickup reminder:', err);
            });
          }
        }
      });
    };

    // Check every hour for unclaimed documents
    const interval = setInterval(checkUnclaimedDocuments, 60 * 60 * 1000); // 1 hour in milliseconds
    
    return () => clearInterval(interval);
  }, [documentCreationDates, selectedFile, getRequestsForFile, fileRequestMap]);

  const getPrimaryRequest = (fileId: string) => {
    const arr = getRequestsForFile(fileId);
    return arr.length ? arr[0] : null;
  };

  const getPrioritizedRequest = React.useCallback((fileId: string) => {
    const arr = getRequestsForFile(fileId);
    if (!arr || !arr.length) return null;
    const found = arr.find((r: any) => ((r.notes && r.notes.toString().toLowerCase().includes('priority')) || r.priority === true));
    return found || arr[0];
  }, [getRequestsForFile]);

  // refs for functions used by earlier effects to avoid use-before-define lint warnings
  const handleProcessClickRef = useRef<((file: any) => Promise<void>) | null>(null);
  const renderPreviewForRequestRef = useRef<((id: string) => Promise<void>) | null>(null);
  // Fetch files and requests and build fileRequestMap. Extracted so we can call it after prioritization.
  const fetchFilesAndRequests = async () => {
    setLoading(true);
    try {
      // Fetch all GridFS files
      const fileList = await documentsAPI.listFiles();
      // Fetch document requests (all, for staff/admin; use getMyDocuments for user)
      const requests = await documentsAPI.getDocumentRecords();
      // Extract unique requested types (normalize to lowercase for matching)
      const types: string[] = Array.from(new Set((requests || []).map((r: any) => (r.type || '').toLowerCase()).filter(Boolean)));
      setRequestedTypes(types);
      // Map files to their matching requests (by type in filename)
      // We store an array per file id to support multiple requests for the same template/file
      const fileRequestMapLocal: Record<string, any> = {};
      // Helper to normalize strings: remove all non-alphanumeric chars, lowercase
      const normalize = (str: string) => (str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      fileList.forEach((file: any) => {
        if (!file || !file.filename) return;
        const normalizedFilename = normalize(file.filename);
        // Find all requests whose type matches filename (robust normalization)
        const matchedRequests = (requests || []).filter((req: any) =>
          req.type && normalizedFilename.includes(normalize(req.type))
        );
        if (matchedRequests && matchedRequests.length) fileRequestMapLocal[file._id] = matchedRequests;
      });
      // Filter files to only those matching requested types
      const filteredFiles = fileList.filter((file: any) => {
        if (!file || !file.filename) return false;
        if (types.length === 0) return true; // If no requests, show all
        const normalizedFilename = file.filename.replace(/[_\s]/g, '').toLowerCase();
        return types.some((type: string) => normalizedFilename.includes(type.replace(/[_\s]/g, '')));
      });
      setFiles(filteredFiles);
      setFileRequestMap(fileRequestMapLocal);
    } catch (err) {
      setFileRequestMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilesAndRequests();
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // After files and mapping are fetched, if navigation included an openRequestId, open the preview
  useEffect(() => {
    if (!openRequestIdFromNav) return;
    // Find the file that contains this request
    const fileId = Object.keys(fileRequestMap).find(fid => {
      const arr = Array.isArray(fileRequestMap[fid]) ? fileRequestMap[fid] : (fileRequestMap[fid] ? [fileRequestMap[fid]] : []);
      return arr.some((r: any) => (r._id || r.requestId) === openRequestIdFromNav);
    });
    if (fileId) {
      const file = files.find(f => f._id === fileId);
      if (file) {
        // open preview for that file and request
        setSelectedFile(file);
        // call via refs to avoid use-before-define issues
        (async () => {
          try {
            await handleProcessClickRef.current?.(file);
            setPreviewSelectedRequestId(openRequestIdFromNav);
            await renderPreviewForRequestRef.current?.(openRequestIdFromNav as string);
            setPreviewVisible(true);
          } catch (e) {}
        })();
      }
    }
    else {
      // No matching file found in the mapping. Try fetching the request directly and open a lightweight preview
      (async () => {
        try {
          if ((documentsAPI as any).getDocumentById) {
            const req = await (documentsAPI as any).getDocumentById(openRequestIdFromNav);
            if (req) {
              // Ensure previewRequests contains this request and open the preview modal
              setPreviewRequests([req]);
              setPreviewSelectedRequestId(openRequestIdFromNav);
              // Build a simple previewHtml from the request.fieldValues if template HTML isn't available
              try {
                const fieldValues = req.fieldValues || {};
                const keys = Object.keys(fieldValues);
                if (keys.length) {
                  const tableHtml = `
                    <table style="width:100%;border-collapse:collapse;">
                      <thead>
                        <tr>
                          <th style='border:1px solid #ccc;padding:8px;text-align:left;'>Field</th>
                          <th style='border:1px solid #ccc;padding:8px;text-align:left;'>Submitted Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${keys.map(k => `<tr><td style='border:1px solid #ccc;padding:8px;'>${k}</td><td style='border:1px solid #ccc;padding:8px;'>${(fieldValues[k] || '')}</td></tr>`).join('')}
                      </tbody>
                    </table>
                    // when we open a preview for a request that wasn't tied to a specific file in mapping,
                    // attempt to scroll to and highlight the request's entry if present in the UI
                    setTimeout(() => {
                      try {
                        const el = rowRefs.current[openRequestIdFromNav];
                        if (el && el.scrollIntoView) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('cv-highlight');
                          if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
                          // remove highlight after 2s
                          // @ts-ignore - window.setTimeout returns number in browser
                          highlightTimeoutRef.current = window.setTimeout(() => el.classList.remove('cv-highlight'), 2000);
                        }
                      } catch (e) {}
                    }, 120);
                  `;
                  setPreviewHtml(tableHtml);
                } else {
                  setPreviewHtml('<div style="color:#666">No submitted field values available.</div>');
                }
              } catch (e) {
                setPreviewHtml('<div style="color:red">Failed to build preview.</div>');
              }
              setPreviewVisible(true);
            }
          }
        } catch (e) {
          // ignore — best effort
        }
      })();
    }
    // clear navigation state so it doesn't re-open repeatedly
    try { navigate(location.pathname, { replace: true, state: {} }); } catch (e) {}
  }, [fileRequestMap, files, navigate, location.pathname, openRequestIdFromNav]);

  // handleCardClick removed (unused)

  // openPrioritizeModal removed (unused)

  const confirmPrioritize = async () => {
    if (!selectedPriorityRequest) {
      alert('Select a request to prioritize');
      return;
    }
    try {
      if ((documentsAPI as any).prioritize) {
        await (documentsAPI as any).prioritize(selectedPriorityRequest);
      } else if (documentsAPI.updateDocumentStatus) {
        // updateDocumentStatus requires a status; use current request status or 'pending' and add notes flag
        let currentReq: any = null;
        for (const v of Object.values(fileRequestMap)) {
          const arr = Array.isArray(v) ? v : [v];
          const found = arr.find((r: any) => (r._id || r.requestId) === selectedPriorityRequest);
          if (found) {
            currentReq = found;
            break;
          }
        }
        const currentStatus = currentReq?.status || 'pending';
        await documentsAPI.updateDocumentStatus(selectedPriorityRequest, { status: currentStatus, notes: 'PRIORITY' });
      }

      setPrioritizeModalVisible(false);
      // Refresh files and request mapping so UI reflects priority changes
      await fetchFilesAndRequests();

      // Update only the specific file mapping if possible
      if (prioritizeTargetFileId) {
        try {
          const refreshed = getRequestsForFile(prioritizeTargetFileId);
          let updated: any = refreshed.find((r: any) => (r._id || r.requestId) === selectedPriorityRequest) || null;

          if (!updated && (documentsAPI as any).getDocumentById) {
            try {
              const fetched = await (documentsAPI as any).getDocumentById(selectedPriorityRequest);
              updated = fetched;
            } catch (e) {
              updated = null;
            }
          }

          if (updated) {
            setFileRequestMap(prev => {
              const cloned: Record<string, any> = { ...prev };
              cloned[prioritizeTargetFileId] = Array.isArray(refreshed) ? refreshed : (refreshed ? [refreshed] : []);
              return cloned;
            });
          } else {
            // fallback: mark the selected request as prioritized in the specific file mapping
            setFileRequestMap(prev => {
              try {
                const cloned: Record<string, any> = { ...prev };
                const v = cloned[prioritizeTargetFileId];
                const arr = Array.isArray(v) ? v.slice() : (v ? [v] : []);
                const idx = arr.findIndex((r: any) => (r._id || r.requestId) === selectedPriorityRequest);
                if (idx !== -1) {
                  arr[idx] = { ...arr[idx], priority: true, notes: (arr[idx].notes || '') + ' PRIORITY' };
                }
                cloned[prioritizeTargetFileId] = arr;
                return cloned;
              } catch (e) {
                return prev;
              }
            });
          }
        } catch (e) {
          // ignore and leave UI refreshed from fetchFilesAndRequests
        }
      }

      // If preview modal is open for this file, update previewRequests and selection so modal reflects the change
      if (selectedFile && prioritizeTargetFileId && selectedFile._id === prioritizeTargetFileId) {
        const updatedRequests = getRequestsForFile(prioritizeTargetFileId);
        setPreviewRequests(updatedRequests);
        setPreviewSelectedRequestId(selectedPriorityRequest);
        // re-render preview for the newly prioritized request
        if (selectedPriorityRequest) {
          await renderPreviewForRequest(selectedPriorityRequest);
        }
      }

      alert('Prioritization saved');
      setPrioritizeTargetFileId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to prioritize');
    }
  };

  const handleProcessClick = React.useCallback(async (file: any) => {
    setPreviewVisible(true);
    setPreviewLoading(true);
    setPreviewHtml('');
    try {
      // Populate preview-related state: all requests for file and template HTML
  const requests = getRequestsForFile(file._id) || [];
  // Only show pending requests in the preview selector
  const pendingRequests = requests.filter((r: any) => ((r.status || '').toString().toLowerCase() === 'pending'));
  setPreviewRequests(pendingRequests);
  const prioritized = getPrioritizedRequest(file._id);
  // Prefer prioritized request if it is pending, otherwise fall back to the first pending request
  const firstPending = pendingRequests[0] || null;
  const prioritizedPending = prioritized && ((prioritized.status || '').toString().toLowerCase() === 'pending') ? prioritized : null;
  setPreviewSelectedRequestId(prioritizedPending ? (prioritizedPending._id || prioritizedPending.requestId) : (firstPending?._id || firstPending?.requestId || null));
      // Fetch template preview HTML once for this file
      const previewResp = await (await import('../services/api')).axiosPublic.get(`/documents/preview/${file._id}`, { params: { format: 'html' }, responseType: 'text' });
      const html = previewResp && previewResp.data ? previewResp.data : '';
      setPreviewTemplateHtml(html);
      // Render preview for the selected/prioritized request
  const selectedReqId = prioritizedPending ? (prioritizedPending._id || prioritizedPending.requestId) : (firstPending?._id || firstPending?.requestId || null);
      if (selectedReqId) await renderPreviewForRequestRef.current?.(selectedReqId);
    } catch (err) {
      setPreviewHtml('<div style="color:red">Failed to load preview.</div>');
    }
    setPreviewLoading(false);
  }, [getRequestsForFile, getPrioritizedRequest]);

  // assign refs so earlier effects can call the latest implementations
  handleProcessClickRef.current = handleProcessClick;

  // Render previewHtml for a specific request id using cached previewTemplateHtml
  const renderPreviewForRequest = React.useCallback(async (requestId: string) => {
    try {
      const req = Object.values(fileRequestMap).flat().find((r: any) => (r._id || r.requestId) === requestId) || null;
  const fieldValues = req?.fieldValues || {};
      // If template html not present, nothing to render
      const html = previewTemplateHtml || '';
      const regex = /\{(.*?)\}/g;
      let match;
      const fields: string[] = [];
      while ((match = regex.exec(html)) !== null) {
        fields.push(match[1].trim());
      }
      if (fields.length > 0) {
        const tableHtml = `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style='border:1px solid #ccc;padding:8px;text-align:left;'>Field</th>
                <th style='border:1px solid #ccc;padding:8px;text-align:left;'>Submitted Value</th>
              </tr>
            </thead>
            <tbody>
              ${fields.map(f => {
                const value = fieldValues[f] || '';
                return `<tr><td style='border:1px solid #ccc;padding:8px;'>${f}</td><td style='border:1px solid #ccc;padding:8px;'>${value}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        `;
        setPreviewHtml(tableHtml);
      } else {
        setPreviewHtml('<div style="color:red">No { ... } content found.</div>');
      }
    } catch (err) {
      setPreviewHtml('<div style="color:red">Failed to load preview.</div>');
    }
  }, [fileRequestMap, previewTemplateHtml]);

  // assign ref for preview renderer
  renderPreviewForRequestRef.current = renderPreviewForRequest;

  // Open preview for a selected record (used by table Actions)
  const openPreview = async (record: any) => {
    setSelectedFile(record);
    await handleProcessClick(record);
  };

  // (Removed download and status update helpers — preview-only workflow)
 
  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #fafbfc 0%, #f5f8fc 100%)',
      padding: '16px'
    }}>
      {/* Shiny Container */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        border: '1px solid rgba(24, 144, 255, 0.1)',
        padding: '24px',
        minHeight: '100vh'
      }}>
      <Spin spinning={loading} tip="Loading documents...">
        <div className={styles.wrapper}>
        {/* Header Section */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(114, 46, 209, 0.35)',
              flexShrink: 0
            }}>
              <FileWordOutlined style={{ fontSize: 32, color: '#ffffff' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>
                Document Processing
              </h2>
              <p style={{ margin: '8px 0 0 0', background: 'linear-gradient(90deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 13, fontWeight: 600 }}>
                Manage and process document requests
              </p>
            </div>
          </div>

          {/* Filters Section */}
          <Card
            style={{
              borderRadius: 12,
              border: '1px solid rgba(24, 144, 255, 0.1)',
              boxShadow: '0 2px 12px rgba(114, 46, 209, 0.06)',
              background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
              padding: '18px'
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography.Text style={{ fontSize: 12, fontWeight: 700, background: 'linear-gradient(90deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', display: 'block', marginBottom: 8 }}>
                  🔍 Search
                </Typography.Text>
                <Input
                  placeholder="Search by document name..."
                  prefix={<SearchOutlined style={{ color: '#722ed1' }} />}
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  style={{ borderRadius: 8, border: '1px solid rgba(114, 46, 209, 0.2)' }}
                  size="large"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Content Section */}
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {files.filter((file: any) => {
              if (filterQuery && !(file.filename || '').toLowerCase().includes(filterQuery.toLowerCase())) return false;
              return true;
            }).length === 0 ? (
              <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
                <FileWordOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 12 }} />
                <Typography.Text type="secondary">No documents found</Typography.Text>
              </Card>
            ) : (
              files.filter((file: any) => {
                if (filterQuery && !(file.filename || '').toLowerCase().includes(filterQuery.toLowerCase())) return false;
                return true;
              }).map((file: any) => {
                const name = file.filename || '';
                const ext = (name.split('.').pop() || '').toLowerCase();
                let icon = <FileWordOutlined style={{ color: '#2B6CB0', fontSize: 24 }} />;
                if (ext === 'pdf') icon = <FilePdfOutlined style={{ color: '#E53E3E', fontSize: 24 }} />;
                if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp'].includes(ext)) icon = <FileImageOutlined style={{ color: '#319795', fontSize: 24 }} />;
                const primary = getPrimaryRequest(file._id);
                const status = primary?.status || '';

                let statusConfig = { label: 'Pending', color: '#1890ff', bgColor: 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%)', icon: '⏳', borderColor: '#1890ff' };
                if (status === 'approved') statusConfig = { label: 'Approved', color: '#52c41a', bgColor: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)', icon: '✓', borderColor: '#52c41a' };
                if (status === 'rejected') statusConfig = { label: 'Rejected', color: '#ff4d4f', bgColor: 'linear-gradient(135deg, #fff2f0 0%, #ffe7e6 100%)', icon: '✕', borderColor: '#ff4d4f' };

                return (
                  <Card 
                    key={file._id}
                    hoverable
                    style={{
                      borderRadius: 12,
                      border: '1px solid rgba(114, 46, 209, 0.12)',
                      boxShadow: '0 4px 16px rgba(114, 46, 209, 0.1)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 12px 32px rgba(114, 46, 209, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(114, 46, 209, 0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    ref={(el: any) => {
                      const primary = getPrimaryRequest(file._id);
                      const rid = primary && (primary._id || primary.requestId);
                      if (rid) rowRefs.current[rid] = el;
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 50%, #13c2c2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff',
                        fontSize: 20
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name.replace(/\.docx$/i, '')}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{file.type || 'Unknown'}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>
                          {file.uploadDate ? formatDateUtil(file.uploadDate) : 'No date'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        {/* Per-file requestor selector (mobile) */}
                        <div>
                          {(() => {
                            const requests = getRequestsForFile(file._id) || [];
                            // Filter to only show pending requests
                            const pendingRequests = requests.filter((r: any) => r.status === 'pending');
                            if (!pendingRequests.length) return <div style={{ color: '#888', fontSize: 12 }}>No pending requests</div>;
                            const options = pendingRequests.map((r: any) => ({ label: (r.username || r.requesterName || 'Unknown') + (r.createdAt ? ` · ${formatDateUtil(r.createdAt)}` : ''), value: (r._id || r.requestId) }));
                            const primary = getPrimaryRequest(file._id);
                            // Only use primary if it's pending, otherwise use first pending
                            const value = (primary && primary.status === 'pending' && (primary._id || primary.requestId)) || options[0].value;
                            return (
                              <Select
                                size="small"
                                value={value}
                                style={{ minWidth: 160 }}
                                options={options}
                                onChange={(val: any) => {
                                  setFileRequestMap(prev => {
                                    const cloned: Record<string, any> = { ...prev };
                                    const arr = Array.isArray(cloned[file._id]) ? cloned[file._id].slice() : (cloned[file._id] ? [cloned[file._id]] : []);
                                    const idx = arr.findIndex((x: any) => ((x._id || x.requestId) === val));
                                    if (idx > 0) {
                                      const [item] = arr.splice(idx, 1);
                                      arr.unshift(item);
                                    }
                                    cloned[file._id] = arr;
                                    return cloned;
                                  });
                                }}
                              />
                            );
                          })()}
                        </div>
                        <div style={{
                          padding: '6px 12px',
                          background: statusConfig.bgColor,
                          color: statusConfig.color,
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          border: `2px solid ${statusConfig.borderColor}`
                        }}>
                          {statusConfig.icon} {statusConfig.label}
                        </div>
                        <Button 
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => openPreview(file)}
                          style={{ borderRadius: 4, fontSize: 12 }}
                        >
                          Preview
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          <Card
            style={{
              borderRadius: 12,
              border: '1px solid rgba(24, 144, 255, 0.1)',
              boxShadow: '0 4px 20px rgba(114, 46, 209, 0.1)',
              background: '#ffffff'
            }}
          >
            <Table
              rowKey={(record: any) => record?._id || 'unknown'}
              dataSource={files.filter((file: any) => {
                if (filterQuery && !(file.filename || '').toLowerCase().includes(filterQuery.toLowerCase())) return false;
                return true;
              })}
              pagination={{ pageSize: 10, position: ['bottomCenter'] }}
              columns={[
                {
                  title: '📄 File',
                  dataIndex: 'filename',
                  key: 'filename',
                  width: 300,
                  sorter: (a: any, b: any) => (a.filename || '').localeCompare(b.filename || ''),
                  render: (text: string, rec: any) => {
                    const name = text || '';
                    const ext = (name.split('.').pop() || '').toLowerCase();
                    let icon = <FileWordOutlined style={{ color: '#2B6CB0', fontSize: 16 }} />;
                    if (ext === 'pdf') icon = <FilePdfOutlined style={{ color: '#E53E3E', fontSize: 16 }} />;
                    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp'].includes(ext)) icon = <FileImageOutlined style={{ color: '#319795', fontSize: 16 }} />;
                    return (
                      <Tooltip title={name}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: 6,
                            background: '#f0f5ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {icon}
                          </div>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {name.replace(/\.docx$/i, '')}
                          </span>
                        </span>
                      </Tooltip>
                    );
                  }
                },
                {
                  title: '📅 Uploaded',
                  dataIndex: 'uploadDate',
                  key: 'uploadDate',
                  width: 140,
                  render: (date: any) => (
                    <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
                      {date ? formatDateUtil(date) : 'N/A'}
                    </span>
                  )
                },
                {
                  title: '👥 Requestors',
                  key: 'requestors',
                  width: 300,
                  render: (_: any, record: any) => {
                    const requests = getRequestsForFile(record._id) || [];
                    const pendingRequests = requests.filter((r: any) => r.status === 'pending');
                    if (!pendingRequests.length) return <span style={{ color: '#888' }}>No pending requests</span>;
                    const options = pendingRequests.map((r: any) => ({ label: (r.username || r.requesterName || 'Unknown') + (r.createdAt ? ` · ${formatDateUtil(r.createdAt)}` : ''), value: (r._id || r.requestId) }));
                    const primary = getPrimaryRequest(record._id);
                    const value = (primary && primary.status === 'pending' && (primary._id || primary.requestId)) || options[0].value;
                    return (
                      <Select
                        value={value}
                        options={options}
                        style={{ minWidth: 200 }}
                        onChange={(val: any) => {
                          setFileRequestMap(prev => {
                            const cloned: Record<string, any> = { ...prev };
                            const arr = Array.isArray(cloned[record._id]) ? cloned[record._id].slice() : (cloned[record._id] ? [cloned[record._id]] : []);
                            const idx = arr.findIndex((x: any) => ((x._id || x.requestId) === val));
                            if (idx > 0) {
                              const [item] = arr.splice(idx, 1);
                              arr.unshift(item);
                            }
                            cloned[record._id] = arr;
                            return cloned;
                          });
                        }}
                      />
                    );
                  }
                },
                {
                  title: '🔧 Actions',
                  key: 'actions',
                  width: 200,
                  align: 'right' as const,
                  render: (_: any, record: any) => (
                    <Space size={8}>
                      <Button 
                        icon={<EyeOutlined />}
                        onClick={() => openPreview(record)}
                        style={{ borderRadius: 6, fontSize: 12, border: '1px solid rgba(114, 46, 209, 0.3)', fontWeight: 600 }}
                      >
                        Preview
                      </Button>
                    </Space>
                  )
                }
              ]}
              style={{ background: 'transparent' }}
            />
          </Card>
        )}

        {/* Modals */}
      {/* Process Modal */}
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileWordOutlined style={{ color: '#1890ff' }} />Process Document</div>}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={720}
        bodyStyle={{ padding: '24px' }}
        style={{ borderRadius: 12 }}
      >
        {selectedFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card style={{ borderRadius: 8, background: '#f9f9f9', border: 'none', padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>File Name</div>
                  <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>{selectedFile.filename}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>Requester</div>
                  <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>
                    {getPrimaryRequest(selectedFile._id)?.username || getPrimaryRequest(selectedFile._id)?.requesterName || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>Barangay ID</div>
                  <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>
                    {getPrimaryRequest(selectedFile._id)?.barangayID || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase' }}>Status</div>
                  <Tag style={{ borderRadius: 4, padding: '4px 12px' }}>
                    {getPrimaryRequest(selectedFile._id)?.status || 'Unknown'}
                  </Tag>
                </div>
              </div>
            </Card>

            <Card
              title={<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>⚙️ Processing Actions</div>}
              style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button 
                  type="primary" 
                  onClick={() => handleProcessClick(selectedFile)}
                  size="large"
                  style={{ borderRadius: 6, flex: '1 1 150px', background: '#1890ff' }}
                  icon={<FileWordOutlined />}
                >
                  Process
                </Button>
                <Button 
                  danger 
                  style={{ borderRadius: 6, flex: '1 1 150px' }}
                  size="large"
                  icon={<FileWordOutlined />}
                >
                  Reject
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <Spin tip="Loading..." />
        )}
      </Modal>

      <Modal
        title="Generated / Processed Copy Saved"
        open={generatedModalVisible}
        onCancel={() => setGeneratedModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setGeneratedModalVisible(false)}>Close</Button>
        ]}
      >
        <div>
          <div style={{ marginBottom: 8 }}>A copy of the generated document was saved.</div>
          {/* Only show generated-documents link when there is no processed copy available */}
          {generatedCopyId && !processedDocId ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 6 }}><strong>Generated metadata ID:</strong> <code>{generatedCopyId}</code></div>
              <div>
                <a href={`${API_URL.replace(/\/$/, '')}/generated-documents/${generatedCopyId}/raw`} target="_blank" rel="noreferrer">Open generated copy (generated_documents)</a>
              </div>
            </div>
          ) : null}

          {processedDocId ? (
            <div>
              <div style={{ marginBottom: 6 }}><strong>Processed document ID:</strong> <code>{processedDocId}</code></div>
              <div>
                <a href={`${API_URL.replace(/\/$/, '')}/processed-documents/${processedDocId}/raw`} target="_blank" rel="noreferrer">Open processed copy (processed_documents)</a>
              </div>
            </div>
          ) : null}

          {(!generatedCopyId && !processedDocId) ? <div>No saved copy id available.</div> : null}
        </div>
      </Modal>

      {/* Prioritize Modal */}
      <Modal
        title="Prioritize Request"
        open={prioritizeModalVisible}
        onCancel={() => setPrioritizeModalVisible(false)}
        onOk={confirmPrioritize}
        okText="Save Priority"
        cancelText="Cancel"
        okButtonProps={{ disabled: prioritizeCandidates.length === 0 || !selectedPriorityRequest }}
      >
        {prioritizeCandidates.length === 0 ? (
          <div>No other requests found for this document type.</div>
        ) : (
          <Radio.Group
            onChange={(e) => setSelectedPriorityRequest(e.target.value)}
            value={selectedPriorityRequest}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {prioritizeCandidates.map((c: any) => (
              <Radio key={c.requestId || c.fileId} value={c.requestId || c.fileId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{c.requesterName}</strong>
                  <small style={{ color: '#666' }}>{c.createdAt ? formatDateUtil(c.createdAt) : ''}</small>
                </div>
                <div style={{ marginLeft: 12 }}>
                  {/* show a small hint if this candidate is currently selected as priority */}
                  {selectedPriorityRequest === (c.requestId || c.fileId) ? <Tag color="red">Selected</Tag> : null}
                </div>
              </Radio>
            ))}
          </Radio.Group>
        )}
      </Modal>

      {/* Preview Modal for Process */}
      <Modal
        title={selectedFile ? `Preview: ${selectedFile.filename.replace(/\.docx$/i, '')}` : 'Preview'}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={isMobile ? '100%' : 900}
        styles={{ body: { padding: isMobile ? 10 : undefined } }}
      >
        {previewLoading ? (
          <Spin />
        ) : (
          <>
            {/* Mobile toggle to show/hide the request selector to give more space to preview */}
            {isMobile ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Button size="small" onClick={() => setShowPreviewRequests((s) => !s)}>{showPreviewRequests ? 'Hide Requests' : 'Show Requests'}</Button>
              </div>
            ) : null}

            <div className={styles.previewWrapper}>
              <div className={styles.previewPane}>
                <div className={styles.previewHtml} dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>

              {showPreviewRequests ? (
                <div className={styles.requestPane}>
                  <div style={{ marginTop: isMobile ? 6 : 12, padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Select Request to Preview</div>
                    <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
                      <Radio.Group
                        value={previewSelectedRequestId}
                        onChange={async (e) => {
                          const newId = e.target.value as string;
                          setPreviewSelectedRequestId(newId);
                          // re-render preview for selected request
                          await renderPreviewForRequest(newId);
                        }}
                        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        {previewRequests && previewRequests.length ? previewRequests.map((r: any) => (
                          <Radio key={(r._id || r.requestId)} value={(r._id || r.requestId)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{r.username || r.requesterName || 'Unknown'}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>{r.createdAt ? formatDateUtil(r.createdAt) : ''}</div>
                              </div>
                              <div style={{ alignSelf: 'center' }}>{(r.notes && r.notes.toString().toLowerCase().includes('priority')) || r.priority ? <Tag color="red">PRIORITY</Tag> : null}</div>
                            </div>
                          </Radio>
                        )) : <div style={{ color: '#666' }}>No pending requests available for this file.</div>}
                      </Radio.Group>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.previewFooter}>
              {/* Complete button removed; Generate will also mark request complete after successful generation */}
              <button
                className={styles.generateButton}
                onClick={async () => {
                  if (!selectedFile || generateLoading) return;
                  setGenerateLoading(true);
                  try {
                    let request: any = null;
                    if (previewSelectedRequestId) {
                      const requestsForFile = getRequestsForFile(selectedFile._id);
                      request = requestsForFile.find((r: any) => (r._id || r.requestId) === previewSelectedRequestId) || null;
                    }
                    if (!request) request = getPrioritizedRequest(selectedFile._id) || getPrimaryRequest(selectedFile._id);

                    if (!request || !request.fieldValues) {
                      alert('No document request or field values found.');
                      setGenerateLoading(false);
                      return;
                    }

                    const result = await generateFilledDocx(selectedFile._id, request.fieldValues, (request._id || request.requestId));
                    const blob = result.blob;

                    const txId = request._id || request.requestId;
                    const filename = txId ? `${String(txId).replace(/[^a-zA-Z0-9-_.]/g, '_')}.docx` : `filled_${selectedFile.filename || 'document'}.docx`;
                    const url = window.URL.createObjectURL(new Blob([blob]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', filename);
                    document.body.appendChild(link);
                    link.click();
                    link.parentNode?.removeChild(link);
                    window.URL.revokeObjectURL(url);

                    const requestId = request._id || request.requestId;
                    try {
                      await documentsAPI.updateDocumentStatus(requestId, { status: 'approved' });
                      
                      // Send pickup notification email
                      try {
                        await documentsAPI.sendPickupNotification(
                          requestId,
                          request.username || request.requesterName || 'Unknown',
                          selectedFile.filename || 'document'
                        );
                        
                        // Record creation date for 3-day tracking
                        setDocumentCreationDates(prev => ({
                          ...prev,
                          [requestId]: new Date()
                        }));
                        
                        notification.open({
                          message: 'Success!',
                          description: 'Document generated and request marked as approved. Pickup notification sent.',
                          duration: 3,
                        });
                      } catch (emailErr) {
                        console.error('Failed to send pickup notification:', emailErr);
                        notification.open({
                          message: 'Document Generated',
                          description: 'Document generated but email notification failed.',
                          duration: 3,
                        });
                      }
                    } catch (err) {
                      notification.open({
                        message: 'Document Generated',
                        description: 'Document downloaded. Status update failed.',
                        duration: 3,
                      });
                    }

                    await fetchFilesAndRequests();
                    setPreviewVisible(false);

                  } catch (err) {
                    console.error(err);
                    alert('Failed to generate document.');
                  } finally {
                    setGenerateLoading(false);
                  }
                }}
                disabled={generateLoading}
              >
                {generateLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Spin size="small" />
                    <span>Generating...</span>
                  </div>
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </>
        )}
      </Modal>
        </div>
      </Spin>
      </div>
    </div>
  );
}

export default DocumentProcessing;
