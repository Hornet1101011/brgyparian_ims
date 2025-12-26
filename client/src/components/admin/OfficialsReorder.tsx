import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Divider
} from '@mui/material';
import {
  DragOutlined,
  DeleteOutlined,
  UploadOutlined,
  UsergroupAddOutlined
} from '@ant-design/icons';
import { Upload as AntdUpload, message as antdMessage } from 'antd';
import { adminAPI } from '../../services/api';
import OfficialPhotoImage from '../OfficialPhotoImage';

interface Official {
  _id?: string;
  name: string;
  title: string;
  term: string;
  photoUrl?: string;
  photoPath?: string;
  previewUrl?: string;
  displayOrder?: number;
}

interface OfficialsReorderProps {
  officials: Official[];
  onOfficialUpdate: (officials: Official[]) => void;
  onAddOfficial: () => void;
  onDeleteOfficial: (id?: string) => Promise<void>;
  officialsLoading: boolean;
  savingOfficials: boolean;
  autoSaveTimers: React.MutableRefObject<Record<string, number>>;
  onNameChange: (id: string | undefined, value: string) => void;
  onTitleChange: (id: string | undefined, value: string) => void;
  onTermChange: (id: string | undefined, value: string) => void;
  previewUrlsRef: React.MutableRefObject<Record<string, string>>;
  manualSaveError?: string | null;
}

// Styled TextField for consistency
const StyledTextField: React.FC<React.ComponentProps<any>> = (props) => {
  const { TextField } = require('@mui/material');
  return (
    <TextField
      {...props}
      variant="outlined"
      size="small"
      InputLabelProps={{
        shrink: true,
        sx: {
          fontSize: 13,
          fontWeight: 600,
          color: '#64748b',
          transform: 'translate(12px, -10px) scale(0.75)',
        }
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: 1,
          minHeight: 44
        },
        '& .MuiOutlinedInput-input': {
          padding: '12px 14px',
          fontSize: 14,
          color: '#0f172a'
        },
        ...props.sx
      }}
    />
  );
};

