# Analytics Data Fetching & Normalization Implementation Guide

## Overview

This guide provides comprehensive documentation for the new analytics data fetching and normalization system. The system handles:

- **Data Normalization**: Standardize PersonalInfo and DocumentRequest data
- **Analytics Computation**: Generate normalized analytics data for charts
- **Data Caching**: Efficient in-memory caching with TTL support
- **React Integration**: Hooks for easy component integration
- **Data Quality**: Assessment and classification of data quality
- **Export Functionality**: Export analytics in various formats

## Files Created

### 1. `src/utils/dataNormalization.ts`
Core normalization utilities providing:
- Field-specific normalizers (sex, education, occupation, etc.)
- Data aggregation functions
- Batch normalization
- Data quality assessment
- Statistics generation

### 2. `src/utils/analyticsFetching.ts`
Data fetching and caching providing:
- API data fetching with caching
- Analytics computation functions
- Dashboard summary generation
- Export functionality
- Cache management

### 3. `src/hooks/useAnalytics.ts`
React hooks for component integration:
- Individual analytics hooks
- Composite hooks for multiple analytics
- Filter management hooks
- Export functionality hooks
- Search and filter utilities

## Key Features

### Data Normalization

The system normalizes various data fields to ensure consistency:

```typescript
// Sex/Gender normalization
normalizeSex('M') // → 'Male'
normalizeSex('f') // → 'Female'
normalizeSex('other') // → 'Other'

// Education normalization
normalizeEducation('HS') // → 'High School'
normalizeEducation('bachelor') // → "Bachelor's Degree"

// Occupation normalization
normalizeOccupation('Software Engineer') // → 'Software Engineer'

// Date normalization
normalizeDate('12/25/1990') // → '1990-12-25'

// Phone number normalization (Philippine)
normalizePhoneNumber('09171234567') // → '+639171234567'
```

### Analytics Computation

Compute normalized analytics from raw data:

```typescript
// Single analytics
const genderData = await computeGenderAnalytics({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  barangayID: 'brgy-123',
});

// Returns:
{
  chartId: 'gender',
  data: [
    { type: 'Male', value: 150, percentage: 60 },
    { type: 'Female', value: 100, percentage: 40 }
  ],
  metadata: {
    total: 250,
    count: 2,
    categories: 2,
    lastUpdated: '2024-01-15T10:00:00Z',
    dataQuality: 'high'
  }
}
```

### React Hook Usage

#### Simple Single Analytics

```typescript
import { useGenderAnalytics } from '@/hooks/useAnalytics';

function GenderChart() {
  const { data, isLoading, isError } = useGenderAnalytics({
    startDate: '2024-01-01',
    endDate: '2024-12-31',
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error loading data</div>;
  
  return <BarChart data={data?.data} />;
}
```

#### Multiple Analytics

```typescript
import { useMultipleAnalytics } from '@/hooks/useAnalytics';

function Dashboard() {
  const { data, isLoading, isError } = useMultipleAnalytics(
    ['gender', 'age', 'occupation', 'education'],
    { startDate: '2024-01-01', endDate: '2024-12-31' }
  );
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      <GenderChart data={data.gender?.data} />
      <AgeChart data={data.age?.data} />
      <OccupationChart data={data.occupation?.data} />
      <EducationChart data={data.education?.data} />
    </div>
  );
}
```

#### With Filters

```typescript
import { useAnalyticsFilters, useMultipleAnalytics } from '@/hooks/useAnalytics';

function AdvancedDashboard() {
  const { filters, setFilter, clearFilters } = useAnalyticsFilters();
  
  const { data, isLoading } = useMultipleAnalytics(
    ['gender', 'age', 'occupation'],
    filters
  );
  
  return (
    <div>
      <DateRangePicker
        onChange={(dates) => {
          setFilter('startDate', dates[0]);
          setFilter('endDate', dates[1]);
        }}
      />
      <Select
        onChange={(value) => setFilter('barangayID', value)}
        placeholder="Select Barangay"
      />
      <Button onClick={clearFilters}>Reset Filters</Button>
      
      {/* Charts using data... */}
    </div>
  );
}
```

