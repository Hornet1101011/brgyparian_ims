import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Spin, Modal, Empty } from 'antd';
import { verificationAPI, getAbsoluteApiUrl } from '../../services/api';

interface IVReq {
  _id: string;
  userId: any;
  files: string[];
  gridFileIds: string[];
  status: string;
  createdAt: string;
}

const VerificationRequests: React.FC = () => {
  const [data, setData] = useState<IVReq[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await verificationAPI.getRequests();
      setData(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error(err);
      message.error('Failed to load verification requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const approve = async (userId: string) => {
    setLoading(true);
    try {
      // Attempt to approve request server-side if request id present; fallback to toggling user
      await verificationAPI.verifyUser(userId, true);
      message.success('User verified');
      await load();
    } catch (err) {
      console.error(err);
      message.error('Failed to verify user');
    } finally {
      setLoading(false);
    }
  };

  const reject = async (record: IVReq) => {
    setLoading(true);
    try {
      // Try to call rejectRequest if request id available, then flip user's verified flag
      if (record && record._id) {
        try { await verificationAPI.rejectRequest(record._id); } catch (e) { /* best-effort */ }
      }
      const userId = record.userId?._id || record.userId;
      if (userId) await verificationAPI.verifyUser(userId, false);
      message.success('Verification request rejected');
      await load();
    } catch (err) {
      console.error(err);
      message.error('Failed to reject verification');
    } finally {
      setLoading(false);
    }
  };

  const handleUnapprove = async (record: IVReq) => {
    setLoading(true);
    try {
      if (record && record._id) {
        try { await verificationAPI.unapproveRequest(record._id); } catch (e) { /* best-effort */ }
      }
      const userId = record.userId?._id || record.userId;
      if (userId) await verificationAPI.verifyUser(userId, false);
      message.success('User unverified');
      await load();
    } catch (err) {
      console.error(err);
      message.error('Failed to unverify user');
    } finally {
      setLoading(false);
    }
  };

  const openFilesModal = (record: any) => {
    setSelectedReq(record);
    setModalVisible(true);
  };

  const closeFilesModal = () => {
    setSelectedReq(null);
    setModalVisible(false);
  };

  const columns = [
    {
      title: 'Resident',
      dataIndex: 'userId',
      key: 'user',
      render: (u: any) => u ? (u.fullName || u.username || u.email) : 'Unknown'
    },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'pending' ? 'orange' : s === 'approved' ? 'green' : 'red'}>{s || 'pending'}</Tag> },
    { title: 'Submitted', dataIndex: 'createdAt', key: 'createdAt', render: (d: string) => d ? new Date(d).toLocaleString() : '-' },
    { title: 'Verified', dataIndex: 'approvedAt', key: 'approvedAt', render: (d: string) => d ? new Date(d).toLocaleString() : '-' },
    { title: 'Files', key: 'files', render: (_: any, record: any) => {
      const files = (Array.isArray(record.filesMeta) && record.filesMeta.length) ? record.filesMeta : ((Array.isArray(record.gridFileIds) && record.gridFileIds.length) ? record.gridFileIds.map((id: string) => ({ filename: id, gridFileId: id })) : []);
      return (
        <Space>
          {files.map((f: any, i: number) => (
            <Button key={i} type="link" href={getAbsoluteApiUrl(`/verification/file/${f.gridFileId || f.filename}`)} target="_blank">{f.fileType ? (f.fileType.charAt(0).toUpperCase() + f.fileType.slice(1)) : 'Open'}</Button>
          ))}
          <Button type="link" onClick={() => openFilesModal(record)}>Check ID</Button>
        </Space>
      );
    } },
    { title: 'Action', key: 'action', render: (_: any, record: IVReq) => (
      <Space>
        {record.status === 'approved' ? (
          <Button size="small" onClick={() => handleUnapprove(record)}>Unverify</Button>
        ) : (
          <>
            <Button size="small" type="primary" onClick={() => approve(record.userId._id || record.userId)}>Verify</Button>
            <Button danger size="small" onClick={() => reject(record)}>Reject</Button>
          </>
        )}
      </Space>
    ) }
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Verification Requests</h2>
      <Spin spinning={loading}>
        {(!data || data.length === 0) ? (
          <Empty description="No verification requests" />
        ) : (
          <Table rowKey="_id" loading={loading} dataSource={data} columns={columns as any} pagination={{ pageSize: 10 }} />
        )}
      </Spin>

      <Modal title="Verification Files" open={modalVisible} onCancel={closeFilesModal} footer={null} width={840}>
        {selectedReq ? (
          <div>
            <p><strong>Resident:</strong> {(selectedReq.userId && (selectedReq.userId.fullName || selectedReq.userId.username)) || 'Unknown'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {((selectedReq.filesMeta && selectedReq.filesMeta.length) ? selectedReq.filesMeta : (selectedReq.gridFileIds || []).map((id: string) => ({ filename: id, gridFileId: id }))).map((f: any, idx: number) => {
                const fid = f.gridFileId || f.filename;
                const fileUrl = getAbsoluteApiUrl(`/verification/file/${fid}`);
                const label = f.fileType ? (f.fileType.charAt(0).toUpperCase() + f.fileType.slice(1)) : (f.filename || 'File');
                return (
                  <div key={idx} style={{ border: '1px solid #f0f0f0', padding: 12, borderRadius: 8, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <a href={fileUrl} target="_blank" rel="noreferrer">Open</a>
                        <a href={fileUrl} download>Download</a>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <img src={fileUrl} alt={label} style={{ maxWidth: '100%', maxHeight: 360 }} onError={(e) => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; }} />
                      <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>{f.filename || fid}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty description="No files" />
        )}
      </Modal>
    </div>
  );
};

export default VerificationRequests;
