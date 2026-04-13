import React, { useState, useEffect } from 'react';
import './Profile.css';
import { 
  Button, 
  Form, 
  Input, 
  message, 
  Upload, 
  Alert, 
  Modal, 
  Tabs, 
  Row, 
  Col, 
  Select, 
  DatePicker, 
  Progress, 
  Card, 
  Badge, 
  Divider,
  Space,
  Typography,
  Tooltip,
  Tag
} from 'antd';
import { 
  UserOutlined, 
  MailOutlined, 
  HomeOutlined, 
  PhoneOutlined,
  EditOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  SafetyOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import AvatarImage from './AvatarImage';
import { getAbsoluteApiUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { axiosInstance } from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface ProfileProps {
  profile: any | null;
  onProfileUpdate: (profile: any) => void;
}

const Profile: React.FC<ProfileProps> = ({ profile, onProfileUpdate }) => {
  const [userForm] = Form.useForm();
  const [residentForm] = Form.useForm();
  const [changeForm] = Form.useForm();
  const { setUser, isAdmin, isStaff, isResident } = useAuth();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [residentMissing, setResidentMissing] = useState(false);
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  
  // Enhanced state for comprehensive profile management
  const [activeTab, setActiveTab] = useState('overview');
  const [profileCompletion, setProfileCompletion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<any>({});
  const [personalInfo, setPersonalInfo] = useState<any>({});
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'rejected'>('pending');

  // Enhanced profile completion calculation with comprehensive field validation
  const calculateProfileCompletion = (userData: any, personalData: any) => {
    // Helper function to check if a field has meaningful content
    const hasValidContent = (value: any) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        return trimmed !== '' && trimmed !== 'n/a' && trimmed !== 'na' && trimmed !== 'not applicable' && trimmed !== 'none';
      }
      if (typeof value === 'number') return !isNaN(value) && value >= 0;
      return true;
    };

    // Comprehensive user account fields
    const userFields = [
      'username', 'email', 'contactNumber', 'address'
    ];

    // Comprehensive personal information fields
    const personalFields = [
      // Basic Information
      'firstName', 'lastName', 'middleName', 'nameExtension', 'age', 'birthDate', 
      'dateOfResidency', 'sex', 'civilStatus',
      
      // Personal Details
      'nationality', 'placeOfBirth', 'religion', 'maritalStatus', 
      'passportNumber', 'governmentIdNumber', 'bloodType', 'disabilityStatus', 
      'occupation', 'educationalAttainment',
      
      // Contact Information
      'facebook', 'landlineNumber', 'emergencyContact', 
      'emergencyContactName', 'emergencyContactRelationship',
      
      // Family Information - Spouse
      'spouseName', 'spouseAge', 'spouseBirthDate', 'spouseMiddleName', 
      'spouseLastName', 'spouseOccupation', 'spouseStatus', 'spouseNationality', 
      'spouseContactNumber',
      
      // Family Information - Parents
      'motherName', 'motherAge', 'motherBirthDate', 'motherOccupation', 'motherStatus',
      'fatherName', 'fatherAge', 'fatherBirthDate', 'fatherOccupation', 'fatherStatus',
      
      // Family Information - Children
      'numberOfChildren', 'childrenNames', 'childrenAges',
      
      // Business Information
      'businessName', 'businessType', 'natureOfBusiness', 'businessAddress', 
      'dateEstablished', 'tin', 'registrationNumber', 'businessPermitNumber', 
      'barangayClearanceNumber', 'numberOfEmployees', 'capitalInvestment', 
      'annualGrossIncome', 'businessContactPerson', 'businessContactNumber', 'businessEmail'
    ];

    let completedFields = 0;
    let totalFields = userFields.length;

    // Check user data fields
    userFields.forEach(field => {
      if (userData && hasValidContent(userData[field])) {
        completedFields++;
      }
    });

    // Check personal data fields
    if (personalData) {
      totalFields += personalFields.length;
      personalFields.forEach(field => {
        if (hasValidContent(personalData[field])) {
          completedFields++;
        }
      });
    }

    // Calculate percentage with proper rounding
    const percentage = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
    return Math.round(percentage);
  };

  useEffect(() => {
    let mounted = true;
    
    // Fetch user profile data
    const profileEndpoint = isAdmin() ? '/admin/profile' : '/resident/profile';
    axiosInstance.get(profileEndpoint)
      .then(res => {
        if (!mounted) return;
        try {
          const raw = res.data;
          console.log('Raw profile API response:', raw);
          console.log('Raw response keys:', Object.keys(raw || {}));
          const p = raw && (raw.user || raw.profile) ? (raw.user || raw.profile) : raw;
          console.log('Processed profile data:', p);
          console.log('Processed profile keys:', Object.keys(p || {}));
          
          // If createdAt is not in profile data, try multiple sources
          if (!p?.createdAt) {
            // First try localStorage
            try {
              const storedUser = localStorage.getItem('userProfile');
              if (storedUser) {
                const user = JSON.parse(storedUser);
                if (user.createdAt) {
                  p.createdAt = user.createdAt;
                }
              }
            } catch (err) {
              console.log('Could not get createdAt from localStorage');
            }
            
            // If still no createdAt, try fetching current user data
            if (!p?.createdAt) {
              try {
                axiosInstance.get('/auth/current-user')
                  .then(userRes => {
                    if (userRes.data?.createdAt && mounted) {
                      p.createdAt = userRes.data.createdAt;
                      setProfileData({...p}); // Update state with createdAt
                    }
                  })
                  .catch(err => {
                    console.log('Could not fetch current user data for createdAt');
                  });
              } catch (err) {
                console.log('Error fetching current user for createdAt');
              }
            }
          }
          
          userForm.setFieldsValue(p || {});
          setProfileData(p || {});
          if (p?.profileImage) {
            const url = p.profileImage.startsWith('http') ? p.profileImage : getAbsoluteApiUrl(p.profileImage);
            setAvatarPreview(url);
          }
        } catch (err) {}
      })
      .catch(() => {});

    // Fetch personal information for residents
    if (isResident() || isAdmin()) {
      axiosInstance.get('/resident/personal-info')
        .then(res => {
          if (!mounted) return;
          const data = res.data || {};
          residentForm.setFieldsValue(data);
          setPersonalInfo(data);
          setVerificationStatus(data.verified ? 'verified' : 'pending');
          
          if (data?.profileImage) {
            const url = data.profileImage.startsWith('http') ? data.profileImage : getAbsoluteApiUrl(data.profileImage);
            setAvatarPreview(url);
          }
        })
        .catch((err) => {
          if (err?.response && err.response.status === 404) {
            setResidentMissing(true);
            residentForm.setFieldsValue({});
          }
        });
    }

    return () => { mounted = false; };
  }, [userForm, residentForm, isAdmin, isResident]);

  // Update profile completion when data changes
  useEffect(() => {
    const completion = calculateProfileCompletion(profileData, personalInfo);
    setProfileCompletion(completion);
  }, [profileData, personalInfo]);

  // Removed live verification socket listener from this component

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
      {/* Top Progress Bar for Small Screens */}
      <div className="profile-progress-top">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>Profile Completion</Text>
          <Text>{profileCompletion}%</Text>
        </div>
        <Progress 
          percent={profileCompletion} 
          status={profileCompletion === 100 ? 'success' : 'active'}
          strokeColor={profileCompletion === 100 ? '#52c41a' : '#1890ff'}
        />
        {profileCompletion < 100 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Complete your profile to unlock all features
          </Text>
        )}
      </div>

      {/* Profile Header with Avatar and Basic Info */}
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
            <div className="title-row">
              <h1 className="name">
                {(() => {
                  const uname = userForm.getFieldValue('username');
                  const first = residentForm.getFieldValue('firstName');
                  const last = residentForm.getFieldValue('lastName');
                  if (profile && (profile.fullName || profile.name)) return profile.fullName || profile.name;
                  if (first || last) return `${first || ''}${first && last ? ' ' : ''}${last || ''}`.trim();
                  if (uname) return uname;
                  try { const stored = localStorage.getItem('userProfile'); if (stored) { const u = JSON.parse(stored); return u.fullName || u.username || u.name || 'User'; } } catch (err) {}
                  return 'User';
                })()}
              </h1>
            </div>
            <div className="meta">
              <div className="meta-item">
                <span className="meta-label">Role</span>
                <span className="meta-value">
                  <Tag color={isAdmin() ? 'gold' : isStaff() ? 'blue' : 'green'}>
                    {isAdmin() ? <SafetyOutlined /> : isStaff() ? <TeamOutlined /> : <UserOutlined />}
                    {isAdmin() ? 'Admin' : isStaff() ? 'Staff' : 'Resident'}
                  </Tag>
                </span>
              </div>
              {profile?.barangayID && (
                <div className="meta-item">
                  <span className="meta-label">Barangay ID</span>
                  <span className="meta-value">{profile.barangayID}</span>
                </div>
              )}
              {personalInfo?.dateOfResidency && (
                <div className="meta-item">
                  <span className="meta-label">Resident For:</span>
                  <span className="meta-value">{calculateResidencyDuration(personalInfo.dateOfResidency)}</span>
                </div>
              )}
              {isResident() && (
                <div className="meta-item">
                  <span className="meta-label">Verification Status</span>
                  <span className="meta-value">
                    <Tag color={verificationStatus === 'verified' ? 'success' : verificationStatus === 'rejected' ? 'error' : 'warning'}>
                      {verificationStatus === 'verified' ? <CheckCircleOutlined /> : verificationStatus === 'rejected' ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />}
                      {verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'rejected' ? 'Rejected' : 'Pending'}
                    </Tag>
                  </span>
                </div>
              )}
            </div>

          <div className="profile-actions">
            <Button 
              onClick={() => setEditMode(!editMode)} 
              type={editMode ? 'default' : 'primary'}
              icon={editMode ? <SaveOutlined /> : <EditOutlined />}
            >
              {editMode ? 'Save Changes' : 'Edit Profile'}
            </Button>
            <Button onClick={() => setPwdModalVisible(true)}>Change Password</Button>
            {isResident() && (
              <Button type="dashed" loading={requesting} onClick={handleRequestStaff}>
                Request Staff Access
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Comprehensive Profile Tabs */}
      <Card style={{ marginTop: 24 }}>
        <Tabs 
          className="profile-tabs"
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Row gutter={[24, 16]}>
                    <Col xs={24} md={12}>
                      <Card size="small" title="Account Information">
                        <Form form={userForm} layout="vertical" disabled={!editMode}>
                          <Form.Item name="username" label="Username">
                            <Input prefix={<UserOutlined />} />
                          </Form.Item>
                          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
                            <Input prefix={<MailOutlined />} />
                          </Form.Item>
                          <Form.Item name="contactNumber" label="Contact Number">
                            <Input prefix={<PhoneOutlined />} />
                          </Form.Item>
                          <Form.Item name="address" label="Address">
                            <Input prefix={<HomeOutlined />} />
                          </Form.Item>
                        </Form>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card size="small" title="Quick Stats">
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>Profile Completion:</Text>
                            <Tag color={profileCompletion >= 80 ? 'green' : profileCompletion >= 50 ? 'orange' : 'red'}>
                              {profileCompletion}%
                            </Tag>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>Verification Status:</Text>
                            <Tag color={verificationStatus === 'verified' ? 'success' : 'warning'}>
                              {verificationStatus}
                            </Tag>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>Resident For:</Text>
                            <Text>{personalInfo?.dateOfResidency ? calculateResidencyDuration(personalInfo.dateOfResidency) : 'Unknown'}</Text>
                          </div>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                </div>
              ),
            },
            // Personal Information Tab (for residents and admins)
            ...(isResident() || isAdmin() ? [{
              key: 'personal',
              label: 'Personal Information',
              children: (
                <div style={{ padding: '16px 0' }}>
                  {residentMissing && (
                    <Alert
                      message="Personal Information Missing"
                      description={
                        <div>
                          <p>We couldn't find your personal information. Please create it to access all features.</p>
                          <Button type="primary" onClick={autoCreateResident}>Create Personal Info</Button>
                        </div>
                      }
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )}
                  
                  <Form form={residentForm} layout="vertical">
                    <Typography.Title level={4} style={{ marginBottom: 16 }}>Basic Information</Typography.Title>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="firstName" label="First Name" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="middleName" label="Middle Name">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="nameExtension" label="Name Extension">
                          <Input placeholder="Jr., Sr., II, III" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="age" label="Age">
                          <Input type="number" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="birthDate" label="Birth Date">
                          <DatePicker 
                            value={residentForm.getFieldValue('birthDate') ? dayjs(residentForm.getFieldValue('birthDate')) : null}
                            onChange={(date) => { 
                              if (date) { 
                                const birthDate = date.format('YYYY-MM-DD'); 
                                const age = dayjs().diff(date, 'year'); 
                                residentForm.setFieldsValue({ birthDate, age }); 
                              } else {
                                residentForm.setFieldsValue({ birthDate: '', age: undefined }); 
                              } 
                            }} 
                            disabledDate={(current) => current && current > dayjs().endOf('day')}
                            style={{ width: '100%' }}
                            placeholder="Select birth date"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="sex" label="Gender">
                          <Select options={[
                            { label: 'Male', value: 'Male' },
                            { label: 'Female', value: 'Female' },
                            { label: 'Other', value: 'Other' }
                          ]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="civilStatus" label="Civil Status">
                          <Select options={[
                            { label: 'Single', value: 'Single' },
                            { label: 'Married', value: 'Married' },
                            { label: 'Widowed', value: 'Widowed' },
                            { label: 'Separated', value: 'Separated' },
                            { label: 'Divorced', value: 'Divorced' },
                            { label: 'Annulled', value: 'Annulled' },
                            { label: 'Domestic Partnership', value: 'Domestic Partnership' },
                            { label: 'Other', value: 'Other' }
                          ]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="dateOfResidency" label="Date of Residency">
                          <DatePicker 
                            value={residentForm.getFieldValue('dateOfResidency') ? dayjs(residentForm.getFieldValue('dateOfResidency')) : null}
                            onChange={(date) => { 
                              const dateOfResidency = date ? date.format('YYYY-MM-DD') : ''; 
                              residentForm.setFieldsValue({ dateOfResidency }); 
                            }} 
                            disabledDate={(current) => current && current > dayjs().endOf('day')}
                            style={{ width: '100%' }}
                            placeholder="Select residency start date"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    
                    <Divider />
                    <Typography.Title level={4} style={{ marginBottom: 16 }}>Personal Details</Typography.Title>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="nationality" label="Nationality">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="placeOfBirth" label="Place of Birth">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="religion" label="Religion">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="maritalStatus" label="Marital Status">
                          <Select options={[
                            { label: 'Single', value: 'Single' },
                            { label: 'Married', value: 'Married' },
                            { label: 'Widowed', value: 'Widowed' },
                            { label: 'Separated', value: 'Separated' },
                            { label: 'Other', value: 'Other' }
                          ]} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="passportNumber" label="Passport Number">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="governmentIdNumber" label="Government ID Number">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="bloodType" label="Blood Type">
                          <Select options={[
                            { label: 'A+', value: 'A+' },
                            { label: 'A-', value: 'A-' },
                            { label: 'B+', value: 'B+' },
                            { label: 'B-', value: 'B-' },
                            { label: 'O+', value: 'O+' },
                            { label: 'O-', value: 'O-' },
                            { label: 'AB+', value: 'AB+' },
                            { label: 'AB-', value: 'AB-' }
                          ]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="disabilityStatus" label="Disability Status">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="occupation" label="Occupation">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24}>
                        <Form.Item name="educationalAttainment" label="Educational Attainment">
                          <Select options={[
                            { label: 'No Formal Education', value: 'No Formal Education' },
                            { label: 'Elementary', value: 'Elementary' },
                            { label: 'High School', value: 'High School' },
                            { label: 'College', value: 'College' },
                            { label: 'Bachelor\'s Degree', value: 'Bachelor\'s Degree' },
                            { label: 'Master\'s Degree', value: 'Master\'s Degree' },
                            { label: 'Doctorate', value: 'Doctorate' },
                            { label: 'Vocational', value: 'Vocational' },
                            { label: 'Other', value: 'Other' }
                          ]} />
                        </Form.Item>
                      </Col>
                    </Row>
                    
                    <Form.Item name="address" label="Address">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <Button type="primary" onClick={handleResidentSave} loading={saving}>
                        Save Personal Information
                      </Button>
                    </div>
                  </Form>
                </div>
              ),
            }] : []),
            // Contact Information Tab
            ...(isResident() || isAdmin() ? [{
              key: 'contact',
              label: 'Contact Information',
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Form form={residentForm} layout="vertical">
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="contactNumber" label="Contact Number">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="landlineNumber" label="Landline Number">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="facebook" label="Facebook">
                          <Input placeholder="Facebook profile/link" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="emergencyContactName" label="Emergency Contact Name">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="emergencyContactRelationship" label="Emergency Contact Relationship">
                          <Input placeholder="Relationship to emergency contact" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="emergencyContact" label="Emergency Contact Number">
                          <Input placeholder="Emergency contact number" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="email" label="Email">
                          <Input type="email" placeholder="Email address" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                </div>
              ),
            }] : []),
            // Professional Information Tab
            ...(isResident() || isAdmin() ? [{
              key: 'professional',
              label: 'Professional Information',
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Form form={residentForm} layout="vertical">
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="occupation" label="Occupation">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="educationalAttainment" label="Educational Attainment">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                </div>
              ),
            }] : []),
            // Admin/Staff specific tabs
            ...(isAdmin() || isStaff() ? [{
              key: 'admin',
              label: 'Admin Settings',
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Alert
                    message="Admin Panel"
                    description="Access comprehensive user management and system settings."
                    type="info"
                    showIcon
                  />
                </div>
              ),
            }] : []),
          ]}
        />
      </Card>

      {/* Change Password Modal */}
      <Modal 
        title="Change Password" 
        open={pwdModalVisible} 
        onCancel={() => { setPwdModalVisible(false); changeForm.resetFields(); }} 
        footer={null}
      >
        <Form 
          form={changeForm} 
          layout="vertical" 
          onFinish={async (vals) => {
            const { currentPassword, newPassword, confirmPassword } = vals;
            if (newPassword !== confirmPassword) { 
              message.error('New password and confirmation do not match'); 
              return; 
            }
            setPwdLoading(true);
            try { 
              await axiosInstance.post('/change-password', { currentPassword, newPassword }); 
              message.success('Password changed successfully'); 
              setPwdModalVisible(false); 
              changeForm.resetFields(); 
            }
            catch (err: any) { 
              const text = err?.response?.data?.message || 'Failed to change password'; 
              message.error(text); 
            }
            finally { 
              setPwdLoading(false); 
            }
          }}
        >
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
    </div>
  );
};

export default Profile;
