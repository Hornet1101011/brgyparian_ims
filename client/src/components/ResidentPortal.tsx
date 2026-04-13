import React, { useEffect, useState, useRef } from 'react';
import './ResidentPortal.css';
import { useTranslation } from 'react-i18next';
import { residentPersonalInfoAPI, axiosInstance, verificationAPI } from '../services/api';
import { initNotificationSocket, onNotificationEvent, offNotificationEvent } from '../services/notificationSocket';
import { AxiosResponse } from 'axios';
import { Form, Input, Button, Select, Typography, Row, Col, Card, Space, message, Upload, Alert, Tooltip, Progress, Tabs, Badge, Tag, Descriptions, Statistic, Divider, DatePicker } from 'antd';
import { UploadOutlined, InfoCircleOutlined, SyncOutlined, EditOutlined, SaveOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, UserOutlined, TeamOutlined, SafetyOutlined, FileTextOutlined } from '@ant-design/icons';
import ResidentCreateModal from './ResidentCreateModal';
import { useAuth } from '../contexts/AuthContext';
import AvatarImage from './AvatarImage';
import dayjs from 'dayjs';

const { Text } = Typography;

// Helper function to calculate residency duration
const calculateResidencyDuration = (dateOfResidency: string) => {
  if (!dateOfResidency) return null;
  
  const residencyStart = dayjs(dateOfResidency);
  const now = dayjs();
  
  const years = now.diff(residencyStart, 'year');
  const months = now.diff(residencyStart, 'month') % 12;
  const days = now.diff(residencyStart, 'day') % 30;
  
  const parts = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  
  return parts.length > 0 ? parts.join(', ') : '0 days';
};

interface ResidentProfile {
	createdAt: any;
	_id: string;
	username: string;
	email: string;
	address: string;
	contactNumber: string;
	barangayID: string;
	role: string;
	// Optional display name provided by the user (used to derive first/last name)
	fullName?: string;
}
// Personal info fields (comprehensive resident information)
interface PersonalInfo {
	// Basic Information
	barangayID?: string;
	firstName: string;
	lastName: string;
	middleName?: string;
	nameExtension?: string;
	age?: number;
	birthDate?: string;
	dateOfResidency?: string;
	sex?: string;
	civilStatus?: string;
	facebook?: string;
	email?: string;
	contactNumber?: string;
	landlineNumber?: string;
	emergencyContact?: string;
	
	// Personal Details
	nationality?: string;
	placeOfBirth?: string;
	religion?: string;
	maritalStatus?: string;
	passportNumber?: string;
	governmentIdNumber?: string;
	bloodType?: string;
	disabilityStatus?: string;
	occupation?: string;
	educationalAttainment?: string;
	
	// Family Information
	spouseName?: string;
	spouseAge?: number;
	spouseBirthDate?: string;
	spouseMiddleName?: string;
	spouseLastName?: string;
	spouseOccupation?: string;
	spouseStatus?: string;
	spouseNationality?: string;
	spouseContactNumber?: string;
	motherName?: string;
	motherAge?: number;
	motherBirthDate?: string;
	motherOccupation?: string;
	motherStatus?: string;
	fatherName?: string;
	fatherAge?: number;
	fatherBirthDate?: string;
	fatherOccupation?: string;
	fatherStatus?: string;
	numberOfChildren?: number;
	childrenNames?: string;
	childrenAges?: string;
	emergencyContactName?: string;
	emergencyContactRelationship?: string;
	
	// Business Information
	businessName?: string;
	businessType?: string;
	natureOfBusiness?: string;
	businessAddress?: string;
	dateEstablished?: string;
	tin?: string;
	registrationNumber?: string;
	businessPermitNumber?: string;
	barangayClearanceNumber?: string;
	numberOfEmployees?: number;
	capitalInvestment?: number;
	annualGrossIncome?: number;
	businessContactPerson?: string;
	businessContactNumber?: string;
	businessEmail?: string;
}

interface DocumentRequest {
	_id: string;
	type: string;
	status: string;
	dateRequested: string;
	notes?: string;
}