#### Search & Filter

```typescript
import { useAnalyticsSearch } from '@/hooks/useAnalytics';
import { usePersonalInfoRecords } from '@/hooks/useAnalytics';

function ResidentSearchPage() {
  const { data: records } = usePersonalInfoRecords();
  const { searchQuery, setSearchQuery, filters, setFilters, filteredRecords } = 
    useAnalyticsSearch(records);
  
  return (
    <div>
      <Input
        placeholder="Search by name, email, phone..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      
      <Select
        onChange={(value) => setFilters({ sex: value })}
        placeholder="Filter by gender"
      >
        <Option value="Male">Male</Option>
        <Option value="Female">Female</Option>
      </Select>
      
      <List data={filteredRecords} />
    </div>
  );
}
```

#### Data Export

```typescript
import { useAnalyticsExport } from '@/hooks/useAnalytics';

function ExportPanel() {
  const { exportAsJSON, exportAsCSV, isExporting } = useAnalyticsExport();
  
  const handleExport = async () => {
    const data = [
      { name: 'John', age: 30, occupation: 'Engineer' },
      { name: 'Jane', age: 28, occupation: 'Designer' },
    ];
    
    exportAsJSON(data, 'residents.json');
    // or
    exportAsCSV(data, ['name', 'age', 'occupation'], 'residents.csv');
  };
  
  return (
    <Button onClick={handleExport} loading={isExporting}>
      Export Data
    </Button>
  );
}
```

## Normalization Functions Reference

### Text Field Normalizers

| Function | Input | Output | Example |
|----------|-------|--------|---------|
| `normalizeSex` | `'M', 'f', 'other'` | `'Male', 'Female', 'Other'` | `normalizeSex('m')` → `'Male'` |
| `normalizeCivilStatus` | `'Single', 'Married'` | Standardized status | `normalizeCivilStatus('wed')` → `'Married'` |
| `normalizeBloodType` | `'O+', 'AB-'` | `'O+', 'AB-'` | `normalizeBloodType('O positive')` → `'O+'` |
| `normalizeOccupation` | Any occupation string | Cleaned occupation | `normalizeOccupation('software engineer (pt)')` → `'Software Engineer'` |
| `normalizeNationality` | Country codes/names | Standardized nationality | `normalizeNationality('PH')` → `'Filipino'` |
| `normalizeEducation` | Education level strings | Standardized level | `normalizeEducation('bachelor')` → `"Bachelor's Degree"` |
| `normalizeBusinessType` | Business type strings | Standardized type | `normalizeBusinessType('sole prop')` → `'Sole Proprietorship'` |
| `normalizeReligion` | Religion strings | Standardized religion | `normalizeReligion('catholic')` → `'Roman Catholic'` |

### Numeric Field Normalizers

```typescript
// General number normalization
normalizeNumber(value, { min, max, integer })

// Examples:
normalizeNumber(25.5, { min: 0, max: 150, integer: true }) // → 25
normalizeNumber('100', { min: 0 }) // → 100
normalizeNumber('-5', { min: 0 }) // → null (below min)
```

### Contact Field Normalizers

```typescript
// Phone number normalization (Philippine focus)
normalizePhoneNumber('09171234567') // → '+639171234567'
normalizePhoneNumber('6391234567890') // → '+6391234567890'

// Email normalization
normalizeEmail('John@Gmail.COM') // → 'john@gmail.com'
normalizeEmail('invalid-email') // → null

// Date normalization
normalizeDate('12/25/1990') // → '1990-12-25'
normalizeDate('Dec 25, 1990') // → '1990-12-25'
normalizeDate('invalid') // → null

// Age calculation
calculateAge('1990-12-25') // → 33 (assuming current date)
```

## Analytics Computation Functions

### Individual Analytics

All computation functions follow the pattern:

