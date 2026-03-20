import axios from 'axios';
import { 
  SystemSettings,
  User,
  ActivityLog,
  SystemStatistics,
  AnalyticsDataPoint,
  AnalyticsSummary,
  AnalyticsDistribution,
  MonthlyAnalytics
} from '../types/admin';
import { Notification } from '../types/notification';
import { localDB } from './localDatabase';
import { syncService } from './syncService';
import type { ScheduledAppointment, ConflictItem } from '../types/appointments';
import { getFileExtension, getFileTypeLabel } from '../utils/fileTypeDetector';

interface AdminAPI {
  createUser: (userData: any) => Promise<void>;
  updateUser: (userId: string, userData: any) => Promise<void>;
  demoteUser: (userId: string) => Promise<any>;
  getSystemSettings: () => Promise<SystemSettings>;
  updateSystemSettings: (settings: SystemSettings) => Promise<void>;
  testSmtp: (testEmail: string, emailConfig?: any) => Promise<any>;
  getUsers: () => Promise<User[]>;
  updateUserStatus: (userId: string, status: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  getActivityLogs: (filters: { startDate?: string; endDate?: string; module?: string; userId?: string }) => Promise<ActivityLog[]>;
  getSystemStatistics: () => Promise<SystemStatistics>;
  getStaffApplicants: () => Promise<{ count: number; applicants: any[] }>;
  getUserWithResident: (userId: string) => Promise<any>;
  getResidentByBarangayID: (barangayID: string) => Promise<any>;
  getResident: (residentId: string) => Promise<any>;
  updateResident: (residentId: string, data: any) => Promise<any>;
  uploadResidentAvatar: (residentId: string, file: File) => Promise<any>;
  getOfficials: () => Promise<any>;
  createOfficial: (data: any) => Promise<any>;
  updateOfficial: (id: string, data: any) => Promise<any>;
  deleteOfficial: (id: string) => Promise<any>;
  reorderOfficials: (order: string[]) => Promise<any>;
  disableUser: (userId: string, data?: { suspendedUntil?: string }) => Promise<any>;
  enableUser: (userId: string) => Promise<any>;
  uploadOfficialPhoto: (id: string, file: File) => Promise<any>;
  approveStaffApplicant: (applicantId: string) => Promise<any>;
  createAnnouncement: (formData: FormData) => Promise<any>;
  listAdminAnnouncements: () => Promise<any>;
  deleteAnnouncement: (id: string) => Promise<any>;
  updateAnnouncement: (id: string, formData: FormData) => Promise<any>;
  getAnalyticsSummary: (params?: { startDate?: string; endDate?: string; residentType?: string }) => Promise<any>;
  getGenderAnalytics: () => Promise<any>;
  getAgeAnalytics: () => Promise<any>;
  getCivilStatusAnalytics: () => Promise<any>;
  getEducationAnalytics: () => Promise<any>;
  getMonthlyDocumentsAnalytics: () => Promise<any>;
  getAllAnalytics: () => Promise<any>;
  get: (path: string, config?: any) => Promise<any>;
  patch: (path: string, data?: any, config?: any) => Promise<any>;
  post: (path: string, data?: any, config?: any) => Promise<any>;
}
export const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  withCredentials: true,
});

export const axiosPublic = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  withCredentials: false,
});

// API_URL constant for absolute URL construction
export const API_URL = process.env.REACT_APP_API_URL || '/api';

// Resident Personal Info API
export const residentPersonalInfoAPI = {
  getPersonalInfo: async () => {
    // Try several common endpoints used across versions of the server
    const candidates = ['/resident/my-info', '/resident/personal-info', '/resident/profile'];
    for (const path of candidates) {
      try {
        const resp = await axiosInstance.get(path);
        if (resp && resp.data) return resp.data;
      } catch (e) {
        // continue to next candidate
      }
    }
    // Last-resort: hit absolute API_URL to avoid using client origin (avoids 3000 -> 404)
    try {
      const resp = await axiosInstance.get('/resident/personal-info');
      if (resp && resp.data) return resp.data;
    } catch (e) {
      // ignore and throw below
    }
    const err: any = new Error('Resident personal info not found');
    // attach a pseudo-response to aid callers checking err.response?.status
    err.response = { status: 404 };
    throw err;
  },
  updatePersonalInfo: async (data: any) => {
    const response = await axiosInstance.put('/resident/my-info', data);
    return response.data;
  },
};

// Fetch template text for a document type
export const getTemplateText = (type: string) => {
  return axiosInstance.get(`/templates/${type}`).then(res => res.data.text);
};

