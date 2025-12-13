/**
 * Data Normalization Utilities for Analytics
 * Provides comprehensive normalization, validation, and transformation functions
 * for resident data, personal information, and document requests
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface PersonalInfo {
  barangayID?: string;
  // Personal Information
  firstName: string;
  lastName: string;
  middleName?: string;
  age?: number;
  birthDate?: string;
  dateOfResidency?: string;
  sex?: string;
  civilStatus?: string;
  nationality?: string;
  placeOfBirth?: string;
  religion?: string;
  
  // Contact Information
  email?: string;
  contactNumber?: string;
  landlineNumber?: string;
  facebook?: string;
  emergencyContact?: string;
  
  // Identity Documents
  passportNumber?: string;
  governmentIdNumber?: string;
  
  // Health Information
  bloodType?: string;
  disabilityStatus?: string;
  
  // Occupation Information
  occupation?: string;
  educationalAttainment?: string;
  
  // Family Information
  numberOfChildren?: number;
  childrenNames?: string;
  childrenAges?: string;
  spouseName?: string;
  spouseAge?: number;
  spouseBirthDate?: string;
  spouseMiddleName?: string;
  spouseLastName?: string;
  spouseNationality?: string;
  spouseOccupation?: string;
  spouseStatus?: string;
  spouseContactNumber?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  
  // Family (Parents)
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

export interface DocumentRequest {
  _id: string;
  type: string;
  status: string;
  dateRequested: string;
  notes?: string;
  userId?: string;
  completedDate?: string;
  requestedBy?: string;
}

export interface AnalyticsDataPoint {
  type: string;
  value: number;
  percentage?: number;
  label?: string;
}

export interface NormalizedAnalyticsData {
  chartId: string;
  data: AnalyticsDataPoint[];
  metadata: {
    total: number;
    count: number;
    categories: number;
    lastUpdated: string;
    dataQuality: 'high' | 'medium' | 'low';
  };
}

// ============================================================================
// Normalization Utilities
// ============================================================================

/**
 * Normalize sex/gender field to standard values
 */
export const normalizeSex = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  // Male variations
  if (/^m|^male|^boy|^man/.test(str)) return 'Male';
  
  // Female variations
  if (/^f|^female|^girl|^woman/.test(str)) return 'Female';
  
  // Non-binary/Other
  if (/other|non.binary|lgbtq|prefer/.test(str)) return 'Other';
  
  return null;
};

/**
 * Normalize civil status field
 */
export const normalizeCivilStatus = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  if (/^single|^unmarried|^never/.test(str)) return 'Single';
  if (/^married|^spouse/.test(str)) return 'Married';
  if (/^divorced|^annul/.test(str)) return 'Divorced';
  if (/^widow|^widower/.test(str)) return 'Widow/Widower';
  if (/^cohabit|^live.in/.test(str)) return 'Cohabiting';
  
  return null;
};

/**
 * Normalize blood type field
 */
export const normalizeBloodType = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toUpperCase().replace(/[^ABO+-]/g, '');
  
  const validTypes = ['O', 'A', 'B', 'AB', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
  if (validTypes.includes(str)) return str;
  
  return null;
};

/**
 * Normalize disability status
 */
export const normalizeDisabilityStatus = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  if (/^no|^none|^not|^negative/.test(str)) return 'None';
  if (/^yes|^physical|^mental|^visual|^hearing|^learning|^cognitive/.test(str)) {
    if (/^yes/.test(str)) return 'Yes, with disability';
    return `Yes, ${str}`;
  }
  
  return null;
};

/**
 * Normalize educational attainment
 */
export const normalizeEducation = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  const educationMap: Record<string, string> = {
    'no': 'No Formal Education',
    'elementary': 'Elementary',
    'primary': 'Elementary',
    'middle': 'Middle School',
    'secondary': 'High School',
    'high': 'High School',
    'vocational': 'Vocational',
    'technical': 'Technical',
    'associate': "Associate's Degree",
    'bachelor': "Bachelor's Degree",
    'master': "Master's Degree",
    'doctorate': 'Doctorate',
    'phd': 'Doctorate',
    'post': 'Postgraduate',
  };
  
  for (const [key, value] of Object.entries(educationMap)) {
    if (str.includes(key)) return value;
  }
  
  return null;
};

