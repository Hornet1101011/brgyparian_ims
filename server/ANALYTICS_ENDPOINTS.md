# Analytics Endpoints Documentation

This document describes all available analytics endpoints for the Alphaversion Admin Dashboard Statistics component.

## Base URL
```
/api/analytics
```

---

## Endpoints Overview

### 1. **Summary Statistics**
**Endpoint:** `GET /api/analytics/summary`

**Purpose:** Fetch total resident count and document request statistics

**Query Parameters:**
- `startDate` (optional): Start date for filtering (YYYY-MM-DD format)
- `endDate` (optional): End date for filtering (YYYY-MM-DD format)
- `residentType` (optional): Filter by resident type

**Response Format:**
```json
{
  "totalResidents": 1250,
  "totalDocumentRequests": 3840,
  "requestsByType": [
    { "type": "Birth Certificate", "value": 1200 },
    { "type": "Barangay Clearance", "value": 2640 }
  ]
}
```

**Used In:** Summary metric cards displaying total residents and total documents

---

### 2. **Gender Distribution**
**Endpoint:** `GET /api/analytics/gender`

**Purpose:** Group residents by sex/gender (Male, Female, Other, Unknown)

**Response Format:**
```json
{
  "data": [
    { "type": "Male", "value": 650 },
    { "type": "Female", "value": 580 },
    { "type": "Other", "value": 15 },
    { "type": "Unknown", "value": 5 }
  ]
}
```

**Chart Type:** Pie Chart  
**Colors:** `['#1890ff', '#00bcd4', '#888888']`

---

### 3. **Age Distribution**
**Endpoint:** `GET /api/analytics/age`

**Purpose:** Bucket residents into age groups (0-18, 19-35, 36-60, 60+)

**Response Format:**
```json
{
  "data": [
    { "type": "0-18", "value": 180 },
    { "type": "19-35", "value": 520 },
    { "type": "36-60", "value": 410 },
    { "type": "60+", "value": 140 }
  ]
}
```

**Chart Type:** Bar Chart  
**Colors:** `['#1890ff']`

**Notes:**
- Age values are normalized from numeric strings in the Resident model
- Residents without age data are excluded from results

---

### 4. **Civil Status Distribution**
**Endpoint:** `GET /api/analytics/civil-status`

**Purpose:** Group residents by civil status (Single, Married, Divorced, Widowed, etc.)

**Response Format:**
```json
{
  "data": [
    { "type": "Married", "value": 720 },
    { "type": "Single", "value": 450 },
    { "type": "Widowed", "value": 65 },
    { "type": "Separated", "value": 15 }
  ]
}
```

**Chart Type:** Bar Chart  
**Colors:** `['#1890ff']`

**Notes:**
- Empty, N/A, and unknown values are normalized to "Unknown"
- Results sorted by frequency (highest first)

---

### 5. **Educational Attainment Distribution**
**Endpoint:** `GET /api/analytics/education`

**Purpose:** Group residents by education level (Elementary, High School, College, etc.)

**Response Format:**
```json
{
  "data": [
    { "type": "High School", "value": 620 },
    { "type": "College", "value": 450 },
    { "type": "Elementary", "value": 140 },
    { "type": "Postgraduate", "value": 40 }
  ]
}
```

**Chart Type:** Bar Chart  
**Colors:** `['#13c2c2']`

**Notes:**
- Empty, N/A, and unknown values are normalized to "Unknown"
- Results sorted by frequency (highest first)

---

### 6. **Monthly Document Requests**
**Endpoint:** `GET /api/analytics/documents-monthly`

**Purpose:** Track document request volume by month (for current year)

**Response Format:**
```json
{
  "data": [
    { "type": "2024-01", "value": 245 },
    { "type": "2024-02", "value": 198 },
    { "type": "2024-03", "value": 267 },
    { "type": "2024-12", "value": 189 }
  ]
}
```

**Chart Type:** Line Chart  
**Colors:** `['#722ed1']`

**Notes:**
- Format: YYYY-MM
- Sorted chronologically
- Uses `dateRequested` field from DocumentRequest model

---

## Advanced Endpoints (TypeScript Implemented)

These endpoints provide more granular analytics across various resident attributes:

### Field Endpoints
All field endpoints return: `{ field: string, totalResidents: number, data: [{ name: string, value: number }] }`

