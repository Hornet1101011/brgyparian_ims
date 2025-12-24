import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Spin, Modal, Empty, Card, Row, Col, Divider, Statistic, Badge, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, EyeOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { verificationAPI, API_URL } from '../../services/api';

interface IVReq {
  _id: string;
  userId: any;
  files: string[];
  gridFileIds: string[];
  filesMeta?: Array<{ filename: string; gridFileId: string; fileType?: string }>;
  status: string;
  createdAt: string;
  reviewedAt?: string;
}

const VerificationRequests: React.FC = () => {
  const [data, setData] = useState<IVReq[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);
  const [fileActionLoading, setFileActionLoading] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await verificationAPI.getRequests();
      setData(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load verification requests:', err);
      message.error('Failed to load verification requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, []);

  const handleVerify = async (record: IVReq) => {
    setActionLoading(true);
    try {
      const userId = record.userId?._id || record.userId;
      await verificationAPI.verifyUser(userId, true);
      message.success('User verified successfully');
      await loadRequests();
    } catch (err) {
      console.error('Verify error:', err);
      message.error('Failed to verify user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (record: IVReq) => {
    setActionLoading(true);
    try {
      if (record._id) {
        await verificationAPI.rejectRequest(record._id);
      }
      message.success('Verification request rejected');
      await loadRequests();
    } catch (err) {
      console.error('Reject error:', err);
      message.error('Failed to reject verification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnverify = async (record: IVReq) => {
    setActionLoading(true);
    try {
      if (record._id) {
        await verificationAPI.unapproveRequest(record._id);
      }
      message.success('User unverified successfully');
      await loadRequests();
    } catch (err) {
      console.error('Unverify error:', err);
      message.error('Failed to unverify user');
    } finally {
      setActionLoading(false);
    }
  };

  const openFilesModal = (record: IVReq) => {
    setSelectedReq(record);
    setModalVisible(true);
  };

  const closeFilesModal = () => {
    setSelectedReq(null);
    setModalVisible(false);
  };

  // Calculate stats
  const pendingCount = data.filter(d => d.status === 'pending').length;
  const approvedCount = data.filter(d => d.status === 'approved').length;
  const rejectedCount = data.filter(d => d.status === 'rejected').length;

  const statusColorMap: Record<string, string> = {
    pending: '#faad14',
    approved: '#52c41a',
    rejected: '#f5222d'
  };

  const statusIconMap: Record<string, React.ReactNode> = {
    pending: <ClockCircleOutlined />,
    approved: <CheckCircleOutlined />,
    rejected: <CloseCircleOutlined />
  };

  const columns = [
    {
      title: 'Resident',
      dataIndex: 'userId',
      key: 'user',
      width: 200,
      render: (u: any) => (
        <div style={{ fontWeight: 500, color: '#0f172a' }}>
          {u ? (u.fullName || u.username || u.email) : 'Unknown'}
        </div>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => {
        const statusMap: Record<string, { color: string; label: string }> = {
          pending: { color: 'warning', label: 'Pending' },
          approved: { color: 'success', label: 'Verified' },
          rejected: { color: 'error', label: 'Rejected' }
        };
        const status = statusMap[s] || statusMap.pending;
        return (
          <Tag icon={statusIconMap[s]} color={status.color} style={{ fontWeight: 500 }}>
            {status.label}
          </Tag>
        );
      }
    },
    {
      title: 'Submitted',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (d: string) => (
        <span style={{ color: '#64748b', fontSize: 13 }}>
          {d ? new Date(d).toLocaleString() : '-'}
        </span>
      )
    },
    {
      title: 'Verified Date',
      dataIndex: 'reviewedAt',
      key: 'reviewedAt',
      width: 180,
      render: (d: string) => (
        <span style={{ color: '#64748b', fontSize: 13 }}>
          {d ? new Date(d).toLocaleString() : '-'}
        </span>
      )
    },
    {
      title: 'Files',
      key: 'files',
      width: 280,
      render: (_: any, record: any) => {
        const files = (Array.isArray(record.filesMeta) && record.filesMeta.length)
          ? record.filesMeta
          : ((Array.isArray(record.gridFileIds) && record.gridFileIds.length)
              ? record.gridFileIds.map((id: string) => ({ filename: id, gridFileId: id }))
              : []);
        return (
          <Space wrap style={{ gap: 6 }}>
            {files.slice(0, 2).map((f: any, i: number) => {
              const fileId = f.gridFileId || f.filename;
              const label = f.fileType
                ? f.fileType.charAt(0).toUpperCase() + f.fileType.slice(1)
                : 'File';
              return (
                <Tooltip key={i} title={`View ${label}`}>
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={async () => {
                      try {
                        setFileActionLoading(true);
                        await verificationAPI.viewFile(fileId);
                        message.success('Opening file...');
                      } catch (err) {
                        console.error('View error:', err);
                        message.error('Failed to view file');
                      } finally {
                        setFileActionLoading(false);
                      }
                    }}
                    loading={fileActionLoading}
                    style={{ padding: '4px 8px', fontWeight: 500 }}
                  >
                    {label}
                  </Button>
                </Tooltip>
              );
            })}
            {files.length > 2 && (
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => openFilesModal(record)}
                style={{ padding: '4px 8px', color: '#1890ff' }}
              >
                +{files.length - 2} more
              </Button>
            )}
            {files.length <= 2 && files.length > 0 && (
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => openFilesModal(record)}
                style={{ padding: '4px 8px' }}
              >
                View All
              </Button>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Action',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: IVReq) => (
        <Space size="small">
          {record.status === 'approved' ? (
            <Tooltip title="Remove verification status">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleUnverify(record)}
                loading={actionLoading}
                style={{ fontWeight: 500 }}
              >
                Unverify
              </Button>
            </Tooltip>
          ) : record.status === 'pending' ? (
            <>
              <Tooltip title="Approve this verification request">
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleVerify(record)}
                  loading={actionLoading}
                  style={{ fontWeight: 500, backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                >
                  Verify
                </Button>
              </Tooltip>
              <Tooltip title="Reject this verification request">
                <Button
                  size="small"
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleReject(record)}
                  loading={actionLoading}
                  style={{ fontWeight: 500 }}
                >
                  Reject
                </Button>
              </Tooltip>
            </>
          ) : (
            <Tag color="error" style={{ margin: 0 }}>Rejected</Tag>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      {/* Header with Stats */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge count={data.length} color="#1890ff" />
            <h2 style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>Verification Requests</h2>
          </div>
        }
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(15,23,42,0.08)',
          border: '1px solid #e2e8f0',
          marginBottom: 24
        }}
        styles={{
          body: { padding: 28 },
          header: { padding: '24px 28px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'rgba(15, 23, 42, 0.01)' }
        }}
      >
        {/* Stats Row */}
        <Row gutter={[24, 24]} style={{ marginBottom: 28 }}>
          <Col xs={24} sm={12} md={8}>
            <Card
              variant="borderless"
              style={{
                borderRadius: 12,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
                border: 'none',
                borderTop: '4px solid #faad14',
                background: '#ffffff',
                textAlign: 'center'
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Statistic
                title={<span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>PENDING</span>}
                value={pendingCount}
                valueStyle={{ color: '#faad14', fontSize: 32, fontWeight: 700 }}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Card
              variant="borderless"
              style={{
                borderRadius: 12,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
                border: 'none',
                borderTop: '4px solid #52c41a',
                background: '#ffffff',
                textAlign: 'center'
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Statistic
                title={<span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>VERIFIED</span>}
                value={approvedCount}
                valueStyle={{ color: '#52c41a', fontSize: 32, fontWeight: 700 }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Card
              variant="borderless"
              style={{
                borderRadius: 12,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
                border: 'none',
                borderTop: '4px solid #f5222d',
                background: '#ffffff',
                textAlign: 'center'
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Statistic
                title={<span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>REJECTED</span>}
                value={rejectedCount}
                valueStyle={{ color: '#f5222d', fontSize: 32, fontWeight: 700 }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Divider style={{ margin: '28px 0', borderColor: '#e2e8f0' }} />

        {/* Data Table */}
        <Spin spinning={loading}>
          {(!data || data.length === 0) ? (
            <Empty
              description="No verification requests"
              style={{ padding: '60px 20px', color: '#94a3b8' }}
            />
          ) : (
            <Table
              rowKey="_id"
              loading={loading}
              dataSource={data}
              columns={columns as any}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => (
                  <span style={{ color: '#64748b' }}>
                    Total {total} verification request{total !== 1 ? 's' : ''}
                  </span>
                ),
                style: { marginTop: 16 }
              }}
              style={{ marginTop: 20 }}
              rowClassName={(record) => {
                if (record.status === 'approved') return 'verified-row';
                if (record.status === 'rejected') return 'rejected-row';
                return '';
              }}
            />
          )}
        </Spin>
      </Card>

      {/* Files Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <EyeOutlined style={{ color: '#1890ff', fontSize: 20 }} />
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Verification Files</span>
          </div>
        }
        open={modalVisible}
        onCancel={closeFilesModal}
        footer={null}
        width={900}
        bodyStyle={{ padding: 24 }}
        style={{ borderRadius: 12 }}
      >
        {selectedReq ? (
          <div>
            <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Resident
              </p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                {(selectedReq.userId && (selectedReq.userId.fullName || selectedReq.userId.username)) || 'Unknown'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
              {((selectedReq.filesMeta && selectedReq.filesMeta.length)
                ? selectedReq.filesMeta
                : (selectedReq.gridFileIds || []).map((id: string) => ({ filename: id, gridFileId: id }))
              ).map((f: any, idx: number) => {
                const fileId = f.gridFileId || f.filename;
                const label = f.fileType
                  ? f.fileType.charAt(0).toUpperCase() + f.fileType.slice(1)
                  : f.filename || 'File';

                return (
                  <Card
                    key={idx}
                    hoverable
                    style={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                      transition: 'all 0.3s ease'
                    }}
                    bodyStyle={{ padding: 0 }}
                  >
                    {/* File Preview */}
                    <div
                      style={{
                        width: '100%',
                        height: 240,
                        backgroundColor: '#f5f7fa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}
                    >
                      <img
                        src={`${API_URL.replace(/\/$/, '')}/verification/file/${fileId}`}
                        alt={label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          const el = e.currentTarget as HTMLImageElement;
                          el.style.display = 'none';
                          if (el.parentElement) {
                            el.parentElement.innerHTML = '<div style="color: #94a3b8; fontSize: 12px;">Preview not available</div>';
                          }
                        }}
                      />
                    </div>

                    {/* File Info */}
                    <div style={{ padding: 16 }}>
                      <div style={{ marginBottom: 12 }}>
                        <p
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: 12,
                            color: '#64748b',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}
                        >
                          File Type
                        </p>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                          {label}
                        </p>
                      </div>

                      <Divider style={{ margin: '12px 0', borderColor: '#e2e8f0' }} />

                      <Space direction="vertical" style={{ width: '100%', gap: 8 }}>
                        <Button
                          type="primary"
                          size="small"
                          block
                          icon={<EyeOutlined />}
                          onClick={async () => {
                            try {
                              setFileActionLoading(true);
                              await verificationAPI.viewFile(fileId);
                              message.success('Opening file...');
                            } catch (err) {
                              console.error('View error:', err);
                              message.error('Failed to view file');
                            } finally {
                              setFileActionLoading(false);
                            }
                          }}
                          loading={fileActionLoading}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          block
                          icon={<DownloadOutlined />}
                          onClick={async () => {
                            try {
                              setFileActionLoading(true);
                              await verificationAPI.downloadFile(fileId);
                              message.success('File downloaded successfully');
                            } catch (err) {
                              console.error('Download error:', err);
                              message.error('Failed to download file');
                            } finally {
                              setFileActionLoading(false);
                            }
                          }}
                          loading={fileActionLoading}
                        >
                          Download
                        </Button>
                      </Space>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty description="No files" style={{ padding: '40px 0' }} />
        )}
      </Modal>

      <style>{`
        .verified-row {
          background-color: #f6ffed !important;
        }
        .rejected-row {
          background-color: #fff1f0 !important;
        }
      `}</style>
    </div>
  );
};

export default VerificationRequests;