/**
 * Normalize occupation field
 */
export const normalizeOccupation = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim();
  const lower = str.toLowerCase();
  
  // Remove common suffixes/patterns
  const cleaned = lower
    .replace(/\s*(part.?time|full.?time|contract|permanent)\s*$/i, '')
    .replace(/^(a |the |my )/, '')
    .trim();
  
  if (!cleaned || cleaned.length < 2) return null;
  
  // Capitalize first letter of each word
  return cleaned.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Normalize nationality field
 */
export const normalizeNationality = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim();
  
  // Common country mappings
  const countryMap: Record<string, string> = {
    'ph': 'Filipino',
    'philippines': 'Filipino',
    'phil': 'Filipino',
    'phl': 'Filipino',
    'usa': 'American',
    'us': 'American',
    'america': 'American',
    'china': 'Chinese',
    'cn': 'Chinese',
    'japan': 'Japanese',
    'jp': 'Japanese',
    'india': 'Indian',
    'in': 'Indian',
    'korea': 'Korean',
    'kr': 'Korean',
    'thai': 'Thai',
    'th': 'Thai',
    'vietnam': 'Vietnamese',
    'vn': 'Vietnamese',
    'myanmar': 'Burmese',
    'cambodia': 'Cambodian',
    'laos': 'Laotian',
    'malaysia': 'Malaysian',
    'singapore': 'Singaporean',
    'indonesia': 'Indonesian',
    'uk': 'British',
    'united kingdom': 'British',
    'france': 'French',
    'germany': 'German',
    'spain': 'Spanish',
    'italy': 'Italian',
    'canada': 'Canadian',
    'australia': 'Australian',
  };
  
  const lower = str.toLowerCase();
  const mapped = countryMap[lower];
  if (mapped) return mapped;
  
  // If not found, capitalize and return original
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Normalize business type
 */
export const normalizeBusinessType = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  const typeMap: Record<string, string> = {
    'sole': 'Sole Proprietorship',
    'partnership': 'Partnership',
    'corporation': 'Corporation',
    'corp': 'Corporation',
    'coop': 'Cooperative',
    'cooperative': 'Cooperative',
    'llc': 'LLC',
    'limited': 'Limited',
    'non.profit': 'Non-Profit',
    'npo': 'Non-Profit',
    'ngo': 'NGO',
    'government': 'Government',
  };
  
  for (const [key, value] of Object.entries(typeMap)) {
    if (str.includes(key)) return value;
  }
  
  return 'Other';
};

/**
 * Normalize religion field
 */
export const normalizeReligion = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  if (/^cath|^roman|^rc/.test(str)) return 'Roman Catholic';
  if (/^protestant|^evan|^baptist|^method|^pent/.test(str)) return 'Protestant';
  if (/^muslim|^islam|^miranao/.test(str)) return 'Muslim';
  if (/^buddhist|^buddha/.test(str)) return 'Buddhist';
  if (/^hindu|^hindus/.test(str)) return 'Hindu';
  if (/^jew|^jewish/.test(str)) return 'Jewish';
  if (/^atheist|^agnostic|^none|^unaffiliated/.test(str)) return 'Unaffiliated';
  if (/^iglesia|^igl/.test(str)) return 'Iglesia ni Cristo';
  if (/^seventh|^sda|^adventist/.test(str)) return 'Seventh Day Adventist';
  if (/^jehovah/.test(str)) return "Jehovah's Witnesses";
  
  return 'Other';
};

/**
 * Validate and normalize numeric fields
 */
export const normalizeNumber = (
  value: unknown,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number | null => {
  if (value === null || value === undefined || value === '') return null;
  
  let num = typeof value === 'number' ? value : parseFloat(String(value));
  
  if (isNaN(num)) return null;
  
  if (options.integer) {
    num = Math.floor(num);
  }
  
  if (options.min !== undefined && num < options.min) return null;
  if (options.max !== undefined && num > options.max) return null;
  
  return num;
};

/**
 * Validate and normalize date strings
 */
export const normalizeDate = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim();
  const date = new Date(str);
  
  if (isNaN(date.getTime())) return null;
  
  // Return ISO format YYYY-MM-DD
  return date.toISOString().split('T')[0];
};