const OfficialsReorder: React.FC<OfficialsReorderProps> = ({
  officials,
  onOfficialUpdate,
  onAddOfficial,
  onDeleteOfficial,
  officialsLoading,
  savingOfficials,
  autoSaveTimers,
  onNameChange,
  onTitleChange,
  onTermChange,
  previewUrlsRef,
  manualSaveError
}) => {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === dropIndex) {
      setDraggedItem(null);
      return;
    }

    // Reorder locally
    const newOfficials = [...officials];
    const draggedOfficial = newOfficials[draggedItem];
    newOfficials.splice(draggedItem, 1);
    newOfficials.splice(dropIndex, 0, draggedOfficial);

    // Update with new display order
    const reorderedOfficials = newOfficials.map((off, idx) => ({
      ...off,
      displayOrder: idx
    }));

    onOfficialUpdate(reorderedOfficials);
    setDraggedItem(null);

    // Save to server
    await saveOrder(reorderedOfficials);
  };

  const saveOrder = async (reorderedOfficials: Official[]) => {
    setSavingOrder(true);
    setOrderError(null);
    try {
      const orderIds = reorderedOfficials
        .map(off => off._id)
        .filter(id => id && !id.toString().startsWith('new-'));

      if (orderIds.length === 0) {
        setOrderError('No saved officials to reorder');
        return;
      }

      await adminAPI.reorderOfficials(orderIds as string[]);
      antdMessage.success('Officials reordered');
    } catch (err) {
      console.error('Failed to save order', err);
      setOrderError('Failed to save order');
      antdMessage.error('Failed to save order');
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header with Info */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DragOutlined style={{ fontSize: 16, color: '#64748b' }} />
          <Typography variant="caption" sx={{ color: '#64748b' }}>
            Drag officials to reorder (1st to last, top to bottom)
          </Typography>
        </Box>
        <Button
          onClick={onAddOfficial}
          startIcon={<UsergroupAddOutlined />}
          size="small"
          variant="contained"
          sx={{ textTransform: 'none', fontWeight: 500 }}
          disabled={savingOrder}
        >
          Add
        </Button>
      </Box>

      {orderError && (
        <Alert severity="error" sx={{ borderRadius: 1 }}>
          {orderError}
        </Alert>
      )}

      {manualSaveError && (
        <Alert severity="warning" sx={{ borderRadius: 1 }}>
          {manualSaveError}
        </Alert>
      )}

      {savingOrder && (
        <Alert severity="info" sx={{ borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="caption">Saving order...</Typography>
        </Alert>
      )}

      {/* Officials List */}
      <Box sx={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {officialsLoading ? (
          <CircularProgress size={24} />
        ) : officials.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#94a3b8', textAlign: 'center', py: 4 }}>
            No officials added yet
          </Typography>
        ) : (
          officials.map((off, idx) => (
            <Paper
              key={off._id || idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              sx={{
                p: 2,
                background: draggedItem === idx ? '#fef3c7' : '#f8fafc',
                border: draggedItem === idx ? '2px dashed #d97706' : '1px solid #e2e8f0',
                borderRadius: 1,
                cursor: 'move',
                transition: 'all 200ms ease',
                opacity: draggedItem === idx ? 0.7 : 1,
                '&:hover': {
                  background: draggedItem === idx ? '#fef3c7' : '#f1f5f9',
                  boxShadow: '0 4px 12px rgba(15,23,42,0.1)'
                },
                userSelect: 'none'
              }}
            >
              {/* Order Badge + Drag Handle */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                <Box sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 56,
                  minHeight: 56,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                  color: '#ffffff',
                  flexShrink: 0
                }}>
                  <DragOutlined style={{ fontSize: 18, marginBottom: 2 }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 700 }}>#{idx + 1}</Typography>
                </Box>

                {/* Official Photo */}
                <Box sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '2px solid #e2e8f0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                }}>
                  <OfficialPhotoImage official={off as any} size={56} />
                </Box>

                {/* Fields */}
                <Box sx={{ flex: 1 }}>
                  <StyledTextField
                    label="Full Name"
                    value={off.name}
                    onChange={(e: any) => {
                      const v = e.target.value;
                      onNameChange(off._id, v);
                      if (autoSaveTimers.current[off._id || '']) {
                        clearTimeout(autoSaveTimers.current[off._id || '']);
                      }
                      autoSaveTimers.current[off._id || ''] = window.setTimeout(async () => {
                        try {
                          if (off._id && !off._id.toString().startsWith('new-')) {
                            await adminAPI.updateOfficial(off._id, { ...off, name: v });
                          } else {
                            const created = await adminAPI.createOfficial({ ...off, name: v });
                            const updated = officials.map(p => p._id === off._id ? created : p);
                            onOfficialUpdate(updated);
                          }
                        } catch (err) {
                          console.error('auto-save failed', err);
                        }
                      }, 900);
                    }}
                    fullWidth
                    sx={{ mb: 1 }}
                  />
                  <StyledTextField
                    label="Position"
                    value={off.title}
                    onChange={(e: any) => {
                      const v = e.target.value;
                      onTitleChange(off._id, v);
                      if (autoSaveTimers.current[off._id || '']) {
                        clearTimeout(autoSaveTimers.current[off._id || '']);
                      }
                      autoSaveTimers.current[off._id || ''] = window.setTimeout(async () => {
                        try {
                          if (off._id && !off._id.toString().startsWith('new-')) {
                            await adminAPI.updateOfficial(off._id, { ...off, title: v });
                          } else {
                            const created = await adminAPI.createOfficial({ ...off, title: v });
                            const updated = officials.map(p => p._id === off._id ? created : p);
                            onOfficialUpdate(updated);
                          }
                        } catch (err) {
                          console.error('auto-save failed', err);
                        }
                      }, 900);
                    }}
                    fullWidth
                    sx={{ mb: 1 }}
                  />
                  <StyledTextField
                    label="Term"
                    value={off.term}
                    onChange={(e: any) => {
                      const v = e.target.value;
                      onTermChange(off._id, v);
                      if (autoSaveTimers.current[off._id || '']) {
                        clearTimeout(autoSaveTimers.current[off._id || '']);
                      }
                      autoSaveTimers.current[off._id || ''] = window.setTimeout(async () => {
                        try {
                          if (off._id && !off._id.toString().startsWith('new-')) {
                            await adminAPI.updateOfficial(off._id, { ...off, term: v });
                          } else {
                            const created = await adminAPI.createOfficial({ ...off, term: v });
                            const updated = officials.map(p => p._id === off._id ? created : p);
                            onOfficialUpdate(updated);
                          }
                        } catch (err) {
                          console.error('auto-save failed', err);
                        }
                      }, 900);
                    }}
                    fullWidth
                  />
                </Box>

                {/* Delete Button */}
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteOutlined />}
                  onClick={() => {
                    if (off._id && !off._id.toString().startsWith('new-')) {
                      onDeleteOfficial(off._id);
                    } else {
                      const updated = officials.filter(p => p._id !== off._id);
                      onOfficialUpdate(updated);
                    }
                  }}
                  disabled={savingOfficials}
                  sx={{ textTransform: 'none', flexShrink: 0 }}
                >
                  Delete
                </Button>
              </Box>

              {/* Photo Upload */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <AntdUpload
                  showUploadList={false}
                  beforeUpload={(file) => {
                    const MAX_BYTES = 2 * 1024 * 1024;
                    if (file.size > MAX_BYTES) {
                      antdMessage.warning('File is too large. Maximum 2 MB.');
                      return false;
                    }
                    try {
                      const url = URL.createObjectURL(file);
                      previewUrlsRef.current[off._id || `temp-${Date.now()}`] = url;
                      const updated = officials.map(o =>
                        o._id === off._id ? { ...o, previewUrl: url } : o
                      );
                      onOfficialUpdate(updated);
                    } catch (e) {}
                    (async () => {
                      try {
                        if (!off._id || off._id.toString().startsWith('new-')) {
                          antdMessage.warning('Please save official first');
                          return;
                        }
                        await adminAPI.uploadOfficialPhoto(off._id, file as File);
                        // Refresh officials list to show new photo
                        const refreshed = await adminAPI.getOfficials();
                        onOfficialUpdate(
                          Array.isArray(refreshed) ? refreshed : officials
                        );
                        antdMessage.success('Photo uploaded');
                        // Clear preview URL after successful upload
                        try {
                          const key = off._id || '';
                          const u = previewUrlsRef.current[key];
                          if (u) {
                            URL.revokeObjectURL(u);
                            delete previewUrlsRef.current[key];
                          }
                        } catch (e) {}
                      } catch (err) {
                        console.error('upload failed', err);
                        antdMessage.error('Upload failed');
                      }
                    })();
                    return false;
                  }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<UploadOutlined />}
                    sx={{ textTransform: 'none' }}
                    disabled={savingOfficials}
                  >
                    Upload Photo
                  </Button>
                </AntdUpload>
              </Box>
            </Paper>
          ))
        )}
      </Box>
    </Box>
  );
};

export default OfficialsReorder;
