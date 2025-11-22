import React from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { TextField, Button, Box, Link, Paper, Container, InputAdornment, Alert, Typography } from '@mui/material';
import { Upload as AntUpload, Progress as AntProgress, message as antdMessage, Button as AntButton, Tooltip, Steps } from 'antd';
import { UploadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import type { AxiosProgressEvent } from 'axios';
import { Email, Lock, Home, Phone, Person, Visibility, VisibilityOff } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { axiosInstance } from '../services/api';

// Server requires: min 6 chars, at least one number, one uppercase letter, and one special character
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// Name regex: letters, spaces, apostrophe, hyphen only
const NAME_REGEX = /^[A-Za-z\s'-]+$/;

const validationSchema = Yup.object({
  username: Yup.string()
    .matches(/^[a-zA-Z0-9]{4,20}$/, 'Username must be 4-20 characters and contain only letters and numbers')
    .required('Username is required'),
  email: Yup.string().email('Invalid email address').required('Email is required'),
  password: Yup.string()
    .matches(PASSWORD_REGEX, 'Password must be at least 6 characters long and contain at least one number, one uppercase letter, and one special character')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password'), undefined], 'Passwords must match')
    .required('Confirm Password is required'),
  address: Yup.string().required('Address is required'),
  contactNumber: Yup.string().matches(/^\d+$/, 'Contact number must contain digits only').required('Contact Number is required'),
  barangayID: Yup.string().required('Barangay ID is required'),
});

const RegisterForm = () => {
  const navigate = useNavigate();
  const [error, setError] = React.useState('');
  const [, setSuccess] = React.useState('');
  // admin password state removed from public registration
  const [adminUnlocked] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword,  setShowConfirmPassword] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{ [key: string]: string }>({});
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [govIdFile, setGovIdFile] = React.useState<File | null>(null);
  const [proofList, setProofList] = React.useState<UploadFile[]>([]);
  const [govIdList, setGovIdList] = React.useState<UploadFile[]>([]);
  const [selfieList, setSelfieList] = React.useState<UploadFile[]>([]);
  const previewUrlsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      try {
        urls.forEach((u) => {
          try { URL.revokeObjectURL(u); } catch (e) {}
        });
      } catch (err) {}
      try { urls.clear(); } catch (e) {}
    };
  }, []);
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = React.useState<string>('');
  const [selfieFile, setSelfieFile] = React.useState<File | null>(null);
  // Process UI for submit steps
  const [processActive, setProcessActive] = React.useState(false);
  const [processPercent, setProcessPercent] = React.useState(0);
  const [processMessage, setProcessMessage] = React.useState('');

  // Helper to generate a random unique Barangay ID
  function generateBarangayID() {
    // New format: brgyparian-<YEAR>-<6 chars alphanumeric mixed case>
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let rand = '';
    for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
    return `brgyparian-${year}-${rand}`;
  }

  const formik = useFormik({
    initialValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      address: '',
      contactNumber: '',
      barangayID: generateBarangayID(),
      role: 'resident',
    },
    validationSchema: validationSchema.shape({
      firstName: Yup.string().matches(NAME_REGEX, 'First name may only contain letters, spaces, hyphens, and apostrophes').required('First name is required'),
      middleName: Yup.string().matches(NAME_REGEX, 'Middle name may only contain letters, spaces, hyphens, and apostrophes').notRequired(),
      lastName: Yup.string().matches(NAME_REGEX, 'Last name may only contain letters, spaces, hyphens, and apostrophes').required('Last name is required'),
      role: Yup.string().oneOf(['resident']).required('Role is required'),
    }),
    // enable realtime validation on change and blur
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
  setError('');
  setFieldErrors({});
  // start process UI
  setProcessActive(true);
  setProcessPercent(5);
  setProcessMessage('Checking information fields...');

      // Prevent submission if there are validation errors
      const formErrors = await formik.validateForm();
      if (Object.keys(formErrors).length > 0) {
        setError('Please correct the highlighted errors before submitting.');
        setSubmitting(false);
        setProcessMessage('Validation failed. Please correct the highlighted fields.');
        setProcessPercent(0);
        setProcessActive(false);
        return;
      }

      // Validate availability (username, email, contact) before saving
      setProcessPercent(15);
      setProcessMessage('Validating availability of username, email and contact number...');
      try {
        const [uRes, eRes, cRes] = await Promise.all([
          axiosInstance.get('/auth/check-username', { params: { username: values.username } }),
          axiosInstance.get('/auth/check-email', { params: { email: values.email } }),
          axiosInstance.get('/auth/check-contact', { params: { contact: values.contactNumber } }),
        ]);
        const uAvail = Boolean(uRes?.data?.available);
        const eAvail = Boolean(eRes?.data?.available);
        const cAvail = Boolean(cRes?.data?.available);
        if (!uAvail || !eAvail || !cAvail) {
          const fe: any = {};
          if (!uAvail) fe.username = 'Username already in use';
          if (!eAvail) fe.email = 'Email already registered';
          if (!cAvail) fe.contactNumber = 'Contact number already registered';
          setFieldErrors(fe);
          setError('Please correct the highlighted errors before submitting.');
          setSubmitting(false);
          setProcessMessage('Some fields are already in use. Fix them and try again.');
          setProcessPercent(0);
          setProcessActive(false);
          return;
        }
      } catch (checkErr) {
        // If availability check fails, continue but inform user
        console.warn('Availability checks failed', checkErr);
        setProcessMessage('Availability checks could not be completed — proceeding with submission.');
        setProcessPercent(30);
      }

      // role is constrained to 'resident' on the client; admin/staff registration is not exposed here
      try {
        const fullName = [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ');

        setProcessPercent(40);
        setProcessMessage('Saving account...');
        const resp = await axiosInstance.post('/auth/register', {
          fullName,
          firstName: values.firstName,
          middleName: values.middleName,
          lastName: values.lastName,
          username: values.username,
          email: values.email,
          password: values.password,
          address: values.address,
          contactNumber: values.contactNumber,
          barangayID: values.barangayID,
          role: values.role,
        });
        let data: any = {};
        try {
          data = resp && resp.data ? resp.data : {};
        } catch (jsonErr) {
          setError('Server error: Could not parse response');
          return;
        }
        if (resp && resp.status >= 200 && resp.status < 300) {
          // Registration succeeded. If server returned a token, attach it and
          // upload verification files (if provided) to the verification upload endpoint.
          setSuccess('Registration successful!');
          // Attempt to parse returned data/token
          const returnedToken = (data && data.token) ? data.token : null;
          // If files were selected, upload them now using the returned token
          if (returnedToken && (proofFile || govIdFile || selfieFile)) {
            try {
              setUploadStatus('Uploading verification documents...');
              setProcessPercent(60);
              setProcessMessage('Uploading verification documents...');
              setUploading(true);
              setUploadProgress(0);
              // Ensure axios has Authorization header for the upload
              const headers: any = { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${returnedToken}` };
              const formData = new FormData();
              // verification upload route expects field name 'ids' (array)
              if (proofFile) formData.append('ids', proofFile, proofFile.name);
              if (govIdFile) formData.append('ids', govIdFile, govIdFile.name);
              if (selfieFile) formData.append('ids', selfieFile, selfieFile.name);
              await axiosInstance.post('/verification/upload', formData, {
                headers,
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                  const loaded = typeof progressEvent?.loaded === 'number' ? progressEvent!.loaded : 0;
                  const total = typeof progressEvent?.total === 'number' ? progressEvent!.total : 0;
                  if (total > 0) {
                    const percentCompleted = Math.round((loaded * 100) / total);
                    setUploadProgress(percentCompleted);
                    // reflect upload progress on processPercent
                    setProcessPercent(60 + Math.round((percentCompleted / 100) * 30));
                  }
                },
              });
              setUploadStatus('Upload complete');
              setProcessPercent(95);
              setProcessMessage('Finalizing verification request...');
              antdMessage.success('Verification documents uploaded successfully');
              setSuccess('Registration complete. Verification documents uploaded.');
            } catch (uploadErr) {
              console.warn('Verification upload failed after registration', uploadErr);
              setUploadStatus('Upload failed');
              antdMessage.error('Uploading verification documents failed. You can upload them later from your profile.');
              setError('Registration succeeded but uploading verification documents failed. You can upload them later from your profile.');
            } finally {
              setUploading(false);
            }
          }

          // complete process
          setProcessPercent(100);
          setProcessMessage('Done');
          setTimeout(() => {
            setProcessActive(false);
            setProcessPercent(0);
            setProcessMessage('');
          }, 800);

          // Reset form and navigate to login (or dashboard if you prefer automatic login)
          resetForm();
          setTimeout(() => navigate('/login'), 1500);
        } else {
          // Try to extract field-specific errors if present
          if (data.errors && typeof data.errors === 'object') {
            setFieldErrors(data.errors);
            setError('Please correct the highlighted errors before submitting.');
            setSubmitting(false);
            return;
          } else if (data.message) {
            setError(data.message);
          } else if (data.error) {
            setError(data.error);
          } else {
            setError('Registration failed');
          }
        }
      } catch (err: any) {
        // Network or server error - try to extract useful validation messages
        const respErr = err?.response;
        if (respErr && respErr.data) {
          const data = respErr.data as any;
          // Duplicate key / already exists
          if (respErr.status === 409 || (data.message && /already/i.test(String(data.message)))) {
            const fe: any = {};
            if (data.keyValue) {
              if (data.keyValue.username) fe.username = 'Username already in use';
              if (data.keyValue.email) fe.email = 'Email already registered';
            } else {
              if (/email/i.test(String(data.message))) fe.email = data.message;
              if (/username/i.test(String(data.message))) fe.username = data.message;
            }
            if (Object.keys(fe).length) {
              setFieldErrors(fe);
              setError('Please correct the highlighted errors before submitting.');
              setSubmitting(false);
              return;
            }
          }
          // Validation error from server
          if (respErr.status === 400) {
            setError(data.message || 'Invalid input');
            setSubmitting(false);
            return;
          }
        }
        setError('Network or server error. Please try again later.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Real-time availability/status states for username/email
  const [usernameAvailable, setUsernameAvailable] = React.useState<boolean | null>(null);
  const [emailAvailable, setEmailAvailable] = React.useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = React.useState(false);
  const [checkingEmail, setCheckingEmail] = React.useState(false);
  const [checkingContact, setCheckingContact] = React.useState(false);
  const [contactAvailable, setContactAvailable] = React.useState<boolean | null>(null);
  const contactTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const usernameTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const emailTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Debounced username availability check
  React.useEffect(() => {
    const username = String(formik.values.username || '').trim();
    setUsernameAvailable(null);
    if (usernameTimerRef.current) {
      clearTimeout(usernameTimerRef.current);
    }
    if (!username || username.length < 3) {
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    usernameTimerRef.current = setTimeout(async () => {
      try {
        const resp = await axiosInstance.get('/auth/check-username', { params: { username } });
        setUsernameAvailable(Boolean(resp?.data?.available));
      } catch (err) {
        // On error, don't block user; leave as unknown (null)
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
    return () => {
      if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    };
  }, [formik.values.username]);

  // Debounced email availability check
  React.useEffect(() => {
    const email = String(formik.values.email || '').trim();
    setEmailAvailable(null);
    if (emailTimerRef.current) {
      clearTimeout(emailTimerRef.current);
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setCheckingEmail(false);
      return;
    }
    setCheckingEmail(true);
    emailTimerRef.current = setTimeout(async () => {
      try {
        const resp = await axiosInstance.get('/auth/check-email', { params: { email } });
        setEmailAvailable(Boolean(resp?.data?.available));
      } catch (err) {
        setEmailAvailable(null);
      } finally {
        setCheckingEmail(false);
      }
    }, 500);
    return () => {
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
    };
  }, [formik.values.email]);

  // Debounced contact availability check (realtime)
  React.useEffect(() => {
    const contact = String(formik.values.contactNumber || '').trim();
    setContactAvailable(null);
    if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
    if (!contact || contact.length < 6) {
      setCheckingContact(false);
      return;
    }
    setCheckingContact(true);
    contactTimerRef.current = setTimeout(async () => {
      try {
        const resp = await axiosInstance.get('/auth/check-contact', { params: { contact } });
        setContactAvailable(Boolean(resp?.data?.available));
      } catch (err) {
        setContactAvailable(null);
      } finally {
        setCheckingContact(false);
      }
    }, 500);
    return () => {
      if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
    };
  }, [formik.values.contactNumber]);

  // Password strength helper
  const getPasswordStrength = React.useCallback((pwd: string) => {
    let score = 0;
    if (!pwd) return { percent: 0, label: 'Too short' };
    if (pwd.length >= 6) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    const percent = Math.min(100, Math.round((score / 4) * 100));
    const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';
    return { percent, label };
  }, []);

  // Helper to compute completion percentage for a simple progress tracker
  const percentComplete = React.useMemo(() => {
    const requiredFields = [
      formik.values.firstName,
      formik.values.lastName,
      formik.values.username,
      formik.values.email,
      formik.values.password,
      formik.values.confirmPassword,
      formik.values.address,
      formik.values.contactNumber,
    ];
    const filled = requiredFields.filter((v) => Boolean(v && String(v).trim().length > 0)).length;
    // include files as bonus completion
    const fileCount = Number(!!proofFile) + Number(!!govIdFile) + Number(!!selfieFile);
    const total = requiredFields.length + 3; // include 3 files
    const val = Math.round(((filled + fileCount) / total) * 100);
    return val;
  }, [formik.values, proofFile, govIdFile, selfieFile]);

  const currentStep = percentComplete < 34 ? 0 : percentComplete < 67 ? 1 : 2;

  const renderLabelWithTooltip = (label: React.ReactNode, tip: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>{label}</span>
      <Tooltip title={tip} placement="right">
        <InfoCircleOutlined style={{ color: '#888' }} />
      </Tooltip>
    </div>
  );

  // Input sanitizers to prevent invalid characters
  const sanitizeName = (v: string) => v.replace(/[^A-Za-z\s'-]/g, '');
  const sanitizeContact = (v: string) => v.replace(/\D/g, '');


  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #40c9ff 0%, #e81cff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      py: 6,
    }}>
      <Container maxWidth="sm">
        <Paper elevation={6} sx={{
          borderRadius: 5,
          p: 4,
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 8px 32px 0 rgba(64,201,255,0.15)',
        }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box sx={{
              fontWeight: 800,
              fontSize: 32,
              letterSpacing: 1,
              background: 'linear-gradient(90deg, #40c9ff, #e81cff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}>
              Create Account
            </Box>
          </Box>
          {/* Progress tracker and steps (Ant Design) */}
          <Box sx={{ maxWidth: 560, mx: 'auto', mb: 3 }}>
            <Steps current={currentStep} size="small">
              <Steps.Step title="Account" />
              <Steps.Step title="Personal" />
              <Steps.Step title="Verification" />
            </Steps>
            <div style={{ marginTop: 8 }}>
              <AntProgress percent={percentComplete} showInfo strokeColor={{ '0%': '#e81cff', '100%': '#40c9ff' }} />
            </div>
          </Box>
          <form onSubmit={formik.handleSubmit}>
            {/* Processing overlay shown while submission steps run */}
            {processActive && (
              <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
                <div style={{ width: 460, padding: 20, borderRadius: 8, background: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
                  <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>Processing</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>{processMessage}</Typography>
                  <AntProgress percent={processPercent} status={processPercent < 100 ? 'active' : 'success'} />
                </div>
              </div>
            )}
            {/* ...existing fields... */}
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('First Name', 'Enter your given/first name. Use letters, spaces, hyphens and apostrophes only.')}
              name="firstName"
              value={formik.values.firstName}
              onChange={(e) => { formik.setFieldValue('firstName', sanitizeName(e.target.value)); }}
              error={formik.touched.firstName && Boolean(formik.errors.firstName)}
              helperText={formik.touched.firstName && formik.errors.firstName}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Middle Name (optional)', 'Middle name is optional. Use letters, spaces, hyphens and apostrophes only.')}
              name="middleName"
              value={formik.values.middleName}
              onChange={(e) => { formik.setFieldValue('middleName', sanitizeName(e.target.value)); }}
              error={formik.touched.middleName && Boolean(formik.errors.middleName)}
              helperText={formik.touched.middleName && formik.errors.middleName}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Last Name', 'Enter your family/last name.')}
              name="lastName"
              value={formik.values.lastName}
              onChange={(e) => { formik.setFieldValue('lastName', sanitizeName(e.target.value)); }}
              error={formik.touched.lastName && Boolean(formik.errors.lastName)}
              helperText={formik.touched.lastName && formik.errors.lastName}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Username', 'Choose a unique username (4-20 letters or numbers).')}
              name="username"
              value={formik.values.username}
              onChange={formik.handleChange}
              error={
                (formik.touched.username && Boolean(formik.errors.username)) ||
                Boolean(fieldErrors.username) ||
                usernameAvailable === false
              }
              helperText={
                (formik.touched.username && formik.errors.username) ||
                fieldErrors.username ||
                (checkingUsername ? 'Checking availability...' : usernameAvailable === false ? 'Username already taken' : usernameAvailable === true ? 'Username available' : 'Username must be at least 4 characters long and contain only letters and numbers.')
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Person color="primary" />
                  </InputAdornment>
                ),
              }}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Email', 'Enter a valid email address used for account recovery and notifications.')}
              name="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              error={
                (formik.touched.email && Boolean(formik.errors.email)) ||
                Boolean(fieldErrors.email) ||
                emailAvailable === false
              }
              helperText={
                (formik.touched.email && formik.errors.email) ||
                fieldErrors.email ||
                (checkingEmail ? 'Checking email...' : emailAvailable === false ? 'Email already registered' : emailAvailable === true ? 'Email looks available' : '')
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Email color="primary" />
                  </InputAdornment>
                ),
              }}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            {/* Password Field with Show/Hide */}
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Password', 'At least 6 characters, include uppercase, number and special character.')}
              name="password"
              type={showPassword ? "text" : "password"}
              value={formik.values.password}
              onChange={formik.handleChange}
              error={formik.touched.password && Boolean(formik.errors.password)}
              helperText={
                (formik.touched.password && formik.errors.password) ||
                fieldErrors.password ||
                'Password must be at least 6 characters long and contain at least one number, one uppercase letter, and one special character.'
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock color="primary" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      onClick={() => setShowPassword((prev) => !prev)}
                      tabIndex={-1}
                      sx={{ minWidth: 0, p: 0, color: 'inherit' }}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </Button>
                  </InputAdornment>
                ),
              }}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            {/* Password strength indicator (client-side heuristic) */}
            <div style={{ marginTop: -8, marginBottom: 12 }}>
              {(() => {
                const { percent, label } = getPasswordStrength(String(formik.values.password || ''));
                return (
                  <div>
                    <AntProgress percent={percent} showInfo={false} strokeColor={percent < 34 ? '#ff4d4f' : percent < 67 ? '#faad14' : '#52c41a'} />
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{label}</Typography>
                  </div>
                );
              })()}
            </div>
            {/* Confirm Password Field with Show/Hide */}
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Confirm Password', 'Re-enter your password to confirm.')}
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              error={formik.touched.confirmPassword && Boolean(formik.errors.confirmPassword)}
              helperText={formik.touched.confirmPassword && formik.errors.confirmPassword}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock color="primary" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      tabIndex={-1}
                      sx={{ minWidth: 0, p: 0, color: 'inherit' }}
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </Button>
                  </InputAdornment>
                ),
              }}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Permanent Address', 'Street, barangay, city — used for official correspondence and verification.')}
              name="address"
              value={formik.values.address}
              onChange={formik.handleChange}
              error={formik.touched.address && Boolean(formik.errors.address)}
              helperText={formik.touched.address && formik.errors.address}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Home color="primary" />
                  </InputAdornment>
                ),
              }}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            <TextField
              fullWidth
              margin="normal"
              label={renderLabelWithTooltip('Contact Number', 'Enter digits only. Include area code if applicable.')}
              name="contactNumber"
              value={formik.values.contactNumber}
              onChange={(e) => { formik.setFieldValue('contactNumber', sanitizeContact(e.target.value)); }}
              error={formik.touched.contactNumber && Boolean(formik.errors.contactNumber)}
              helperText={formik.touched.contactNumber && formik.errors.contactNumber}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Phone color="primary" />
                  </InputAdornment>
                ),
              }}
              sx={{ borderRadius: 3, background: '#f4f6fa', mb: 2 }}
            />
            {/* File uploads for verification during registration */}
            <Box sx={{ mb: 2 }}>
              <Typography component="label" sx={{ display: 'block', fontWeight: 600, mb: 1 }}>
                {renderLabelWithTooltip('Proof of Residency', 'Upload a document showing your address (e.g., utility bill, lease, or bank statement).')}
              </Typography>
              <AntUpload
                accept="image/*,application/pdf"
                fileList={proofList}
                beforeUpload={(file) => {
                  // prevent auto upload
                  return false;
                }}
                onChange={({ fileList }) => {
                  // revoke any existing preview for this slot
                  proofList.forEach((pf) => {
                    if (pf && (pf as any).thumbUrl) {
                      try { URL.revokeObjectURL(String((pf as any).thumbUrl)); } catch (e) {}
                      previewUrlsRef.current.delete(String((pf as any).thumbUrl));
                    }
                  });
                  // create preview for images
                  const list = (fileList || []).slice(-1);
                  list.forEach((f) => {
                    if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
                      const url = URL.createObjectURL(f.originFileObj as Blob);
                      f.thumbUrl = url;
                      previewUrlsRef.current.add(url);
                    }
                  });
                  setProofList(list as UploadFile[]);
                  setProofFile((list[0] && (list[0].originFileObj as File)) || null);
                }}
                listType="picture-card"
                showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
                maxCount={1}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UploadOutlined /> <span style={{ fontWeight: 600 }}>Select Proof</span>
                </div>
              </AntUpload>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography component="label" sx={{ display: 'block', fontWeight: 600, mb: 1 }}>
                {renderLabelWithTooltip('Government-issued ID', 'Upload a government-issued ID such as passport, driver\'s license, or national ID.')}
              </Typography>
              <AntUpload
                accept="image/*,application/pdf"
                fileList={govIdList}
                beforeUpload={(file) => false}
                onChange={({ fileList }) => {
                  // revoke existing preview
                  govIdList.forEach((gf) => {
                    if (gf && (gf as any).thumbUrl) {
                      try { URL.revokeObjectURL(String((gf as any).thumbUrl)); } catch (e) {}
                      previewUrlsRef.current.delete(String((gf as any).thumbUrl));
                    }
                  });
                  const list = (fileList || []).slice(-1);
                  list.forEach((f) => {
                    if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
                      const url = URL.createObjectURL(f.originFileObj as Blob);
                      f.thumbUrl = url;
                      previewUrlsRef.current.add(url);
                    }
                  });
                  setGovIdList(list as UploadFile[]);
                  setGovIdFile((list[0] && (list[0].originFileObj as File)) || null);
                }}
                listType="picture-card"
                showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
                maxCount={1}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UploadOutlined /> <span style={{ fontWeight: 600 }}>Select ID</span>
                </div>
              </AntUpload>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography component="label" sx={{ display: 'block', fontWeight: 600, mb: 1 }}>
                {renderLabelWithTooltip('Selfie with Government-issued ID', 'Take a clear photo of yourself holding your government ID next to your face.')}
              </Typography>
              <AntUpload
                accept="image/*"
                fileList={selfieList}
                beforeUpload={(file) => false}
                onChange={({ fileList }) => {
                  // revoke existing preview
                  selfieList.forEach((sf) => {
                    if (sf && (sf as any).thumbUrl) {
                      try { URL.revokeObjectURL(String((sf as any).thumbUrl)); } catch (e) {}
                      previewUrlsRef.current.delete(String((sf as any).thumbUrl));
                    }
                  });
                  const list = (fileList || []).slice(-1);
                  list.forEach((f) => {
                    if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
                      const url = URL.createObjectURL(f.originFileObj as Blob);
                      f.thumbUrl = url;
                      previewUrlsRef.current.add(url);
                    }
                  });
                  setSelfieList(list as UploadFile[]);
                  setSelfieFile((list[0] && (list[0].originFileObj as File)) || null);
                }}
                listType="picture-card"
                showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
                maxCount={1}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UploadOutlined /> <span style={{ fontWeight: 600 }}>Select Selfie with ID</span>
                </div>
              </AntUpload>
            </Box>
            {uploading && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 14, mb: 1 }}>Uploading verification documents</Typography>
                <AntProgress percent={uploadProgress} />
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>{uploadStatus}</Typography>
              </Box>
            )}
            {/* Keep Barangay ID out of the visible form but include it as a hidden field so it's submitted */}
            <input type="hidden" name="barangayID" value={formik.values.barangayID} />

            {/* Role is fixed to resident during public registration (hidden) */}
            <input type="hidden" name="role" value="resident" />
              {/* admin/staff registration is not available through this public form */}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{
                mt: 3, mb: 2, borderRadius: 3, fontWeight: 700, fontSize: '1.1rem',
                background: 'linear-gradient(90deg, #e81cff 0%, #40c9ff 100%)',
                color: '#fff',
                boxShadow: '0 2px 8px #e81cff44',
                transition: 'background 0.3s',
                '&:hover': {
                  background: 'linear-gradient(90deg, #40c9ff 0%, #e81cff 100%)',
                },
              }}
              disabled={formik.isSubmitting}
            >
              Register
            </Button>
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {/* Show field-specific errors in a list if present and not already shown in helperText */}
            {Object.keys(fieldErrors).length > 0 && !error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {Object.entries(fieldErrors).map(([field, msg]) => (
                  <div key={field}>{msg}</div>
                ))}
              </Alert>
            )}
            {/* Optionally, show a message or unlock admin features if adminUnlocked is true */}
            {adminUnlocked && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Admin access is now unlocked! Redirecting to admin dashboard...
              </Alert>
            )}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Link component={RouterLink} to="/login" variant="body2" sx={{ color: '#e81cff', fontWeight: 600 }}>
                Already have an account? <span style={{ textDecoration: 'underline' }}>Sign In</span>
              </Link>
            </Box>
          </form>
        </Paper>
      </Container>
    </Box>
  );
};

export default RegisterForm;
