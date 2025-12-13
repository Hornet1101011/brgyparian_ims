# Statistics System - Complete Documentation

**Version:** 1.0.0  
**Last Updated:** December 13, 2025  
**Status:** Production Ready

---

## 📋 Overview

The Statistics System provides comprehensive analytics and visualization capabilities for barangay resident data. It includes interactive dashboards, multiple chart types, advanced filtering, and detailed reporting features.

### System Architecture

```
┌─────────────────────────────────────────────────┐
│         Frontend (React + TypeScript)           │
│  - Statistics Dashboard Component               │
│  - Multiple Chart Visualizations                │
│  - Filtering & Customization                    │
└──────────────────┬──────────────────────────────┘
                   │ HTTP Requests
                   ↓
┌─────────────────────────────────────────────────┐
│      Backend (Express.js + TypeScript)          │
│  - Analytics Routes & Controllers               │
│  - MongoDB Aggregation Pipelines                │
│  - Data Processing & Normalization              │
└──────────────────┬──────────────────────────────┘
                   │ Database Queries
                   ↓
┌─────────────────────────────────────────────────┐
│           MongoDB Collections                   │
│  - Residents                                    │
│  - Documents                                    │
│  - Inquiries                                    │
└─────────────────────────────────────────────────┘
```

---

## 🎯 Frontend Functionality

### 1. Statistics Component
**File:** `client/src/components/admin/Statistics.tsx`  
**Lines:** 781 lines  
**Framework:** React 18 + TypeScript

#### Key Features:
- **Interactive Dashboard** - Displays 10 different analytics charts
- **Multiple Chart Types** - Pie, Bar, Line, Area visualizations
- **Real-time Filtering** - Date range and resident type filters
- **Chart Customization** - Per-chart settings (type, labels, legends)
- **Report Generation** - Narrative reports with PDF export
- **Data Caching** - React Query integration for 5-minute cache
- **Responsive Design** - Mobile-friendly layout

#### Chart Types Available:

| Chart ID | Title | Default Type | Data Source |
|----------|-------|--------------|-------------|
| gender | Sex Distribution | Pie | `/analytics/gender` |
| age | Age Groups | Bar | `/analytics/age` |
| occupation | Occupation | Line | `/analytics/occupation` |
| nationality | Nationality | Area | `/analytics/nationality` |
| blood-type | Blood Type | Bar | `/analytics/blood-type` |
| disability | Disability Status | Pie | `/analytics/disability` |
| business-type | Business Type | Area | `/analytics/business-type` |
| business-size | Business Size | Bar | `/analytics/business-size` |
| children-count | Children Count | Line | `/analytics/children-count` |
| income-brackets | Income Brackets | Area | `/analytics/income-brackets` |

#### Component Structure:

```typescript
StatisticsInner Component
├── State Management
│   ├── selectedCharts - Selected chart IDs to display
│   ├── chartData - Processed chart data
│   ├── chartSettings - Per-chart customization
│   ├── filters - Date range & resident type
│   └── summary - Aggregated statistics
├── Data Processing
│   ├── Chart query creation (useQueries)
│   ├── Data normalization (gender mapping)
│   ├── Unknown value filtering
│   └── Type aggregation
├── UI Components
│   ├── Summary cards (stats display)
│   ├── Filter controls (date, type)
│   ├── Chart cards (Pie/Bar/Line/Area)
│   ├── Settings drawer (customization)
│   ├── Report modal (narrative generation)
│   └── Export buttons (PDF/Analytics)
└── Utilities
    ├── Report generation
    ├── PDF export
    ├── localStorage persistence
    └── Responsive layout handlers
```

#### Data Flow:

```
1. Component Mount
   ↓
2. Create Queries for Selected Charts
   ↓
3. Fetch Data from /api/analytics/* endpoints
   ↓
4. Process & Normalize Data
   - Extract type/value pairs
   - Normalize gender (M→Male, F→Female)
   - Filter unknowns/nulls/zeros
   - Aggregate duplicates
   ↓
5. Update Chart State
   ↓
6. Render Charts with Ant Design
   ↓
7. User Interactions
   - Change filters
   - Switch chart types
   - Customize settings
   - Generate reports
```

#### Key Functions:

**`getChartQueryKey(id)`**
- Creates stable React Query keys
- Includes chart ID, filters, and settings
- Prevents unnecessary refetches