// Notification API
export const notificationAPI = {
  getNotifications: async () => {
    return axiosInstance.get('/notifications').then(res => (res.data || []).filter(item => item != null));
  },
  approveStaff: async (userId: string, notifId: string) => {
    return axiosInstance.post(`/notifications/approve-staff/${userId}/${notifId}`);
  },
  rejectStaff: async (notifId: string, reason?: string) => {
    return axiosInstance.post(`/notifications/reject-staff/${notifId}`, { reason });
  },
};


// Staff registration API
export const staffRegister = async (data: any) => {
  const response = await axiosInstance.post('/auth/register/staff', data);
  return response.data;
};

// Build an absolute URL to the API given a path (path may start with '/').
// This normalizes the configured API base (runtime config -> REACT_APP_API_URL -> '/api')
// and ensures requests to asset URLs (images/files) resolve to the correct origin.
export function getAbsoluteApiUrl(path: string) {
  const cfg = (globalThis as any).__APP_CONFIG__;
  const base = (cfg && cfg.API_BASE) || process.env.REACT_APP_API_URL || '/api';
  let root = String(base).replace(/\/$/, '');
  // If the base includes the '/api' suffix, strip it to create a root host
  if (root.endsWith('/api')) root = root.replace(/\/api$/, '');
  // Ensure path begins with a single '/'
  const p = path.startsWith('/') ? path : `/${path}`;
  // If caller already passed a path that starts with '/api', just join with root
  if (p.startsWith('/api')) return `${root}${p}`;
  // Otherwise prefix with /api
  return `${root}/api${p}`;
}


// Auth service wrapper
export const authService = {
  login: async (email: string, password: string) => {
    const response = await axiosInstance.post('/auth/login', { email, password });
    return response.data;
  },
  register: async (userData: any) => {
    const response = await axiosInstance.post('/auth/register', userData);
    return response.data;
  },
  logout: async () => {
    await axiosInstance.post('/auth/logout');
  },
  // Fetch current authenticated user's full profile
  getCurrentUser: async () => {
    const response = await axiosInstance.get('/auth/me');
    return response.data;
  }
};

// Add auth token to requests
axiosInstance.interceptors.request.use((config) => {
  // Prefer the primary auth token (set at login). Fall back to a guest session
  // token if present so guest users can make authenticated requests that the
  // server accepts (the server issues `sessionToken` for guest flows).
  const token = localStorage.getItem('token') || localStorage.getItem('guestSessionToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response handler: if any request returns 401, clear auth and redirect to login
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const status = error?.response?.status;
      if (status === 401) {
        // Avoid redirect loops: only redirect if we're not already on the login page
        // and the failed request was not the login attempt itself.
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname || '';
          const requestUrl = (error?.config && (error.config.url || '')) || (error?.request && error.request.responseURL) || '';
          const isLoginRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/me');
          const isLoginPage = currentPath === '/login' || currentPath.startsWith('/login');

          if (!isLoginPage && !isLoginRequest) {
            console.warn('API responded 401 Unauthorized — clearing auth and redirecting to login');
            try {
              localStorage.removeItem('token');
              localStorage.removeItem('guestSessionToken');
            } catch (e) {}

            // Debounce multiple simultaneous 401s so we only force one navigation.
            try {
              if (!sessionStorage.getItem('redirectingToLogin')) {
                sessionStorage.setItem('redirectingToLogin', '1');
                // Small timeout so callers can finish their promise chains and avoid
                // racing navigation that could otherwise produce reload storms.
                setTimeout(() => {
                  window.location.href = '/login';
                }, 100);
              } else {
                // Already in the process of redirecting; no-op to avoid loops.
              }
            } catch (e) {
              // sessionStorage may throw in some environments; fallback to immediate redirect
              try {
                window.location.href = '/login';
              } catch (_e) {}
            }
          } else {
            // If we're already on the login page or this was the login request,
            // don't redirect — let the login UI display the error to the user.
            // Also clear tokens in case they're present.
            try { localStorage.removeItem('guestSessionToken'); } catch (e) {}
          }
        }
      }
    } catch (e) {
      // ignore
    }
    return Promise.reject(error);
  }
);

// API interfaces

export const getInbox = async () => {
  return axiosInstance.get('/messages/inbox');
};

