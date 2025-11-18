import React, { useState } from 'react';
import { Button, Tooltip, Upload, message } from 'antd';
import { UploadOutlined, EyeOutlined, DownloadOutlined, DeleteOutlined, FileWordOutlined } from '@ant-design/icons';
import { axiosInstance, axiosPublic } from '../services/api';
import styles from './TemplatesManager.module.css';

const getLabel = (filename?: string) =>
  filename ? filename.replace(/_/g, " ").replace(/\.docx$/, "") : "Untitled";

const TemplatesManager: React.FC = () => {
  const [templateList, setTemplateList] = useState<any[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'html' | 'pdf' | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');

  React.useEffect(() => {
    // Fetch files from Templates folder
    const fetchTemplatesFolderFiles = async () => {
      try {
        await axiosPublic.get('/templates/list');
      } catch (err) {
        // Ignore error for now
      }
    };
    const fetchTemplates = async () => {
      setLoading(true);
      setError(null);
        try {
          const res = await axiosPublic.get('/documents/list');
          setTemplateList(res.data || []);
        } catch (err) {
          setError('Could not load templates.');
        }
      setLoading(false);
    };
    fetchTemplates();
  }, []);

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>📂 Templates Manager</h2>
      {/* GridFS Files Section */}
      <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: "0.5rem", color: '#374151' }}></h3>
        {loading && <div>Loading templates...</div>}
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <div className={styles.grid}>
          {templateList.filter((file: any) => file && file.filename).map((file: any) => (
            <div key={file._id} className={styles.card}>
              <img src="/word.png" alt="Word Icon" className={styles.icon} />
              <div className={styles.cardBody}>
                <span className={styles.cardTitle}>{getLabel(file.filename)}</span>
                <div className={styles.actions}>
                  <Tooltip title="Preview">
                    <Button
                      icon={<EyeOutlined />}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (previewId === file._id) {
                          setPreviewId(null);
                          setHtmlContent('');
                          return;
                        }
                        setPreviewId(file._id);
                        setHtmlContent('');
                          try {
                            const res = await axiosPublic.get(`/documents/preview/${file._id}?format=html`, { responseType: 'text' });
                            setHtmlContent(res.data || '');
                          } catch (err) {
                            setHtmlContent('<div style="color:red">Failed to load preview.</div>');
                          }
                      }}
                    >Preview</Button>
                  </Tooltip>
                  <Tooltip title="Download">
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        setDownloadError(null);
                        try {
                          const res = await axiosInstance.get(`/documents/original/${file._id}`, { responseType: 'blob' });
                          const blob = res.data;
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = file.filename;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          setDownloadError(`Failed to download ${file.filename} from MongoDB.`);
                        }
                      }}
                    >Download</Button>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={async () => {
                        setLoading(true);
                        setError(null);
                          try {
                            const res = await axiosInstance.delete(`/documents/file/${file._id}`);
                            const data = res.data;
                            if (data && data.success) {
                              // Refresh list
                              const resList = await axiosPublic.get('/documents/list');
                              setTemplateList(resList.data || []);
                            } else {
                              setError('Delete failed.');
                            }
                          } catch (err) {
                            setError('Delete failed.');
                          }
                        setLoading(false);
                      }}
                    >Remove</Button>
                  </Tooltip>
                </div>
                {previewId === file._id && htmlContent && (
                  <div className={styles.previewModal}>
                    <div className={styles.previewHeader}>
                      <span className={styles.previewTitle}>Preview</span>
                      <button className={styles.previewClose} onClick={() => { setPreviewId(null); setHtmlContent(''); }}>Close</button>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {downloadError && (
        <div style={{ color: 'red', marginBottom: 16 }}>{downloadError}</div>
      )}
      {/* Upload Section */}
      <div className={styles.uploadWrap}>
        <Upload
          accept=".docx"
          showUploadList={false}
          customRequest={async ({ file, onSuccess, onError }) => {
            setLoading(true);
            setError(null);
            const formData = new FormData();
            formData.append('file', file);
              try {
              const res = await axiosInstance.post('/documents/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              const data = res.data;
              if (data && data.success) {
                // Refresh list
                const resList = await axiosPublic.get('/documents/list');
                setTemplateList(resList.data || []);
                message.success('Upload successful');
                onSuccess && onSuccess('ok');
              } else {
                setError('Upload failed.');
                message.error('Upload failed');
                onError && onError(new Error('Upload failed'));
              }
            } catch (err) {
              setError('Upload failed.');
              message.error('Upload failed');
              onError && onError(new Error('Upload failed'));
            }
            setLoading(false);
          }}
        >
          <Button icon={<UploadOutlined />} type="primary">Upload .docx</Button>
        </Upload>
      </div>
    </div>
  );
};

export default TemplatesManager;