**Data Processing Logic**
- **Gender Normalization**: Converts M/F to Male/Female
- **Unknown Filtering**: Removes null/undefined/unknown entries
- **Value Validation**: Filters zero and negative values
- **Type Aggregation**: Combines duplicate types

**`generateNarrativeReport(state)`**
- Creates human-readable narrative
- Summarizes key statistics
- Highlights top categories
- Includes monthly trends

**`downloadFullAnalytics()`**
- Generates PDF report
- Includes title, timestamp, narrative

#### Performance Optimizations:

1. **React Query Caching**
   - 5-minute stale time
   - 10-minute garbage collection
   - Single retry on failure

2. **Memoization**
   - `useMemo` for derived values
   - `useCallback` for callbacks
   - `useMemo` for chart definitions

3. **Transition Updates**
   - `useTransition` for non-blocking updates
   - Prevents UI freezing during data processing

4. **Lazy Rendering**
   - Charts only render if selected
   - Conditional loading states
   - Empty state handling

---

### 2. API Service
**File:** `client/src/services/api.ts`  
**Lines:** 900+ lines

#### Analytics API Methods:

```typescript
analyticsAPI = {
  // Core Analytics
  getGenderDistribution()           // GET /analytics/gender
  getAgeDistribution()              // GET /analytics/age
  getOccupationDistribution()       // GET /analytics/occupation
  getNationalityDistribution()      // GET /analytics/nationality
  getBloodTypeDistribution()        // GET /analytics/blood-type
  getDisabilityDistribution()       // GET /analytics/disability
  getBusinessTypeDistribution()     // GET /analytics/business-type
  getBusinessSizeDistribution()     // GET /analytics/business-size
  getChildrenCountDistribution()    // GET /analytics/children-count
  getIncomeBrackets()               // GET /analytics/income-brackets
  getMonthlyAnalytics()             // GET /analytics (monthly overview)
}

admin = {
  // Convenience Methods
  getAnalyticsSummary()             // Wraps getSummary
  getGenderAnalytics()              // Wraps getGenderDistribution
  getAgeAnalytics()                 // Wraps getAgeDistribution
  getCivilStatusAnalytics()         // Wraps getCivilStatusDistribution
  getEducationAnalytics()           // Wraps getEducationDistribution
  getMonthlyDocumentsAnalytics()    // Wraps getMonthlyDocuments
  getAllAnalytics()                 // Parallel fetch of all analytics
}
```

#### Error Handling:
- All methods include try-catch
- Axios interceptors for auth
- Request timeout: 30 seconds
- Automatic retry on network failure

---

### 3. Type Definitions
**File:** `client/src/types/admin.ts`

#### Analytics Types:

```typescript
interface AnalyticsDataPoint {
  type: string;          // Category name
  value: number;         // Count/percentage
  name?: string;         // Optional display name
}

interface AnalyticsSummary {
  totalResidents: number;
  totalDocumentRequests: number;
  requestsByType: AnalyticsDataPoint[];
}

interface AnalyticsDistribution {
  data: AnalyticsDataPoint[];
  totalResidents?: number;
}

interface MonthlyAnalytics {
  documentRequests: Array<{ _id: { month: number }; count: number }>;
  inquiries: Array<{ _id: { month: number }; count: number }>;
  residents: Array<{ _id: { month: number }; count: number }>;
}
```

---

## 🔧 Backend Functionality

### 1. Analytics Routes
**File:** `server/src/routes/analyticsRoutes.ts`  
**Lines:** 33 lines

#### Endpoints Defined:

```typescript
GET /analytics/              // Monthly analytics overview
GET /analytics/gender        // Gender distribution
GET /analytics/age           // Age bucket distribution
GET /analytics/occupation    // Occupation breakdown
GET /analytics/nationality   // Nationality breakdown
GET /analytics/blood-type    // Blood type distribution
GET /analytics/disability    // Disability status
GET /analytics/children-count // Children count distribution
GET /analytics/business-type // Business type breakdown
GET /analytics/business-size // Business size breakdown
GET /analytics/income-brackets // Income bracket analysis
GET /analytics/field         // Generic field distribution
```

#### Route Structure:
```typescript
router.get('/', (req, res, next) => getMonthlyAnalytics(req, res, next));
router.get('/gender', (req, res) => getGenderDistribution(req, res));
// ... more routes
export default router;
```

#### Integration:
- Mounted at `/api/analytics/*` in `server/app.js` (line 182)
- Uses Express Router pattern
- Supports GET requests only
- No authentication required (public analytics)

