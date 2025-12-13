/**
 * React Hooks for Analytics Data Fetching
 * Provides convenient React hooks for fetching and managing analytics data
 */

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useQueries, UseQueryResult } from '@tanstack/react-query';
import type {
  PersonalInfo,
  DocumentRequest,
  NormalizedAnalyticsData,
} from '../utils/dataNormalization';
import type { FetchOptions } from '../utils/analyticsFetching';
import {
  fetchPersonalInfoRecords,
  fetchDocumentRequests,
  fetchDashboardSummary,
  computeGenderAnalytics,
  computeAgeAnalytics,
  computeOccupationAnalytics,
  computeNationalityAnalytics,
  computeBloodTypeAnalytics,
  computeDisabilityAnalytics,
  computeBusinessTypeAnalytics,
  computeBusinessSizeAnalytics,
  computeChildrenCountAnalytics,
  computeIncomeAnalytics,
  computeEducationAnalytics,
  computeCivilStatusAnalytics,
  computeReligionAnalytics,
  computeDocumentAnalytics,
  analyticsCache,
} from '../utils/analyticsFetching';

// ============================================================================
// Hooks for Individual Data Fetches
// ============================================================================

/**
 * Hook to fetch personal info records with caching
 */
export const usePersonalInfoRecords = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['personal-info-records', JSON.stringify(options)],
    queryFn: () => fetchPersonalInfoRecords(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch document requests
 */
export const useDocumentRequests = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['document-requests', JSON.stringify(options)],
    queryFn: () => fetchDocumentRequests(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// ============================================================================
// Hooks for Individual Analytics Computations
// ============================================================================

/**
 * Hook to fetch gender analytics
 */
export const useGenderAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-gender', JSON.stringify(options)],
    queryFn: () => computeGenderAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch age analytics
 */
export const useAgeAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-age', JSON.stringify(options)],
    queryFn: () => computeAgeAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch occupation analytics
 */
export const useOccupationAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-occupation', JSON.stringify(options)],
    queryFn: () => computeOccupationAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch nationality analytics
 */
export const useNationalityAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-nationality', JSON.stringify(options)],
    queryFn: () => computeNationalityAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch blood type analytics
 */
export const useBloodTypeAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-blood-type', JSON.stringify(options)],
    queryFn: () => computeBloodTypeAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch disability analytics
 */
export const useDisabilityAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-disability', JSON.stringify(options)],
    queryFn: () => computeDisabilityAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch business type analytics
 */
export const useBusinessTypeAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-business-type', JSON.stringify(options)],
    queryFn: () => computeBusinessTypeAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch business size analytics
 */
export const useBusinessSizeAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-business-size', JSON.stringify(options)],
    queryFn: () => computeBusinessSizeAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch children count analytics
 */
export const useChildrenCountAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-children-count', JSON.stringify(options)],
    queryFn: () => computeChildrenCountAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch income analytics
 */
export const useIncomeAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-income', JSON.stringify(options)],
    queryFn: () => computeIncomeAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch education analytics
 */
export const useEducationAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-education', JSON.stringify(options)],
    queryFn: () => computeEducationAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch civil status analytics
 */
export const useCivilStatusAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-civil-status', JSON.stringify(options)],
    queryFn: () => computeCivilStatusAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch religion analytics
 */
export const useReligionAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-religion', JSON.stringify(options)],
    queryFn: () => computeReligionAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to fetch document analytics
 */
export const useDocumentAnalytics = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['analytics-documents', JSON.stringify(options)],
    queryFn: () => computeDocumentAnalytics(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// ============================================================================
// Hooks for Dashboard Summary
// ============================================================================

/**
 * Hook to fetch dashboard summary
 */
export const useDashboardSummary = (options: FetchOptions = {}) => {
  return useQuery({
    queryKey: ['dashboard-summary', JSON.stringify(options)],
    queryFn: () => fetchDashboardSummary(options),
    staleTime: (options.cacheTTL || 5) * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// ============================================================================
// Composite Hooks for Multiple Analytics
// ============================================================================

/**
 * Hook to fetch multiple analytics in parallel
 */
export const useMultipleAnalytics = (
  chartIds: string[] = [
    'gender',
    'age',
    'occupation',
    'nationality',
    'blood-type',
    'disability',
    'business-type',
    'business-size',
    'children-count',
    'income-brackets',
  ],
  options: FetchOptions = {}
) => {
  const hookMap: Record<string, (opts: FetchOptions) => UseQueryResult<NormalizedAnalyticsData>> = {
    gender: useGenderAnalytics,
    age: useAgeAnalytics,
    occupation: useOccupationAnalytics,
    nationality: useNationalityAnalytics,
    'blood-type': useBloodTypeAnalytics,
    disability: useDisabilityAnalytics,
    'business-type': useBusinessTypeAnalytics,
    'business-size': useBusinessSizeAnalytics,
    'children-count': useChildrenCountAnalytics,
    'income-brackets': useIncomeAnalytics,
  };
  
  const queries = chartIds.map(chartId => {
    const hook = hookMap[chartId];
    return hook ? hook(options) : useQuery({ queryKey: [], queryFn: async () => null });
  });
  
  return {
    queries,
    data: useMemo(() => {
      const result: Record<string, NormalizedAnalyticsData> = {};
      chartIds.forEach((chartId, idx) => {
        if (queries[idx].data) {
          result[chartId] = queries[idx].data;
        }
      });
      return result;
    }, [queries]),
    isLoading: queries.some(q => q.isLoading),
    isError: queries.some(q => q.isError),
    errors: queries.filter(q => q.error).map(q => q.error),
  };
};

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to invalidate analytics cache
 */
export const useInvalidateAnalyticsCache = () => {
  return useCallback(() => {
    analyticsCache.clear();
  }, []);
};

/**
 * Hook to manage filter options
 */
export const useAnalyticsFilters = (defaultOptions: FetchOptions = {}) => {
  const [filters, setFilters] = useState<FetchOptions>(defaultOptions);
  
  const setFilter = useCallback((key: keyof FetchOptions, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  
  const clearFilters = useCallback(() => {
    setFilters(defaultOptions);
  }, [defaultOptions]);
  
  return { filters, setFilter, clearFilters };
};

/**
 * Hook to debounce fetch operations
 */
export const useDebouncedAnalyticsFilters = (
  options: FetchOptions = {},
  delayMs: number = 500
) => {
  const [debouncedOptions, setDebouncedOptions] = useState<FetchOptions>(options);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedOptions(options);
    }, delayMs);
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [options, delayMs]);
  
  return debouncedOptions;
};

/**
 * Hook for analytics filtering and search
 */
export const useAnalyticsSearch = (records: PersonalInfo[] = []) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<PersonalInfo>>({});
  
  const filteredRecords = useMemo(() => {
    let result = records;
    
    // Apply text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(record => {
        const fullName = `${record.firstName} ${record.lastName}`.toLowerCase();
        const email = String(record.email || '').toLowerCase();
        const phone = String(record.contactNumber || '').toLowerCase();
        const barangayID = String(record.barangayID || '').toLowerCase();
        
        return (
          fullName.includes(query) ||
          email.includes(query) ||
          phone.includes(query) ||
          barangayID.includes(query)
        );
      });
    }
    
    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;
      
      result = result.filter(record => {
        const recordValue = record[key as keyof PersonalInfo];
        
        if (typeof value === 'string') {
          return String(recordValue || '').toLowerCase().includes(String(value).toLowerCase());
        } else if (Array.isArray(value)) {
          return value.includes(recordValue);
        } else {
          return recordValue === value;
        }
      });
    }
    
    return result;
  }, [records, searchQuery, filters]);
  
  return {
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    filteredRecords,
  };
};

/**
 * Hook for data export functionality
 */
export const useAnalyticsExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  
  const exportAsJSON = useCallback((data: any, filename: string = 'analytics.json') => {
    setIsExporting(true);
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, []);
  
  const exportAsCSV = useCallback((data: any[], headers: string[], filename: string = 'analytics.csv') => {
    setIsExporting(true);
    try {
      const rows = data.map(item =>
        headers.map(header => `"${item[header] || ''}"`.replace(/"/g, '""')).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, []);
  
  return { exportAsJSON, exportAsCSV, isExporting };
};
