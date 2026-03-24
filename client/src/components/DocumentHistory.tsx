import React, { useEffect, useState, useMemo } from 'react';
import { Table, Spin, Card, Empty, Input, Select, Button, Space } from 'antd';
import { SearchOutlined, SortAscendingOutlined, ClearOutlined } from '@ant-design/icons';
import { documentsAPI } from '../services/api';
import { formatDate as formatDateUtil } from '../utils/formatDate';
import { FileWordOutlined } from '@ant-design/icons';
import styles from './DocumentHistory.module.css';

const DocumentHistory: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortField, setSortField] = useState<string>('completedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(isMobile ? 5 : 10);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 720;
      setIsMobile(mobile);
      setPageSize(mobile ? 5 : 10);
      setCurrentPage(1);
    };
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

  const filteredAndSortedData = useMemo(() => {
    let filtered = history.filter(item => item && item._id && (
      (item.username && item.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.type && item.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.transactionCode && item.transactionCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.status && item.status.toLowerCase().includes(searchTerm.toLowerCase()))
    ));

    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'completedAt' || sortField === 'dateApproved' || sortField === 'approvedAt') {
        aVal = new Date(a.completedAt || a.dateApproved || a.approvedAt || 0).getTime();
        bVal = new Date(b.completedAt || b.dateApproved || b.approvedAt || 0).getTime();
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [history, searchTerm, sortField, sortOrder]);

  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredAndSortedData.slice(startIdx, startIdx + pageSize);
  }, [filteredAndSortedData, currentPage, pageSize]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSortField('completedAt');
    setSortOrder('desc');
    setCurrentPage(1);
  };

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
        padding: '24px'
      }}>
      {/* Header Section */}
      <div style={{ marginBottom: 28 }}>
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
              Document History
            </h2>
            <p style={{ margin: '8px 0 0 0', background: 'linear-gradient(90deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 13, fontWeight: 600 }}>
              View all processed documents and requests
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Section */}
      <div style={{
        background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        border: '1px solid rgba(114, 46, 209, 0.15)'
      }}>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%', gap: 12 }} wrap>
          <Input
            placeholder="🔍 Search by name, type, or ID..."
            prefix={<SearchOutlined style={{ color: '#722ed1' }} />}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(114, 46, 209, 0.2)',
              flex: isMobile ? 1 : 0.3,
              minWidth: isMobile ? 'auto' : 200
            }}
          />
          <Select
            value={sortField}
            onChange={(val) => {
              setSortField(val);
              setCurrentPage(1);
            }}
            style={{ minWidth: isMobile ? '100%' : 150, borderRadius: 8 }}
            options={[
              { label: '📅 Date', value: 'completedAt' },
              { label: '👤 Requester', value: 'username' },
              { label: '📋 Type', value: 'type' },
              { label: '✓ Status', value: 'status' }
            ]}
            optionLabelProp="label"
          />
          <Button
            type={sortOrder === 'asc' ? 'primary' : 'default'}
            icon={<SortAscendingOutlined />}
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            style={{
              borderRadius: 8,
              background: sortOrder === 'asc' ? 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)' : undefined,
              border: sortOrder === 'asc' ? 'none' : '1px solid rgba(114, 46, 209, 0.2)',
              color: sortOrder === 'asc' ? '#fff' : '#1f2937'
            }}
          >
            {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
          </Button>
          <Button
            icon={<ClearOutlined />}
            onClick={handleClearFilters}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(114, 46, 209, 0.2)',
              color: '#722ed1'
            }}
          >
            Clear
          </Button>
          <span style={{ 
            color: '#666', 
            fontSize: 12, 
            fontWeight: 600,
            marginLeft: 'auto'
          }}>
            📊 {filteredAndSortedData.length} result{filteredAndSortedData.length !== 1 ? 's' : ''}
          </span>
        </Space>
      </div>

      <Spin spinning={loading} tip="Loading document history...">
        {isMobile ? (
          <div className={styles.cardList}>
            {paginatedData.length === 0 ? (
              <Card style={{
                borderRadius: 12,
                border: '2px dashed rgba(114, 46, 209, 0.4)',
                boxShadow: '0 6px 24px rgba(114, 46, 209, 0.12)',
                background: 'linear-gradient(135deg, #f9f5ff 0%, #f0e6ff 50%, #e6f7ff 100%)',
                padding: 60,
                textAlign: 'center'
              }}>
                <Empty description={searchTerm ? "No results found" : "No document history"} style={{ color: '#722ed1' }} />
              </Card>
            ) : (
              paginatedData.filter((h: any) => h && h._id).map(h => (
                <Card 
                  key={h._id} 
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(114, 46, 209, 0.12)',
                    boxShadow: '0 4px 16px rgba(114, 46, 209, 0.1)',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(114, 46, 209, 0.2)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(114, 46, 209, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className={styles.cardRow}>
                    <div className={styles.cardCol}>
                      <div className={styles.cardLabel}>👤 Requester</div>
                      <div style={{ fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{h.username || 'Unknown'}</div>
                    </div>
                    <div className={styles.cardCol}>
                      <div className={styles.cardLabel}>📋 Type</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{h.type || 'Unknown'}</div>
                    </div>
                  </div>
                  <div className={styles.cardRow}>
                    <div className={styles.cardCol}>
                      <div className={styles.cardLabel}>🔖 Txn ID</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#666' }}>{h.transactionCode || '—'}</div>
                    </div>
                    <div className={styles.cardCol}>
                      <div className={styles.cardLabel}>📅 Date Approved</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{(h.completedAt || h.dateApproved || h.approvedAt) ? formatDateUtil(h.completedAt || h.dateApproved || h.approvedAt) : '—'}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    {h.status && h.status.toString().toLowerCase() === 'rejected' ? (
                      <div style={{
                        padding: '8px 12px',
                        background: 'linear-gradient(135deg, #fff2f0 0%, #ffe7e6 100%)',
                        color: '#cf1322',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        border: '2px solid #ff7875'
                      }}>
                        ❌ Rejected
                      </div>
                    ) : (
                      <div style={{
                        padding: '8px 12px',
                        background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)',
                        color: '#52c41a',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        border: '2px solid #52c41a'
                      }}>
                        ✓ Completed
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          <Table
            dataSource={paginatedData}
            rowKey={(record: any) => record?._id || 'unknown'}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredAndSortedData.length,
              onChange: (page) => setCurrentPage(page),
              onShowSizeChange: (_, size) => {
                setPageSize(size);
                setCurrentPage(1);
              },
              showSizeChanger: true,
              pageSizeOptions: ['5', '10', '15', '20'],
              showTotal: (total) => `Total: ${total} records`,
              style: { marginTop: 16 }
            }}
            columns={[
              { title: '👤 Requester Name', dataIndex: 'username', key: 'username', render: (text: string) => <span style={{ fontWeight: 700, background: 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{text || 'Unknown'}</span> },
              { title: '🔖 Transactional ID', dataIndex: 'transactionCode', key: 'transactionCode', render: (text: string) => <span style={{ fontFamily: 'monospace', color: '#666' }}>{text || '—'}</span> },
              { title: '📋 Type', dataIndex: 'type', key: 'type', render: (text: string) => <span style={{ fontWeight: 700, color: '#1f2937' }}>{text || 'Unknown'}</span> },
              { title: '📅 Date Approved', dataIndex: 'completedAt', key: 'completedAt', render: (text: string, record: any) => {
                  const date = text || record.dateApproved || record.completedAt || record.approvedAt || null;
                  if (!date) return '—';
                  try {
                    return formatDateUtil(date);
                  } catch {
                    return String(date);
                  }
                }
              },
              { title: '✓ Status', dataIndex: 'status', key: 'status', render: (text: string, record: any) => {
                  const staffName = record.processedBy?.fullName || record.processedBy?.username || 'Unknown';
                  if (text && text.toLowerCase() === 'rejected') {
                    return <div style={{
                      padding: '6px 10px',
                      background: 'linear-gradient(135deg, #fff2f0 0%, #ffe7e6 100%)',
                      color: '#cf1322',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid #ff7875'
                    }}>❌ Rejected by {staffName}</div>;
                  } else if (text && (text.toLowerCase() === 'completed' || text.toLowerCase() === 'approved')) {
                    return <div style={{
                      padding: '6px 10px',
                      background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)',
                      color: '#52c41a',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid #52c41a'
                    }}>✓ Completed by {staffName}</div>;
                  } else {
                    return <span>{text}</span>;
                  }
                }
              }
            ]}
          />
        )}
        {/* Pagination Controls for Mobile */}
        {isMobile && filteredAndSortedData.length > 0 && (
          <div style={{ 
            marginTop: 16, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            gap: 12,
            padding: '12px 0',
            borderTop: '1px solid rgba(114, 46, 209, 0.1)'
          }}>
            <Button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              style={{
                borderRadius: 6,
                background: currentPage === 1 ? '#f0f0f0' : 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)',
                color: currentPage === 1 ? '#999' : '#fff',
                border: 'none'
              }}
            >
              ← Prev
            </Button>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>
              Page {currentPage} of {Math.ceil(filteredAndSortedData.length / pageSize)}
            </span>
            <Button
              disabled={currentPage >= Math.ceil(filteredAndSortedData.length / pageSize)}
              onClick={() => setCurrentPage(currentPage + 1)}
              style={{
                borderRadius: 6,
                background: currentPage >= Math.ceil(filteredAndSortedData.length / pageSize) ? '#f0f0f0' : 'linear-gradient(135deg, #722ed1 0%, #1890ff 100%)',
                color: currentPage >= Math.ceil(filteredAndSortedData.length / pageSize) ? '#999' : '#fff',
                border: 'none'
              }}
            >
              Next →
            </Button>
          </div>
        )}
      </Spin>
      </div>
    </div>
  );
};

export default DocumentHistory;
