import React from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { TextField, Button, Box, Link, Paper, Container, InputAdornment, Alert, Typography, Checkbox, FormControlLabel } from '@mui/material';
import { Upload as AntUpload, Progress as AntProgress, message as antdMessage, Button as AntButton, Tooltip, Steps, Tabs, Input } from 'antd';
import { Modal, Typography as AntTypography } from 'antd';
import { UploadOutlined, InfoCircleOutlined, CloseOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import type { AxiosProgressEvent } from 'axios';
import { Email, Lock, Home, Phone, Person, Visibility, VisibilityOff, LocationOn, Close } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { axiosInstance } from '../services/api';

// Server requires: min 6 chars, at least one number, one uppercase letter, and one special character
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// Name regex: letters, spaces, apostrophe, hyphen only
const NAME_REGEX = /^[A-Za-z\s'-]+$/;

// Philippine cellphone format: must start with 09, exactly 11 digits
const PHILIPPINE_CONTACT_REGEX = /^09\d{9}$/;

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
  contactNumber: Yup.string()
    .matches(PHILIPPINE_CONTACT_REGEX, 'Contact number must be Philippine format: 09XXXXXXXXX (starts with 09, 11 digits total)')
    .required('Contact Number is required'),
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
        urls.forEach((u: string) => {
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
  // Terms & Policy modal and acceptance state
  const [termsChecked, setTermsChecked] = React.useState(false);
  const [showTermsModal, setShowTermsModal] = React.useState(false);

  // Helper to generate a random unique Barangay ID
  function generateBarangayID() {
    // New format: brgyparian-<YEAR>-<6 chars alphanumeric mixed case>
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let rand = '';
    for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
    return `brgyparian-${year}-${rand}`;
  }

  // Google Maps modal state
  const [showMapsModal, setShowMapsModal] = React.useState(false);
  const [mapsSearchAddress, setMapsSearchAddress] = React.useState('Barangay Parian, Cebu, Philippines');
  const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [pinnedLocation, setPinnedLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [addressSuggestions, setAddressSuggestions] = React.useState<Array<{ address: string; lat: number; lng: number }>>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const suggestionsTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Get user's current location when maps modal opens
  React.useEffect(() => {
    if (showMapsModal && !userLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          setPinnedLocation({ lat: latitude, lng: longitude });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          // Default to Barangay Parian if geolocation fails
        }
      );
    }
  }, [showMapsModal, userLocation]);

  // Handle map pin placement - reverse geocode coordinates to address
  const handleMapPin = React.useCallback(async (lat: number, lng: number) => {
    setPinnedLocation({ lat, lng });
    // Use reverse geocoding to get address from coordinates
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      if (data.address) {
        const addressParts = [
          data.address.house_number,
          data.address.road,
          data.address.village || data.address.town,
          data.address.city,
          data.address.province,
          data.address.postcode,
        ].filter(Boolean);
        const fullAddress = addressParts.join(', ');
        setMapsSearchAddress(fullAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      // Fallback to coordinates if reverse geocoding fails
      setMapsSearchAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  }, []);

  // Fetch address suggestions based on search input
  const fetchAddressSuggestions = React.useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.toLowerCase())}&limit=8`
      );
      const data = await response.json();
      const suggestions = data.map((item: any) => ({
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
      setAddressSuggestions(suggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.warn('Address suggestions fetch failed:', error);
      setAddressSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  // Handle address input change with debounced suggestions
  const handleAddressInputChange = React.useCallback((value: string) => {
    setMapsSearchAddress(value);
    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
    suggestionsTimerRef.current = setTimeout(() => {
      fetchAddressSuggestions(value);
    }, 500);
  }, [fetchAddressSuggestions]);

  // Handle selecting a suggestion
  const handleSelectSuggestion = React.useCallback((suggestion: { address: string; lat: number; lng: number }) => {
    setMapsSearchAddress(suggestion.address);
    setPinnedLocation({ lat: suggestion.lat, lng: suggestion.lng });
    setShowSuggestions(false);
    setAddressSuggestions([]);
  }, []);

  const formik = useFormik({
    initialValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      nameExtension: '',
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
      nameExtension: Yup.string().matches(/^[A-Za-z0-9.\s'-]*$/, 'Extension may only contain letters, numbers, dots, spaces, hyphens, and apostrophes').notRequired(),
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
        const fullName = [values.firstName, values.middleName, values.lastName, values.nameExtension].filter(Boolean).join(' ');

        setProcessPercent(40);
        setProcessMessage('Saving account...');
        const resp = await axiosInstance.post('/auth/register', {
          fullName,
          firstName: values.firstName,
          middleName: values.middleName,
          lastName: values.lastName,
          nameExtension: values.nameExtension,
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
              // include per-file types so server can persist structured metadata and avoid index-only mapping
              if (proofFile) formData.append('fileTypes', 'proof');
              if (govIdFile) formData.append('fileTypes', 'govid');
              if (selfieFile) formData.append('fileTypes', 'selfie');
              // include barangayID so server-side metadata/request can record it (server prefers authenticated user value)
              if (values.barangayID) formData.append('barangayID', values.barangayID);
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
  const [emailFormatValid, setEmailFormatValid] = React.useState<boolean | null>(null);
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
    
    // Check email format first
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const isValidFormat = emailRegex.test(email);
    setEmailFormatValid(email ? isValidFormat : null);
    
    if (!email || !isValidFormat) {
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
    // Only check availability once a full 11-digit contact number is entered
    if (!contact || contact.length < 11) {
      setCheckingContact(false);
      return;
    }
    setCheckingContact(true);
    contactTimerRef.current = setTimeout(async () => {
      try {
        const resp = await axiosInstance.get('/auth/check-contact', { params: { contact } });
        const avail = Boolean(resp?.data?.available);
        setContactAvailable(avail);
        // reflect availability into Formik so the field shows validation immediately
        if (avail) {
          formik.setFieldError('contactNumber', '');
        } else {
          formik.setFieldError('contactNumber', 'Contact number already registered');
          // mark touched so MUI/validation UI displays consistently
          formik.setFieldTouched('contactNumber', true, false);
        }
      } catch (err) {
        setContactAvailable(null);
        // on network error, clear the Formik contact error we may have set
        formik.setFieldError('contactNumber', '');
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
  const capitalizeFirst = (v: string) => {
    if (!v) return v;
    return v.charAt(0).toUpperCase() + v.slice(1);
  };
  const sanitizeName = (v: string) => {
    const cleaned = v.replace(/[^A-Za-z\s'-]/g, '');
    return capitalizeFirst(cleaned);
  };
  // keep digits only, enforce Philippine format (must start with 09), limit to 11 characters
  const sanitizeContact = (v: string) => {
    const digitsOnly = v.replace(/\D/g, '');
    // If empty or starts with 9, prepend 0 (user likely omitted leading 0)
    if (!digitsOnly) return '';
    if (digitsOnly.length > 0 && digitsOnly[0] === '9' && digitsOnly.length <= 10) {
      return ('0' + digitsOnly).slice(0, 11);
    }
    // Otherwise just take first 11 digits
    return digitsOnly.slice(0, 11);
  };
  
  // Format contact number for display (09XX-XXXX-XXX)
  const formatContactDisplay = (num: string): string => {
    if (!num) return '';
    const digits = num.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return num;
  };
  const sanitizeAddress = (v: string) => capitalizeFirst(v);
  // Open Google Maps modal to let user find their address
  const handleOpenGoogleMaps = () => {
    setShowMapsModal(true);
  };

  // Handle address selection from Google Maps modal
  const handleSelectAddressFromMaps = (address: string) => {
    formik.setFieldValue('address', sanitizeAddress(address));
    setShowMapsModal(false);
    antdMessage.success('Address added to Permanent Address field');
  };

  // Ensure all three verification files are selected before allowing registration
  const allFilesSelected = Boolean(proofFile && govIdFile && selfieFile);

  // Combined enable flag for Register button: requires files and terms accepted
  const canRegister = allFilesSelected && termsChecked;


  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      py: 6,
    }}>
      <Container maxWidth="sm">
        <Paper elevation={8} sx={{
          borderRadius: 4,
          p: 5,
          background: '#ffffff',
          boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
          border: '1px solid rgba(102,126,234,0.1)',
        }}>
          {/* Google Maps Location Picker Modal */}
          <Modal
            title="📍 Find Your Address"
            centered
            visible={showMapsModal}
            onCancel={() => setShowMapsModal(false)}
            width={Math.min(900, window.innerWidth - 32)}
            bodyStyle={{ padding: '16px', height: 'auto', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
            footer={(
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <AntButton onClick={() => setShowMapsModal(false)}>Cancel</AntButton>
                <AntButton 
                  type="primary" 
                  onClick={() => handleSelectAddressFromMaps(mapsSearchAddress)}
                  disabled={!mapsSearchAddress}
                >
                  Use This Address
                </AntButton>
              </div>
            )}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1.5 }}>
              {/* Search/Address Input with Autocomplete */}
              <Box sx={{ position: 'relative', zIndex: 5 }}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600, color: '#0f172a', fontSize: { xs: 12, sm: 14 } }}>
                  Selected Address:
                </Typography>
                <Input
                  placeholder="Type address or click on map to place a pin"
                  value={mapsSearchAddress}
                  onChange={(e) => handleAddressInputChange(e.target.value)}
                  onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                  size="large"
                  prefix={<LocationOn style={{ color: '#764ba2' }} />}
                  style={{ fontSize: 14 }}
                />
                
                {/* Address Suggestions Dropdown */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <Box sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 10,
                    maxHeight: 250,
                    overflowY: 'auto',
                  }}>
                    {addressSuggestions.map((suggestion, idx) => (
                      <Box
                        key={idx}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        sx={{
                          padding: '10px 12px',
                          borderBottom: idx < addressSuggestions.length - 1 ? '1px solid #f0f2f5' : 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          '&:hover': {
                            background: '#f8fafc',
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 500, fontSize: 13 }}>
                          {suggestion.address.split(',').slice(0, 3).join(',').trim()}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 11 }}>
                          {suggestion.address.split(',').slice(3).join(',').trim()}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                
                {loadingSuggestions && (
                  <Box sx={{ mt: 1, padding: '8px 12px', color: '#64748b', fontSize: 12 }}>
                    Loading suggestions...
                  </Box>
                )}
              </Box>

              {/* Pin My Location Button */}
              <Box sx={{ display: 'flex', gap: 1, zIndex: 4 }}>
                <AntButton 
                  type="primary" 
                  onClick={() => {
                    if (userLocation) {
                      handleMapPin(userLocation.lat, userLocation.lng);
                    } else {
                      antdMessage.warning('Please enable geolocation or manually enter an address');
                    }
                  }}
                  style={{ flex: 1 }}
                  icon={<LocationOn style={{ fontSize: 16 }} />}
                >
                  Pin My Location
                </AntButton>
              </Box>

              {/* Google Maps Embed (Desktop) or Redirect Button (Mobile) */}
              <Box sx={{ height: { xs: 300, md: 400 }, overflow: 'hidden', borderRadius: 2, border: '1px solid #e2e8f0', position: 'relative', display: { xs: 'none', md: 'block' }, zIndex: 1 }}>
                <iframe
                  key={pinnedLocation ? `${pinnedLocation.lat}-${pinnedLocation.lng}` : 'default'}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0, borderRadius: 8 }}
                  src={
                    userLocation
                      ? `https://maps.google.com/maps?q=${userLocation.lat},${userLocation.lng}&output=embed&z=15`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(mapsSearchAddress)}&output=embed`
                  }
                  allowFullScreen={true}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {/* Overlay hint */}
                <Box sx={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  padding: '8px 12px',
                  borderRadius: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}>
                  📌 Search location or edit address manually
                </Box>
              </Box>

              {/* Google Maps Redirect Button (Mobile) */}
              <Box sx={{ flex: 1, display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.5, justifyContent: 'center', alignItems: 'center', p: 2, background: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', minHeight: 250, zIndex: 1 }}>
                <Typography variant="body2" sx={{ color: '#64748b', textAlign: 'center', fontWeight: 500, fontSize: { xs: 13, sm: 14 } }}>
                  Open Google Maps to find and verify your location
                </Typography>
                <AntButton 
                  type="primary" 
                  size="large"
                  onClick={() => {
                    const mapsUrl = mapsSearchAddress
                      ? `https://www.google.com/maps/search/${encodeURIComponent(mapsSearchAddress)}`
                      : userLocation
                      ? `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}&z=15`
                      : 'https://www.google.com/maps';
                    window.open(mapsUrl, '_blank');
                  }}
                  style={{ width: '100%' }}
                  icon={<LocationOn style={{ fontSize: 18 }} />}
                >
                  Open Google Maps
                </AntButton>
                <Typography variant="caption" sx={{ color: '#94a3b8', textAlign: 'center', fontSize: { xs: 11, sm: 12 } }}>
                  Find your location on Google Maps, then copy the address and paste it above
                </Typography>
              </Box>

              {/* Instructions */}
              <Box sx={{ p: 1.5, background: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', zIndex: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5, fontWeight: 600, fontSize: { xs: 11, sm: 12 } }}>
                  💡 <strong>How to use:</strong>
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', ml: 1.5, fontSize: { xs: 10, sm: 12 } }}>
                  1. Type an address to see suggestions or select one from the list
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', ml: 1.5, fontSize: { xs: 10, sm: 12 } }}>
                  2. Click "Pin My Location" to automatically pin your current location
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', ml: 1.5, fontSize: { xs: 10, sm: 12 } }}>
                  3. Edit the address text field to refine or search again
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', ml: 1.5, fontSize: { xs: 10, sm: 12 } }}>
                  4. Click "Use This Address" to save the selected location to your profile
                </Typography>
              </Box>
            </Box>
          </Modal>

          {/* Header Section */}
          <Box sx={{ textAlign: 'center', mb: 4, pb: 3, borderBottom: '2px solid #f0f2f5' }}>
            <AntTypography.Title level={2} style={{ 
              margin: '0 0 8px 0', 
              fontWeight: 800, 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent',
            }}>
              Resident Registration
            </AntTypography.Title>
            <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
              Barangay Parian Information System
            </Typography>
          </Box>

          {/* Progress Indicator */}
          <Box sx={{ mb: 4, p: 3, background: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0' }}>
            <Steps current={currentStep} size="small" style={{ marginBottom: 12 }}>
              <Steps.Step title="Account" />
              <Steps.Step title="Personal" />
              <Steps.Step title="Verification" />
            </Steps>
            <Box sx={{ mt: 2 }}>
              <AntProgress 
                percent={percentComplete} 
                showInfo={false}
                strokeColor={{ '0%': '#667eea', '100%': '#764ba2' }} 
                status={percentComplete === 100 ? 'success' : 'active'}
              />
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
              {percentComplete}% complete
            </Typography>
          </Box>
          <form onSubmit={formik.handleSubmit}>
            {/* Processing overlay shown while submission steps run */}
            {processActive && (
              <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                <div style={{ width: 400, padding: 28, borderRadius: 12, background: '#fff', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: '#0f172a' }}>Processing Your Registration</Typography>
                  <Typography variant="body2" sx={{ mb: 3, color: '#64748b' }}>{processMessage}</Typography>
                  <AntProgress percent={processPercent} status={processPercent < 100 ? 'active' : 'success'} strokeColor={{ '0%': '#667eea', '100%': '#764ba2' }} />
                </div>
              </div>
            )}

            {/* Account Information Section */}
            <Box sx={{ mb: 4, p: 3, background: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0', borderTop: '4px solid #667eea' }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                <span style={{ width: 24, height: 24, background: '#667eea', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>1</span>
                Account Information
              </Typography>
              
            <Tooltip title="Your given name (e.g., John, Maria). Will auto-capitalize." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="First Name"
                name="firstName"
                value={formik.values.firstName}
                onChange={(e) => { formik.setFieldValue('firstName', sanitizeName(e.target.value)); }}
                error={formik.touched.firstName && Boolean(formik.errors.firstName)}
                helperText={formik.touched.firstName && formik.errors.firstName}
                variant="outlined"
                sx={{ 
                  '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                  '& .MuiInputBase-input': { padding: '12px 14px' },
                  mb: 2
                }}
              />
            </Tooltip>
            <Tooltip title="Your mother's maiden name or middle name (e.g., Santos, Cruz). Optional." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="Middle Name (Optional)"
                name="middleName"
                value={formik.values.middleName}
                onChange={(e) => { formik.setFieldValue('middleName', sanitizeName(e.target.value)); }}
                error={formik.touched.middleName && Boolean(formik.errors.middleName)}
                helperText={formik.touched.middleName && formik.errors.middleName}
                variant="outlined"
                sx={{ 
                  '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                  '& .MuiInputBase-input': { padding: '12px 14px' },
                  mb: 2
                }}
              />
            </Tooltip>
            <Tooltip title="Your family name (e.g., Habacon, Perez). Will auto-capitalize." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="Last Name"
                name="lastName"
                value={formik.values.lastName}
                onChange={(e) => { formik.setFieldValue('lastName', sanitizeName(e.target.value)); }}
                error={formik.touched.lastName && Boolean(formik.errors.lastName)}
                helperText={formik.touched.lastName && formik.errors.lastName}
                required
                variant="outlined"
                sx={{ 
                  '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                  '& .MuiInputBase-input': { padding: '12px 14px' },
                  mb: 2
                }}
              />
            </Tooltip>
            <Tooltip title="Name suffix if applicable (e.g., Jr., Sr., III, II). Optional." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="Name Extension (Optional)"
                placeholder="e.g., Jr., Sr., III, II"
                name="nameExtension"
                value={formik.values.nameExtension}
                onChange={(e) => { formik.setFieldValue('nameExtension', e.target.value.slice(0, 20)); }}
                error={formik.touched.nameExtension && Boolean(formik.errors.nameExtension)}
                helperText={formik.touched.nameExtension && formik.errors.nameExtension}
                variant="outlined"
                sx={{ 
                  '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                  '& .MuiInputBase-input': { padding: '12px 14px' },
                  mb: 2
                }}
              />
            </Tooltip>
            <Tooltip title="4-20 characters, letters & numbers only (e.g., john2025). Must be unique." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="Username"
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
                  (checkingUsername ? 'Checking availability...' : usernameAvailable === false ? 'Username already taken' : usernameAvailable === true ? '✓ Available' : '')
                }
                required
                variant="outlined"
                sx={{ 
                  '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                  '& .MuiInputBase-input': { padding: '12px 14px' },
                  mb: 2
                }}
              />
            </Tooltip>
            <Tooltip title="Valid email format: user@domain.com (e.g., john@example.com). Must be unique." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="Email Address"
                name="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                error={
                  (formik.touched.email && Boolean(formik.errors.email)) ||
                  Boolean(fieldErrors.email) ||
                  emailFormatValid === false ||
                  emailAvailable === false
                }
                helperText={
                  (formik.touched.email && formik.errors.email) ||
                  fieldErrors.email ||
                  (emailFormatValid === false ? '❌ Invalid email format' : 
                   checkingEmail ? 'Checking email...' : 
                   emailAvailable === false ? 'Email already registered' : 
                   emailAvailable === true ? '✓ Email available' : 
                   emailFormatValid === true ? '✓ Valid email format' : '')
                }
                required
                variant="outlined"
                sx={{ 
                  '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                '& .MuiInputBase-input': { padding: '12px 14px' },
                mb: 2
              }}
            />
            </Tooltip>
            <Tooltip title="Min 6 characters: 1 uppercase, 1 number, 1 special char (!@#$%^&*)." placement="top">
              <TextField
                fullWidth
                margin="normal"
                label="Password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formik.values.password}
                onChange={formik.handleChange}
                error={formik.touched.password && Boolean(formik.errors.password)}
                helperText={formik.touched.password && formik.errors.password}
                required
                variant="outlined"
                InputProps={{
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
              sx={{ 
                '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                '& .MuiInputBase-input': { padding: '12px 14px' },
                mb: 2
              }}
            />
            {(() => {
              const { percent, label } = getPasswordStrength(String(formik.values.password || ''));
              return (
                <Box sx={{ mb: 2 }}>
                  <AntProgress 
                    percent={percent} 
                    showInfo={false} 
                    strokeColor={percent < 34 ? '#ff4d4f' : percent < 67 ? '#faad14' : '#52c41a'} 
                  />
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#64748b', fontWeight: 600 }}>{label}</Typography>
                </Box>
              );
            })()}
            </Tooltip>
            <Tooltip title="Re-enter password to confirm match." placement="top">
              <TextField
                fullWidth
                margin="normal"
              label="Confirm Password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              error={formik.touched.confirmPassword && Boolean(formik.errors.confirmPassword)}
              helperText={formik.touched.confirmPassword && formik.errors.confirmPassword}
              variant="outlined"
              InputProps={{
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
              sx={{ 
                '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                '& .MuiInputBase-input': { padding: '12px 14px' },
              }}
            />
            </Tooltip>
            </Box>

            {/* Personal Information Section */}
            <Box sx={{ mb: 4, p: 3, background: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0', borderTop: '4px solid #764ba2' }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                <span style={{ width: 24, height: 24, background: '#764ba2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>2</span>
                Personal Information
              </Typography>
              
            <Tooltip title="Your residential address (e.g., 123 Main St, Barangay Parian). Will auto-capitalize." placement="top">
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  fullWidth
                  margin="normal"
                  label="Permanent Address"
                  name="address"
                  value={formik.values.address}
                  onChange={(e) => { formik.setFieldValue('address', sanitizeAddress(e.target.value)); }}
                  error={formik.touched.address && Boolean(formik.errors.address)}
                  helperText={formik.touched.address && formik.errors.address}
                  variant="outlined"
                  multiline
                  rows={2}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                    '& .MuiInputBase-input': { padding: '12px 14px' },
                  }}
                />
                <Tooltip title="Open Google Maps to find your location" placement="top">
                  <Button
                    variant="outlined"
                    onClick={handleOpenGoogleMaps}
                    sx={{
                      flexShrink: 0,
                      minWidth: 56,
                      width: 56,
                      height: 56,
                      p: 0,
                      borderRadius: 2,
                      borderColor: '#764ba2',
                      color: '#764ba2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': {
                        borderColor: '#667eea',
                        color: '#667eea',
                        background: 'rgba(102,126,234,0.05)',
                      },
                    }}
                  >
                    <LocationOn sx={{ fontSize: 24 }} />
                  </Button>
                </Tooltip>
              </Box>
            </Tooltip>
            <Box sx={{ mb: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Tooltip title="Philippine cellphone format: 09XX-XXXX-XXX (starts with 09, 11 digits total). Examples: Globe 0917, Smart 0910, Sun 0922. Must be unique." placement="top">
                <TextField
                  fullWidth
                  margin="normal"
                  label="Contact Number"
                  name="contactNumber"
                  placeholder="e.g., 09171234567"
                  value={formik.values.contactNumber}
                  onChange={(e) => { formik.setFieldValue('contactNumber', sanitizeContact(e.target.value)); }}
                  error={
                    (formik.touched.contactNumber && Boolean(formik.errors.contactNumber)) ||
                    Boolean(fieldErrors.contactNumber) ||
                    (formik.touched.contactNumber && contactAvailable === false)
                  }
                  helperText={
                    (formik.touched.contactNumber && formik.errors.contactNumber) ||
                    fieldErrors.contactNumber ||
                    (checkingContact ? 'Checking contact...' : contactAvailable === false ? 'Already registered' : contactAvailable === true ? '✓ Available' : '')
                  }
                  inputProps={{ inputMode: 'numeric', maxLength: 11 }}
                  required
                  variant="outlined"
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#ffffff', fontSize: 14 },
                    '& .MuiInputBase-input': { padding: '12px 14px' },
                  }}
                />
              </Tooltip>
              {formik.values.contactNumber && formik.values.contactNumber.length === 11 && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#667eea', fontWeight: 600, fontSize: 12 }}>
                  ✓ Format: {formatContactDisplay(formik.values.contactNumber)}
                </Typography>
              )}
              {!formik.values.contactNumber && !checkingContact && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#94a3b8', fontSize: 12 }}>
                  Format: 09XXXXXXXXX (11 digits)
                </Typography>
              )}
            </Box>
            </Box>

            {/* Verification Section */}
            <Box sx={{ mb: 4, p: 3, background: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0', borderTop: '4px solid #f59e0b' }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                <span style={{ width: 24, height: 24, background: '#f59e0b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>3</span>
                Verification Documents
              </Typography>
              <Typography variant="body2" sx={{ mb: 2, color: '#64748b' }}>
                Upload required documents to verify your residency
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 600, mb: 1, color: '#0f172a', fontSize: 14 }}>Proof of Residency</Typography>
                <AntUpload
                  accept="image/*,application/pdf"
                  fileList={proofList}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => {
                    proofList.forEach((pf: UploadFile) => {
                      if (pf && (pf as any).thumbUrl) {
                        try { URL.revokeObjectURL(String((pf as any).thumbUrl)); } catch (e) {}
                      }
                    });
                    const list = (fileList || []).slice(-1);
                    list.forEach((f: UploadFile) => {
                      if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
                        const url = URL.createObjectURL(f.originFileObj as Blob);
                        f.thumbUrl = url;
                      }
                    });
                    setProofList(list as UploadFile[]);
                    setProofFile((list[0] && (list[0].originFileObj as File)) || null);
                  }}
                  listType="picture-card"
                  maxCount={1}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UploadOutlined /> <span style={{ fontWeight: 600 }}>Select File</span>
                  </div>
                </AntUpload>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 600, mb: 1, color: '#0f172a', fontSize: 14 }}>Government-issued ID</Typography>
                <AntUpload
                  accept="image/*,application/pdf"
                  fileList={govIdList}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => {
                    govIdList.forEach((gf: UploadFile) => {
                      if (gf && (gf as any).thumbUrl) {
                        try { URL.revokeObjectURL(String((gf as any).thumbUrl)); } catch (e) {}
                      }
                    });
                    const list = (fileList || []).slice(-1);
                    list.forEach((f: UploadFile) => {
                      if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
                        const url = URL.createObjectURL(f.originFileObj as Blob);
                        f.thumbUrl = url;
                      }
                    });
                    setGovIdList(list as UploadFile[]);
                    setGovIdFile((list[0] && (list[0].originFileObj as File)) || null);
                  }}
                  listType="picture-card"
                  maxCount={1}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UploadOutlined /> <span style={{ fontWeight: 600 }}>Select File</span>
                  </div>
                </AntUpload>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 600, mb: 1, color: '#0f172a', fontSize: 14 }}>Selfie with Government ID</Typography>
                <AntUpload
                  accept="image/*"
                  fileList={selfieList}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => {
                    selfieList.forEach((sf: UploadFile) => {
                      if (sf && (sf as any).thumbUrl) {
                        try { URL.revokeObjectURL(String((sf as any).thumbUrl)); } catch (e) {}
                      }
                    });
                    const list = (fileList || []).slice(-1);
                    list.forEach((f: UploadFile) => {
                      if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
                        const url = URL.createObjectURL(f.originFileObj as Blob);
                        f.thumbUrl = url;
                      }
                    });
                    setSelfieList(list as UploadFile[]);
                    setSelfieFile((list[0] && (list[0].originFileObj as File)) || null);
                  }}
                  listType="picture-card"
                  maxCount={1}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UploadOutlined /> <span style={{ fontWeight: 600 }}>Select File</span>
                  </div>
                </AntUpload>
              </Box>
            </Box>

            {/* Terms & Policy checkbox and modal trigger (moved below Selfie upload) */}
            <Box sx={{ mt: 2, mb: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={termsChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked) {
                        setShowTermsModal(true);
                      } else {
                        setTermsChecked(false);
                      }
                    }}
                    name="terms"
                    color="primary"
                    inputProps={{ 'aria-label': 'Accept terms and policy' }}
                  />
                }
                label={<span>I agree to the <a href="#" onClick={(ev) => { ev.preventDefault(); setShowTermsModal(true); }}>Terms & Policy</a></span>}
              />
            </Box>

            {/* Terms & Policy Modal (Ant Design) */}
            <Modal
              title={<span style={{ fontWeight: 700 }}>Parian Residency Verification — Terms & Policy</span>}
              centered
              visible={showTermsModal}
              onCancel={() => setShowTermsModal(false)}
              footer={(
                <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, width: '100%' }}>
                  <AntButton key="cancel" onClick={() => { setShowTermsModal(false); }}>
                    Cancel
                  </AntButton>
                  <AntButton key="accept" type="primary" onClick={() => { setTermsChecked(true); setShowTermsModal(false); antdMessage.success('Terms accepted'); }}>
                    Accept
                  </AntButton>
                </div>
              )}
              width={Math.min(920, window.innerWidth - 48)}
              bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
            >
              <Tabs defaultActiveKey="1" type="card">
                <Tabs.TabPane tab={"📘 TERMS OF SERVICE (TOS)"} key="1">
                  <AntTypography>
                    <AntTypography.Title level={4}>Barangay Information Management System (BIMS)</AntTypography.Title>

                    <AntTypography.Title level={5}>1. Acceptance of Terms</AntTypography.Title>
                    <AntTypography.Paragraph>
                      By accessing or using the BIMS Web Application (the “System”), you agree to comply with and be bound by these Terms of Service. If you do not agree, you must discontinue use of the System immediately.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>2. Purpose of the System</AntTypography.Title>
                    <AntTypography.Paragraph>
                      The System is an official digital platform used for managing: resident information, announcements and public notices, inquiries and requests, processing of templates and official documents, and administrative records of the Barangay. The System is intended for legitimate and authorized use only.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>3. User Eligibility</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Users must be authorized barangay staff with valid credentials, or registered residents using the system for official transactions. Any unauthorized access is strictly prohibited.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>4. User Responsibilities</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Users agree to provide accurate and truthful information, keep login credentials secure, use the System only for lawful and official purposes, and immediately report suspicious or unauthorized activity. Users must not attempt to bypass security controls, upload malicious files, access information beyond their role, or misuse system data.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>5. Data Accuracy and Submission</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Users are responsible for ensuring that any data they submit — including inquiries, requests, and personal information — is accurate and complete.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>6. System Availability</AntTypography.Title>
                    <AntTypography.Paragraph>
                      The Barangay reserves the right to modify, suspend, or terminate system access at any time for updates, security, or administrative purposes.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>7. Intellectual Property</AntTypography.Title>
                    <AntTypography.Paragraph>
                      All content, system design, database structures, and digital materials are owned by the Barangay. Copying or redistributing without authorization is prohibited.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>8. Limitation of Liability</AntTypography.Title>
                    <AntTypography.Paragraph>
                      The Barangay shall not be liable for downtime or service interruptions, loss of data due to technical issues beyond reasonable control, or unauthorized access resulting from user negligence.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>9. Termination of Access</AntTypography.Title>
                    <AntTypography.Paragraph>
                      The Barangay may suspend or terminate user accounts for violations of this TOS, misuse of system data, security threats, or administrative decisions.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>10. Changes to Terms</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Updates to these Terms may be made at any time. Continued use of the System signifies acceptance of the updated Terms.
                    </AntTypography.Paragraph>
                  </AntTypography>
                </Tabs.TabPane>

                <Tabs.TabPane tab={"📘 PRIVACY POLICY"} key="2">
                  <AntTypography>
                    <AntTypography.Title level={4}>Barangay Information Management System (BIMS)</AntTypography.Title>
                    <AntTypography.Paragraph><em>Compliant with RA 10173 – Data Privacy Act of 2012</em></AntTypography.Paragraph>

                    <AntTypography.Title level={5}>1. Purpose</AntTypography.Title>
                    <AntTypography.Paragraph>
                      This Privacy Policy explains how the System collects, uses, stores, and protects personal information of residents and staff.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>2. Information We Collect</AntTypography.Title>
                    <AntTypography.Paragraph>
                      We may collect personal data depending on your role and transaction. For residents: full name, address, contact information, age, gender, civil status, government-issued ID details, document request information, submitted forms and inquiries. For staff/admins: login credentials, user activity logs, role- and task-related information. Automatically collected data includes IP address, browser/device details, date and time of access, and system usage logs.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>3. Legal Basis for Processing</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Data is collected and processed under RA 10173 – Data Privacy Act of 2012, legitimate interests of the Barangay, performance of official public functions, and consent of the data subject (when required).
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>4. How We Use Your Information</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Personal data is used for processing resident documents and requests, keeping official barangay records, sending announcements and updates, responding to inquiries, authenticating users, and maintaining system security and audit logs.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>5. Data Sharing and Disclosure</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Data may only be shared with authorized barangay personnel, national or local agencies when legally required, law enforcement under lawful orders, and third-party service providers (e.g., cloud hosting) with Data Sharing Agreements. We never sell or share data for marketing or commercial purposes.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>6. Data Storage and Retention</AntTypography.Title>
                    <AntTypography.Paragraph>
                      Data is stored securely in encrypted databases and retained only for the duration required for completing transactions, performing barangay functions, and legal/audit purposes. After the retention period, data is securely deleted.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>7. Security Measures</AntTypography.Title>
                    <AntTypography.Paragraph>
                      The System uses industry-standard security protocols, including encrypted connections (HTTPS), role-based access control, activity logging, firewalls and intrusion detection, and regular security audits.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>8. Your Rights as a Data Subject (RA 10173)</AntTypography.Title>
                    <AntTypography.Paragraph>
                      You have the right to be informed, access your data, request correction or updating, object to processing, withdraw consent, file a complaint with the National Privacy Commission, and obtain a copy of your personal data.
                    </AntTypography.Paragraph>

                    <AntTypography.Title level={5}>9. Contact Information (DPO)</AntTypography.Title>
                    <AntTypography.Paragraph>
                      For privacy concerns, contact: Barangay Data Protection Officer (DPO) — [Insert Name], [Insert Email], [Insert Office Address].
                    </AntTypography.Paragraph>
                  </AntTypography>
                </Tabs.TabPane>

                <Tabs.TabPane tab={"📘 DATA PRIVACY STATEMENT"} key="3">
                  <AntTypography>
                    <AntTypography.Title level={4}>BIMS – Compliance with the Data Privacy Act of 2012</AntTypography.Title>
                    <AntTypography.Paragraph>
                      The Barangay is committed to protecting your personal information in compliance with Republic Act 10173 (Data Privacy Act of 2012) and its Implementing Rules and Regulations. All data collected through the BIMS Web Application is processed lawfully, fairly, and transparently, and used strictly for official barangay transactions.
                    </AntTypography.Paragraph>

                    <AntTypography.Paragraph>
                      By using the system, you voluntarily consent to the collection and processing of your information as described in this Privacy Policy.
                    </AntTypography.Paragraph>
                  </AntTypography>
                </Tabs.TabPane>
              </Tabs>
            </Modal>
            {uploading && (
              <Box sx={{ mb: 2 }}>
                <AntProgress percent={uploadProgress} strokeColor={{ '0%': '#667eea', '100%': '#764ba2' }} />
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#64748b', fontWeight: 600 }}>{uploadStatus}</Typography>
              </Box>
            )}

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            {/* Hidden fields */}
            <input type="hidden" name="barangayID" value={formik.values.barangayID} />
            <input type="hidden" name="role" value="resident" />

            {/* Register Button */}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{
                mt: 3,
                mb: 2,
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '1rem',
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                boxShadow: '0 4px 15px rgba(102,126,234,0.3)',
                transition: 'all 0.3s',
                '&:hover': {
                  boxShadow: '0 6px 20px rgba(102,126,234,0.4)',
                  transform: 'translateY(-2px)',
                },
                '&:disabled': {
                  background: '#cbd5e0',
                  boxShadow: 'none',
                },
              }}
              disabled={formik.isSubmitting || !canRegister}
            >
              {formik.isSubmitting ? 'Registering...' : 'Create Account'}
            </Button>

            {/* Sign In Link */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Already have an account?{' '}
                <Link component={RouterLink} to="/login" sx={{ color: '#667eea', fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                  Sign In
                </Link>
              </Typography>
            </Box>
          </form>
        </Paper>
      </Container>
    </Box>
  );
};

export default RegisterForm;