```typescript
async function compute[Field]Analytics(options?: FetchOptions): Promise<NormalizedAnalyticsData>
```

Available functions:
- `computeGenderAnalytics()`
- `computeAgeAnalytics()`
- `computeOccupationAnalytics()`
- `computeNationalityAnalytics()`
- `computeBloodTypeAnalytics()`
- `computeDisabilityAnalytics()`
- `computeBusinessTypeAnalytics()`
- `computeBusinessSizeAnalytics()`
- `computeChildrenCountAnalytics()`
- `computeIncomeAnalytics()`
- `computeEducationAnalytics()`
- `computeCivilStatusAnalytics()`
- `computeReligionAnalytics()`
- `computeDocumentAnalytics()`

### Aggregation Functions

```typescript
// Aggregate by a single field
aggregateByField(
  items: any[],
  fieldName: string,
  normalizer?: (value: unknown) => string | null
): AnalyticsDataPoint[]

// Aggregate ages into groups
aggregateByAgeGroup(ages: (number | null | undefined)[]): AnalyticsDataPoint[]

// Aggregate income into brackets
aggregateByIncomeBracket(incomes: (number | null | undefined)[]): AnalyticsDataPoint[]

// Aggregate employee count into ranges
aggregateByEmployeeCount(counts: (number | null | undefined)[]): AnalyticsDataPoint[]
```

## Caching Strategy

The system uses an in-memory cache with TTL (Time-To-Live):

```typescript
// Cache is automatically managed by React Query
// Default cache time: 5 minutes (staleTime)
// Garbage collection: 10 minutes (gcTime)

// Manual cache control
import { analyticsCache, clearAnalyticsCache } from '@/utils/analyticsFetching';

// Clear all caches
clearAnalyticsCache();

// Or use the hook
import { useInvalidateAnalyticsCache } from '@/hooks/useAnalytics';

function ClearCacheButton() {
  const invalidateCache = useInvalidateAnalyticsCache();
  
  return <Button onClick={invalidateCache}>Refresh Data</Button>;
}
```

## Data Quality Levels

The system classifies data quality as:

- **High**: ≥ 80% of records have the field populated
- **Medium**: 50-79% of records have the field populated
- **Low**: < 50% of records have the field populated

```typescript
// Check data quality for a field
const quality = assessDataQuality(records, 'email');
// Returns: number (0-100)

// Classify quality level
const level = classifyDataQuality(quality);
// Returns: 'high' | 'medium' | 'low'
```

## Batch Operations

### Normalize Multiple Records

```typescript
import { normalizePersonalInfoBatch, normalizeDocumentRequestBatch } from '@/utils/dataNormalization';

// Normalize personal info records
const normalized = normalizePersonalInfoBatch(rawRecords);

// Normalize document requests
const requests = normalizeDocumentRequestBatch(rawRequests);
```

### Generate Statistics

```typescript
import { generatePersonalInfoStats, generateDocumentStats } from '@/utils/dataNormalization';

const stats = generatePersonalInfoStats(records);
// Returns: {
//   totalRecords: number,
//   avgAge: number,
//   genderDistribution: AnalyticsDataPoint[],
//   educationDistribution: AnalyticsDataPoint[],
//   occupationDistribution: AnalyticsDataPoint[],
//   businessOwners: number,
//   dataQuality: number
// }

const docStats = generateDocumentStats(requests);
// Returns: {
//   totalRequests: number,
//   pendingRequests: number,
//   completedRequests: number,
//   rejectedRequests: number,
//   typeDistribution: AnalyticsDataPoint[]
// }
```

## Best Practices

### 1. Use React Query for Data Fetching

```typescript
// ✅ Good: Let React Query handle caching and updates
const { data } = useGenderAnalytics();

// ❌ Avoid: Manual async/await in effects
useEffect(() => {
  computeGenderAnalytics().then(setData);
}, []);
```

### 2. Normalize Data on the Backend if Possible