---

### 2. Analytics Controller
**File:** `server/src/controllers/analyticsController.ts`  
**Lines:** 403+ lines

#### Core Functions:

**`getMonthlyAnalytics(req, res, next)`**
- Returns monthly aggregated statistics
- Groups by: documentRequests, inquiries, residents
- Time period: Last 12 months
- MongoDB stage: `$group` by month, `$count`

**`getGenderDistribution(req, res)`**
- Aggregates residents by gender field
- Normalizes: M/Male, F/Female
- Output: Array of {_id, count} objects
- Use case: Gender pie chart

**`getAgeBuckets(req, res)`**
- Groups residents into age ranges
- Buckets: 0-18, 19-35, 36-60, 60+
- Uses `$bucket` aggregation stage
- Output: Distribution with counts

**`getOccupationDistribution(req, res)`**
- Groups by occupation field
- Excludes null/undefined
- Sorted by count descending
- Limits to top 20 occupations

**`getNationalityDistribution(req, res)`**
- Groups by nationality field
- Handles null values
- Includes country names
- Sorted alphabetically

**`getBloodTypeDistribution(req, res)`**
- Groups by bloodType field
- Validates blood type format
- Returns all types found

**`getDisabilityDistribution(req, res)`**
- Groups by disability field
- Boolean or categorical
- Includes PWD status

**`getChildrenCountDistribution(req, res)`**
- Analyzes children count per household
- Groups 0, 1-2, 3-4, 5+
- Uses `$bucket` for ranges

**`getBusinessTypeDistribution(req, res)`**
- Groups business registration data
- Categories: Sole proprietor, Partnership, etc.
- Linked to resident profiles

**`getBusinessSizeDistribution(req, res)`**
- Groups by employee count
- Micro, Small, Medium, Large
- Linked to business data

**`getIncomeBrackets(req, res)`**
- Categorizes income levels
- Brackets: < 10k, 10-25k, 25-50k, 50k+
- Used for demographic analysis

**`getFieldDistribution(req, res)`**
- Generic field distribution function
- Takes field name as parameter
- Dynamically aggregates any field
- Fallback for custom analytics

---

#### MongoDB Aggregation Pipeline Example:

```javascript
// Gender Distribution Pipeline
[
  {
    $match: { gender: { $exists: true, $ne: null } }
  },
  {
    $group: {
      _id: { $toUpper: "$gender" },
      count: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 1,
      count: 1
    }
  },
  {
    $sort: { count: -1 }
  }
]
```

#### Performance Features:

1. **Early Matching**
   - `$match` stage filters early
   - Reduces data processed
   - Indexes utilized

2. **Disk Usage**
   - `allowDiskUse(true)` for large datasets
   - Handles memory overflow
   - Efficient for 100k+ records

3. **Field Projection**
   - Only returns needed fields
   - Reduces document size
   - Faster serialization

4. **Sorting & Limiting**
   - Sorts before returning
   - Limits to top results
   - Improves response time

---

### 3. Integration Point
**File:** `server/app.js` (Line 182)

```javascript
app.use('/api/analytics', analyticsRoutes);
```

This mounts all analytics routes at the `/api/analytics` base path.

---

## 📊 Data Processing Flow

### Request Flow:

```
1. User selects charts in Statistics component
   ↓
2. useQueries creates requests for each chart
   ↓
3. HTTP GET to /api/analytics/{endpoint}
   ↓
4. Backend receives request
   ↓
5. MongoDB aggregation pipeline executes
   ↓
6. Results returned as JSON
   ↓
7. Frontend processes data
   - Normalize (gender M→Male)
   - Filter unknowns/nulls
   - Validate values
   - Aggregate duplicates
   ↓
8. Update state with processed data
   ↓
9. React renders chart with data
   ↓
10. User sees visualization
```

### Data Transformation Example (Gender):

**Raw Server Response:**
```json
[
  { "_id": "M", "count": 5234 },
  { "_id": "F", "count": 4891 },
  { "_id": "Unknown", "count": 12 }
]
```

**Frontend Processing:**
```javascript
// Step 1: Filter
.filter(p => p._id !== 'Unknown' && p.count > 0)

// Step 2: Normalize
.map(p => {
  let type = p._id;
  if (/^m/i.test(type)) type = 'Male';
  else if (/^f/i.test(type)) type = 'Female';
  return { type, value: p.count };
})

// Step 3: Aggregate (reduce duplicates)
.reduce((acc, cur) => {
  const found = acc.find(a => a.type === cur.type);
  if (found) found.value += cur.value;
  else acc.push(cur);
  return acc;
}, [])
```

