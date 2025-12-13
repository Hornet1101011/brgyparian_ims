import React, { useEffect, useState } from 'react';
import { List, Button, Input, Modal, message, Typography, Space, Popconfirm } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;

type StaffNote = {
  _id: string;
  text: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
};

type Props = {
  inquiryId: string;
  onChange?: () => void;
};

export default function StaffNotes({ inquiryId, onChange }: Props) {
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editing, setEditing] = useState<StaffNote | null>(null);
  const [editingText, setEditingText] = useState('');

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/inquiries/${inquiryId}/staff-notes`);
      if (res.data?.success) setNotes(res.data.notes || []);
    } catch (err) {
      console.error(err);
      message.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!inquiryId) return;
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  const handleAdd = async () => {
    if (!newNote || newNote.trim().length < 3) {
      return message.warning('Please enter a note (min 3 chars)');
    }
    try {
      setLoading(true);
      const res = await axios.post(`/api/inquiries/${inquiryId}/staff-notes`, { text: newNote });
      if (res.data?.success) {
        message.success('Note saved');
        setNewNote('');
        setNotes(prev => [res.data.note, ...prev]);
        if (onChange) onChange();
      } else {
        message.error('Failed to save note');
      }
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (note: StaffNote) => {
    setEditing(note);
    setEditingText(note.text);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editingText || editingText.trim().length < 1) {
      return message.warning('Note cannot be empty');
    }
    try {
      setLoading(true);
      const res = await axios.put(
        `/api/inquiries/${inquiryId}/staff-notes/${editing._id}`,
        { text: editingText }
      );
      if (res.data?.success) {
        message.success('Note updated');
        setNotes(prev => prev.map(n => (n._id === editing._id ? res.data.note : n)));
        setEditing(null);
        setEditingText('');
        if (onChange) onChange();
      } else {
        message.error('Update failed');
      }
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.error || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditingText('');
  };

  const deleteNote = async (noteId: string) => {
    try {
      setLoading(true);
      const res = await axios.delete(`/api/inquiries/${inquiryId}/staff-notes/${noteId}`);
      if (res.data?.success) {
        message.success('Note deleted');
        setNotes(res.data.notes || []);
        if (onChange) onChange();
      } else {
        message.error('Delete failed');
      }
    } catch (err) {
      console.error(err);
      message.error('Delete failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text strong>Staff Notes (private)</Text>
        <TextArea
          placeholder="Add internal note for staff..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
        />
        <Space>
          <Button type="primary" onClick={handleAdd} loading={loading}>
            Save Note
          </Button>
          <Button onClick={() => setNewNote('')}>Clear</Button>
        </Space>

        <List
          loading={loading}
          dataSource={notes}
          locale={{ emptyText: 'No staff notes yet.' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button type="link" onClick={() => openEdit(item)} key="edit">
                  Edit
                </Button>,
                <Popconfirm
                  title="Delete note?"
                  onConfirm={() => deleteNote(item._id)}
                  okText="Yes"
                  cancelText="No"
                  key="delete"
                >
                  <Button type="link" danger>
                    Delete
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <div>
                    <Text strong>{item.createdByName || 'Staff'}</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      {dayjs(item.createdAt).format('MMM D, YYYY - h:mm A')}
                    </Text>
                  </div>
                }
                description={<div style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>}
              />
            </List.Item>
          )}
        />
      </Space>

      <Modal
        visible={!!editing}
        title="Edit Staff Note"
        onOk={saveEdit}
        onCancel={cancelEdit}
        okText="Save"
      >
        <TextArea rows={4} value={editingText} onChange={(e) => setEditingText(e.target.value)} />
      </Modal>
    </div>
  );
}
