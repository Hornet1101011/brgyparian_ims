import { useState, useEffect } from 'react';
import { axiosPublic } from '../services/api';

export interface PlaceholderValidation {
  placeholder: string;
  fieldType: 'string' | 'integer' | 'date' | 'email' | 'phone' | 'text';
  tooltip: string;
  isRequired: boolean;
  maxCharacters?: number;
  minCharacters?: number;
  pattern?: string;
  enablePastDates?: boolean;
  enableFutureDates?: boolean;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  autoFillMode?: 'none' | 'full-date' | 'day-only' | 'month-only' | 'year-only';
  autoFillValue?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export const useTemplateValidations = (templateId: string) => {
  const [validations, setValidations] = useState<Record<string, PlaceholderValidation>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;

    const fetchValidations = async () => {
      setLoading(true);
      setError(null);
      try {
        let data: any[] = [];
        // Try new /config endpoint first
        try {
          const res = await axiosPublic.get(`/documents/${templateId}/config`);
          data = res.data?.validations || [];
        } catch (err) {
          // Fall back to legacy /validations endpoint
          console.log('Config endpoint not available, trying legacy endpoint...');
          const res = await axiosPublic.get(`/documents/${templateId}/validations`);
          data = res.data?.validations || [];
        }
        const validationMap = data.reduce((acc: any, v: PlaceholderValidation) => {
          acc[v.placeholder] = v;
          return acc;
        }, {});
        setValidations(validationMap);
      } catch (err) {
        // If endpoint doesn't exist, that's okay - just use defaults
        console.log('Validations endpoint not available yet');
        setValidations({});
      }
      setLoading(false);
    };

    fetchValidations();
  }, [templateId]);

  const getValidation = (placeholder: string): PlaceholderValidation | null => {
    return validations[placeholder] || null;
  };

  const validateField = (placeholder: string, value: string | number | Date): { valid: boolean; error?: string } => {
    const validation = getValidation(placeholder);
    if (!validation) return { valid: true };

    // Check required
    if (validation.isRequired && !value) {
      return { valid: false, error: 'This field is required' };
    }

    if (!value) return { valid: true };

    // String validations
    if (validation.fieldType === 'string' || validation.fieldType === 'text') {
      const strValue = String(value);
      if (validation.minCharacters && strValue.length < validation.minCharacters) {
        return { valid: false, error: `Minimum ${validation.minCharacters} characters required` };
      }
      if (validation.maxCharacters && strValue.length > validation.maxCharacters) {
        return { valid: false, error: `Maximum ${validation.maxCharacters} characters allowed` };
      }
      if (validation.pattern) {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(strValue)) {
          return { valid: false, error: 'Invalid format' };
        }
      }
    }

    // Email validation
    if (validation.fieldType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(value))) {
        return { valid: false, error: 'Invalid email format' };
      }
    }

    // Phone validation
    if (validation.fieldType === 'phone') {
      const phoneRegex = /^\d{10,}$/;
      if (!phoneRegex.test(String(value).replace(/\D/g, ''))) {
        return { valid: false, error: 'Invalid phone number' };
      }
    }

    // Integer validation
    if (validation.fieldType === 'integer') {
      if (isNaN(Number(value))) {
        return { valid: false, error: 'Must be a number' };
      }
    }

    // Date validations
    if (validation.fieldType === 'date') {
      const dateValue = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateValue < today && !validation.enablePastDates) {
        return { valid: false, error: 'Past dates are not allowed' };
      }
      if (dateValue > today && !validation.enableFutureDates) {
        return { valid: false, error: 'Future dates are not allowed' };
      }

      if (validation.dateRangeStart) {
        const rangeStart = new Date(validation.dateRangeStart);
        if (dateValue < rangeStart) {
          return { valid: false, error: `Date must be after ${validation.dateRangeStart}` };
        }
      }

      if (validation.dateRangeEnd) {
        const rangeEnd = new Date(validation.dateRangeEnd);
        if (dateValue > rangeEnd) {
          return { valid: false, error: `Date must be before ${validation.dateRangeEnd}` };
        }
      }
    }

    return { valid: true };
  };

  const getAutoFillValue = (placeholder: string): string | null => {
    const validation = getValidation(placeholder);
    if (!validation || validation.autoFillMode === 'none') return null;

    const now = new Date();
    switch (validation.autoFillMode) {
      case 'full-date':
        return now.toISOString().split('T')[0];
      case 'day-only':
        return String(now.getDate()).padStart(2, '0');
      case 'month-only':
        return String(now.getMonth() + 1).padStart(2, '0');
      case 'year-only':
        return String(now.getFullYear());
      default:
        return null;
    }
  };

  return {
    validations,
    loading,
    error,
    getValidation,
    validateField,
    getAutoFillValue,
  };
};