```typescript
// ✅ Better: Return normalized data from API
// API returns: { type: 'Male', value: 150 }

// ⚠️ Still works: Client-side normalization
const normalized = normalizePersonalInfo(rawData);
```

### 3. Use Filters to Reduce Data

```typescript
// ✅ Good: Filter on the server
const data = await fetchPersonalInfoRecords({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  barangayID: 'brgy-123'
});

// ❌ Avoid: Fetch all data and filter client-side
const allData = await fetchPersonalInfoRecords();
const filtered = allData.filter(r => r.barangayID === 'brgy-123');
```

### 4. Debounce Filter Changes

```typescript
import { useDebouncedAnalyticsFilters } from '@/hooks/useAnalytics';

function FilteredDashboard() {
  const [filters, setFilters] = useState({});
  const debouncedFilters = useDebouncedAnalyticsFilters(filters, 500);
  
  const { data } = useMultipleAnalytics(['gender', 'age'], debouncedFilters);
  
  return (
    <div>
      <Input onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
      {/* Data will update only after 500ms of inactivity */}
    </div>
  );
}
```

### 5. Handle Errors Gracefully

```typescript
const { data, isLoading, isError, error } = useGenderAnalytics();

if (isError) {
  return <Alert type="error" message={`Failed to load data: ${error?.message}`} />;
}
```

## Performance Optimization

### 1. Memoize Computation Results

```typescript
const computedAnalytics = useMemo(
  () => generatePersonalInfoStats(records),
  [records]
);
```

### 2. Use Dynamic Imports for Large Components

```typescript
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));

<Suspense fallback={<Spin />}>
  <AnalyticsDashboard />
</Suspense>
```

### 3. Paginate Large Datasets

```typescript
const { data, pagination, handlePageChange } = usePaginatedAnalytics(
  records,
  { pageSize: 50 }
);
```

### 4. Cache Computed Results

```typescript
const memoizedData = useMemo(
  () => aggregateByField(records, 'occupation'),
  [records]
);
```

## Error Handling

```typescript
import { useErrorHandler } from 'react-error-boundary';

function SafeAnalyticsComponent() {
  const handleError = useErrorHandler();
  const { data, isError, error } = useGenderAnalytics();
  
  if (isError) {
    handleError(error);
    return null;
  }
  
  return <Chart data={data} />;
}
```

## Integration with Existing Statistics Component

To integrate with the existing Statistics.tsx component:

```typescript
import { useMultipleAnalytics } from '@/hooks/useAnalytics';

const StatisticsInner: React.FC = () => {
  const { filters } = useAnalyticsFilters();
  
  // Use hooks instead of manual useQueries
  const { data, isLoading } = useMultipleAnalytics(
    ['gender', 'age', 'occupation', 'nationality'],
    filters
  );
  
  // Rest of component remains the same
};
```

## Troubleshooting

### Data Not Updating After Filter Change

- Check that filter options are included in the query key
- Verify React Query is properly configured
- Clear cache manually: `clearAnalyticsCache()`

### High Memory Usage

- Reduce cache TTL
- Implement pagination
- Use virtual scrolling for large lists

### Slow Performance

- Enable React Query DevTools to profile
- Check data normalization logic
- Verify backend API response time
- Consider implementing server-side aggregation

## TypeScript Support

Full TypeScript support included:

```typescript
import type {
  PersonalInfo,
  DocumentRequest,
  AnalyticsDataPoint,
  NormalizedAnalyticsData,
  FetchOptions,
} from '@/utils/dataNormalization';

// Fully typed functions and hooks
const data: NormalizedAnalyticsData = await computeGenderAnalytics();
const records: PersonalInfo[] = await fetchPersonalInfoRecords();
```

## Summary

This comprehensive system provides:

✅ Robust data normalization for consistency
✅ Efficient caching and query management
✅ React hooks for easy component integration
✅ Data quality assessment
✅ Export functionality
✅ Type safety with TypeScript
✅ Performance optimization
✅ Error handling and fallbacks

The system is production-ready and can be extended with additional normalizers and analytics functions as needed.