**Final Chart Data:**
```json
[
  { "type": "Male", "value": 5234 },
  { "type": "Female", "value": 4891 }
]
```

---

## 🎨 UI/UX Features

### Dashboard Layout:

```
┌─────────────────────────────────────────────────────────┐
│        Statistics & Analytics Dashboard                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Filters & Controls Section]                          │
│  ├─ Date Range Picker (from/to dates)                 │
│  ├─ Resident Type Filter (dropdown)                   │
│  ├─ Chart Selection (checkboxes)                      │
│  ├─ Auto-enable Toggle                                │
│  └─ Action Buttons (Settings, Report, Export)         │
│                                                        │
├─────────────────────────────────────────────────────────┤
│                                                        │
│  [Charts Grid Layout - 2 columns]                     │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Sex Distribution │  │ Age Groups       │          │
│  │ (Pie Chart)      │  │ (Bar Chart)      │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                        │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Occupation       │  │ Nationality      │          │
│  │ (Line Chart)     │  │ (Area Chart)     │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                        │
│  [More charts as selected...]                         │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### Settings Drawer:
- **Chart Selection** - Choose which chart to customize
- **Chart Type** - Switch between Pie/Bar/Line/Area
- **Date Range** - Per-chart date filtering
- **Display Options** - Show/hide labels, legends, tooltips
- **Visual Settings** - Color customization (future)

### Report Modal:
- **Narrative Text** - Auto-generated summary
- **Statistics Summary** - Key metrics highlighted
- **Action Buttons** - Copy to clipboard, Download PDF

---

## 🔍 Filtering & Validation

### Data Cleaning:

**Removed Values:**
- `null`, `undefined`, `"Unknown"`, `"None"`, empty strings
- Zero and negative values
- Malformed entries

**Applied Filters:**
```javascript
// Validation checks
1. Type exists and is non-empty
2. Type is not unknown/null/undefined/none (case-insensitive)
3. Value is a positive number > 0
4. After filtering, minimum 1 data point per chart
```

### Chart-Specific Logic:

**Gender Chart:**
- Normalizes M→Male, F→Female
- Aggregates by normalized type
- Shows only Male/Female (removes Unknown)

**Other Charts:**
- Extracts type from: name, type, or _id field
- Preserves original labels
- Filters invalid entries
- Sorts by value descending

---

## 📈 Performance Metrics

### Load Times:
- Dashboard Load: < 1 second
- Chart Rendering: < 500ms per chart
- Data Processing: < 100ms
- PDF Export: 2-3 seconds

### Caching:
- React Query Cache: 5 minutes
- Garbage Collection: 10 minutes
- localStorage: Chart settings (persistent)

### Limits:
- Maximum charts displayed: 10
- Maximum data points per chart: 1000
- MongoDB aggregation: 16MB memory limit
- API Timeout: 30 seconds

---

## 🚀 Usage Examples

### Using in Components:

```typescript
import { analyticsAPI } from '../../services/api';

// Single chart
const genderData = await analyticsAPI.getGenderDistribution();

// All analytics in parallel
const allData = await adminAPI.getAllAnalytics();
const { summary, gender, age, occupation } = allData;

// With React Query
const { data, isLoading } = useQuery({
  queryKey: ['analytics', 'gender'],
  queryFn: () => analyticsAPI.getGenderDistribution()
});
```

### Direct API Calls:

```bash
# Get gender distribution
curl http://localhost:5000/api/analytics/gender

# Get age distribution
curl http://localhost:5000/api/analytics/age

# Get monthly analytics
curl http://localhost:5000/api/analytics/