// Verification API for admin actions
export const verificationAPI = {
  // Get file URL by userId and fileType (for new route)
  getFileUrlByUserType: (userId: string, fileType: string) => `${API_URL.replace(/\/$/, '')}/verification/file/${userId}/${fileType}`,
  getRequests: async () => axiosInstance.get('/verification/admin/requests').then(res => res.data),
  verifyUser: async (userId: string, verified: boolean) => axiosInstance.post(`/verification/admin/verify-user/${userId}`, { verified }).then(res => res.data),
  // Function to get file URL with proper authentication headers (for img src)
  getFileUrl: (fileId: string) => `${API_URL.replace(/\/$/, '')}/verification/file/${fileId}`,
  // Extract filename from Content-Disposition header
  getFilenameFromHeader: (contentDisposition: string): string => {
    if (!contentDisposition) return 'file';
    const matches = contentDisposition.match(/filename="([^"]+)"|filename=([^;]+)/);
    return matches ? (matches[1] || matches[2]).trim() : 'file';
  },
  // Download file with proper auth headers and correct filename
  downloadFile: async (fileId: string, originalFilename?: string) => {
    try {
      const response = await axiosInstance.get(`/verification/file/${fileId}`, {
        responseType: 'blob'
      });
      // Extract filename from Content-Disposition header or use provided filename
      const contentDisposition = response.headers['content-disposition'] || '';
      let filename = verificationAPI.getFilenameFromHeader(contentDisposition);
      if (!filename || filename === 'file') {
        filename = originalFilename || 'file';
      }
      
      // Ensure filename has proper extension based on content type
      const contentType = response.headers['content-type'] || '';
      if (filename && !filename.includes('.')) {
        const ext = getFileExtension(filename);
        if (ext === 'unknown' && contentType) {
          // Try to infer extension from MIME type
          const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'application/pdf': 'pdf',
            'application/zip': 'zip'
          };
          const inferredExt = mimeToExt[contentType];
          if (inferredExt) filename += '.' + inferredExt;
        }
      }
      
      // Create blob URL and download
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      return { blob: response.data, filename };
    } catch (error) {
      console.error('Failed to download file:', error);
      throw error;
    }
  },
  // View file with proper auth headers - opens in new tab for viewing
  viewFile: async (fileId: string, originalFilename?: string) => {
    try {
      const response = await axiosInstance.get(`/verification/file/${fileId}`, {
        responseType: 'blob'
      });
      // Extract content type and filename
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const contentDisposition = response.headers['content-disposition'] || '';
      let filename = verificationAPI.getFilenameFromHeader(contentDisposition);
      if (!filename || filename === 'file') {
        filename = originalFilename || 'file';
      }
      
      // Create blob URL for viewing
      const url = URL.createObjectURL(response.data);
      
      // For images and PDFs, open in new tab for viewing; for other files, download
      if (contentType.startsWith('image/') || contentType === 'application/pdf') {
        window.open(url, '_blank');
      } else {
        // For other file types, trigger download instead of view
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      return { url, filename };
    } catch (error) {
      console.error('Failed to view file:', error);
      throw error;
    }
  },
  // Get file as blob for preview loading
  getFileBlob: async (fileId: string): Promise<Blob> => {
    try {
      const response = await axiosInstance.get(`/verification/file/${fileId}`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get file blob:', error);
      throw error;
    }
  },
  // Approve a verification request by request id (admin)
  approveRequest: async (requestId: string) => axiosInstance.post(`/verification/admin/requests/${requestId}/approve`).then(res => res.data),
  // Unapprove (revert) a previously approved verification request (admin)
  unapproveRequest: async (requestId: string) => axiosInstance.post(`/verification/admin/requests/${requestId}/unapprove`).then(res => res.data),
  // Reject a verification request by request id (admin)
  rejectRequest: async (requestId: string, reason?: string) => axiosInstance.post(`/verification/admin/requests/${requestId}/reject`, { reason }).then(res => res.data),
  // Resident: cancel their own verification request
  cancelRequest: async (requestId: string) => axiosInstance.delete(`/verification/requests/${requestId}`).then(res => res.data),
  // Get current user's verification requests
  getMyRequests: async () => axiosInstance.get('/verification/requests/my').then(res => res.data),
  getRequestById: async (id: string) => axiosInstance.get(`/verification/requests/${id}`).then(res => res.data),
};
interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  address: string;
  contactNumber: string;
  barangayID: string;
  fullName?: string;
  username?: string;
}

interface DocumentRequest {
  type: string; // add this for backend compatibility
  documentType: string;
  purpose: string;
  additionalDetails?: Record<string, any>;
  barangayID?: string;
}

// (Removed unused interface `InquiryRequest` to reduce lint warnings)

// API implementations
const auth = {
  login: (credentials: LoginCredentials) => 
    axiosInstance.post('/auth/login', credentials).then(response => response.data),
  register: (data: RegisterData) => 
    axiosInstance.post('/auth/register', data).then(response => response.data),
};

