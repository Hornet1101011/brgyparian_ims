import React, { useEffect, useState } from 'react';
import { Table, Typography, Spin, Card } from 'antd';
import { documentsAPI } from '../services/api';
import { formatDate as formatDateUtil } from '../utils/formatDate';
import styles from './DocumentHistory.module.css';

const DocumentHistory: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await (documentsAPI as any).getDocumentRecords();
        if (mounted) setHistory(Array.isArray(res) ? res : []);
      } catch (err) {
        console.error('Failed to load document history', err);
        if (mounted) setHistory([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchHistory();
    return () => { mounted = false; };
  }, []);

  return (
    <div className={styles.wrapper}>
      <Typography.Title level={3} className={styles.title}>Document History</Typography.Title>
      {loading ? <Spin /> : (
        isMobile ? (
          <div className={styles.cardList}>
            {history.map(h => (
              <Card key={h._id} className={styles.card}>
                <div className={styles.cardRow}>
                  <div className={styles.cardCol}>
                    <div className={styles.cardLabel}>Requester</div>
                    <div className={styles.cardValue}>{h.username || 'Unknown'}</div>
                  </div>
                  <div className={styles.cardCol}>
                    <div className={styles.cardLabel}>Type</div>
                    <div className={styles.cardValue}>{h.type || 'Unknown'}</div>
                  </div>
                </div>
                <div className={styles.cardRow}>
                  <div className={styles.cardCol}>
                    <div className={styles.cardLabel}>Txn ID</div>
                    <div className={styles.cardValue}>{h.transactionCode || '—'}</div>
                  </div>
                  <div className={styles.cardCol}>
                    <div className={styles.cardLabel}>Date Approved</div>
                    <div className={styles.cardValue}>{(h.completedAt || h.dateApproved || h.approvedAt) ? formatDateUtil(h.completedAt || h.dateApproved || h.approvedAt) : '—'}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {h.status && h.status.toString().toLowerCase() === 'rejected' ? (
                    <div className={styles.rejected}>Rejected</div>
                  ) : (
                    <div className={styles.completed}>Completed</div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Table
            dataSource={history}
            rowKey="_id"
            pagination={{ pageSize: 8 }}
            columns={[
              { title: 'Requester Name', dataIndex: 'username', key: 'username', render: (text: string) => text || 'Unknown' },
              { title: 'Transactional ID', dataIndex: 'transactionCode', key: 'transactionCode', render: (text: string) => text || '—' },
              { title: 'Type', dataIndex: 'type', key: 'type', render: (text: string) => text || 'Unknown' },
              { title: 'Date Approved', dataIndex: 'completedAt', key: 'completedAt', render: (text: string, record: any) => {
                  const date = text || record.dateApproved || record.completedAt || record.approvedAt || null;
                  if (!date) return '—';
                  try {
                    return formatDateUtil(date);
                  } catch {
                    return String(date);
                  }
                }
              },
              { title: 'Status', dataIndex: 'status', key: 'status', render: (text: string, record: any) => {
                  const staffName = record.processedBy?.fullName || record.processedBy?.username || 'Unknown';
                  const staffBarangayID = record.processedBy?.barangayID || 'Unknown';
                  if (text && text.toLowerCase() === 'rejected') {
                    return <span style={{ color: '#FF3B3B', fontWeight: 600 }}>Rejected by: {staffName} ({staffBarangayID})</span>;
                  } else if (text && (text.toLowerCase() === 'completed' || text.toLowerCase() === 'approved')) {
                    return <span style={{ color: '#43D96B', fontWeight: 600 }}>Completed by: {staffName} ({staffBarangayID})</span>;
                  } else {
                    return <span>{text}</span>;
                  }
                }
              }
            ]}
          />
        )
      )}
    </div>
  );
};

export default DocumentHistory;
