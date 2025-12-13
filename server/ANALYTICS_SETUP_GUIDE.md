# Server Statistics & Analytics Setup Guide

This guide provides comprehensive instructions for setting up and managing the analytics system in the Alphaversion backend.

## Overview

The analytics system in Alphaversion provides detailed insights into:
- **Resident Demographics:** Gender, age, civil status, education level
- **Document Requests:** Monthly trends, request volumes by type
- **Advanced Metrics:** Occupation, nationality, business data, income brackets

---

## File Structure

```
server/
├── app.js                                     # Main Express app (mounts /api/analytics routes)
├── src/
│   ├── routes/
│   │   ├── analyticsRoutes.ts               # TypeScript route definitions
│   │   └── analyticsRoutes.js               # JavaScript route handler (fallback)
│   └── controllers/
│       └── analyticsController.ts            # Controller implementations
├── dist/                                      # Compiled JavaScript output
└── ANALYTICS_ENDPOINTS.md                    # API documentation
```

---

## Prerequisites

### Required Models
Ensure these models are properly defined and registered:

1. **Resident Model** (`src/models/Resident.ts`)
   - Required fields: `sex`, `age`, `civilStatus`, `educationalAttainment`
   - Optional fields: `occupation`, `nationality`, `bloodType`, `disabilityStatus`, `numberOfChildren`, `businessType`, `numberOfEmployees`, `annualGrossIncome`

2. **DocumentRequest Model** (`src/models/DocumentRequest.ts`)
   - Required fields: `dateRequested`, `type`
   - Required for monthly analytics: `dateRequested` (Date type)

3. **Inquiry Model** (`src/models/Inquiry.ts`)
   - Required for monthly analytics: `createdAt` (Date type)

### Environment Configuration
- **MongoDB URI:** Must be set in `.env` or connection string configured in `app.js`
- **Node.js Version:** 14+ recommended
- **Express Version:** 4.0+

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd server
npm install
```

Required packages:
- `express` - Web framework
- `mongoose` - MongoDB ODM
- `@types/express` - TypeScript types

### 2. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 3. Verify Analytics Routes
The routes are automatically mounted in `app.js`:

```javascript
// Analytics routes
app.use('/api/analytics', require('./src/routes/analyticsRoutes'));
```

### 4. Test Endpoints
Once the server is running (default: `http://localhost:5000`):

```bash
# Test summary endpoint
curl http://localhost:5000/api/analytics/summary

# Test gender distribution
curl http://localhost:5000/api/analytics/gender

# Test with query parameters
curl "http://localhost:5000/api/analytics/summary?startDate=2024-01-01&endDate=2024-12-31"
```

---

## Route Files Explained

### analyticsRoutes.ts (TypeScript)
**Location:** `server/src/routes/analyticsRoutes.ts`

Defines API routes that delegate to controller functions:

```typescript
router.get('/gender', (req: any, res: Response) => getGenderDistribution(req, res));
router.get('/age', (req: any, res: Response) => getAgeBuckets(req, res));
router.get('/civil-status', ...) // etc.
```

**Key Features:**
- Type-safe with TypeScript
- Clean separation of routes and logic
- Middleware support for future authentication

### analyticsRoutes.js (JavaScript Fallback)
**Location:** `server/src/routes/analyticsRoutes.js`

Legacy JavaScript implementation with inline aggregation logic:

```javascript
router.get('/gender', async (req, res) => {
  // inline aggregation pipeline
  const data = await Resident.aggregate([...]).allowDiskUse(true);
  res.json({ data });
});
```

**Note:** TypeScript version is preferred; JavaScript fallback exists for compatibility.

---

## Controller Implementation

### analyticsController.ts
**Location:** `server/src/controllers/analyticsController.ts`

Implements business logic for analytics queries:

#### Key Functions:

1. **getMonthlyAnalytics()**
   - Returns monthly trends for documents, inquiries, residents
   - Current year only

2. **getGenderDistribution()**
   - Groups residents by sex (Male/Female/Other/Unknown)
   - Normalizes values (case-insensitive, trimmed)

3. **getAgeBuckets()**
   - Buckets residents: 0-18, 19-35, 36-60, 60+
   - Converts string ages to integers

4. **getFieldDistribution()**
   - Generic endpoint for aggregating any string field
   - Query param: `field` (e.g., `?field=occupation`)

5. **getOccupationDistribution(), getNationalityDistribution(), etc.**
   - Specialized string field aggregators
   - Return normalized, sorted data

#### Response Format Pattern:
```typescript
res.json({
  field?: string,
  totalResidents: number,
  data: [{ name: string, value: number }]
});
```

---

## Data Aggregation Pipeline Patterns

### Pattern 1: Simple Field Grouping (Gender, Civil Status)
```javascript
[
  { $project: { field: '$fieldName' } },
  { $group: { _id: '$field', count: { $sum: 1 } } },
  { $project: { _id: 0, type: '$_id', value: '$count' } },
  { $sort: { value: -1 } }
]
```