/**
 * Calculate age from birth date
 */
export const calculateAge = (birthDate: unknown): number | null => {
  if (!birthDate) return null;
  
  const normalized = normalizeDate(birthDate);
  if (!normalized) return null;
  
  const birth = new Date(normalized);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age < 0 || age > 150 ? null : age;
};

/**
 * Normalize phone number
 */
export const normalizePhoneNumber = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).replace(/\D/g, '');
  
  // Philippine numbers
  if (str.length === 10 && str.startsWith('9')) {
    return `+63${str.slice(1)}`;
  }
  if (str.length === 11 && str.startsWith('09')) {
    return `+63${str.slice(1)}`;
  }
  if (str.length === 12 && str.startsWith('639')) {
    return `+${str}`;
  }
  
  // Generic validation: at least 7 digits
  if (str.length >= 7) return str;
  
  return null;
};

/**
 * Normalize email address
 */
export const normalizeEmail = (value: unknown): string | null => {
  if (!value) return null;
  
  const str = String(value).trim().toLowerCase();
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(str)) return str;
  
  return null;
};

// ============================================================================
// Data Aggregation & Transformation
// ============================================================================

/**
 * Create a data point for analytics
 */
export const createAnalyticsDataPoint = (
  type: string,
  value: number,
  total?: number
): AnalyticsDataPoint => {
  return {
    type: String(type || 'Unknown'),
    value: Math.max(0, value),
    percentage: total && total > 0 ? Math.round((value / total) * 100) : undefined,
  };
};

/**
 * Aggregate array of items by a field, counting occurrences
 */
export const aggregateByField = (
  items: any[],
  fieldName: string,
  normalizer?: (value: unknown) => string | null
): AnalyticsDataPoint[] => {
  if (!Array.isArray(items) || items.length === 0) return [];
  
  const counts: Record<string, number> = {};
  
  items.forEach(item => {
    const raw = item?.[fieldName];
    const normalized = normalizer ? normalizer(raw) : (raw ? String(raw) : 'Unknown');
    
    if (normalized && normalized !== 'Unknown') {
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
  });
  
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([type, count]) => createAnalyticsDataPoint(type, count, total));
};

/**
 * Aggregate data by age groups
 */
export const aggregateByAgeGroup = (ages: (number | null | undefined)[]): AnalyticsDataPoint[] => {
  const ageGroups: Record<string, number> = {
    '0-17': 0,
    '18-25': 0,
    '26-35': 0,
    '36-45': 0,
    '46-55': 0,
    '56-65': 0,
    '66+': 0,
  };
  
  ages.forEach(age => {
    if (age === null || age === undefined) return;
    
    const num = Number(age);
    if (isNaN(num) || num < 0) return;
    
    if (num < 18) ageGroups['0-17']++;
    else if (num < 26) ageGroups['18-25']++;
    else if (num < 36) ageGroups['26-35']++;
    else if (num < 46) ageGroups['36-45']++;
    else if (num < 56) ageGroups['46-55']++;
    else if (num < 66) ageGroups['56-65']++;
    else ageGroups['66+']++;
  });
  
  const total = Object.values(ageGroups).reduce((sum, count) => sum + count, 0);
  
  return Object.entries(ageGroups)
    .filter(([_, count]) => count > 0)
    .map(([group, count]) => createAnalyticsDataPoint(group, count, total));
};

/**
 * Aggregate data by income brackets
 */
