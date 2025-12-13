# MongoDB Direct Analytics System

## Overview

The analytics system has been revised to use **direct MongoDB driver connections** instead of Mongoose models for optimal performance on read-heavy analytics operations. This change provides:

- **Better Performance**: Direct driver access bypasses Mongoose's abstraction layer
- **Scalability**: Efficient aggregation pipelines directly on MongoDB
- **Direct Collection Access**: Direct access to `residents` and `documentrequests` collections via MongoDB URI
- **Real-time Data**: No ORM caching layers - always fresh data

## Architecture

### Core Components

#### 1. MongoDB Analytics Service
**File**: `server/src/services/mongoAnalyticsService.ts`

The central service providing all analytics functionality through direct MongoDB connections.

```typescript
class MongoAnalyticsService {
  // Connection management
  connect(): Promise<void>
  disconnect(): Promise<void>
  
  // Residents collection queries
  getTotalResidents(filter?: Filter<any>): Promise<number>
  getGenderDistribution(filter?: Filter<any>): Promise<AnalyticsResult>
  getAgeDistribution(filter?: Filter<any>): Promise<AnalyticsResult>
  getFieldDistribution(fieldName: string, filter?: Filter<any>): Promise<AnalyticsResult>
  getResidents(filter?: Filter<any>, limit?: number): Promise<AnalyticsResult>
  
  // Document requests collection queries
  getTotalDocumentRequests(filter?: Filter<any>): Promise<number>
  getDocumentTypeDistribution(filter?: Filter<any>): Promise<AnalyticsResult>
  getDocumentsByStatus(filter?: Filter<any>): Promise<AnalyticsResult>
  getDocumentRequests(filter?: Filter<any>, limit?: number): Promise<AnalyticsResult>
  
  // Summary queries
  getDashboardSummary(): Promise<AnalyticsResult>
}
```

**Usage**:
```typescript
import { getMongoAnalyticsService } from '../services/mongoAnalyticsService';

const mongoService = getMongoAnalyticsService();
const result = await mongoService.getGenderDistribution();
```

#### 2. Analytics Controller
**File**: `server/src/controllers/analyticsController.ts`

Updated to use the MongoDB analytics service for all endpoints.

**Key Features**:
- All endpoints use direct MongoDB connections
- Supports filtering by date range, barangay ID, resident type
- Consistent error handling and response formatting
- Real-time data aggregation

#### 3. Analytics Routes
**File**: `server/src/routes/analyticsRoutes.ts`

Comprehensive API endpoints for all analytics operations.

## Collections Accessed

### 1. Residents Collection
Direct access to the `residents` collection containing all resident data.

**Key Fields Used**:
- `sex` - Gender/sex information
- `age` - Age for bucketing
- `occupation` - Occupation data
- `nationality` - Nationality information
- `bloodType` - Blood type
- `disabilityStatus` - Disability status
- `numberOfChildren` - Children count
- `businessType` - Type of business
- `numberOfEmployees` - Business size
- `annualGrossIncome` - Income information
- `educationLevel` - Education level
- `civilStatus` - Marital status
- `religion` - Religious affiliation
- `createdAt` - Record creation date

### 2. Document Requests Collection
Direct access to the `documentrequests` collection containing all document request data.

**Key Fields Used**:
- `documentType` - Type of document requested
- `status` - Request status (pending, completed, rejected, etc.)
- `createdAt` - Request creation date
- `barangayID` - Associated barangay

## API Endpoints

### Summary Endpoints

#### `GET /api/analytics`
Returns monthly analytics summary for the current year.

**Response**:
```json
{
  "year": 2025,
  "summary": {
    "totalResidents": 1000,
    "totalDocuments": 500,
    "genderDistribution": [...],
    "ageDistribution": [...]
  },
  "timestamp": "2025-12-14T10:30:00Z"
}
```

#### `GET /api/analytics/dashboard-summary`
Returns comprehensive dashboard summary statistics.

### Resident Demographics Endpoints

#### `GET /api/analytics/gender`
Gender/sex distribution of residents.

#### `GET /api/analytics/age`
Age distribution with pre-defined buckets (0-18, 19-35, 36-60, 60+).

#### `GET /api/analytics/occupation`
Occupation distribution of residents.

#### `GET /api/analytics/nationality`
Nationality distribution of residents.

#### `GET /api/analytics/blood-type`
Blood type distribution.

#### `GET /api/analytics/disability`
Disability status distribution.

#### `GET /api/analytics/education`
Education level distribution.

#### `GET /api/analytics/civil-status`
Marital/civil status distribution.

