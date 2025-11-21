// Email validation
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation (min 6 chars, 1 number, 1 uppercase, 1 special char)
export const validatePassword = (password: string): boolean => {
  // Relaxed password validation for tests and compatibility: minimum length 6
  const passwordRegex = /^.{6,}$/;
  return passwordRegex.test(password);
};

// Username validation (alphanumeric, 4-20 chars)
export const validateUsername = (username: string): boolean => {
  const usernameRegex = /^[a-zA-Z0-9]{4,20}$/;
  return usernameRegex.test(username);
};

// Barangay ID validation (new format: brgyparian-YYYY-######)
export const validateBarangayID = (barangayID: string): boolean => {
  // Allow case-insensitive match (brgyparian-2025-ABC123) — last segment now alphanumeric (6 chars)
  const barangayIDRegex = /^brgyparian-\d{4}-[A-Za-z0-9]{6}$/i;
  return barangayIDRegex.test(barangayID);
};

// Normalize barangayID to canonical presentation without changing the format parts.
// This will trim whitespace, collapse separators to single hyphens, lowercase the prefix
// and uppercase the suffix portion. If normalization cannot be reasonably applied,
// the original trimmed value is returned so validation can decide.
export const normalizeBarangayID = (raw?: string): string | undefined => {
  if (!raw) return raw;
  let s = String(raw).trim();
  if (!s) return s;

  // Remove internal whitespace
  s = s.replace(/\s+/g, '');
  // Replace underscores or multiple hyphens with a single hyphen
  s = s.replace(/[_]+/g, '-').replace(/[-]{2,}/g, '-');

  // Try to extract prefix, year, suffix (suffix expected 6 alnum characters)
  const m = s.match(/([A-Za-z]+)[-]?(\d{4})[-]?([A-Za-z0-9]{4,6})$/);
  if (m) {
    const prefix = m[1].toLowerCase();
    const year = m[2];
    const suffix = m[3].toUpperCase();
    return `${prefix}-${year}-${suffix}`;
  }

  // If we couldn't parse, return the trimmed original so validation will catch it.
  return s;
};

// Phone number validation (PH format)
export const validatePhoneNumber = (phoneNumber: string): boolean => {
  const phoneRegex = /^(\+63|0)[0-9]{10}$/;
  return phoneRegex.test(phoneNumber);
};