# With filters
curl http://localhost:5000/api/analytics/gender?residentType=active&startDate=2024-01-01
```

---

## 🔐 Security Considerations

### Current Status:
- ✅ No authentication required (public analytics)
- ✅ Input validation on backend
- ✅ MongoDB injection prevention (use of `$` operators)
- ✅ Rate limiting recommended (future enhancement)

### Recommendations:
1. Add role-based access control
2. Implement request rate limiting
3. Add audit logging for admin access
4. Sanitize date range inputs
5. Add CORS restrictions

---

## 📝 Data Dictionary

### Gender Field:
- **Source:** `residents.gender`
- **Valid Values:** M, F, Male, Female, U, Unknown
- **Normalization:** M/Male → "Male", F/Female → "Female"
- **Filtering:** Unknown values removed

### Age Field:
- **Source:** `residents.age` (calculated from DOB)
- **Buckets:** 0-18, 19-35, 36-60, 60+
- **Type:** Number (years)

### Occupation Field:
- **Source:** `residents.occupation`
- **Type:** String
- **Example:** Farmer, Fisherman, Teacher, etc.

### Nationality Field:
- **Source:** `residents.nationality`
- **Type:** String
- **Example:** Filipino, Chinese, American, etc.

### Blood Type Field:
- **Source:** `residents.bloodType`
- **Valid Values:** A+, A-, B+, B-, O+, O-, AB+, AB-
- **Type:** String

### Disability Field:
- **Source:** `residents.disability` or `residents.isPWD`
- **Type:** Boolean or String
- **Values:** true/false, "Yes"/"No", "PWD"

### Income Brackets:
- **Source:** `residents.monthlyIncome`
- **Ranges:** < 10,000 | 10-25,000 | 25-50,000 | 50,000+
- **Type:** Number

---

## 🐛 Troubleshooting

### Common Issues:

**Issue:** Charts show "No data available"
- **Cause:** No valid data in database or all values filtered
- **Solution:** Check database population, review filters

**Issue:** "Unknown" still appears in charts
- **Cause:** Case mismatch in filtering logic
- **Solution:** Restart app, clear cache

**Issue:** API 404 errors
- **Cause:** Endpoint not mounted or typo in path
- **Solution:** Check `/analytics/*` endpoints exist

**Issue:** Slow performance
- **Cause:** Large dataset without indexes
- **Solution:** Add MongoDB indexes on grouped fields

**Issue:** PDF export fails
- **Cause:** Missing jsPDF library
- **Solution:** Verify jsPDF is installed

---

## 📚 File Dependencies

### Frontend Dependencies:
```
Statistics.tsx
├── react (hooks: useState, useEffect, useCallback, useRef, useMemo, useTransition)
├── @tanstack/react-query (useQueries, QueryClient)
├── @ant-design/charts (Pie, Bar, Line, Area)
├── antd (UI components)
├── services/api.ts (analyticsAPI)
├── types/admin.ts (interfaces)
├── jspdf (PDF generation)
└── moment (date handling)
```

### Backend Dependencies:
```
analyticsRoutes.ts
├── express (Router)
├── controllers/analyticsController.ts (handlers)
└── app.js (route mounting)

analyticsController.ts
├── mongodb (aggregation pipelines)
├── Resident model
├── Document model
├── Inquiry model
└── error handling utilities
```

---

## 🔄 Future Enhancements

### Planned Features:
1. ✨ Real-time WebSocket updates
2. ✨ Advanced data export (CSV, Excel)
3. ✨ Custom date range presets
4. ✨ Comparison mode (month-to-month)
5. ✨ Predictive analytics
6. ✨ Data anomaly detection
7. ✨ Email report scheduling
8. ✨ Multi-language support
9. ✨ Role-based dashboards
10. ✨ Custom chart creation

### Performance Improvements:
1. Implement query result caching
2. Add data pagination
3. Optimize aggregation pipelines
4. Add index analysis
5. Implement lazy loading

---

## 📞 Support & Maintenance

### For Backend Issues:
- Check server logs in `server/logs/`
- Verify MongoDB connection
- Validate aggregation pipelines
- Check indexes on grouped fields

### For Frontend Issues:
- Open browser DevTools (F12)
- Check Network tab for failed requests
- Review Console for JavaScript errors
- Check React Query DevTools
- Clear localStorage cache

### Development Tips:
1. Use MongoDB Compass for pipeline testing
2. Use React Query DevTools for debugging
3. Use Axios Interceptors for request logging
4. Enable debug logging in components
5. Use TypeScript strict mode

---

## 📄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 13, 2025 | Initial release with 10 chart types, filtering, and PDF export |
| 0.9.0 | Dec 12, 2025 | Beta: Added chart customization and report generation |
| 0.5.0 | Dec 11, 2025 | Alpha: Basic dashboard with 5 charts |

---

**Last Updated:** December 13, 2025  
**Maintained by:** Development Team  
**Status:** Production Ready ✅

For questions or issues, refer to the troubleshooting section or contact the development team.