export default function ResidentPortal() {
	const { setUser, isAdmin, isStaff, isResident } = useAuth();
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [residentMissing, setResidentMissing] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);

	// Verification upload state
	const [proofFile, setProofFile] = useState<File | null>(null);
	const [govIdFile, setGovIdFile] = useState<File | null>(null);
	const [selfieFile, setSelfieFile] = useState<File | null>(null);
	const [proofList, setProofList] = useState<any[]>([]);
	const [govIdList, setGovIdList] = useState<any[]>([]);
	const [selfieList, setSelfieList] = useState<any[]>([]);
	const [verificationUploading, setVerificationUploading] = useState(false);
	const [verificationProgress, setVerificationProgress] = useState<number>(0);
	const previewUrlsRef = useRef<Set<string>>(new Set());

	// Enhanced state for comprehensive profile management
	const [activeTab, setActiveTab] = useState('overview');
	const [profileCompletion, setProfileCompletion] = useState(0);
	const [saving, setSaving] = useState(false);
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

	// handle avatar upload for resident portal banner
	const handleBannerAvatarUpload = async (file: File | null) => {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = e => setAvatarPreview(e.target?.result as string);
		reader.readAsDataURL(file);
		const form = new FormData();
		form.append('avatar', file);
		try {
			const resp = await axiosInstance.post('/resident/personal-info/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
			// server returns { message, resident, user }
			const updated = resp.data?.resident;
			const returnedUser = resp.data?.user;
			if (updated) {
				// Update resident container state so the picture is saved in the resident container
				setPersonalInfo(updated);
				setPersonalForm(updated);
				if (updated.profileImage) {
					const url = updated.profileImage.startsWith('http') ? updated.profileImage : `${window.location.origin}${updated.profileImage}`;
					setAvatarPreview(url);
				}
				setResidentMissing(false);
				message.success('Profile image updated');
			} else {
				message.success('Profile image updated');
			}
			// If server returned an updated user, update AuthContext/localStorage
			if (returnedUser) {
				try {
					if (typeof setUser === 'function') setUser(returnedUser);
					else localStorage.setItem('userProfile', JSON.stringify(returnedUser));
				} catch (err) {
					// ignore
				}

				try {
					const ev = new CustomEvent('userProfileUpdated', { detail: returnedUser });
					window.dispatchEvent(ev);
				} catch (err) {
					// ignore
				}
			}
		} catch (err) {
			message.error('Failed to upload avatar');
		}
	};

	// Refresh authoritative profile from server (keeps verification status accurate)
	const refreshProfile = async () => {
		try {
			const resp = await axiosInstance.get('/resident/profile');
			if (resp && resp.data) {
				// Normalize possible response shapes: { user }, { profile }, or raw user
				const p = (resp.data && ((resp.data as any).user || (resp.data as any).profile)) ? ((resp.data as any).user || (resp.data as any).profile) : resp.data;
				setProfile(p);
				// verification status handling removed
				setForm(p);
				if (p?.profileImage) {
					const url = p.profileImage.startsWith('http') ? p.profileImage : `${window.location.origin}${p.profileImage}`;
					setAvatarPreview(url);
				}
				// Also update AuthContext user if available so verification badges across the app stay in sync
				try {
					if (typeof setUser === 'function') setUser(p);
				} catch (e) {}
				message.success('Profile synchronized');
			}
		} catch (err) {
			// silent fail - user can retry
			console.warn('Failed to refresh profile', err);
			message.error('Failed to refresh profile');
		}
	};
	// ...existing code...
	const handleRegisterResident = async () => {
		try {
			// Use form (user info) and personalForm (resident info)
			const payload = {
				barangayID: form?.barangayID || '',
				username: form?.username || '',
				...personalForm
			};
			await axiosInstance.post('/resident', payload);
			alert('Resident registered successfully!');
		} catch (error) {
			alert('Failed to register resident.');
		}
	};
	const { t } = useTranslation();
	const [profile, setProfile] = useState<ResidentProfile | null>(null);
	const [, setRequests] = useState<DocumentRequest[]>([]);
  
	const [form, setForm] = useState<ResidentProfile | null>(null);
	const [staffRequestSent, setStaffRequestSent] = useState(false);
	const [requesting, setRequesting] = useState(false);
	const [editingUser, setEditingUser] = useState(false);
	const [editingPersonal, setEditingPersonal] = useState(false);
	const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
	const [personalForm, setPersonalForm] = useState<PersonalInfo | null>(null);
	const [currentTime, setCurrentTime] = useState<string>('');

	useEffect(() => {
	// Fetch resident profile and requests
	axiosInstance.get('/resident/profile').then((res: AxiosResponse<any>) => {
		const profileData = res.data;
		setProfile(profileData);
		setForm(profileData);
		if (profileData?.profileImage) {
			const url = profileData.profileImage.startsWith('http') ? profileData.profileImage : `${window.location.origin}${profileData.profileImage}`;
			setAvatarPreview(url);
		}
		// Update verification status
		setVerificationStatus(profileData?.verified ? 'verified' : 'pending');
	});
    residentPersonalInfoAPI.getPersonalInfo()
      .then((data: any) => {
        setPersonalInfo(data);
        setPersonalForm(data);
				if (data?.profileImage) {
						const url = data.profileImage.startsWith('http') ? data.profileImage : `${window.location.origin}${data.profileImage}`;
						setAvatarPreview(url);
				}
      })
			.catch((err: any) => {
				if (err.response && err.response.status === 404) {
					// No personal info yet, show empty form and flag missing
					setResidentMissing(true);
					setPersonalInfo(null);
					setPersonalForm({
            firstName: '',
            lastName: '',
            nameExtension: '',
            age: undefined,
            birthDate: '',
            dateOfResidency: '',
            sex: '',
            civilStatus: '',
            facebook: '',
            email: '',
            contactNumber: '',
            emergencyContact: '',
            landlineNumber: '',
            spouseName: '',
            spouseAge: undefined,
            spouseBirthDate: '',
            spouseOccupation: '',
            spouseStatus: '',
            motherName: '',
            motherAge: undefined,
            motherBirthDate: '',
            motherOccupation: '',
            motherStatus: '',
            fatherName: '',
            fatherAge: undefined,
            fatherBirthDate: '',
            fatherOccupation: '',
            fatherStatus: '',
          });
        }
      });
	// Fetch resident requests but quietly ignore 401 (not authenticated) to avoid noisy console errors
	try {
		axiosInstance.get('/resident/requests')
			.then((res: AxiosResponse<any>) => setRequests(res.data))
			.catch((err) => {
				if (err && err.response && err.response.status === 401) {
					// silently ignore unauthorized for this optional endpoint
					return;
				}
				console.warn('Failed to load resident requests', err);
			});
	} catch (e) {
		// ignore
	}

	// Load current user's verification requests (if any) so we can display pending uploads
	(async () => {
		try {
			const reqs = await verificationAPI.getMyRequests();
			if (Array.isArray(reqs) && reqs.length > 0) {
				// prefer most recent pending request
				const pending = reqs.find((r: any) => r.status === 'pending') || reqs[0];
				if (pending) {
					// There's a pending verification request
					const filesMeta: any[] = pending.filesMeta || [];
					// Map files by their fileType instead of index for reliability
					const makeFileEntry = (fm: any) => {
						if (!fm || !fm.gridFileId) return null;
						const url = verificationAPI.getFileUrl(fm.gridFileId);
						return {
							uid: `remote-${fm.fileType || 'unknown'}-${fm.gridFileId}`,
							name: fm.filename || `file-${fm.fileType || 'unknown'}`,
							status: 'done',
							url,
							thumbUrl: fm.filename && /\.(png|jpe?g|gif|webp)$/i.test(fm.filename) ? url : undefined,
						};
					};
					// Find files by type
					const proofFile = filesMeta.find((fm: any) => fm.fileType === 'proof');
					const govIdFile = filesMeta.find((fm: any) => fm.fileType === 'govid');
					const selfieFile = filesMeta.find((fm: any) => fm.fileType === 'selfie');
					setProofList(proofFile ? [makeFileEntry(proofFile)].filter(Boolean) as any[] : []);
					setGovIdList(govIdFile ? [makeFileEntry(govIdFile)].filter(Boolean) as any[] : []);
					setSelfieList(selfieFile ? [makeFileEntry(selfieFile)].filter(Boolean) as any[] : []);
				}
			}
		} catch (e) {
			console.error('Failed to load verification documents:', e);
			message.error('Failed to load your verification documents. Please try refreshing the page.');
		}
	})();

	// Initialize notification/socket connection and listen for profile updates
	try {
		initNotificationSocket();
		const profileHandler = (payload: any) => {
			try {
				const raw = payload?.data || payload;
				const updated = raw && (raw.user || raw.profile) ? (raw.user || raw.profile) : raw;
				if (!updated) return;
				// Merge partial updates into existing profile
				setProfile(prev => {
					const merged = { ...(prev || {}), ...updated } as any;
					try { if (typeof setUser === 'function') setUser(merged); } catch (err) {}
					return merged;
				});
			} catch (err) {
				// ignore
			}
		};
		onNotificationEvent('profile', profileHandler);
		onNotificationEvent('verification-request-deleted', profileHandler);

			// Fallback: nothing to initialize from localStorage here

		// store cleanup so outer effect cleanup can run it if needed
		(window as any).__residentPortalSocketCleanup = () => {
			try { offNotificationEvent('profile', profileHandler); } catch (e) {}
			try { offNotificationEvent('verification-request-deleted', profileHandler); } catch (e) {}
		};
	} catch (err) {
		// ignore socket init failures
	}

}, []);

	// Update profile completion when data changes
	useEffect(() => {
		const completion = calculateProfileCompletion(form, personalInfo);
		setProfileCompletion(completion);
	}, [form, personalInfo]);

// Cleanup any created object URLs for upload previews when component unmounts
useEffect(() => {
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

// Cleanup any socket handlers when component unmounts
useEffect(() => {
	return () => {
		try {
			const fn = (window as any).__residentPortalSocketCleanup;
			if (typeof fn === 'function') fn();
			try { delete (window as any).__residentPortalSocketCleanup; } catch (e) {}
		} catch (err) {}
	};
}, []);

// verification status has been removed from this component

	// Handler to upload verification documents (proof, id, selfie)
	const handleVerificationUpload = async () => {
		if (!proofFile && !govIdFile && !selfieFile) {
			message.warning('Please select at least one document to upload');
			return;
		}
		// If user is already verified, avoid uploading and inform user
		if (profile && (profile as any).verified) {
			message.info('Your account is already verified; no need to upload verification documents.');
			return;
		}
		// Double-check the server-side verified status before uploading to avoid a rejected request
		try {
			const latestProfileResp = await axiosInstance.get('/resident/profile');
			const latestProfileRaw = latestProfileResp?.data;
			const latestProfile = latestProfileRaw && (latestProfileRaw.user || latestProfileRaw.profile) ? (latestProfileRaw.user || latestProfileRaw.profile) : latestProfileRaw;
			if (latestProfile && (latestProfile as any).verified) {
				message.info('Your account is already verified; no need to upload verification documents.');
				return;
			}
		} catch (err: any) {
			// If unauthorized, surface an auth message; otherwise ignore and continue (server may be temporarily unreachable)
			if (err?.response && err.response.status === 401) {
				message.error('Authentication required. Please login and try again.');
				return;
			}
		}
		setVerificationUploading(true);
		setVerificationProgress(0);
		try {
			const formData = new FormData();
			if (proofFile) formData.append('ids', proofFile, proofFile.name);
			if (govIdFile) formData.append('ids', govIdFile, govIdFile.name);
			if (selfieFile) formData.append('ids', selfieFile, selfieFile.name);
			// include per-file types so server can persist structured metadata and avoid index-only mapping
			if (proofFile) formData.append('fileTypes', 'proof');
			if (govIdFile) formData.append('fileTypes', 'govid');
			if (selfieFile) formData.append('fileTypes', 'selfie');
			// include uploader barangayID so GridFS file metadata and request document can record it
			const brgy = form?.barangayID || profile?.barangayID || '';
			if (brgy) formData.append('barangayID', brgy);
			await axiosInstance.post('/verification/upload', formData, {
				headers: { 'Content-Type': 'multipart/form-data' },
				onUploadProgress: (ev: any) => {
					const loaded = typeof ev?.loaded === 'number' ? ev.loaded : 0;
					const total = typeof ev?.total === 'number' ? ev.total : 0;
					if (total > 0) {
						const pct = Math.min(100, Math.round((loaded / total) * 100));
						setVerificationProgress(pct);
					}
				}
			});
			message.success('Verification documents uploaded');
			// After a successful upload refresh the authoritative profile so UI reflects server-side verified flag
			try {
				await refreshProfile();
			} catch (e) {
				// ignore refresh failure
			}
			// Refresh displayed files from the server (show pending request with uploaded files)
			try {
				const reqs = await verificationAPI.getMyRequests();
				if (Array.isArray(reqs) && reqs.length > 0) {
					const pending = reqs.find((r: any) => r.status === 'pending') || reqs[0];
					const filesMeta: any[] = pending.filesMeta || [];
					const makeFileEntry = (fm: any) => {
						if (!fm || !fm.gridFileId) return null;
						const url = verificationAPI.getFileUrl(fm.gridFileId);
						return {
							uid: `remote-${fm.fileType || 'unknown'}-${fm.gridFileId}`,
							name: fm.filename || `file-${fm.fileType || 'unknown'}`,
							status: 'done',
							url,
							thumbUrl: fm.filename && /\.(png|jpe?g|gif|webp)$/i.test(fm.filename) ? url : undefined,
						};
					};
					// Find files by type
					const proofFile = filesMeta.find((fm: any) => fm.fileType === 'proof');
					const govIdFile = filesMeta.find((fm: any) => fm.fileType === 'govid');
					const selfieFile = filesMeta.find((fm: any) => fm.fileType === 'selfie');
					setProofList(proofFile ? [makeFileEntry(proofFile)].filter(Boolean) as any[] : []);
					setGovIdList(govIdFile ? [makeFileEntry(govIdFile)].filter(Boolean) as any[] : []);
					setSelfieList(selfieFile ? [makeFileEntry(selfieFile)].filter(Boolean) as any[] : []);
					// clear local pending File objects since we are now showing server versions
					setProofFile(null); setGovIdFile(null); setSelfieFile(null);
				}
			} catch (e) {
				// ignore failures here
			}
			setVerificationProgress(100);
		} catch (err: any) {
			console.error('Verification upload failed', err);
			const serverMsg = err?.response?.data?.message || err?.message;
			if (err?.response && err.response.status === 400 && serverMsg) {
				message.error(String(serverMsg));
			} else if (err?.response && err.response.status === 401) {
				message.error('Authentication required. Please login and try again.');
			} else {
				message.error('Failed to upload verification documents');
			}
		} finally {
			setVerificationUploading(false);
		}
	};

	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			const formatted = now.toLocaleString('en-US', {
				year: 'numeric', month: '2-digit', day: '2-digit',
				hour: '2-digit', minute: '2-digit', second: '2-digit',
				hour12: false
			}).replace(/,/g, '');
			setCurrentTime(formatted);
		};
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, []);

	// User info edit logic
	const handleEditUser = () => setEditingUser(true);
	const handleCancelUser = () => {
		setEditingUser(false);
		setForm(profile);
	};
	const handleChangeUser = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!form) return;
		setForm({ ...form, [e.target.name]: e.target.value });
	};
	const handleSaveUser = async () => {
		if (!form) return;
		try {
			// Build a minimal payload containing only allowed fields the server expects
			const deriveNames = () => {
				let first = (form as any).firstName || '';
				let last = (form as any).lastName || '';
				if ((!first || !last) && profile && (profile as any).fullName) {
					const parts = (profile as any).fullName.trim().split(' ');
					first = first || parts[0] || '';
					last = last || (parts.length > 1 ? parts.slice(1).join(' ') : '');
				}
				// Fallback to username/email if still missing
				first = first || profile?.username || profile?.email || 'Resident';
				last = last || 'User';
				return { first, last };
			};
			const names = deriveNames();
			const payload: any = {
				firstName: names.first,
				lastName: names.last,
				barangayID: form?.barangayID || profile?.barangayID || '',
				email: form?.email || profile?.email || '',
				contactNumber: form?.contactNumber || profile?.contactNumber || '',
				address: form?.address || profile?.address || ''
			};
			const resp = await axiosInstance.put('/resident/personal-info', payload);
			// Update local profile with returned resident/user fields when available
			if (resp && resp.data) {
				setProfile({ ...profile, ...resp.data });
			} else {
				setProfile({ ...profile, ...payload } as any);
			}
			setEditingUser(false);
			message.success('Profile saved');
		} catch (err: any) {
			console.error('Failed to save user info:', err);
			if (err?.response && err.response.data) {
				const data = err.response.data;
				if (data.errors) {
					// Validation errors
					const msgs = Object.values(data.errors).map((v: any) => v.toString()).join('; ');
					message.error(msgs || data.message || 'Validation error');
				} else {
					message.error(data.message || 'Failed to save');
				}
			} else {
				message.error('Failed to save user info');
			}
		}
	};

	// Personal info edit logic
	const handleEditPersonal = () => setEditingPersonal(true);
	const handleCancelPersonal = () => {
		setEditingPersonal(false);
		setPersonalForm(personalInfo);
	};
	const handleChangePersonal = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		if (!personalForm) return;
		setPersonalForm({ ...personalForm, [e.target.name]: e.target.value });
	};
	const handleSavePersonal = async () => {
		if (!personalForm || !profile?._id) return;
		// Overwrite the existing record for the displayed user
		await residentPersonalInfoAPI.updatePersonalInfo({ ...personalForm, userId: profile._id });
		setPersonalInfo(personalForm);
		setEditingPersonal(false);
	};

	const handleRequestStaff = async () => {
		setRequesting(true);
		try {
			const resp = await axiosInstance.post('/resident/request-staff-access');
			const serverMsg = resp?.data?.message || 'Request sent to admin for staff access';
			if (resp && (resp.status === 200 || resp.status === 201)) {
				message.success(serverMsg);
				setStaffRequestSent(true);
			} else {
				message.info(serverMsg);
			}
 		} catch (err) {
 			console.error('Request staff access failed:', err);
 			const e: any = err;
 			const serverMsg = e?.response?.data?.message || e?.message || 'Failed to send staff access request';
 			message.error(serverMsg);
 		} finally {
			setRequesting(false);
		}
	};

		// Feedback form state
	// ...existing code...

			    return (
				    <>
				    <div className="max-w-3xl mx-auto p-6">
						{/* Enhanced Resident Portal Banner with role-aware features */}
						<Card
							style={{
								background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
								borderRadius: 20,
								boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)',
								marginBottom: 32,
								border: 'none',
								padding: 0,
							}}
								bodyStyle={{ padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
								bordered={false}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
								{/* Left column: avatar and role info */}
								<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
									<Upload
										showUploadList={false}
										accept="image/*"
										customRequest={async (opts: any) => {
											const { file, onSuccess, onError } = opts || {};
											try {
												await handleBannerAvatarUpload(file as File | null);
												if (typeof onSuccess === 'function') onSuccess('ok');
											} catch (err) {
												if (typeof onError === 'function') onError(err as any);
											}
										}}
									>
										<div
											className="resident-banner-avatar clickable"
											role="button"
											tabIndex={0}
											aria-label="Upload profile picture"
											title="Upload profile picture"
											onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
												const key = (e && (e as React.KeyboardEvent).key) || '';
												if (key === 'Enter' || key === ' ') {
													(e.target as HTMLElement).click();
												}
											}}
										>
											{avatarPreview ? (
												<img src={avatarPreview} alt="avatar" className="resident-banner-avatar__img" />
											) : (
												<AvatarImage user={(() => {
													let displayUser = profile;
													if (!displayUser) {
														try {
															const stored = localStorage.getItem('userProfile');
															if (stored) displayUser = JSON.parse(stored);
														} catch (err) {}
													}
													return displayUser;
												})()} size={96} className="resident-banner-avatar__img" />
											)}
										</div>
									</Upload>
									{/* Role and verification badges */}
									<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
										<Tag color={isAdmin() ? 'gold' : isStaff() ? 'blue' : 'green'} style={{ fontSize: 12, fontWeight: 600 }}>
											{isAdmin() ? <SafetyOutlined /> : isStaff() ? <TeamOutlined /> : <UserOutlined />}
											{isAdmin() ? 'Admin' : isStaff() ? 'Staff' : 'Resident'}
										</Tag>
										<Tag color={verificationStatus === 'verified' ? 'success' : verificationStatus === 'rejected' ? 'error' : 'warning'} style={{ fontSize: 10 }}>
											{verificationStatus === 'verified' ? <CheckCircleOutlined /> : verificationStatus === 'rejected' ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />}
											{verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'rejected' ? 'Rejected' : 'Pending'}
										</Tag>
									</div>
								</div>
								
								{/* Center column: user info and profile completion */}
								<div style={{ flex: 1, textAlign: 'center' }}>
									<Typography.Title level={2} style={{ margin: 0, fontWeight: 800, color: 'white' }}>
										{profile?.username || profile?.email || 'Resident'}
									</Typography.Title>
									<Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
										Barangay ID: {profile?.barangayID || 'N/A'}
									</Typography.Text>
									{personalInfo?.dateOfResidency && (
										<Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
											Resident for: {calculateResidencyDuration(personalInfo.dateOfResidency)}
										</Typography.Text>
									)}
									
									{/* Profile Completion Progress */}
									<div style={{ marginTop: 16, maxWidth: 300, margin: '16px auto 0' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
											<Typography.Text style={{ color: 'white', fontWeight: 600, fontSize: 12 }}>
												Profile Completion
											</Typography.Text>
											<Typography.Text style={{ color: 'white', fontWeight: 600, fontSize: 12 }}>
												{profileCompletion}%
											</Typography.Text>
										</div>
										<Progress 
											percent={profileCompletion} 
											size="small"
											status={profileCompletion === 100 ? 'success' : 'active'}
											strokeColor={profileCompletion === 100 ? '#52c41a' : '#ffffff'}
											trailColor="rgba(255,255,255,0.3)"
										/>
										{profileCompletion < 100 && (
											<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4, display: 'block' }}>
												Complete your profile to unlock all features
											</Typography.Text>
										)}
									</div>
								</div>
								
								{/* Right column: timestamp and quick actions */}
								<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
									<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
										{currentTime}
									</Typography.Text>
									{!editingUser && !editingPersonal && (
										<Button 
											type="primary" 
											ghost 
											size="small"
											icon={<EditOutlined />}
											onClick={() => setEditingUser(true)}
											style={{ borderRadius: 20 }}
										>
											Quick Edit
										</Button>
									)}
								</div>
							</div>
						</Card>

						{/* Verification Uploads Section (styled like User Info) */}
																								{/* Prompt to create resident info if missing */}
																		{residentMissing && (
																			<div style={{ marginBottom: 16 }}>
																				<Alert
																					message="Your resident profile is incomplete"
																					description={
																						<div>
																							<p>We couldn't find your resident information. Please create your resident profile so you can upload documents and profile pictures.</p>
																							<Button type="primary" onClick={() => setShowCreateModal(true)}>Create Resident Info</Button>
																						</div>
																					}
																					showIcon
																				/>
																			</div>
																		)}
																		<ResidentCreateModal
																			visible={showCreateModal}
																			onClose={() => setShowCreateModal(false)}
																			onCreated={(resident: any) => {
																				setPersonalInfo(resident);
																				setPersonalForm(resident);
																				setResidentMissing(false);
																			}}
																			defaultBarangayID={profile?.barangayID || ''}
																			defaultUsername={profile?.username || ''}
																			defaultEmail={profile?.email || ''}
																		/>
																		{/* Resident Tool Tips moved to Dashboard */}
																		{/* Comprehensive Profile Management with Tabbed Interface */}
						<Card
							style={{
								background: 'linear-gradient(135deg, #f8fafc 0%, #e3e6f3 40%, #f6f1f7 100%)',
								borderRadius: 20,
								boxShadow: '0 8px 32px #bfc7d6cc',
								marginBottom: 32,
								border: 'none',
								backdropFilter: 'blur(2px)',
							}}
							bodyStyle={{ padding: 0 }}
							bordered={false}
						>
							<Tabs
								activeKey={activeTab}
								onChange={setActiveTab}
								size="large"
								style={{ padding: '24px 24px 0' }}
								items={[
									{
										key: 'overview',
										label: (
											<span>
												<UserOutlined />
												Overview
											</span>
										),
										children: (
											<div style={{ padding: '0 24px 24px' }}>
												<Typography.Title level={3} style={{
													fontWeight: 900,
													marginBottom: 24,
													letterSpacing: 1,
													textAlign: 'left',
													fontSize: 28,
													background: 'linear-gradient(90deg, #40c9ff, #e81cff)',
													WebkitBackgroundClip: 'text',
													WebkitTextFillColor: 'transparent',
												}}>Account Overview</Typography.Title>
												
												<Row gutter={[24, 16]}>
													<Col xs={24} md={12}>
														<Card size="small" title="Account Information">
															{form && (
																<Form layout="vertical" disabled={!editingUser}>
																	<Form.Item label="Username">
																		<Input name="username" value={form?.username || ''} onChange={handleChangeUser} />
																	</Form.Item>
																	<Form.Item label="Email">
																		<Input name="email" value={form?.email || ''} onChange={handleChangeUser} />
																	</Form.Item>
																	<Form.Item label="Contact Number">
																		<Input name="contactNumber" value={form?.contactNumber || ''} onChange={handleChangeUser} />
																	</Form.Item>
																	<Form.Item label="Address">
																		<Input name="address" value={form?.address || ''} onChange={handleChangeUser} />
																	</Form.Item>
																</Form>
															)}
														</Card>
													</Col>
													<Col xs={24} md={12}>
														<Card size="small" title="Quick Stats">
															<Space direction="vertical" style={{ width: '100%' }}>
																<Statistic 
																	title="Profile Completion" 
																	value={profileCompletion} 
																	suffix="%" 
																	valueStyle={{ color: profileCompletion >= 80 ? '#52c41a' : profileCompletion >= 50 ? '#faad14' : '#ff4d4f' }}
																/>
																<Divider style={{ margin: '12px 0' }} />
																<div style={{ display: 'flex', justifyContent: 'space-between' }}>
																	<Text>Verification Status:</Text>
																	<Tag color={verificationStatus === 'verified' ? 'success' : 'warning'}>
																		{verificationStatus}
																	</Tag>
																</div>
																<div style={{ display: 'flex', justifyContent: 'space-between' }}>
																	<Text>Member Since:</Text>
																	<Text>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Unknown'}</Text>
																</div>
																<div style={{ display: 'flex', justifyContent: 'space-between' }}>
																	<Text>Role:</Text>
																	<Tag color={isAdmin() ? 'gold' : isStaff() ? 'blue' : 'green'}>
																		{isAdmin() ? 'Admin' : isStaff() ? 'Staff' : 'Resident'}
																	</Tag>
																</div>
															</Space>
														</Card>
													</Col>
												</Row>
												
												<Space style={{ marginTop: 24 }}>
													{editingUser ? (
														<>
															<Button type="primary" onClick={handleSaveUser} icon={<SaveOutlined />}>
																Save Changes
															</Button>
															<Button onClick={handleCancelUser}>Cancel</Button>
														</>
													) : (
														<Button onClick={handleEditUser} icon={<EditOutlined />}>
															Edit Profile
														</Button>
													)}
													{isResident() && (
														<Button
															type="dashed"
															onClick={handleRequestStaff}
															disabled={staffRequestSent || requesting}
														>
															{staffRequestSent ? 'Request Sent' : 'Request Staff Access'}
														</Button>
													)}
												</Space>
											</div>
										),
									},
									{
										key: 'personal',
										label: (
											<span>
												<FileTextOutlined />
												Personal Info
											</span>
										),
										children: (
											<div style={{ padding: '0 24px 24px' }}>
												{personalForm && (
													<>
														<Typography.Title level={3} style={{
															fontWeight: 900,
															marginBottom: 24,
															letterSpacing: 1,
															textAlign: 'left',
															fontSize: 28,
															background: 'linear-gradient(90deg, #40c9ff, #e81cff)',
															WebkitBackgroundClip: 'text',
															WebkitTextFillColor: 'transparent',
														}}>Personal Information</Typography.Title>
														
														<Tabs
															defaultActiveKey="basic"
															type="card"
															size="small"
															items={[
																{
																	key: 'basic',
																	label: 'Basic Info',
																	children: (
																		<div style={{ padding: '16px 0' }}>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="First Name">
																						<Input name="firstName" value={personalForm?.firstName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Middle Name">
																						<Input name="middleName" value={personalForm?.middleName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Last Name">
																						<Input name="lastName" value={personalForm?.lastName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Name Extension">
																						<Input name="nameExtension" value={personalForm?.nameExtension || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Jr., Sr., II, III" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Age">
																						<Input name="age" type="number" value={personalForm?.age || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Birth Date">
																						<DatePicker 
																							name="birthDate" 
																							value={personalForm.birthDate ? dayjs(personalForm.birthDate) : null} 
																							onChange={(date) => {
																								if (date) {
																									const birthDate = date.format('YYYY-MM-DD');
																									const age = dayjs().diff(date, 'year');
																									setPersonalForm(prev => prev ? { ...prev, birthDate, age } : prev);
																								} else {
																									setPersonalForm(prev => prev ? { ...prev, birthDate: '', age: undefined } : prev);
																								}
																							}} 
																							disabled={!editingPersonal}
																							disabledDate={(current) => current && current > dayjs().endOf('day')}
																							style={{ width: '100%' }}
																							placeholder="Select birth date"
																						/>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Sex">
																						<Select
																							value={personalForm.sex || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, sex: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Male">Male</Select.Option>
																							<Select.Option value="Female">Female</Select.Option>
																							<Select.Option value="Other">Other</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Civil Status">
																						<Select
																							value={personalForm.civilStatus || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, civilStatus: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Single">Single</Select.Option>
																							<Select.Option value="Married">Married</Select.Option>
																							<Select.Option value="Widowed">Widowed</Select.Option>
																							<Select.Option value="Divorced">Divorced</Select.Option>
																							<Select.Option value="Separated">Separated</Select.Option>
																							<Select.Option value="Annulled">Annulled</Select.Option>
																							<Select.Option value="Domestic Partnership">Domestic Partnership</Select.Option>
																							<Select.Option value="Other">Other</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Date of Residency">
																						<DatePicker 
																							name="dateOfResidency" 
																							value={personalForm.dateOfResidency ? dayjs(personalForm.dateOfResidency) : null} 
																							onChange={(date) => {
																								const dateOfResidency = date ? date.format('YYYY-MM-DD') : '';
																								setPersonalForm(prev => prev ? { ...prev, dateOfResidency } : prev);
																							}} 
																							disabled={!editingPersonal}
																							disabledDate={(current) => current && current > dayjs().endOf('day')}
																							style={{ width: '100%' }}
																							placeholder="Select residency start date"
																						/>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Nationality">
																						<Input name="nationality" value={personalForm.nationality || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Place of Birth">
																						<Input name="placeOfBirth" value={personalForm.placeOfBirth || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Religion">
																						<Input name="religion" value={personalForm.religion || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Marital Status">
																						<Select
																							value={personalForm.maritalStatus || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, maritalStatus: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Single">Single</Select.Option>
																							<Select.Option value="Married">Married</Select.Option>
																							<Select.Option value="Widowed">Widowed</Select.Option>
																							<Select.Option value="Divorced">Divorced</Select.Option>
																							<Select.Option value="Separated">Separated</Select.Option>
																							<Select.Option value="Other">Other</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Passport Number">
																						<Input name="passportNumber" value={personalForm.passportNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Government ID Number">
																						<Input name="governmentIdNumber" value={personalForm.governmentIdNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Blood Type">
																						<Select
																							value={personalForm.bloodType || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, bloodType: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="A+">A+</Select.Option>
																							<Select.Option value="A-">A-</Select.Option>
																							<Select.Option value="B+">B+</Select.Option>
																							<Select.Option value="B-">B-</Select.Option>
																							<Select.Option value="O+">O+</Select.Option>
																							<Select.Option value="O-">O-</Select.Option>
																							<Select.Option value="AB+">AB+</Select.Option>
																							<Select.Option value="AB-">AB-</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Disability Status">
																						<Input name="disabilityStatus" value={personalForm.disabilityStatus || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Occupation">
																						<Input name="occupation" value={personalForm.occupation || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24}>
																					<Form.Item label="Educational Attainment">
																						<Select
																							value={personalForm.educationalAttainment || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, educationalAttainment: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="No Formal Education">No Formal Education</Select.Option>
																							<Select.Option value="Elementary">Elementary</Select.Option>
																							<Select.Option value="High School">High School</Select.Option>
																							<Select.Option value="College">College</Select.Option>
																							<Select.Option value="Bachelor's Degree">Bachelor's Degree</Select.Option>
																							<Select.Option value="Master's Degree">Master's Degree</Select.Option>
																							<Select.Option value="Doctorate">Doctorate</Select.Option>
																							<Select.Option value="Vocational">Vocational</Select.Option>
																							<Select.Option value="Other">Other</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																			</Row>
																		</div>
																	),
																},
																{
																	key: 'contact',
																	label: 'Contact',
																	children: (
																		<div style={{ padding: '16px 0' }}>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Facebook">
																						<Input name="facebook" value={personalForm.facebook || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Facebook profile/link" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Email">
																						<Input name="email" type="email" value={personalForm.email || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Email address" />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Contact Number">
																						<Input name="contactNumber" value={personalForm.contactNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Contact No." />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Landline Number">
																						<Input name="landlineNumber" value={personalForm.landlineNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Landline number" />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Emergency Contact">
																						<Input name="emergencyContact" value={personalForm.emergencyContact || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Emergency contact number" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Emergency Contact Name">
																						<Input name="emergencyContactName" value={personalForm.emergencyContactName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Emergency Contact Relationship">
																						<Input name="emergencyContactRelationship" value={personalForm.emergencyContactRelationship || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Relationship to emergency contact" />
																					</Form.Item>
																				</Col>
																			</Row>
																		</div>
																	),
																},
																{
																	key: 'family',
																	label: 'Family',
																	children: (
																		<div style={{ padding: '16px 0' }}>
																			<Typography.Title level={4} style={{ marginBottom: 16 }}>Spouse Information</Typography.Title>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Name">
																						<Input name="spouseName" value={personalForm.spouseName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Age">
																						<Input name="spouseAge" type="number" value={personalForm.spouseAge || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Birth Date">
																						<DatePicker 
																							name="spouseBirthDate" 
																							value={personalForm.spouseBirthDate ? dayjs(personalForm.spouseBirthDate) : null} 
																							onChange={(date) => {
																								const spouseBirthDate = date ? date.format('YYYY-MM-DD') : '';
																								setPersonalForm(prev => prev ? { ...prev, spouseBirthDate } : prev);
																							}} 
																							disabled={!editingPersonal}
																							disabledDate={(current) => current && current > dayjs().endOf('day')}
																							style={{ width: '100%' }}
																							placeholder="Select spouse birth date"
																						/>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Middle Name">
																						<Input name="spouseMiddleName" value={personalForm.spouseMiddleName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Last Name">
																						<Input name="spouseLastName" value={personalForm.spouseLastName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Occupation">
																						<Input name="spouseOccupation" value={personalForm.spouseOccupation || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Status">
																						<Select
																							value={personalForm.spouseStatus || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, spouseStatus: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Living">Living</Select.Option>
																							<Select.Option value="Deceased">Deceased</Select.Option>
																							<Select.Option value="Separated">Separated</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Nationality">
																						<Input name="spouseNationality" value={personalForm.spouseNationality || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Spouse Contact Number">
																						<Input name="spouseContactNumber" value={personalForm.spouseContactNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Divider />
																			<Typography.Title level={4} style={{ marginBottom: 16 }}>Parent Information</Typography.Title>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Mother's Name">
																						<Input name="motherName" value={personalForm.motherName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Father's Name">
																						<Input name="fatherName" value={personalForm.fatherName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Mother's Age">
																						<Input name="motherAge" type="number" value={personalForm.motherAge || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Father's Age">
																						<Input name="fatherAge" type="number" value={personalForm.fatherAge || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Mother's Birth Date">
																						<DatePicker 
																							name="motherBirthDate" 
																							value={personalForm.motherBirthDate ? dayjs(personalForm.motherBirthDate) : null} 
																							onChange={(date) => {
																								const motherBirthDate = date ? date.format('YYYY-MM-DD') : '';
																								setPersonalForm(prev => prev ? { ...prev, motherBirthDate } : prev);
																							}} 
																							disabled={!editingPersonal}
																							disabledDate={(current) => current && current > dayjs().endOf('day')}
																							style={{ width: '100%' }}
																							placeholder="Select mother birth date"
																						/>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Father's Birth Date">
																						<DatePicker 
																							name="fatherBirthDate" 
																							value={personalForm.fatherBirthDate ? dayjs(personalForm.fatherBirthDate) : null} 
																							onChange={(date) => {
																								const fatherBirthDate = date ? date.format('YYYY-MM-DD') : '';
																								setPersonalForm(prev => prev ? { ...prev, fatherBirthDate } : prev);
																							}} 
																							disabled={!editingPersonal}
																							disabledDate={(current) => current && current > dayjs().endOf('day')}
																							style={{ width: '100%' }}
																							placeholder="Select father birth date"
																						/>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Mother's Occupation">
																						<Input name="motherOccupation" value={personalForm.motherOccupation || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Father's Occupation">
																						<Input name="fatherOccupation" value={personalForm.fatherOccupation || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Mother's Status">
																						<Select
																							value={personalForm.motherStatus || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, motherStatus: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Living">Living</Select.Option>
																							<Select.Option value="Deceased">Deceased</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={6}>
																					<Form.Item label="Father's Status">
																						<Select
																							value={personalForm.fatherStatus || ''}
																							onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, fatherStatus: value } : prev)}
																							disabled={!editingPersonal}
																						>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Living">Living</Select.Option>
																							<Select.Option value="Deceased">Deceased</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Divider />
																			<Typography.Title level={4} style={{ marginBottom: 16 }}>Children Information</Typography.Title>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Number of Children">
																						<Input name="numberOfChildren" type="number" value={personalForm.numberOfChildren || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Children Names">
																						<Input name="childrenNames" value={personalForm.childrenNames || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="List children names separated by comma" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Children Ages">
																						<Input name="childrenAges" value={personalForm.childrenAges || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="List children ages separated by comma" />
																					</Form.Item>
																				</Col>
																			</Row>
																		</div>
																	),
																},
																{
																	key: 'business',
																	label: 'Business',
																	children: (
																		<div style={{ padding: '16px 0' }}>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Business Name">
																						<Input name="businessName" value={personalForm.businessName || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Business Type">
																						<Select value={personalForm.businessType || ''} onChange={(value: string) => setPersonalForm(prev => prev ? { ...prev, businessType: value } : prev)} disabled={!editingPersonal}>
																							<Select.Option value="">Select</Select.Option>
																							<Select.Option value="Sole Proprietorship">Sole Proprietorship</Select.Option>
																							<Select.Option value="Partnership">Partnership</Select.Option>
																							<Select.Option value="Corporation">Corporation</Select.Option>
																							<Select.Option value="Cooperative">Cooperative</Select.Option>
																							<Select.Option value="Other">Other</Select.Option>
																						</Select>
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Nature of Business">
																						<Input name="natureOfBusiness" value={personalForm.natureOfBusiness || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Business Address">
																						<Input name="businessAddress" value={personalForm.businessAddress || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Date Established">
																						<DatePicker 
																							name="dateEstablished" 
																							value={personalForm.dateEstablished ? dayjs(personalForm.dateEstablished) : null} 
																							onChange={(date) => {
																								const dateEstablished = date ? date.format('YYYY-MM-DD') : '';
																								setPersonalForm(prev => prev ? { ...prev, dateEstablished } : prev);
																							}} 
																							disabled={!editingPersonal}
																							disabledDate={(current) => current && current > dayjs().endOf('day')}
																							style={{ width: '100%' }}
																							placeholder="Select business establishment date"
																						/>
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="TIN">
																						<Input name="tin" value={personalForm.tin || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Tax Identification Number" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Registration Number">
																						<Input name="registrationNumber" value={personalForm.registrationNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Business Permit Number">
																						<Input name="businessPermitNumber" value={personalForm.businessPermitNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Barangay Clearance Number">
																						<Input name="barangayClearanceNumber" value={personalForm.barangayClearanceNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Number of Employees">
																						<Input name="numberOfEmployees" type="number" value={personalForm.numberOfEmployees || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Capital Investment">
																						<Input name="capitalInvestment" type="number" value={personalForm.capitalInvestment || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Amount in PHP" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Annual Gross Income">
																						<Input name="annualGrossIncome" type="number" value={personalForm.annualGrossIncome || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Amount in PHP" />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={8}>
																					<Form.Item label="Business Contact Person">
																						<Input name="businessContactPerson" value={personalForm.businessContactPerson || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																			</Row>
																			<Row gutter={[16, 8]}>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Business Contact Number">
																						<Input name="businessContactNumber" value={personalForm.businessContactNumber || ''} onChange={handleChangePersonal} disabled={!editingPersonal} />
																					</Form.Item>
																				</Col>
																				<Col xs={24} sm={12}>
																					<Form.Item label="Business Email">
																						<Input name="businessEmail" type="email" value={personalForm.businessEmail || ''} onChange={handleChangePersonal} disabled={!editingPersonal} placeholder="Business email address" />
																					</Form.Item>
																				</Col>
																			</Row>
																		</div>
																	),
																},
															]}
														/>
														
														<div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
															{editingPersonal ? (
																<>
																	<Button type="primary" onClick={handleSavePersonal} icon={<SaveOutlined />}>
																		Save Personal Info
																	</Button>
																	<Button onClick={handleCancelPersonal}>Cancel</Button>
																</>
															) : (
																<Button onClick={handleEditPersonal} icon={<EditOutlined />}>
																	Edit Personal Info
																</Button>
															)}
															{personalInfo && personalInfo.barangayID ? (
																<Button type="primary" disabled>Registered</Button>
															) : (
																<Button type="primary" onClick={handleRegisterResident}>Register</Button>
															)}
														</div>
													</>
												)}
											</div>
										),
									},
									{
										key: 'verification',
										label: (
											<span>
												<SafetyOutlined />
												Verification
											</span>
										),
										children: (
											<div style={{ padding: '0 24px 24px' }}>
												<Typography.Title level={3} style={{
													fontWeight: 900,
													marginBottom: 24,
													letterSpacing: 1,
													textAlign: 'left',
													fontSize: 28,
													background: 'linear-gradient(90deg, #40c9ff, #e81cff)',
													WebkitBackgroundClip: 'text',
													WebkitTextFillColor: 'transparent',
												}}>Verification Documents</Typography.Title>
												
												<Alert
													message="Verification Status"
													description={
														<div>
															<p>Upload your verification documents to verify your identity and unlock all features.</p>
															<div style={{ marginTop: 8 }}>
																<Tag color={verificationStatus === 'verified' ? 'success' : 'warning'}>
																	{verificationStatus === 'verified' ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
																	{verificationStatus === 'verified' ? 'Verified' : 'Pending Verification'}
																</Tag>
															</div>
														</div>
													}
													type={verificationStatus === 'verified' ? 'success' : 'info'}
													showIcon
													style={{ marginBottom: 24 }}
												/>
												
												<Form layout="vertical">
													<Row gutter={24}>
														<Col xs={24} sm={24} md={12} lg={8}>
															<Form.Item label={
																<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
																	Proof of Residency
																	<Tooltip title="Upload a document showing your address (e.g., utility bill, lease, or bank statement).">
																		<InfoCircleOutlined style={{ color: '#888' }} />
																	</Tooltip>
																</div>
															}>
																<Upload
																	accept="image/*,application/pdf"
																	fileList={proofList}
																	beforeUpload={(file: File) => false}
																	onChange={(info: any) => {
																		const fileList = info?.fileList || [];
																		proofList.forEach((pf: any) => {
																			if (pf && pf.thumbUrl) {
																				try { URL.revokeObjectURL(String(pf.thumbUrl)); } catch (e) {}
																				previewUrlsRef.current.delete(String(pf.thumbUrl));
																			}
																		});
																		const list = (fileList || []).slice(-1);
																		list.forEach((f: any) => {
																			if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
																				const url = URL.createObjectURL(f.originFileObj);
																				f.thumbUrl = url;
																				previewUrlsRef.current.add(url);
																			}
																		});
																		setProofList(list as any[]);
																		setProofFile((list[0] && (list[0].originFileObj as File)) || null);
																	}}
																	listType="picture-card"
																	showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
																	maxCount={1}
																>
																	<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
																		<UploadOutlined /> <span style={{ fontWeight: 600 }}>Select Proof</span>
																	</div>
																</Upload>
															</Form.Item>
														</Col>
														<Col xs={24} sm={24} md={12} lg={8}>
															<Form.Item label={
																<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
																	Government-issued ID
																	<Tooltip title="Upload a government-issued ID such as passport, driver's license, or national ID.">
																		<InfoCircleOutlined style={{ color: '#888' }} />
																	</Tooltip>
																</div>
															}>
																<Upload
																	accept="image/*,application/pdf"
																	fileList={govIdList}
																	beforeUpload={(file: File) => false}
																	onChange={(info: any) => {
																		const fileList = info?.fileList || [];
																		govIdList.forEach((gf: any) => {
																			if (gf && gf.thumbUrl) {
																				try { URL.revokeObjectURL(String(gf.thumbUrl)); } catch (e) {}
																				previewUrlsRef.current.delete(String(gf.thumbUrl));
																			}
																		});
																		const list = (fileList || []).slice(-1);
																		list.forEach((f: any) => {
																			if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
																				const url = URL.createObjectURL(f.originFileObj);
																				f.thumbUrl = url;
																				previewUrlsRef.current.add(url);
																			}
																		});
																		setGovIdList(list as any[]);
																		setGovIdFile((list[0] && (list[0].originFileObj as File)) || null);
																	}}
																	listType="picture-card"
																	showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
																	maxCount={1}
																>
																	<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
																		<UploadOutlined /> <span style={{ fontWeight: 600 }}>Select ID</span>
																	</div>
																</Upload>
															</Form.Item>
														</Col>
														<Col xs={24} sm={24} md={12} lg={8}>
															<Form.Item label={
																<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
																	Selfie with ID
																	<Tooltip title="Take a clear photo of yourself holding your government ID next to your face.">
																		<InfoCircleOutlined style={{ color: '#888' }} />
																	</Tooltip>
																</div>
															}>
																<Upload
																	accept="image/*"
																	fileList={selfieList}
																	beforeUpload={(file: File) => false}
																	onChange={(info: any) => {
																		const fileList = info?.fileList || [];
																		selfieList.forEach((sf: any) => {
																			if (sf && sf.thumbUrl) {
																				try { URL.revokeObjectURL(String(sf.thumbUrl)); } catch (e) {}
																				previewUrlsRef.current.delete(String(sf.thumbUrl));
																			}
																		});
																		const list = (fileList || []).slice(-1);
																		list.forEach((f: any) => {
																			if (f.originFileObj && !f.thumbUrl && f.type && f.type.startsWith('image/')) {
																				const url = URL.createObjectURL(f.originFileObj);
																				f.thumbUrl = url;
																				previewUrlsRef.current.add(url);
																			}
																		});
																		setSelfieList(list as any[]);
																		setSelfieFile((list[0] && (list[0].originFileObj as File)) || null);
																	}}
																	listType="picture-card"
																	showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
																	maxCount={1}
																>
																	<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
																		<UploadOutlined /> <span style={{ fontWeight: 600 }}>Select Selfie</span>
																	</div>
																</Upload>
															</Form.Item>
														</Col>
													</Row>
													<Row gutter={24} style={{ marginTop: 16 }}>
														<Col span={24} style={{ display: 'flex', justifyContent: 'flex-start', gap: 12 }}>
															<Button type="dashed" onClick={() => {
																[ ...proofList, ...govIdList, ...selfieList ].forEach((f: any) => {
																	if (f && f.thumbUrl) {
																		try { URL.revokeObjectURL(String(f.thumbUrl)); } catch (e) {}
																		previewUrlsRef.current.delete(String(f.thumbUrl));
																	}
																});
																setProofFile(null); setGovIdFile(null); setSelfieFile(null); setProofList([]); setGovIdList([]); setSelfieList([]);
															}}>Clear</Button>
															<Button type="primary" loading={verificationUploading} disabled={!(proofFile && govIdFile && selfieFile)} onClick={handleVerificationUpload}>
																Upload Verification Documents
															</Button>
														</Col>
													</Row>
													{(verificationUploading || verificationProgress > 0) && (
														<Row gutter={24} style={{ marginTop: 12 }}>
															<Col span={24}>
																<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
																	<div style={{ flex: 1 }}>
																		<Progress percent={verificationProgress} status={verificationProgress < 100 ? 'active' : 'success'} strokeColor={{ '0%': '#e81cff', '100%': '#40c9ff' }} />
																	</div>
																	<div style={{ minWidth: 110 }}>
																		<Typography.Text type="secondary">
																			{verificationUploading ? `Uploading (${verificationProgress}%)` : verificationProgress === 100 ? 'Upload complete' : ''}
																		</Typography.Text>
																	</div>
																</div>
															</Col>
														</Row>
													)}
												</Form>
											</div>
										),
									},
								]}
							/>
						</Card>

												
			</div>

					{/* Floating refresh button (bottom-left) */}
					<div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 1200 }}>
						<Button type="primary" shape="circle" size="large" icon={<SyncOutlined />} onClick={refreshProfile} aria-label="Refresh profile" />
					</div>
					</>
		);
}



