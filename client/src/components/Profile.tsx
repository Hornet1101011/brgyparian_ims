import React, { useState, useEffect } from 'react';
import './Profile.css';
import { Button, Form, Input, message, Upload, Alert, Modal } from 'antd';
import { UserOutlined, MailOutlined, HomeOutlined, PhoneOutlined } from '@ant-design/icons';
import AvatarImage from './AvatarImage';
import { getAbsoluteApiUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { axiosInstance } from '../services/api';
import dayjs from 'dayjs';

interface ProfileProps {
  profile: any | null;
  onProfileUpdate: (profile: any) => void;
}

const Profile: React.FC<ProfileProps> = ({ profile, onProfileUpdate }) => {
  const [userForm] = Form.useForm();
  const [residentForm] = Form.useForm();
  const [changeForm] = Form.useForm();
  const { setUser } = useAuth();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [residentMissing, setResidentMissing] = useState(false);
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    axiosInstance.get('/resident/profile')
      .then(res => {
        if (!mounted) return;
        userForm.setFieldsValue(res.data || {});
        if (res.data?.profileImage) {
          const url = res.data.profileImage.startsWith('http') ? res.data.profileImage : getAbsoluteApiUrl(res.data.profileImage);
          setAvatarPreview(url);
        }
      })
      .catch(() => {});

    axiosInstance.get('/resident/personal-info')
      .then(res => {
        if (!mounted) return;
        residentForm.setFieldsValue(res.data || {});
        if (res.data?.profileImage) {
          const url = res.data.profileImage.startsWith('http') ? res.data.profileImage : getAbsoluteApiUrl(res.data.profileImage);
          setAvatarPreview(url);
        }
      })
      .catch((err) => {
        if (err?.response && err.response.status === 404) {
          setResidentMissing(true);
          residentForm.setFieldsValue({});
        }
      });

    return () => { mounted = false; };
  }, [userForm, residentForm]);

  const autoCreateResident = async () => {
    try {
      const values = userForm.getFieldsValue();
      const parts = (values.fullName || values.username || '').toString().trim().split(' ');
      const firstName = parts.length ? parts[0] : (values.username || values.email || 'Resident');
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      const payload: any = { firstName, lastName, barangayID: values.barangayID || '', username: values.username || '', email: values.email || '' };
      const resp = await axiosInstance.put('/resident/personal-info', payload);
      residentForm.setFieldsValue(resp.data || {});
      setResidentMissing(false);
      message.success('Resident profile created');
    } catch (err) {
      console.error('Failed to auto-create resident:', err);
      message.error('Failed to create resident info. Please fill the form manually.');
    }
  };

  const handleAvatarChange = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setAvatarPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const form = new FormData();
    form.append('avatar', file);
    try {
      const resp = await axiosInstance.post('/resident/personal-info/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updated = resp.data?.resident;
      const returnedUser = resp.data?.user;
      if (updated) {
        residentForm.setFieldsValue(updated || {});
        if (updated.profileImage) {
          const url = updated.profileImage.startsWith('http') ? updated.profileImage : `${getAbsoluteApiUrl(updated.profileImage)}?t=${Date.now()}`;
          setAvatarPreview(url);
        }
        setResidentMissing(false);
      }
      if (returnedUser) {
        try {
          if (typeof setUser === 'function') setUser(returnedUser);
          else localStorage.setItem('userProfile', JSON.stringify(returnedUser));
          try { window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: returnedUser })); } catch (err) {}
        } catch (err) {}
      }
      message.success('Profile image updated');
    } catch (err) {
      message.error('Failed to upload avatar');
    }
  };

  const handleUserSave = async () => {
    try {
      const values = await userForm.validateFields();
      const resp = await axiosInstance.put('/resident/profile', values);
      const returned = resp?.data || null;
      if (returned) {
        const returnedUser = returned.user || returned.profile || (returned?.userProfile ? returned.userProfile : (returned?.username ? returned : null));
        if (returnedUser && typeof setUser === 'function') setUser(returnedUser);
      }
      onProfileUpdate(values);
      message.success('User info updated');
      setEditMode(false);
    } catch (err) {
      message.error('Failed to update user info');
    }
  };

  const handleResidentSave = async () => {
    try {
      const values = await residentForm.validateFields();
      await axiosInstance.put('/resident/personal-info', values);
      message.success('Resident info updated');
    } catch (err) {
      message.error('Failed to update resident info');
    }
  };

  const handleRequestStaff = async () => {
    setRequesting(true);
    try {
      const resp = await axiosInstance.post('/resident/request-staff-access');
      message.success(resp.data?.message || 'Request sent');
    } catch (err) {
      message.error('Failed to send request');
    }
    setRequesting(false);
  };

  return (
    <div className="profile-page">
      <section className="profile-header card">
        <div className="profile-left">
          <Upload
            showUploadList={false}
            accept="image/*"
            customRequest={async ({ file, onSuccess, onError }) => {
              try { await handleAvatarChange(file as File); if (typeof onSuccess === 'function') onSuccess('ok'); } catch (err) { if (typeof onError === 'function') onError(err as any); }
            }}
          >
            <div
              className="profile-avatar clickable"
              role="button"
              tabIndex={0}
              aria-label="Upload profile picture"
              title="Upload profile picture"
              onKeyDown={(e) => {
                // allow Enter/Space to activate the upload (delegates to click)
                if (e.key === 'Enter' || e.key === ' ') {
                  (e.target as HTMLElement).click();
                }
              }}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile" />
              ) : (
                <AvatarImage user={(() => {
                  let displayUser = profile;
                  if (!displayUser) {
                    try { const stored = localStorage.getItem('userProfile'); if (stored) displayUser = JSON.parse(stored); } catch (err) {}
                  }
                  return displayUser;
                })()} size={96} />
              )}
            </div>
          </Upload>
        </div>

        <div className="profile-right">
          <div className="profile-title">
            <div className="title-row">
              <h1 className="name">
                {(() => {
                  const uname = userForm.getFieldValue('username');
                  const first = residentForm.getFieldValue('firstName');
                  const last = residentForm.getFieldValue('lastName');
                  if (profile && (profile.fullName || profile.name)) return profile.fullName || profile.name;
                  if (first || last) return `${first || ''}${first && last ? ' ' : ''}${last || ''}`.trim();
                  if (uname) return uname;
                  try { const stored = localStorage.getItem('userProfile'); if (stored) { const u = JSON.parse(stored); return u.fullName || u.username || u.name || 'Resident'; } } catch (err) {}
                  return 'Resident';
                })()}
              </h1>

              <div className="meta">
                {profile?.barangayID ? <span className="meta-item">Barangay ID: {profile.barangayID}</span> : null}
                {profile?.createdAt ? <span className="meta-item">{dayjs(profile.createdAt).format('MM/DD/YYYY HH:mm')}</span> : null}
              </div>
            </div>
          </div>

          <Form form={userForm} layout="vertical" className="profile-info" disabled={!editMode}>
            <Form.Item name="username" label="Username">
              <Input prefix={<UserOutlined />} />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input prefix={<MailOutlined />} />
            </Form.Item>
            <Form.Item name="address" label="Address">
              <Input prefix={<HomeOutlined />} />
            </Form.Item>
            <Form.Item name="contactNumber" label="Contact Number">
              <Input prefix={<PhoneOutlined />} />
            </Form.Item>
          </Form>

          <div className="profile-actions">
            {editMode ? <Button type="primary" onClick={handleUserSave}>Save</Button> : null}
            <Button onClick={() => setEditMode(!editMode)} type={editMode ? 'default' : 'primary'}>{editMode ? 'Cancel' : 'Edit'}</Button>
            <Button onClick={() => setPwdModalVisible(true)}>Change Password</Button>
            <div style={{ marginLeft: 'auto' }}>
              <Button type="dashed" loading={requesting} onClick={handleRequestStaff}>Request Staff Access</Button>
            </div>
          </div>
        </div>
      </section>

      <Modal title="Change Password" open={pwdModalVisible} onCancel={() => { setPwdModalVisible(false); changeForm.resetFields(); }} footer={null}>
        <Form form={changeForm} layout="vertical" onFinish={async (vals) => {
          const { currentPassword, newPassword, confirmPassword } = vals;
          if (newPassword !== confirmPassword) { message.error('New password and confirmation do not match'); return; }
          setPwdLoading(true);
          try { await axiosInstance.post('/change-password', { currentPassword, newPassword }); message.success('Changes have been saved'); setPwdModalVisible(false); changeForm.resetFields(); }
          catch (err: any) { const text = err?.response?.data?.message || 'Failed to change password'; message.error(text); }
          finally { setPwdLoading(false); }
        }}>
          <Form.Item name="currentPassword" label="Current password" rules={[{ required: true, message: 'Enter your current password' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="New password" rules={[{ required: true, message: 'Enter a new password' }, { min: 6, message: 'Password must be at least 6 characters' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="Confirm new password" rules={[{ required: true, message: 'Confirm your new password' }]}>
            <Input.Password />
          </Form.Item>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setPwdModalVisible(false); changeForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" loading={pwdLoading} onClick={() => changeForm.submit()}>Save</Button>
          </div>
        </Form>
      </Modal>

      <section className="profile-resident card">
        <h3>Resident Info</h3>
        {residentMissing && (
          <Alert
            message="Resident profile missing"
            description={<div><p>We couldn't find your resident personal info. Please create it so you can upload your profile picture and use resident features.</p><Button type="primary" onClick={autoCreateResident}>Create Resident Info</Button></div>}
            type="warning"
            showIcon
          />
        )}

        <Form form={residentForm} layout="vertical" className="profile-info">
          <Form.Item name="firstName" label="First Name"><Input /></Form.Item>
          <Form.Item name="lastName" label="Last Name"><Input /></Form.Item>
          <Form.Item name="birthDate" label="Birthdate"><Input type="date" onChange={e => { const v = e.target.value; if (v) { const age = dayjs().diff(dayjs(v), 'year'); residentForm.setFieldsValue({ age }); } }} /></Form.Item>
          <Form.Item name="age" label="Age"><Input type="number" /></Form.Item>
          <Form.Item name="address" label="Address"><Input /></Form.Item>
          <div style={{ display: 'flex', gap: '0.5rem' }}><Button type="primary" onClick={handleResidentSave}>Save Resident Info</Button></div>
        </Form>
      </section>
    </div>
  );
};

export default Profile;