### Pattern 2: Age Bucketing
```javascript
[
  { $match: { age: { $exists: true, $ne: null } } },
  { $project: { ageNum: { $toInt: '$age' } } },
  { $group: { _id: '$ageNum', count: { $sum: 1 } } },
  // Calculate buckets in application code
]
```

### Pattern 3: Time-based Grouping (Monthly)
```javascript
[
  { $group: {
    _id: { year: { $year: '$dateField' }, month: { $month: '$dateField' } },
    count: { $sum: 1 }
  }},
  { $sort: { '_id.year': 1, '_id.month': 1 } }
]
```

---

## Error Handling

### Common Issues & Solutions

**1. Models Not Found**
```
Error: Cannot find module '../../dist/models/Resident'
```
**Solution:** Ensure TypeScript is compiled to `dist/` folder
```bash
npm run build
```

**2. MongoDB Connection Errors**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:** Verify MongoDB is running
```bash
# Local MongoDB
mongod

# Or check MONGO_URI in .env
```

**3. Empty Results**
- Expected if no residents in database
- Controllers return zero values gracefully

---

## Performance Optimization

### Aggregation Optimization
All aggregation pipelines use `allowDiskUse(true)`:
```javascript
await Resident.aggregate(pipeline).allowDiskUse(true);
```

This allows MongoDB to use disk space for large intermediate results.

### Database Indexing
Recommended indexes for optimal performance:

```javascript
// In your seed/migration script
db.residents.createIndex({ sex: 1 });
db.residents.createIndex({ age: 1 });
db.residents.createIndex({ civilStatus: 1 });
db.residents.createIndex({ educationalAttainment: 1 });
db.documentrequests.createIndex({ dateRequested: 1 });
```

### Query Caching (Client-Side)
The client uses React Query with configuration:
```typescript
staleTime: 5 * 60 * 1000,    // 5 minutes
gcTime: 10 * 60 * 1000,      // 10 minutes
refetchOnWindowFocus: false
```

---

## Adding New Analytics Endpoints

### Step 1: Add Controller Function
**File:** `server/src/controllers/analyticsController.ts`

```typescript
export const getMyAnalytic = async (req: Request, res: Response) => {
  try {
    const data = await Resident.aggregate([
      // Your pipeline here
    ]);
    res.json({ data, totalResidents: data.length });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics', error });
  }
};
```

### Step 2: Add Route
**File:** `server/src/routes/analyticsRoutes.ts`

```typescript
import { getMyAnalytic } from '../controllers/analyticsController';

router.get('/my-analytic', (req: any, res: Response) => getMyAnalytic(req, res));
```

### Step 3: Update Client Component
**File:** `client/src/components/admin/Statistics.tsx`

Add to `CHART_DEFINITIONS`:
```typescript
'my-chart': {
  title: 'My Chart Title',
  chartType: 'pie' | 'bar' | 'line' | 'area',
  endpoint: '/analytics/my-analytic',
  colors: ['#1890ff', '#00bcd4']
}
```

### Step 4: Recompile (if using TypeScript routes)
```bash
npm run build
```

---

## Deployment Checklist

- [ ] MongoDB connection string configured in production environment
- [ ] TypeScript compiled to `dist/` folder (`npm run build`)
- [ ] All required models properly defined
- [ ] Database indexes created for performance
- [ ] CORS settings allow client origin in `app.js`
- [ ] Port configuration matches client API calls
- [ ] Analytics routes mounted in `app.js`
- [ ] Test endpoints with sample data

---

## Client Integration

The Statistics component automatically detects available endpoints from `CHART_DEFINITIONS`:

```typescript
const chartIds = useMemo(() => Object.keys(CHART_DEFINITIONS) as ChartId[], []);
```

Each chart:
- Fetches from its configured endpoint
- Renders with appropriate chart type (Pie/Bar/Line/Area)
- Applies per-chart colors
- Shows loading/error states
- Supports PDF export

---

## Troubleshooting

### Analytics Tab is Slow
**Cause:** Large database with unindexed fields or slow aggregation
**Solution:**
1. Add database indexes (see Performance Optimization section)
2. Increase `staleTime` in React Query configuration
3. Implement pagination for very large datasets

### "No data" in Charts
**Cause:** Missing or empty data in database
**Solution:**
1. Seed database with sample data
2. Check data format matches expected schema
3. Verify field names in models match aggregation pipelines

### 404 on Analytics Endpoints
**Cause:** Routes not mounted or file not loaded
**Solution:**
1. Verify `app.use('/api/analytics', ...)` in `app.js`
2. Check file paths in require statements
3. Restart server after file changes

---

## Related Documentation
- [Analytics Endpoints API Reference](./ANALYTICS_ENDPOINTS.md)
- [Resident Model Documentation](./src/models/Resident.ts)
- [Client Statistics Component](../client/src/components/admin/Statistics.tsx)