export const aggregateByIncomeBracket = (incomes: (number | null | undefined)[]): AnalyticsDataPoint[] => {
  const brackets: Record<string, number> = {
    'Below 50K': 0,
    '50K-100K': 0,
    '100K-250K': 0,
    '250K-500K': 0,
    '500K-1M': 0,
    '1M+': 0,
  };
  
  incomes.forEach(income => {
    if (income === null || income === undefined) return;
    
    const num = Number(income);
    if (isNaN(num) || num < 0) return;
    
    if (num < 50000) brackets['Below 50K']++;
    else if (num < 100000) brackets['50K-100K']++;
    else if (num < 250000) brackets['100K-250K']++;
    else if (num < 500000) brackets['250K-500K']++;
    else if (num < 1000000) brackets['500K-1M']++;
    else brackets['1M+']++;
  });
  
  const total = Object.values(brackets).reduce((sum, count) => sum + count, 0);
  
  return Object.entries(brackets)
    .filter(([_, count]) => count > 0)
    .map(([bracket, count]) => createAnalyticsDataPoint(bracket, count, total));
};

/**
 * Aggregate business employee count by ranges
 */
export const aggregateByEmployeeCount = (counts: (number | null | undefined)[]): AnalyticsDataPoint[] => {
  const ranges: Record<string, number> = {
    'Solo': 0,
    '2-5': 0,
    '6-10': 0,
    '11-20': 0,
    '20+': 0,
  };
  
  counts.forEach(count => {
    if (count === null || count === undefined) return;
    
    const num = Number(count);
    if (isNaN(num) || num < 0) return;
    
    if (num === 0 || num === 1) ranges['Solo']++;
    else if (num <= 5) ranges['2-5']++;
    else if (num <= 10) ranges['6-10']++;
    else if (num <= 20) ranges['11-20']++;
    else ranges['20+']++;
  });
  
  const total = Object.values(ranges).reduce((sum, count) => sum + count, 0);
  
  return Object.entries(ranges)
    .filter(([_, count]) => count > 0)
    .map(([range, count]) => createAnalyticsDataPoint(range, count, total));
};

// ============================================================================
// Data Quality Assessment
// ============================================================================

/**
 * Assess data quality for a field
 */