export const documentsAPI = {
  getMyDocuments: () => 
    axiosInstance.get('/document-requests/my-requests').then(response => response.data),
  requestDocument: (data: DocumentRequest) => 
    axiosInstance.post('/document-requests', data).then(response => response.data),
  getDocumentById: (id: string) => 
    axiosInstance.get(`/document-requests/${id}`).then(response => response.data),
  getAllDocuments: () =>
    axiosInstance.get('/document-requests/all')
      .then(response => response.data)
      .catch((err) => {
        // If unauthenticated (401) or forbidden (403), return an empty list
        // instead of throwing so pages don't log parse errors or unhandled rejections.
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          console.warn('getAllDocuments: Insufficient permissions. User must be admin or staff.', status);
          return [] as any[];
        }
        // Re-throw other errors so callers can handle them as before.
        throw err;
      }),
  getDocumentRecords: () =>
    axiosInstance.get('/document-requests/all')
      .then(response => response.data)
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          console.warn('getDocumentRecords: Insufficient permissions. User must be admin or staff.', status);
          return [] as any[];
        }
        throw err;
      }),
  updateDocumentStatus: (id: string, data: { status: string; notes?: string }) =>
    axiosInstance.patch(`/document-requests/${id}/process`, data).then(response => response.data),
  processDocument: (id: string) =>
    axiosInstance.patch(`/document-requests/${id}/process`).then(response => response.data),
  listFiles: () =>
    axiosInstance.get('/documents/list').then(response => response.data),
  deleteFile: (id: string) =>
    axiosInstance.delete(`/documents/file/${id}`).then(response => response.data),
  updateFileStatus: (id: string, data: { status: string }) =>
    axiosInstance.patch(`/documents/file/${id}/status`, data).then(response => response.data),
  getFilledDocument: (id: string) =>
    axiosInstance.get(`/document-requests/${id}/filled`).then(response => response.data),
  previewFilledDocument: (data: any) =>
    axiosInstance.post('/document-requests/preview-filled', data).then(response => response.data),
};

export const contactAPI = {
  submitInquiry: (data: any) => {
    // Support FormData (multipart) or JSON payloads
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      return axiosInstance.post('/inquiries', data, { headers: { 'Content-Type': 'multipart/form-data' } }).then(response => response.data);
    }
    return axiosInstance.post('/inquiries', data).then(response => response.data);
  },
  getMyInquiries: (username?: string, barangayID?: string) =>
    axiosInstance.get('/inquiries/my-inquiries', {
      params: username && barangayID ? { username, barangayID } : undefined
    }).then(response => response.data),
  getInquiryById: (id: string) =>
    axiosInstance.get(`/inquiries/${id}`).then(response => response.data),
  // Staff-specific endpoints
  getAllInquiries: () =>
  axiosInstance.get('/inquiries').then(response => response.data),
  respondToInquiry: (id: string, data: { response: string }) =>
    axiosInstance.post(`/inquiries/${id}/responses`, data).then(response => response.data),
  // Mark an inquiry as resolved (admin/staff)
  resolveInquiry: (id: string) =>
    axiosInstance.patch(`/inquiries/${id}`, { status: 'resolved' }).then(response => response.data),
  // Check availability for proposed scheduled dates (server may implement this endpoint).
  // Returns availability details or `null` if the endpoint is not available (404).
  checkAvailability: async (id: string, scheduledDates: ScheduledAppointment[]) => {
    try {
      // Server exposes POST /inquiries/:id/check-availability
      const resp = await axiosInstance.post(`/inquiries/${id}/check-availability`, { scheduledDates });
      return resp.data;
    } catch (err: any) {
      // If server doesn't provide an availability endpoint, return null so callers
      // can fallback to optimistic scheduling or rely on server-side 409 handling.
      if (err && err.response && err.response.status === 404) return null;
      throw err;
    }
  },
  // Schedule appointments for an inquiry. This centralizes the POST payload
  // used by various UI components and returns server response data.
  scheduleInquiry: async (id: string, scheduledDates: ScheduledAppointment[]) => {
    const payload = { scheduledDates, status: 'scheduled' };
    const resp = await axiosInstance.post(`/inquiries/${id}`, payload);
    return resp.data as { success?: boolean; conflicts?: ConflictItem[] } | any;
  },
  // Public announcements
  getAnnouncements: () =>
    axiosInstance.get('/announcements').then(response => response.data),
  // Public events
  getEvents: () =>
    axiosInstance.get('/events').then(response => response.data),
  getAnnouncementById: (id: string) =>
    axiosInstance.get(`/announcements/${id}`).then(response => response.data),
};

// Requests API (generic requests collection)
export const requestsAPI = {
  // Get all requests (admin/staff)
  getAllRequests: async () => axiosInstance.get('/requests').then(response => response.data),
  // Get a single request by id
  getRequestById: async (id: string) => axiosInstance.get(`/requests/${id}`).then(response => response.data),
  // Get staff access requests only (client-side filter)
  getStaffAccessRequests: async () => {
    const all = await axiosInstance.get('/requests').then(response => response.data);
    return Array.isArray(all)
      ? all.filter((r: any) => (r.type || '').toString().toLowerCase() === 'staff_access' && (r.status || '').toString().toLowerCase() === 'pending')
      : [];
  }
  ,
  // Approve a request by id (admin)
  approveRequest: async (id: string) => {
    const response = await axiosInstance.post(`/requests/${id}/approve`);
    return response.data;
  }
};

