/**
 * Analytics Data Fetching Utilities
 * Provides efficient data fetching, caching, and transformation for analytics
 */

import { axiosInstance, axiosPublic } from '../services/api';
import type {
  PersonalInfo,
  DocumentRequest,
  AnalyticsDataPoint,
  NormalizedAnalyticsData,
} from './dataNormalization';
import {
  normalizePersonalInfo,
  normalizePersonalInfoBatch,
  normalizeDocumentRequest,
  normalizeDocumentRequestBatch,
  aggregateByField,
  aggregateByAgeGroup,
  aggregateByIncomeBracket,
  aggregateByEmployeeCount,
  normalizeSex,
  normalizeCivilStatus,
  normalizeBloodType,
  normalizeDisabilityStatus,
  normalizeOccupation,
  normalizeNationality,
  normalizeEducation,
  normalizeBusinessType,
  normalizeReligion,
  assessDataQuality,
  classifyDataQuality,
} from './dataNormalization';

// ============================================================================
// Cache Management
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  
  set<T>(key: string, data: T, ttlMinutes: number = 5): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000,
    });
  }
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
}

export const analyticsCache = new DataCache();

// ============================================================================
// Fetch Utilities
// ============================================================================

export interface FetchOptions {
  startDate?: string;
  endDate?: string;
  barangayID?: string;
  residentType?: string;
  useCache?: boolean;
  cacheTTL?: number;
}

/**
 * Fetch personal info records with optional filtering
 */
export const fetchPersonalInfoRecords = async (
  options: FetchOptions = {}
): Promise<PersonalInfo[]> => {
  const cacheKey = `personal-info-${JSON.stringify(options)}`;
  
  if (options.useCache !== false) {
    const cached = analyticsCache.get<PersonalInfo[]>(cacheKey);
    if (cached) return cached;
  }
  
  try {
    const response = await axiosInstance.get('/analytics/personal-info', {
      params: {
        startDate: options.startDate,
        endDate: options.endDate,
        barangayID: options.barangayID,
        residentType: options.residentType,
      },
    });
    
    const rawData = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data)
        ? response.data
        : [];
    
    const normalized = normalizePersonalInfoBatch(rawData);
    
    if (options.useCache !== false) {
      analyticsCache.set(cacheKey, normalized, options.cacheTTL);
    }

    return normalized as PersonalInfo[];
  } catch (error) {
    console.error('Failed to fetch personal info records:', error);
    return [];
  }
};

/**
 * Fetch document request records
 */
export const fetchDocumentRequests = async (
  options: FetchOptions = {}
): Promise<DocumentRequest[]> => {
  const cacheKey = `document-requests-${JSON.stringify(options)}`;
  
  if (options.useCache !== false) {
    const cached = analyticsCache.get<DocumentRequest[]>(cacheKey);
    if (cached) return cached;
  }
  
  try {
    const response = await axiosInstance.get('/analytics/document-requests', {
      params: {
        startDate: options.startDate,
        endDate: options.endDate,
        barangayID: options.barangayID,
      },
    });
    
    const rawData = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data)
        ? response.data
        : [];
    
    const normalized = normalizeDocumentRequestBatch(rawData);
    
    if (options.useCache !== false) {
      analyticsCache.set(cacheKey, normalized, options.cacheTTL);
    }

    return normalized as DocumentRequest[];
  } catch (error) {
    console.error('Failed to fetch document requests:', error);
    return [];
  }
};

// ============================================================================
// Analytics Computation Functions
// ============================================================================

/**
 * Compute gender/sex distribution analytics
 */