- `GET /api/analytics/occupation` - Occupation distribution
- `GET /api/analytics/nationality` - Nationality distribution
- `GET /api/analytics/blood-type` - Blood type distribution
- `GET /api/analytics/disability` - Disability status distribution
- `GET /api/analytics/business-type` - Business type distribution

### Bucketed Endpoints

**Children Count Distribution:**  
`GET /api/analytics/children-count`
- Buckets: 0, 1, 2, 3, 4, 5, 6+

**Business Size Distribution:**  
`GET /api/analytics/business-size`
- Buckets: 0, 1-5, 6-20, 21-100, 100+

**Income Brackets:**  
`GET /api/analytics/income-brackets`
- Buckets: <10k, 10k-50k, 50k-100k, 100k-500k, 500k+

**Monthly Analytics (All Data):**  
`GET /api/analytics/`
- Returns monthly data for: document requests, inquiries, and active residents

---

## Error Handling

All endpoints return error responses with status 500 on failure:

```json
{
  "error": "Failed to fetch gender distribution"
}
```

**Common Issues:**
1. **Missing or misconfigured Resident/DocumentRequest models** - Ensure models are properly imported
2. **Empty database** - All endpoints gracefully handle zero results
3. **Database connection issues** - Check MongoDB URI configuration

---

## Data Normalization Rules

### String Fields (Gender, Civil Status, Education, etc.)
1. Trim whitespace: `"  Male  "` → `"Male"`
2. Convert to lowercase: `"MALE"` → `"male"`
3. Match prefixes (gender only): `"m"` → `"Male"`, `"f"` → `"Female"`
4. Empty/null values → `"Unknown"`

### Numeric Fields (Age, Income, etc.)
1. Convert to integer using `$toInt`
2. Handle non-numeric strings gracefully
3. Null/empty → 0 or excluded from results

---

## Integration with Statistics Component

The client Statistics component (`client/src/components/admin/Statistics.tsx`) integrates with these endpoints via the `CHART_DEFINITIONS` object:

```typescript
const CHART_DEFINITIONS = {
  gender: { 
    title: 'Sex Distribution', 
    chartType: 'pie', 
    endpoint: '/analytics/gender', 
    colors: ['#1890ff', '#00bcd4', '#888888'] 
  },
  age: { 
    title: 'Age Groups', 
    chartType: 'bar', 
    endpoint: '/analytics/age', 
    colors: ['#1890ff'] 
  },
  'civil-status': { 
    title: 'Civil Status', 
    chartType: 'bar', 
    endpoint: '/analytics/civil-status', 
    colors: ['#1890ff'] 
  },
  education: { 
    title: 'Education', 
    chartType: 'bar', 
    endpoint: '/analytics/education', 
    colors: ['#13c2c2'] 
  },
  'documents-monthly': { 
    title: 'Monthly Document Requests', 
    chartType: 'line', 
    endpoint: '/analytics/documents-monthly', 
    colors: ['#722ed1'] 
  },
};
```

---

## Query Performance Considerations

1. **Aggregation Pipelines:** All endpoints use MongoDB aggregation with `allowDiskUse(true)` for large datasets
2. **Disk Space:** Monthly document aggregation may use disk space for datasets > 100MB
3. **Indexing:** Ensure indexes exist on:
   - `Resident.sex`
   - `Resident.age`
   - `Resident.civilStatus`
   - `Resident.educationalAttainment`
   - `DocumentRequest.dateRequested`

---

## Testing Endpoints

Using curl:

```bash
# Summary
curl http://localhost:5000/api/analytics/summary

# Gender distribution
curl http://localhost:5000/api/analytics/gender

# Age distribution
curl http://localhost:5000/api/analytics/age

# With date range
curl "http://localhost:5000/api/analytics/summary?startDate=2024-01-01&endDate=2024-12-31"
```

---

## Related Files

- **Server Routes:** `server/src/routes/analyticsRoutes.ts`
- **Server Controller:** `server/src/controllers/analyticsController.ts`
- **Client Component:** `client/src/components/admin/Statistics.tsx`
- **Models:**
  - `server/src/models/Resident.ts`
  - `server/src/models/DocumentRequest.ts`

---

## Version History

- **v1.0** - Initial implementation with 6 core endpoints
- **v1.1** - Added TypeScript controller with extended endpoints
- **v1.2** - Performance optimizations for large datasets (allowDiskUse)