export const assessDataQuality = (items: any[], fieldName: string): number => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  
  const validItems = items.filter(item => {
    const value = item?.[fieldName];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
  
  return Math.round((validItems.length / items.length) * 100);
};

/**
 * Classify overall data quality
 */
export const classifyDataQuality = (percentage: number): 'high' | 'medium' | 'low' => {
  if (percentage >= 80) return 'high';
  if (percentage >= 50) return 'medium';
  return 'low';
};

// ============================================================================
// Batch Normalization
// ============================================================================

/**
 * Normalize a single PersonalInfo record
 */
export const normalizePersonalInfo = (raw: any): Partial<PersonalInfo> => {
  if (!raw) return {};
  
  return {
    barangayID: raw.barangayID?.toString().trim() || undefined,
    firstName: String(raw.firstName || '').trim(),
    lastName: String(raw.lastName || '').trim(),
    middleName: raw.middleName?.toString().trim() || undefined,
    age: normalizeNumber(raw.age, { min: 0, max: 150, integer: true }) || undefined,
    birthDate: normalizeDate(raw.birthDate) || undefined,
    dateOfResidency: normalizeDate(raw.dateOfResidency) || undefined,
    sex: normalizeSex(raw.sex) || undefined,
    civilStatus: normalizeCivilStatus(raw.civilStatus) || undefined,
    nationality: normalizeNationality(raw.nationality) || undefined,
    placeOfBirth: raw.placeOfBirth?.toString().trim() || undefined,
    religion: normalizeReligion(raw.religion) || undefined,
    email: normalizeEmail(raw.email) || undefined,
    contactNumber: normalizePhoneNumber(raw.contactNumber) || undefined,
    landlineNumber: normalizePhoneNumber(raw.landlineNumber) || undefined,
    facebook: raw.facebook?.toString().trim() || undefined,
    emergencyContact: raw.emergencyContact?.toString().trim() || undefined,
    passportNumber: raw.passportNumber?.toString().trim() || undefined,
    governmentIdNumber: raw.governmentIdNumber?.toString().trim() || undefined,
    bloodType: normalizeBloodType(raw.bloodType) || undefined,
    disabilityStatus: normalizeDisabilityStatus(raw.disabilityStatus) || undefined,
    occupation: normalizeOccupation(raw.occupation) || undefined,
    educationalAttainment: normalizeEducation(raw.educationalAttainment) || undefined,
    numberOfChildren: normalizeNumber(raw.numberOfChildren, { min: 0, max: 20, integer: true }) || undefined,
    childrenNames: raw.childrenNames?.toString().trim() || undefined,
    childrenAges: raw.childrenAges?.toString().trim() || undefined,
    spouseName: raw.spouseName?.toString().trim() || undefined,
    spouseAge: normalizeNumber(raw.spouseAge, { min: 0, max: 150, integer: true }) || undefined,
    spouseBirthDate: normalizeDate(raw.spouseBirthDate) || undefined,
    spouseMiddleName: raw.spouseMiddleName?.toString().trim() || undefined,
    spouseLastName: raw.spouseLastName?.toString().trim() || undefined,
    spouseNationality: normalizeNationality(raw.spouseNationality) || undefined,
    spouseOccupation: normalizeOccupation(raw.spouseOccupation) || undefined,
    spouseStatus: raw.spouseStatus?.toString().trim() || undefined,
    spouseContactNumber: normalizePhoneNumber(raw.spouseContactNumber) || undefined,
    emergencyContactName: raw.emergencyContactName?.toString().trim() || undefined,
    emergencyContactRelationship: raw.emergencyContactRelationship?.toString().trim() || undefined,
    motherName: raw.motherName?.toString().trim() || undefined,
    motherAge: normalizeNumber(raw.motherAge, { min: 0, max: 150, integer: true }) || undefined,
    motherBirthDate: normalizeDate(raw.motherBirthDate) || undefined,
    motherOccupation: normalizeOccupation(raw.motherOccupation) || undefined,
    motherStatus: raw.motherStatus?.toString().trim() || undefined,
    fatherName: raw.fatherName?.toString().trim() || undefined,
    fatherAge: normalizeNumber(raw.fatherAge, { min: 0, max: 150, integer: true }) || undefined,
    fatherBirthDate: normalizeDate(raw.fatherBirthDate) || undefined,
    fatherOccupation: normalizeOccupation(raw.fatherOccupation) || undefined,
    fatherStatus: raw.fatherStatus?.toString().trim() || undefined,
    businessName: raw.businessName?.toString().trim() || undefined,
    businessType: normalizeBusinessType(raw.businessType) || undefined,
    natureOfBusiness: raw.natureOfBusiness?.toString().trim() || undefined,
    businessAddress: raw.businessAddress?.toString().trim() || undefined,
    dateEstablished: normalizeDate(raw.dateEstablished) || undefined,
    tin: raw.tin?.toString().trim() || undefined,
    registrationNumber: raw.registrationNumber?.toString().trim() || undefined,
    businessPermitNumber: raw.businessPermitNumber?.toString().trim() || undefined,
    barangayClearanceNumber: raw.barangayClearanceNumber?.toString().trim() || undefined,
    numberOfEmployees: normalizeNumber(raw.numberOfEmployees, { min: 0, max: 10000, integer: true }) || undefined,
    capitalInvestment: normalizeNumber(raw.capitalInvestment, { min: 0 }) || undefined,
    annualGrossIncome: normalizeNumber(raw.annualGrossIncome, { min: 0 }) || undefined,
    businessContactPerson: raw.businessContactPerson?.toString().trim() || undefined,
    businessContactNumber: normalizePhoneNumber(raw.businessContactNumber) || undefined,
    businessEmail: normalizeEmail(raw.businessEmail) || undefined,
  };
};

/**
 * Normalize batch of PersonalInfo records
 */
export const normalizePersonalInfoBatch = (records: any[]): Partial<PersonalInfo>[] => {
  if (!Array.isArray(records)) return [];
  return records.map(normalizePersonalInfo);
};

/**
 * Normalize a single DocumentRequest
 */
export const normalizeDocumentRequest = (raw: any): Partial<DocumentRequest> => {
  if (!raw) return {};
  
  return {
    _id: raw._id?.toString() || `doc-${Date.now()}`,
    type: String(raw.type || '').trim(),
    status: String(raw.status || 'pending').trim().toLowerCase(),
    dateRequested: normalizeDate(raw.dateRequested) || new Date().toISOString().split('T')[0],
    notes: raw.notes?.toString().trim() || undefined,
    userId: raw.userId?.toString() || undefined,
    completedDate: raw.completedDate ? normalizeDate(raw.completedDate) || undefined : undefined,
    requestedBy: raw.requestedBy?.toString().trim() || undefined,
  };
};

/**
 * Normalize batch of DocumentRequest records
 */
export const normalizeDocumentRequestBatch = (records: any[]): Partial<DocumentRequest>[] => {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeDocumentRequest);
};