export const computeGenderAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'sex', normalizeSex);
  
  const quality = assessDataQuality(records, 'sex');
  
  return {
    chartId: 'gender',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute age group distribution analytics
 */
export const computeAgeAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const ages = records.map(r => r.age).filter(Boolean);
  const data = aggregateByAgeGroup(ages);
  
  const quality = assessDataQuality(records, 'age');
  
  return {
    chartId: 'age',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute occupation distribution analytics
 */
export const computeOccupationAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'occupation', normalizeOccupation);
  
  const quality = assessDataQuality(records, 'occupation');
  
  return {
    chartId: 'occupation',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute nationality distribution analytics
 */
export const computeNationalityAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'nationality', normalizeNationality);
  
  const quality = assessDataQuality(records, 'nationality');
  
  return {
    chartId: 'nationality',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute blood type distribution analytics
 */
export const computeBloodTypeAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'bloodType', normalizeBloodType);
  
  const quality = assessDataQuality(records, 'bloodType');
  
  return {
    chartId: 'blood-type',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute disability status distribution analytics
 */
export const computeDisabilityAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'disabilityStatus', normalizeDisabilityStatus);
  
  const quality = assessDataQuality(records, 'disabilityStatus');
  
  return {
    chartId: 'disability',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute business type distribution analytics
 */
export const computeBusinessTypeAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const businessRecords = records.filter(r => r.businessName);
  const data = aggregateByField(businessRecords, 'businessType', normalizeBusinessType);
  
  const quality = businessRecords.length > 0
    ? assessDataQuality(businessRecords, 'businessType')
    : 0;
  
  return {
    chartId: 'business-type',
    data,
    metadata: {
      total: businessRecords.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute business size (by employee count) distribution
 */
export const computeBusinessSizeAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const businessRecords = records.filter(r => r.businessName);
  const employeeCounts = businessRecords.map(r => r.numberOfEmployees).filter(Boolean);
  const data = aggregateByEmployeeCount(employeeCounts);
  
  const quality = businessRecords.length > 0
    ? assessDataQuality(businessRecords, 'numberOfEmployees')
    : 0;
  
  return {
    chartId: 'business-size',
    data,
    metadata: {
      total: businessRecords.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute children count distribution
 */
export const computeChildrenCountAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  
  const childrenCounts: Record<string, number> = {
    'No Children': 0,
    '1-2 Children': 0,
    '3-4 Children': 0,
    '5+ Children': 0,
  };
  
  records.forEach(r => {
    const count = r.numberOfChildren;
    if (count === undefined || count === null) return;
    
    if (count === 0) childrenCounts['No Children']++;
    else if (count <= 2) childrenCounts['1-2 Children']++;
    else if (count <= 4) childrenCounts['3-4 Children']++;
    else childrenCounts['5+ Children']++;
  });
  
  const total = Object.values(childrenCounts).reduce((a, b) => a + b, 0);
  const data = Object.entries(childrenCounts)
    .filter(([_, count]) => count > 0)
    .map(([range, count]) => ({
      type: range,
      value: count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  
  const quality = assessDataQuality(records, 'numberOfChildren');
  
  return {
    chartId: 'children-count',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute income brackets distribution
 */
export const computeIncomeAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const incomes = records
    .map(r => r.annualGrossIncome)
    .filter((income): income is number => income !== null && income !== undefined);
  const data = aggregateByIncomeBracket(incomes);
  
  const businessRecords = records.filter(r => r.businessName);
  const quality = businessRecords.length > 0
    ? assessDataQuality(businessRecords, 'annualGrossIncome')
    : 0;
  
  return {
    chartId: 'income-brackets',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute education distribution analytics
 */
export const computeEducationAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'educationalAttainment', normalizeEducation);
  
  const quality = assessDataQuality(records, 'educationalAttainment');
  
  return {
    chartId: 'education',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute civil status distribution analytics
 */
export const computeCivilStatusAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'civilStatus', normalizeCivilStatus);
  
  const quality = assessDataQuality(records, 'civilStatus');
  
  return {
    chartId: 'civil-status',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute religion distribution analytics
 */
export const computeReligionAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchPersonalInfoRecords(options);
  const data = aggregateByField(records, 'religion', normalizeReligion);
  
  const quality = assessDataQuality(records, 'religion');
  
  return {
    chartId: 'religion',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: classifyDataQuality(quality),
    },
  };
};

/**
 * Compute document request analytics
 */
export const computeDocumentAnalytics = async (
  options: FetchOptions = {}
): Promise<NormalizedAnalyticsData> => {
  const records = await fetchDocumentRequests(options);
  const data = aggregateByField(records, 'type');
  
  return {
    chartId: 'documents',
    data,
    metadata: {
      total: records.length,
      count: data.length,
      categories: data.length,
      lastUpdated: new Date().toISOString(),
      dataQuality: 'high',
    },
  };
};

// ============================================================================
// Batch Computation
// ============================================================================

/**
 * Compute all analytics in parallel
 */
export const computeAllAnalytics = async (
  options: FetchOptions = {}
): Promise<Record<string, NormalizedAnalyticsData>> => {
  try {
    const results = await Promise.all([
      computeGenderAnalytics(options),
      computeAgeAnalytics(options),
      computeOccupationAnalytics(options),
      computeNationalityAnalytics(options),
      computeBloodTypeAnalytics(options),
      computeDisabilityAnalytics(options),
      computeBusinessTypeAnalytics(options),
      computeBusinessSizeAnalytics(options),
      computeChildrenCountAnalytics(options),
      computeIncomeAnalytics(options),
      computeEducationAnalytics(options),
      computeCivilStatusAnalytics(options),
      computeReligionAnalytics(options),
      computeDocumentAnalytics(options),
    ]);
    
    const analytics: Record<string, NormalizedAnalyticsData> = {};
    results.forEach(result => {
      analytics[result.chartId] = result;
    });
    
    return analytics;
  } catch (error) {
    console.error('Failed to compute all analytics:', error);
    return {};
  }
};

// ============================================================================
// Specific Analytics Queries
// ============================================================================

/**
 * Get summary dashboard statistics
 */
/**
 * Fetch total processed documents from the processed_documents collection
 */
const fetchProcessedDocumentsCount = async (): Promise<number> => {
  try {
    const response = await axiosInstance.get('/analytics/processed-documents-count');
    return response.data?.count || 0;
  } catch (error) {
    console.error('Failed to fetch processed documents count:', error);
    return 0;
  }
};

/**
 * Fetch pending document requests from the document_requests collection
 */
const fetchPendingRequestsCount = async (): Promise<number> => {
  try {
    const response = await axiosInstance.get('/analytics/pending-requests-count');
    return response.data?.count || 0;
  } catch (error) {
    console.error('Failed to fetch pending requests count:', error);
    return 0;
  }
};

export const fetchDashboardSummary = async (
  options: FetchOptions = {}
): Promise<{
  totalResidents: number;
  totalDocuments: number;
  templatesCount: number;
  processedDocuments: number;
  pendingRequests: number;
  documentRequestsCount: number;
  inquiriesCount: number;
  verificationRequestsCount: number;
  staffRequestsCount: number;
  maleCount: number;
  femaleCount: number;
  avgAge: number;
  businessOwners: number;
  dataQuality: number;
}> => {
  const records = await fetchPersonalInfoRecords(options);
  
  // Fetch document counts from the total-documents-count endpoint
  let totalDocuments = 0;
  let templatesCount = 0;
  let processedDocuments = 0;
  try {
    const response = await axiosInstance.get('/analytics/total-documents-count');
    totalDocuments = response.data?.totalCount || 0;
    templatesCount = response.data?.documentsCount || 0;
    processedDocuments = response.data?.processedCount || 0;
  } catch (error) {
    console.error('Failed to fetch document counts:', error);
    totalDocuments = await fetchProcessedDocumentsCount();
  }

  // Fetch pending requests breakdown
  let pendingRequests = 0;
  let documentRequestsCount = 0;
  let inquiriesCount = 0;
  let verificationRequestsCount = 0;
  let staffRequestsCount = 0;
  try {
    const response = await axiosInstance.get('/analytics/pending-requests-breakdown');
    pendingRequests = response.data?.totalCount || 0;
    documentRequestsCount = response.data?.documentRequestsCount || 0;
    inquiriesCount = response.data?.inquiriesCount || 0;
    verificationRequestsCount = response.data?.verificationRequestsCount || 0;
    staffRequestsCount = response.data?.staffRequestsCount || 0;
  } catch (error) {
    console.error('Failed to fetch pending requests breakdown:', error);
    pendingRequests = await fetchPendingRequestsCount();
  }
  
  if (records.length === 0) {
    return {
      totalResidents: 0,
      totalDocuments,
      templatesCount,
      processedDocuments,
      pendingRequests,
      documentRequestsCount,
      inquiriesCount,
      verificationRequestsCount,
      staffRequestsCount,
      maleCount: 0,
      femaleCount: 0,
      avgAge: 0,
      businessOwners: 0,
      dataQuality: 0,
    };
  }
  
  const maleCount = records.filter(r => r.sex === 'Male').length;
  const femaleCount = records.filter(r => r.sex === 'Female').length;
  const ages = records
    .map(r => r.age)
    .filter((age): age is number => age !== null && age !== undefined);
  const avgAge = ages.length > 0
    ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
    : 0;
  const businessOwners = records.filter(r => r.businessName).length;
  
  const quality =
    (assessDataQuality(records, 'firstName') +
      assessDataQuality(records, 'email') +
      assessDataQuality(records, 'contactNumber') +
      assessDataQuality(records, 'occupation')) /
    4;
  
  return {
    totalResidents: records.length,
    totalDocuments,
    templatesCount,
    processedDocuments,
    pendingRequests,
    documentRequestsCount,
    inquiriesCount,
    verificationRequestsCount,
    staffRequestsCount,
    maleCount,
    femaleCount,
    avgAge,
    businessOwners,
    dataQuality: Math.round(quality),
  };
};

/**
 * Export analytics data as CSV
 */
export const exportAnalyticsAsCSV = (
  data: NormalizedAnalyticsData,
  filename: string = 'analytics.csv'
): void => {
  const headers = ['Category', 'Count', 'Percentage'];
  const rows = data.data.map(item => [
    item.type,
    item.value,
    item.percentage || 'N/A',
  ]);
  
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Clear all cached analytics data
 */
export const clearAnalyticsCache = (): void => {
  analyticsCache.clear();
};