// Admin API
export const adminAPI: AdminAPI = {
  createUser: async (userData: any): Promise<void> => {
    try {
      const response = await axiosInstance.post('/admin/users', userData);
      if (response.data) {
        await localDB.saveUser(response.data);
        try {
          // Notify listeners that a user profile was created/updated
          const ev = new CustomEvent('userProfileUpdated', { detail: response.data });
          window.dispatchEvent(ev);
        } catch (err) {
          // ignore
        }
      }
    } catch (error) {
      if (!navigator.onLine) {
        await syncService.performOperation('create', 'users', userData);
      }
      throw error;
    }
  },

  updateUser: async (userId: string, userData: any): Promise<void> => {
    try {
      const response = await axiosInstance.put(`/admin/users/${userId}`, userData);
      if (response.data) {
        await localDB.saveUser(response.data);
        try {
          // Notify any listeners (e.g., AuthContext) that a user profile has updated
          const ev = new CustomEvent('userProfileUpdated', { detail: response.data });
          window.dispatchEvent(ev);
        } catch (err) {
          // ignore
        }
      }
    } catch (error) {
      if (!navigator.onLine) {
        await syncService.performOperation('update', 'users', { ...userData, _id: userId });
      }
      throw error;
    }
  },
  // Demote a staff user back to resident
  demoteUser: async (userId: string) => {
    try {
      const response = await axiosInstance.put(`/admin/users/${userId}`, { role: 'resident' });
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        // queue for sync if offline
        await syncService.performOperation('update', 'users', { _id: userId, role: 'resident' });
        return;
      }
      throw error;
    }
  },
  // System Settings
  getSystemSettings: async (): Promise<SystemSettings> => {
    try {
      // Try admin-only settings first
      const response = await axiosInstance.get('/admin/settings');
      return response.data;
    } catch (error) {
      // If offline, return cached settings
      if (!navigator.onLine) {
        const settings = await localDB.getSettings();
        if (settings) return settings;
      }
      // If the dev proxy isn't forwarding (requests hit :3000 and return 404),
      // try fallbacks in order: /settings (non-admin), then admin settings,
      // then absolute /settings, and finally /settings/public if enabled on server.
      try {
        // try non-admin path on same base (/api/settings)
        const resp = await axiosInstance.get('/settings');
        return resp.data;
      } catch (e1) {
        try {
          // attempt admin settings again via configured API base
          const resp2 = await axiosInstance.get('/admin/settings');
          return resp2.data;
        } catch (e2) {
          try {
            const resp3 = await axiosInstance.get('/settings');
            return resp3.data;
          } catch (e3) {
            try {
              // try optional public endpoint if server enabled DEBUG_PUBLIC_SETTINGS
              const resp4 = await axiosInstance.get('/settings/public');
              return resp4.data;
            } catch (e4) {
              // As a last resort, return cached settings or a minimal default so UI does not crash
              try {
                const cached = await localDB.getSettings();
                if (cached) return cached;
              } catch (dbErr) {
                // ignore
              }
              console.warn('getSystemSettings: all fallbacks failed; returning empty defaults. Original error:', error);
              // Return a minimal default settings object to keep UI functional
              const defaults: any = {
                siteName: 'Barangay Information System',
                barangayName: '',
                barangayAddress: '',
                contactEmail: '',
                contactPhone: '',
                systemNotice: '',
                smtp: { passwordSet: false },
              };
              return defaults as SystemSettings;
            }
          }
        }
      }
    }
  },

  updateSystemSettings: async (settings: SystemSettings): Promise<void> => {
    // Helper: recursively remove all _id fields from object
    const removeAllIds = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map(removeAllIds);
      }
      const cleaned = { ...obj };
      delete (cleaned as any)._id;
      for (const key in cleaned) {
        if (cleaned[key] && typeof cleaned[key] === 'object') {
          cleaned[key] = removeAllIds(cleaned[key]);
        }
      }
      return cleaned;
    };

    try {
      // Deep clean: remove all _id from entire settings object and nested properties
      const cleanSettings = removeAllIds(settings);
      
      const response = await axiosInstance.patch('/settings', cleanSettings);
      await localDB.saveSettings(cleanSettings);
      return response.data;
    } catch (error) {
      // Log full error details for debugging
      console.error('[updateSystemSettings] PATCH error:', {
        status: (error as any)?.response?.status,
        statusText: (error as any)?.response?.statusText,
        errorData: (error as any)?.response?.data,
        message: (error as any)?.message,
      });
      
      // If offline, queue for sync and return
      if (!navigator.onLine) {
        await syncService.performOperation('update', 'settings', settings);
        return;
      }
      // If the dev proxy isn't forwarding (requests hit :3000 and return 404),
      // try a direct request to the backend API base as a fallback.
      try {
        // Attempt direct PATCH using configured API base
        const cleanSettings = removeAllIds(settings);
        
        const resp = await axiosInstance.patch('/settings', cleanSettings, { withCredentials: true });
        // persist locally as well
        try { await localDB.saveSettings(cleanSettings); } catch (e) {}
        return resp.data;
      } catch (fall) {
        // rethrow original error so callers receive the initial failure context
        throw error;
      }
    }
  },

  // Send test SMTP email - accepts either full emailConfig or testEmail + optional config
  // Sends to /email/test endpoint which validates provider-specific required fields
  testSmtp: async (testEmail: string, emailConfig?: any) => {
    // If emailConfig provided, use new endpoint with full payload
    if (emailConfig) {
      const payload = {
        testEmail,
        emailConfig: {
          provider: emailConfig.provider,
          enabled: emailConfig.enabled,
          fromName: emailConfig.fromName,
          fromEmail: emailConfig.fromEmail,
          // Custom SMTP fields
          host: emailConfig.host,
          port: emailConfig.port,
          user: emailConfig.user,
          password: emailConfig.password,
          secure: emailConfig.secure,
          // Gmail fields
          gmailAddress: emailConfig.gmailAddress,
          gmailAppPassword: emailConfig.gmailAppPassword,
          // SendGrid fields
          sendgridApiKey: emailConfig.sendgridApiKey,
          // AWS SES fields
          awsAccessKeyId: emailConfig.awsAccessKeyId,
          awsSecretAccessKey: emailConfig.awsSecretAccessKey,
          awsRegion: emailConfig.awsRegion,
        }
      };
      const response = await axiosInstance.post('/admin/settings/email/test', payload);
      return response.data;
    }
    
    // Fallback to old endpoint with just testEmail (uses database settings)
    const response = await axiosInstance.post('/admin/settings/test-smtp', { to: testEmail });
    return response.data;
  },

  // User Management
  getUsers: async (): Promise<User[]> => {
    try {
  const response = await axiosInstance.get('/auth/users');
      const users = response.data;
      // Cache users locally
      for (const user of users) {
        await localDB.saveUser(user);
      }
      return users;
    } catch (error) {
      if (!navigator.onLine) {
        // Return cached users if offline
        return localDB.getAllUsers();
      }
      throw error;
    }
  },

  updateUserStatus: async (userId: string, status: string): Promise<void> => {
    try {
      const response = await axiosInstance.put(`/admin/users/${userId}/status`, { status });
      const user = await localDB.getUser(userId);
      if (user) {
        user.status = status;
        await localDB.saveUser(user);
        try {
          // Notify listeners that a user's status has changed
          const ev = new CustomEvent('userProfileUpdated', { detail: user });
          window.dispatchEvent(ev);
        } catch (err) {
          // ignore
        }
      }
      return response.data;
    } catch (error) {
      if (!navigator.onLine) {
        // Update locally and queue for sync
        const user = await localDB.getUser(userId);
        if (user) {
          user.status = status;
          await syncService.performOperation('update', 'users', user);
        }
        return;
      }
      throw error;
    }
  },

  deleteUser: async (userId: string): Promise<void> => {
    try {
      await axiosInstance.delete(`/admin/users/${userId}`);
      await localDB.deleteUser(userId);
      try {
        // Notify listeners that a user was deleted; include id so listeners can react
        const ev = new CustomEvent('userProfileUpdated', { detail: { _id: userId, deleted: true } });
        window.dispatchEvent(ev);
      } catch (err) {
        // ignore
      }
    } catch (error) {
      if (!navigator.onLine) {
        // Delete locally and queue for sync
        await syncService.performOperation('delete', 'users', { _id: userId });
        return;
      }
      throw error;
    }
  },

  // Activity Logs
  getActivityLogs: (filters: { startDate?: string; endDate?: string; module?: string; userId?: string }): Promise<ActivityLog[]> =>
    axiosInstance.get('/admin/logs', { params: filters }).then(response => response.data),

  // Statistics
  getSystemStatistics: (): Promise<SystemStatistics> =>
    axiosInstance.get('/admin/statistics').then(response => response.data),

  // Staff Applicants
  getStaffApplicants: async (): Promise<{ count: number; applicants: any[] }> => {
    const response = await axiosInstance.get('/admin/staff-applications');
    return response.data;
  },
  // Get user with resident info (admin)
  getUserWithResident: async (userId: string) => {
    const response = await axiosInstance.get(`/admin/users/${userId}/with-resident`);
    return response.data;
  },
  // Admin: lookup resident by barangayID
  getResidentByBarangayID: async (barangayID: string) => {
    const response = await axiosInstance.get(`/admin/resident/${encodeURIComponent(barangayID)}`);
    return response.data;
  },
  // Admin: get resident by id
  getResident: async (residentId: string) => {
    const response = await axiosInstance.get(`/admin/resident/id/${residentId}`);
    return response.data;
  },
  // Admin: update resident record
  updateResident: async (residentId: string, data: any) => {
    const response = await axiosInstance.put(`/admin/resident/${residentId}`, data);
    return response.data;
  },
  // Admin: upload resident avatar (multipart/form-data)
  uploadResidentAvatar: async (residentId: string, file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    const response = await axiosInstance.post(`/admin/resident/${residentId}/avatar`, form, {
      headers: { 'Content-Type': undefined }
    });
    return response.data;
  },
  // Barangay Officials endpoints
  getOfficials: async () => {
    try {
      const response = await axiosInstance.get('/admin/officials');
      return response.data;
    } catch (error) {
      // If proxies/backends aren't responding or return 404, try a public backend URL
      // This attempts the absolute API base (REACT_APP_API_URL or localhost fallback)
      // and purposely omits credentials so public endpoints aren't blocked by auth/proxy.
      // If that also fails, return an empty array so UI remains functional.
      console.warn('getOfficials: primary request failed; attempting public backend fallback. Error:', error);
      try {
        const resp2 = await axiosPublic.get('/officials');
        return Array.isArray(resp2.data) ? resp2.data : [];
      } catch (pfall) {
        return [];
      }
    }
  },
  createOfficial: async (data: any) => {
    try {
      const response = await axiosInstance.post('/admin/officials', data);
      return response.data;
    } catch (error) {
      // Creating an official is an admin operation and should fail loudly if
      // the authenticated request does not succeed. Rethrow the original
      // error so callers can handle/show the proper message.
      throw error;
    }
  },
  updateOfficial: async (id: string, data: any) => {
    try {
      const response = await axiosInstance.put(`/admin/officials/${id}`, data);
      return response.data;
    } catch (error) {
      // If offline, queue for sync
      if (!navigator.onLine) {
        await syncService.performOperation('update', 'officials', { ...data, _id: id });
        return;
      }
      // Rethrow original error so callers can handle it; fallback to a
      // direct backend URL is unnecessary when runtime `API_BASE` exists.
      throw error;
    }
  },
  deleteOfficial: async (id: string) => {
    const response = await axiosInstance.delete(`/admin/officials/${id}`);
    return response.data;
  },
  reorderOfficials: async (order: string[]) => {
    const response = await axiosInstance.post('/admin/officials/reorder', { order });
    return response.data;
  },
  // Disable (optionally suspend until a date) a user
  disableUser: async (userId: string, data?: { suspendedUntil?: string }) => {
    const response = await axiosInstance.patch(`/admin/users/${userId}/disable`, data || {});
    return response.data;
  },
  // Enable a previously disabled user
  enableUser: async (userId: string) => {
    const response = await axiosInstance.patch(`/admin/users/${userId}/enable`);
    return response.data;
  },
  uploadOfficialPhoto: async (id: string, file: File) => {
    const form = new FormData();
    form.append('photo', file);
    // Try the axios instance first (should let browser set multipart boundary).
    try {
      const response = await axiosInstance.post(`/admin/officials/${id}/photo`, form, { headers: { 'Content-Type': undefined } });
      return response.data;
    } catch (err: any) {
      // If server returned a 400 possibly due to malformed multipart headers,
      // attempt a raw fetch fallback which uses the browser-native request
      // (ensures proper Content-Type/boundary). Also surface server response
      // where possible to aid debugging.
      try {
        if (err && err.response && err.response.data) {
          console.error('uploadOfficialPhoto axios error response:', err.response.data);
        } else {
          console.error('uploadOfficialPhoto axios error', err);
        }
      } catch (e) {}

      // Fallback to fetch with credentials so cookies/auth are sent
      try {
        const url = `${API_URL}/admin/officials/${id}/photo`;
        const resp = await fetch(url, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = (data && data.message) ? data.message : `Upload failed with status ${resp.status}`;
          const error = new Error(msg) as any;
          error.response = { status: resp.status, data };
          throw error;
        }
        return data;
      } catch (fetchErr) {
        throw fetchErr;
      }
    }
  },
  // Approve a staff applicant (server should expose this endpoint)
  approveStaffApplicant: async (applicantId: string) => {
    const response = await axiosInstance.post(`/admin/staff-applications/${applicantId}/approve`);
    return response.data;
  },
  // Announcements
  createAnnouncement: async (formData: FormData) => {
    const response = await axiosInstance.post('/admin/announcements', formData, {
      headers: { 'Content-Type': undefined }
    });
    return response.data;
  },
  listAdminAnnouncements: async () => {
    const response = await axiosInstance.get('/admin/announcements/list');
    return response.data;
  },
  deleteAnnouncement: async (id: string) => {
    const response = await axiosInstance.delete(`/admin/announcements/${id}`);
    return response.data;
  },
  updateAnnouncement: async (id: string, formData: FormData) => {
    const response = await axiosInstance.put(`/admin/announcements/${id}`, formData, {
      headers: { 'Content-Type': undefined }
    });
    return response.data;
  },
  
  // Analytics Methods
  getAnalyticsSummary: async (params?: { startDate?: string; endDate?: string; residentType?: string }) =>
    analyticsAPI.getSummary(params),
  
  getGenderAnalytics: async () =>
    analyticsAPI.getGenderDistribution(),
  
  getAgeAnalytics: async () =>
    analyticsAPI.getAgeDistribution(),
  
  getCivilStatusAnalytics: async () =>
    analyticsAPI.getCivilStatusDistribution(),
  
  getEducationAnalytics: async () =>
    analyticsAPI.getEducationDistribution(),
  
  getMonthlyDocumentsAnalytics: async () =>
    analyticsAPI.getMonthlyDocuments(),
  
  getAllAnalytics: async () => {
    try {
      const [summary, gender, age, civilStatus, education, monthly] = await Promise.all([
        analyticsAPI.getSummary(),
        analyticsAPI.getGenderDistribution(),
        analyticsAPI.getAgeDistribution(),
        analyticsAPI.getCivilStatusDistribution(),
        analyticsAPI.getEducationDistribution(),
        analyticsAPI.getMonthlyDocuments(),
      ]);
      return { summary, gender, age, civilStatus, education, monthly };
    } catch (error) {
      console.error('Error fetching all analytics:', error);
      throw error;
    }
  },

  // Generic HTTP methods for admin API calls
  get: async (path: string, config?: any) => {
    const response = await axiosInstance.get(path, config);
    return response;
  },
  patch: async (path: string, data?: any, config?: any) => {
    const response = await axiosInstance.patch(path, data, config);
    return response;
  },
  post: async (path: string, data?: any, config?: any) => {
    const response = await axiosInstance.post(path, data, config);
    return response;
  },
};