// ============================================================================
// Filter & Search Utilities
// ============================================================================

/**
 * Filter PersonalInfo records by criteria
 */
export const filterPersonalInfo = (
  records: PersonalInfo[],
  criteria: Partial<PersonalInfo>
): PersonalInfo[] => {
  return records.filter(record => {
    for (const [key, value] of Object.entries(criteria)) {
      if (value === undefined || value === null) continue;
      
      const recordValue = record[key as keyof PersonalInfo];
      
      if (typeof value === 'string') {
        if (!String(recordValue || '').toLowerCase().includes(String(value).toLowerCase())) {
          return false;
        }
      } else if (Array.isArray(value)) {
        if (!value.includes(recordValue)) return false;
      } else if (recordValue !== value) {
        return false;
      }
    }
    return true;
  });
};

/**
 * Search PersonalInfo records by name or contact
 */
export const searchPersonalInfo = (
  records: PersonalInfo[],
  query: string
): PersonalInfo[] => {
  const lower = query.toLowerCase();
  
  return records.filter(record => {
    const fullName = `${record.firstName} ${record.lastName}`.toLowerCase();
    const email = String(record.email || '').toLowerCase();
    const phone = String(record.contactNumber || '').toLowerCase();
    
    return fullName.includes(lower) || email.includes(lower) || phone.includes(lower);
  });
};

// ============================================================================
// Statistics & Reporting
// ============================================================================

/**
 * Generate summary statistics for PersonalInfo records
 */
export const generatePersonalInfoStats = (records: PersonalInfo[]) => {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalRecords: 0,
      avgAge: 0,
      genderDistribution: [],
      educationDistribution: [],
      occupationDistribution: [],
      businessOwners: 0,
      dataQuality: 0,
    };
  }
  
  const validAges = records
    .map(r => r.age)
    .filter((age): age is number => age !== null && age !== undefined);
  
  const avgAge = validAges.length > 0
    ? Math.round(validAges.reduce((a, b) => a + b, 0) / validAges.length)
    : 0;
  
  const businessOwners = records.filter(r => r.businessName && r.businessName.trim()).length;
  
  const dataQuality = Math.round(
    (assessDataQuality(records, 'firstName') +
      assessDataQuality(records, 'email') +
      assessDataQuality(records, 'contactNumber') +
      assessDataQuality(records, 'occupation')) / 4
  );
  
  return {
    totalRecords: records.length,
    avgAge,
    genderDistribution: aggregateByField(records, 'sex', normalizeSex),
    educationDistribution: aggregateByField(records, 'educationalAttainment', normalizeEducation),
    occupationDistribution: aggregateByField(records, 'occupation', normalizeOccupation),
    businessOwners,
    dataQuality,
  };
};

/**
 * Generate summary statistics for DocumentRequest records
 */
export const generateDocumentStats = (records: DocumentRequest[]) => {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalRequests: 0,
      pendingRequests: 0,
      completedRequests: 0,
      rejectedRequests: 0,
      typeDistribution: [],
    };
  }
  
  const pending = records.filter(r => r.status === 'pending').length;
  const completed = records.filter(r => r.status === 'completed' || r.status === 'approved').length;
  const rejected = records.filter(r => r.status === 'rejected' || r.status === 'denied').length;
  
  return {
    totalRequests: records.length,
    pendingRequests: pending,
    completedRequests: completed,
    rejectedRequests: rejected,
    typeDistribution: aggregateByField(records, 'type'),
  };
};
