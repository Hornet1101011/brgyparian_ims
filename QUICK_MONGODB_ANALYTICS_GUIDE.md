# Quick Implementation Guide - MongoDB Direct Analytics

## What You Need to Know

Your analytics system now connects **directly to MongoDB** using the native driver instead of Mongoose models. This provides better performance and more control over read operations.

## The Three Core Components

### 1. MongoDB Analytics Service
**Location**: `server/src/services/mongoAnalyticsService.ts`

This is the heart of the system. It:
- Opens/maintains MongoDB connections
- Queries the `residents` collection directly
- Queries the `documentrequests` collection directly
- Returns standardized responses

**Use it like this**:
```typescript
import { getMongoAnalyticsService } from '../services/mongoAnalyticsService';

const service = getMongoAnalyticsService();
const result = await service.getGenderDistribution();
```

### 2. Analytics Controller
**Location**: `server/src/controllers/analyticsController.ts`

Handles HTTP requests by:
- Receiving query parameters (date ranges, filters)
- Calling the MongoDB analytics service
- Returning HTTP responses

### 3. Analytics Routes
**Location**: `server/src/routes/analyticsRoutes.ts`

Maps HTTP endpoints to controller methods.

## How It Works - The Flow

```
Client (React)
    ↓
HTTP Request (GET /api/analytics/gender)
    ↓
Express Route (analyticsRoutes.ts)
    ↓
Controller (analyticsController.ts)
    ↓
MongoDB Service (mongoAnalyticsService.ts)
    ↓
MongoDB (residents collection)
    ↓
Aggregation Pipeline (on MongoDB server)
    ↓
Results → Controller → HTTP Response → Client
```

## Collections Being Used

### Residents Collection
- **What**: All resident records from your barangay system
- **Where**: MongoDB `residents` collection
- **Fields used**: sex, age, occupation, nationality, bloodType, etc.

### Document Requests Collection
- **What**: All document requests submitted
- **Where**: MongoDB `documentrequests` collection
- **Fields used**: documentType, status, createdAt, etc.

## Key Methods in the Service

```typescript
// Get counts
getTotalResidents(filter?)
getTotalDocumentRequests(filter?)

// Get resident demographics
getGenderDistribution(filter?)
getAgeDistribution(filter?)
getFieldDistribution(fieldName, filter?)
getResidents(filter?, limit?)

// Get document analytics
getDocumentTypeDistribution(filter?)
getDocumentsByStatus(filter?)
getDocumentRequests(filter?, limit?)

// Get summary
getDashboardSummary()
```

## Filtering Examples

### By Date Range
```typescript
const filter = {
  createdAt: {
    $gte: new Date('2025-01-01'),
    $lte: new Date('2025-12-31')
  }
};
const result = await service.getGenderDistribution(filter);
```

### By Custom Field
```typescript
const filter = { sex: 'Male' };
const result = await service.getResidents(filter);
```

### Combined
```typescript
const filter = {
  createdAt: { $gte: new Date('2025-01-01') },
  occupation: 'Teacher'
};
const result = await service.getResidents(filter);
```

## API Response Format

All endpoints return:
```json
{
  "success": true/false,
  "data": [...],           // The actual analytics data
  "total": 100,            // Count of items
  "error": "error message", // Only if success=false
  "timestamp": "2025-12-14T10:30:00Z"
}
```

## Adding a New Analytics Field

To add analytics for a new resident field:

1. **Add to service** (mongoAnalyticsService.ts):
```typescript
async getMyFieldDistribution(filter?: Filter<any>): Promise<AnalyticsResult> {
  try {
    const collection = await this.getResidentsCollection();
    const pipeline = [
      ...(filter ? [{ $match: filter }] : []),
      {
        $group: {
          _id: { $toLower: { $trim: { input: { $toString: '$myFieldName' } } } },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];
    const results = await collection.aggregate(pipeline).toArray();
    const total = results.reduce((sum, r) => sum + r.count, 0);
    return { success: true, data: results, total, timestamp: new Date().toISOString() };
  } catch (error) {
    return { success: false, error: error?.message, timestamp: new Date().toISOString() };
  }
}
```

2. **Add controller endpoint** (analyticsController.ts):
```typescript
export const getMyFieldDistribution = async (req: Request, res: Response) => {
  try {
    const mongoService = getMongoAnalyticsService();
    const result = await mongoService.getMyFieldDistribution();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message });
  }
};
```

3. **Add route** (analyticsRoutes.ts):
```typescript
router.get('/my-field', (req: any, res: Response) => getMyFieldDistribution(req, res));
```

## Connection Configuration

The service uses the environment variable `MONGODB_URI`:

```env
MONGODB_URI=mongodb://localhost:27017/barangay-system
```

If not set, it defaults to this connection string.

You can also pass custom options:
```typescript
const service = new MongoAnalyticsService({
  uri: 'mongodb+srv://user:pass@cluster.mongodb.net',
  dbName: 'my-database'
});
```

## Error Handling

The service catches all errors and returns them in the response:

```typescript
// If query fails:
{
  "success": false,
  "error": "Connection timeout",
  "timestamp": "2025-12-14T10:30:00Z"
}
```

## Performance Tips

1. **Use filters** - Narrow down data with date ranges and field filters
2. **Use limits** - When fetching raw data, use the `limit` parameter
3. **Let MongoDB aggregate** - Don't fetch all data and aggregate on the server
4. **Reuse the service** - The singleton pattern ensures connection reuse

## Testing Locally

Start your server and test with curl:

```bash
# Gender distribution
curl http://localhost:5000/api/analytics/gender

# With date filter
curl "http://localhost:5000/api/analytics/gender?startDate=2025-01-01&endDate=2025-12-31"

# Raw resident data
curl http://localhost:5000/api/analytics/personal-info

# Document analytics
curl http://localhost:5000/api/analytics/document-requests
```

## Debugging

Enable detailed logging by checking console output:

```bash
npm run dev  # Starts with nodemon, shows all console.log
```

The service logs:
- MongoDB connection establishment
- Query errors with stack traces
- Aggregation pipeline execution

## Common Patterns

### Get analytics for a specific date
```typescript
const result = await service.getGenderDistribution({
  createdAt: { 
    $gte: new Date('2025-01-01'),
    $lt: new Date('2025-01-02')
  }
});
```

### Get residents with specific criteria
```typescript
const residents = await service.getResidents({
  sex: 'Female',
  age: { $gte: 18, $lte: 65 }
});
```

### Get field distribution with filter
```typescript
const result = await service.getFieldDistribution('occupation', {
  sex: 'Male'
});
```

## No Client-Side Changes Needed

The React analytics hooks (`useGenderAnalytics`, `useAgeAnalytics`, etc.) don't need any changes. They still work exactly the same way, just connecting to faster endpoints now!

```typescript
// This works without any changes:
const genderQuery = useGenderAnalytics();
const ageQuery = useAgeAnalytics();
```

## Monitoring Performance

To check if queries are fast, look at the response time:

```bash
curl -w "\nTime: %{time_total}s\n" http://localhost:5000/api/analytics/gender
```

Direct MongoDB queries should typically complete in <100ms for most analytics operations.

---

**Need more details?** See `MONGODB_DIRECT_ANALYTICS.md` for comprehensive documentation.