// Resident Personal Info API

export const authAPI = {
  ...auth,
  getUsers: async (): Promise<User[]> => {
    try {
      const response = await axiosInstance.get('/auth/users');
      return response.data;
    } catch (error) {
      // keep logging minimal and rethrow so callers can handle errors
      // ...existing error handling might expect a thrown error
      // eslint-disable-next-line no-console
      console.error('authAPI.getUsers failed', error);
      throw error;
    }
  }
};
// Analytics API
export const analyticsAPI = {
  // Get summary statistics
  getSummary: async (params?: { startDate?: string; endDate?: string; residentType?: string }) =>
    axiosInstance.get('/analytics/summary', { params }).then(res => res.data),

  // Get gender distribution
  getGenderDistribution: async () =>
    axiosInstance.get('/analytics/gender').then(res => res.data),

  // Get age buckets
  getAgeDistribution: async () =>
    axiosInstance.get('/analytics/age').then(res => res.data),

  // Get civil status
  getCivilStatusDistribution: async () =>
    axiosInstance.get('/analytics/civil-status').then(res => res.data),

  // Get education
  getEducationDistribution: async () =>
    axiosInstance.get('/analytics/education').then(res => res.data),

  // Get monthly documents
  getMonthlyDocuments: async () =>
    axiosInstance.get('/analytics/documents-monthly').then(res => res.data),

  // Get occupation distribution
  getOccupationDistribution: async () =>
    axiosInstance.get('/analytics/occupation').then(res => res.data),

  // Get nationality distribution
  getNationalityDistribution: async () =>
    axiosInstance.get('/analytics/nationality').then(res => res.data),

  // Get blood type distribution
  getBloodTypeDistribution: async () =>
    axiosInstance.get('/analytics/blood-type').then(res => res.data),

  // Get disability distribution
  getDisabilityDistribution: async () =>
    axiosInstance.get('/analytics/disability').then(res => res.data),

  // Get business type distribution
  getBusinessTypeDistribution: async () =>
    axiosInstance.get('/analytics/business-type').then(res => res.data),

  // Get business size distribution
  getBusinessSizeDistribution: async () =>
    axiosInstance.get('/analytics/business-size').then(res => res.data),

  // Get children count distribution
  getChildrenCountDistribution: async () =>
    axiosInstance.get('/analytics/children-count').then(res => res.data),

  // Get income brackets
  getIncomeBrackets: async () =>
    axiosInstance.get('/analytics/income-brackets').then(res => res.data),

  // Get monthly analytics
  getMonthlyAnalytics: async () =>
    axiosInstance.get('/analytics').then(res => res.data),
};