#### `GET /api/analytics/religion`
Religious affiliation distribution.

#### `GET /api/analytics/children-count`
Number of children distribution.

#### `GET /api/analytics/business-type`
Business type distribution for residents with businesses.

#### `GET /api/analytics/business-size`
Business size (number of employees) distribution.

#### `GET /api/analytics/income-brackets`
Annual gross income distribution by brackets.

### Raw Data Endpoints

#### `GET /api/analytics/personal-info`
Returns raw resident data for client-side processing.

**Query Parameters**:
- `startDate` - Filter by start date (ISO format)
- `endDate` - Filter by end date (ISO format)
- `barangayID` - Filter by barangay ID
- `residentType` - Filter by resident type
- `limit` - Maximum records to return (default: 10000)

**Response**:
```json
{
  "data": [...],
  "total": 1000,
  "success": true,
  "timestamp": "2025-12-14T10:30:00Z"
}
```

#### `GET /api/analytics/document-requests`
Returns raw document request data for client-side processing.

**Query Parameters**:
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `limit` - Maximum records to return (default: 10000)

### Document Analytics Endpoints

#### `GET /api/analytics/document-types`
Document type distribution from requests.

#### `GET /api/analytics/document-status`
Document request status distribution (pending, completed, rejected, etc.).

### Generic Endpoints

#### `GET /api/analytics/field`
Generic field distribution endpoint for custom field analysis.

**Query Parameters**:
- `field` - Field name to aggregate (required)
- `startDate` - Optional start date filter
- `endDate` - Optional end date filter

## Configuration

### MongoDB Connection
The service automatically uses the `MONGODB_URI` environment variable:

```env
MONGODB_URI=mongodb://localhost:27017/barangay-system
```

### Database Name
Default: `barangay-system`

Override by passing options to the service:
```typescript
const service = getMongoAnalyticsService({
  uri: 'mongodb://...',
  dbName: 'custom-db-name'
});
```

## Usage Examples

### Client-side (React)
```typescript
import { useAnalytics } from '../../hooks/useAnalytics';

// In your component
const genderQuery = useGenderAnalytics();

if (genderQuery.isLoading) {
  return <Spinner />;
}

if (genderQuery.isError) {
  return <ErrorMessage error={genderQuery.error} />;
}

// genderQuery.data contains the result
const chartData = genderQuery.data?.data;
```

### Server-side (Direct)
```typescript
import { getMongoAnalyticsService } from '../services/mongoAnalyticsService';

async function getStats() {
  const service = getMongoAnalyticsService();
  
  // Get gender distribution
  const genderDist = await service.getGenderDistribution();
  
  // Get with date filter
  const filter = {
    createdAt: {
      $gte: new Date('2025-01-01'),
      $lte: new Date('2025-12-31')
    }
  };
  const yearGenderDist = await service.getGenderDistribution(filter);
  
  // Get all residents
  const residents = await service.getResidents();
  
  // Get document requests
  const documents = await service.getDocumentRequests();
}
```

## Performance Benefits

1. **Direct Driver Access**: No Mongoose abstraction overhead
2. **Aggregation Pipeline**: Complex queries run on MongoDB server
3. **Efficient Filtering**: Date ranges and field filters processed at database level
4. **Connection Pooling**: Reusable MongoDB connections
5. **Lean Documents**: Direct BSON to JSON conversion

## Response Format

All endpoints follow a consistent response format:

```json
{
  "success": boolean,
  "data": any[],           // Analytics data
  "total": number,         // Total count
  "error": string,         // Error message (if failed)
  "timestamp": string      // ISO timestamp
}
```

## Error Handling

All errors are caught and returned in the consistent response format:

```json
{
  "success": false,
  "error": "Connection failed",
  "timestamp": "2025-12-14T10:30:00Z"
}
```

## Migration Notes

- **Old Mongoose models**: Still available but not used by analytics
- **Backward compatibility**: API endpoints remain the same
- **Client code**: No changes required to client-side analytics hooks
- **Direct collection names**: Uses lowercase collection names (`residents`, `documentrequests`)

## Testing

Test the connection with:
```bash
curl http://localhost:5000/api/analytics/dashboard-summary
curl http://localhost:5000/api/analytics/gender
curl http://localhost:5000/api/analytics/personal-info
curl http://localhost:5000/api/analytics/document-requests
```

## Future Enhancements

- [ ] Add caching layer for frequently accessed statistics
- [ ] Implement incremental aggregation for real-time updates
- [ ] Add batch query support for multiple analytics requests
- [ ] Implement query result streaming for large datasets
- [ ] Add query performance monitoring and optimization
