# Server Statistics Best Practices & Utilities

This document provides best practices, utility functions, and advanced patterns for working with the analytics system.

---

## Table of Contents

1. [Data Normalization](#data-normalization)
2. [Aggregation Patterns](#aggregation-patterns)
3. [Error Handling](#error-handling)
4. [Performance Tips](#performance-tips)
5. [Common Utility Functions](#common-utility-functions)
6. [Testing Analytics](#testing-analytics)
7. [Monitoring & Debugging](#monitoring--debugging)

---

## Data Normalization

### String Field Normalization

All string fields in analytics are normalized to ensure consistency:

```typescript
// Pattern: Trim whitespace and convert to lowercase
const normalizeString = (value: string | null | undefined): string => {
  return (value || '').trim().toLowerCase();
};

// Usage in aggregation:
{ 
  $project: { 
    normalized: { 
      $toLower: { $trim: { input: { $ifNull: ['$field', ''] } } } 
    } 
  } 
}
```

### Gender Normalization

Special handling for gender fields with prefix matching:

```typescript
// JavaScript normalization
const normalizeGender = (raw: string): 'Male' | 'Female' | 'Other' | 'Unknown' => {
  const norm = (raw || '').trim().toLowerCase();
  if (!norm) return 'Unknown';
  if (norm.startsWith('m')) return 'Male';
  if (norm.startsWith('f')) return 'Female';
  return 'Other';
};

// MongoDB aggregation pattern
{
  $switch: {
    branches: [
      { case: { $regexMatch: { input: '$sexNorm', regex: '^m' } }, then: 'Male' },
      { case: { $regexMatch: { input: '$sexNorm', regex: '^f' } }, then: 'Female' }
    ],
    default: 'Other'
  }
}
```

### Numeric Conversion

Safely convert string numbers to integers:

```typescript
// MongoDB aggregation pattern
{ 
  $project: { 
    ageNum: { 
      $toInt: { 
        $toString: { $ifNull: ['$age', '0'] } 
      } 
    } 
  } 
}

// JavaScript utility
const toInteger = (value: any): number => {
  const num = Number(value);
  return isNaN(num) ? 0 : Math.floor(num);
};
```

---

## Aggregation Patterns

### Pattern 1: Simple Group & Count

Group by a single field and count occurrences:

```javascript
const simpleCounting = [
  { $match: { field: { $exists: true, $ne: null } } },
  { $group: { _id: '$field', count: { $sum: 1 } } },
  { $project: { _id: 0, type: '$_id', value: '$count' } },
  { $sort: { value: -1 } }
];
```

**Use Case:** Civil status, education level, occupation

### Pattern 2: Bucketing Numeric Values

Group numeric values into ranges:

```javascript
const ageBucketing = [
  { $match: { age: { $exists: true, $ne: null } } },
  { 
    $project: { 
      ageNum: { $toInt: { $toString: '$age' } },
      ageGroup: {
        $switch: {
          branches: [
            { case: { $and: [{ $gte: ['$ageNum', 0] }, { $lte: ['$ageNum', 18] }] }, then: '0-18' },
            { case: { $and: [{ $gte: ['$ageNum', 19] }, { $lte: ['$ageNum', 35] }] }, then: '19-35' },
            { case: { $and: [{ $gte: ['$ageNum', 36] }, { $lte: ['$ageNum', 60] }] }, then: '36-60' },
            { case: { $gte: ['$ageNum', 61] }, then: '60+' }
          ],
          default: 'Unknown'
        }
      }
    }
  },
  { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
  { $sort: { '_id': 1 } }
];
```

**Use Case:** Age groups, income brackets, employee counts

### Pattern 3: Time-Based Grouping

Group by time periods (month, year, quarter):

```javascript
const monthlyGrouping = [
  { 
    $group: { 
      _id: { 
        year: { $year: '$dateField' }, 
        month: { $month: '$dateField' } 
      }, 
      count: { $sum: 1 } 
    } 
  },
  { $sort: { '_id.year': 1, '_id.month': 1 } },
  { 
    $project: {
      _id: 0,
      type: { 
        $concat: [ 
          { $toString: '$_id.year' }, 
          '-', 
          { $cond: [ 
            { $lt: ['$_id.month', 10] }, 
            { $concat: ['0', { $toString: '$_id.month' }] }, 
            { $toString: '$_id.month' } 
          ] } 
        ] 
      },
      value: '$count'
    }
  }
];
```

**Use Case:** Monthly document requests, quarterly trends

### Pattern 4: Conditional Aggregation

Use conditional logic in aggregations:

```javascript
const conditionalCounting = [
  { 
    $group: { 
      _id: null,
      documentCount: { 
        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } 
      },
      pendingCount: { 
        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
      }
    } 
  }
];
```

**Use Case:** Status-based counts, conditional metrics

---

## Error Handling

### Standard Try-Catch Pattern

```typescript
export const getAnalytic = async (req: Request, res: Response) => {
  try {
    // Validate input
    if (!req.query.field) {
      return res.status(400).json({ message: 'Missing required field parameter' });
    }

    // Query database
    const result = await Model.aggregate([...]);

    // Validate result
    if (!result || result.length === 0) {
      return res.json({ data: [], totalResidents: 0 });
    }

    // Return success
    return res.json({ data: result, totalResidents: result.length });
  } catch (error) {
    console.error('Error in getAnalytic:', error);
    return res.status(500).json({ 
      message: 'Error fetching analytics',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};
```

### Input Validation

```typescript
const validateDateRange = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return { valid: true, errors: [] };

  const errors: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    errors.push('Invalid startDate format. Use YYYY-MM-DD');
  }
  if (isNaN(end.getTime())) {
    errors.push('Invalid endDate format. Use YYYY-MM-DD');
  }
  if (start > end) {
    errors.push('startDate must be before endDate');
  }

  return { valid: errors.length === 0, errors };
};
```

### Graceful Empty State Handling

```typescript
export const ensureAllBuckets = (data: any[], buckets: string[]) => {
  const map = data.reduce((acc, d) => {
    acc[d.type || d.name] = d.value;
    return acc;
  }, {} as Record<string, number>);

  return buckets.map(bucket => ({
    type: bucket,
    value: map[bucket] || 0
  }));
};
```

---

## Performance Tips

### 1. Database Indexing

Create indexes for frequently aggregated fields:

```javascript
// In a migration or seed script
async function ensureIndexes(db) {
  const collections = {
    residents: ['sex', 'age', 'civilStatus', 'educationalAttainment'],
    documentRequests: ['dateRequested', 'type', 'status']
  };

  for (const [collName, fields] of Object.entries(collections)) {
    const coll = db.collection(collName);
    for (const field of fields) {
      try {
        await coll.createIndex({ [field]: 1 });
        console.log(`Created index on ${collName}.${field}`);
      } catch (e) {
        console.warn(`Index already exists or failed: ${field}`);
      }
    }
  }
}
```

### 2. Allowdiskuse for Large Datasets

Always use `allowDiskUse(true)` for aggregations:

```typescript
const result = await Resident.aggregate(pipeline)
  .allowDiskUse(true)
  .exec();
```

This allows MongoDB to spill to disk if aggregation results exceed memory limits.

### 3. Match Early in Pipeline

Push `$match` stages as early as possible:

```javascript
// ❌ Bad: Filters after group (inefficient)
const pipeline = [
  { $group: { _id: '$status', count: { $sum: 1 } } },
  { $match: { '_id.year': 2024 } }
];

// ✅ Good: Filter before processing
const pipeline = [
  { $match: { dateRequested: { $gte: new Date('2024-01-01') } } },
  { $group: { _id: '$status', count: { $sum: 1 } } }
];
```

### 4. Limit Results

For endpoints with potential large output:

```typescript
{ $limit: 1000 }  // Added to pipeline
```

### 5. Use Projection to Reduce Data

Only project needed fields:

```javascript
// ❌ Bad: All fields included
{ $project: { _id: 1, sex: 1, age: 1, all_other_fields: 1 } }

// ✅ Good: Only needed fields
{ $project: { sex: 1 } }
```

---

## Common Utility Functions

### Analytics Response Builder

```typescript
interface AnalyticsResponse<T> {
  data: T[];
  totalResidents?: number;
  error?: string;
}

const buildResponse = <T>(data: T[], total?: number): AnalyticsResponse<T> => ({
  data,
  totalResidents: total || data.length
});
```

### Field Aggregation Helper

```typescript
const aggregateField = async (
  model: mongoose.Model<any>,
  field: string,
  match?: object
): Promise<{ name: string; value: number }[]> => {
  const pipeline = [
    { $match: { [field]: { $exists: true, $ne: null }, ...match } },
    {
      $project: {
        normalized: {
          $toLower: { $trim: { input: { $toString: { $ifNull: [`$${field}`, ''] } } } }
        }
      }
    },
    { $group: { _id: '$normalized', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];

  const results = await model.aggregate(pipeline);
  return results.map(r => ({
    name: r._id.charAt(0).toUpperCase() + r._id.slice(1),
    value: r.count
  }));
};
```

### Bucket Creator

```typescript
const createBuckets = (
  data: { _id: number; count: number }[],
  bucketRanges: { key: string; min: number; max?: number }[]
): { name: string; value: number }[] => {
  const buckets: Record<string, number> = {};
  bucketRanges.forEach(r => buckets[r.key] = 0);

  for (const item of data) {
    const num = Number(item._id) || 0;
    const bucket = bucketRanges.find(r => 
      num >= r.min && (r.max === undefined || num <= r.max)
    );
    if (bucket) {
      buckets[bucket.key] = (buckets[bucket.key] || 0) + item.count;
    }
  }

  return Object.keys(buckets).map(key => ({
    name: key,
    value: buckets[key]
  }));
};
```

---

## Testing Analytics

### Unit Test Example

```typescript
import { getGenderDistribution } from '../controllers/analyticsController';
import { Resident } from '../models/Resident';

describe('Analytics Controller', () => {
  it('should return gender distribution', async () => {
    // Mock aggregate
    const mockAggregate = jest.spyOn(Resident, 'aggregate');
    mockAggregate.mockResolvedValue([
      { _id: 'male', count: 10 },
      { _id: 'female', count: 15 }
    ]);

    const req = {} as any;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    } as any;

    await getGenderDistribution(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          { name: 'Male', value: 10 },
          { name: 'Female', value: 15 }
        ])
      })
    );

    mockAggregate.mockRestore();
  });
});
```

### Integration Test Example

```typescript
import request from 'supertest';
import app from '../app';

describe('Analytics Endpoints', () => {
  it('GET /api/analytics/gender should return gender data', async () => {
    const response = await request(app)
      .get('/api/analytics/gender')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('should handle missing data gracefully', async () => {
    const response = await request(app)
      .get('/api/analytics/nonexistent')
      .expect(404);
  });
});
```

### Load Test Example

```typescript
// Simple load test with artillery
const payload = {
  target: 'http://localhost:5000',
  phases: [
    { duration: 10, arrivalRate: 5, name: 'Warm up' },
    { duration: 30, arrivalRate: 20, name: 'Sustained load' },
    { duration: 5, arrivalRate: 0, name: 'Cool down' }
  ],
  scenarios: [
    {
      name: 'Analytics endpoints',
      flow: [
        { get: { url: '/api/analytics/summary' } },
        { get: { url: '/api/analytics/gender' } },
        { get: { url: '/api/analytics/age' } }
      ]
    }
  ]
};
```

---

## Monitoring & Debugging

### Add Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

export const getAnalytic = async (req: Request, res: Response) => {
  logger.info(`Fetching analytic: ${req.path}`);
  
  try {
    const result = await Model.aggregate(pipeline);
    logger.info(`Analytics result count: ${result.length}`);
    return res.json(result);
  } catch (error) {
    logger.error(`Analytics error: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

### Monitor Query Performance

```typescript
// Add timing to aggregation
const startTime = Date.now();
const result = await Resident.aggregate(pipeline).allowDiskUse(true);
const duration = Date.now() - startTime;

console.log(`Aggregation took ${duration}ms for ${result.length} results`);

// Log slow queries (> 1000ms)
if (duration > 1000) {
  logger.warn(`Slow aggregation (${duration}ms): ${JSON.stringify(pipeline)}`);
}
```

### Debug Aggregation

```typescript
// Print aggregation stages for debugging
const debugPipeline = (pipeline: any[]) => {
  pipeline.forEach((stage, idx) => {
    console.log(`Stage ${idx}:`, JSON.stringify(stage, null, 2));
  });
};

debugPipeline(myPipeline);

// Run aggregation with explain to see execution stats
const stats = await Resident.aggregate(pipeline).explain('executionStats');
console.log('Execution stats:', stats);
```

---

## Common Pitfalls to Avoid

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Missing null checks | Crashes on null/undefined | Use `$ifNull` in pipelines |
| No disk space allocation | OOM errors | Use `allowDiskUse(true)` |
| Late filtering | Slow aggregations | Push `$match` early |
| Unindexed fields | Slow queries | Create indexes on aggregation fields |
| Type mismatches | Inconsistent results | Use `$toString`, `$toInt` for normalization |
| No error handling | Unhandled crashes | Wrap with try-catch, log errors |
| Large result sets | Memory issues | Add `$limit` or pagination |

---

## Resources

- [MongoDB Aggregation Framework](https://docs.mongodb.com/manual/aggregation/)
- [Mongoose Aggregate Documentation](https://mongoosejs.com/docs/api.html#aggregate)
- [Query Performance Analysis](https://docs.mongodb.com/manual/tutorial/analyze-query-performance/)

