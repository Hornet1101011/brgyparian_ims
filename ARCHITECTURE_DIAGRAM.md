# Architecture Diagram - MongoDB Direct Analytics

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        REACT CLIENT                              │
│                    (Statistics.tsx Component)                    │
│                                                                   │
│  ├─ useGenderAnalytics()                                        │
│  ├─ useAgeAnalytics()                                           │
│  ├─ useOccupationAnalytics()                                    │
│  └─ ... (other analytics hooks)                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ HTTP GET Requests
                       │ /api/analytics/*
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS ROUTES                                │
│            (server/src/routes/analyticsRoutes.ts)               │
│                                                                   │
│  GET /analytics/gender                                          │
│  GET /analytics/age                                             │
│  GET /analytics/personal-info                                  │
│  GET /analytics/document-requests                              │
│  ... (20+ endpoints)                                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Route Dispatch
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                ANALYTICS CONTROLLER                              │
│       (server/src/controllers/analyticsController.ts)           │
│                                                                   │
│  getGenderDistribution()  ──┐                                   │
│  getAgeDistribution()     ──┤                                   │
│  getPersonalInfoRecords()─┐ │                                   │
│  getDocumentRequests()    │ │                                   │
│  ... (all endpoints)      │ │                                   │
│                            │ │                                   │
└────────────────────────────┼─┼──────────────────────────────────┘
                             │ │
                      Calls  │ │
                             ▼ ▼
┌─────────────────────────────────────────────────────────────────┐
│           MONGO ANALYTICS SERVICE                                │
│    (server/src/services/mongoAnalyticsService.ts)               │
│                                                                   │
│  ┌─ Connection Management                                       │
│  │  ├─ connect() ──────────┐                                   │
│  │  └─ disconnect()        │                                   │
│  │                          │                                   │
│  ├─ Residents Analytics   │                                   │
│  │  ├─ getTotalResidents()                                     │
│  │  ├─ getGenderDistribution()                                │
│  │  ├─ getAgeDistribution()                                   │
│  │  ├─ getFieldDistribution()                                 │
│  │  ├─ getResidents()                                         │
│  │                                                              │
│  ├─ Document Analytics                                         │
│  │  ├─ getDocumentTypeDistribution()                          │
│  │  ├─ getDocumentsByStatus()                                 │
│  │  ├─ getDocumentRequests()                                  │
│  │                                                              │
│  └─ Summary Operations                                         │
│     └─ getDashboardSummary()                                   │
│                                                                   │
│  Uses: MongoDB Driver (Native)                                 │
│  Pattern: Singleton Connection Pooling                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    Gets Collections
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────┐         ┌─────────────┐    ┌──────────┐
    │ MongoDB │ ◄──────►│  Connection │────│  Resident│
    │  Driver │         │    Pool     │    │  Collection
    │         │         │             │    │
    └─────────┘         └─────────────┘    └──────────┘
         ▲                                       │
         │                                       │ Aggregation Pipeline
         │                                       │ ┌──────────────────┐
         │                                       ├─► $match (filter)  │
         │                                       │ ├─ $group (agg)    │
         │                                       │ ├─ $sort           │
         │                                       │ └─ $project        │
         │                                       ▼
         │                                   Results
         │
         │ Direct BSON ↔ JSON
         │
    ┌────────────────────────┐
    │  MongoDB Instance      │
    │  mongodb://...         │
    │  Database: barangay... │
    │                        │
    │ Collections:           │
    │  ├─ residents          │
    │  └─ documentrequests   │
    └────────────────────────┘
```

## Data Flow Diagram

### Example: Getting Gender Distribution

```
1. REACT COMPONENT
   ↓
   useGenderAnalytics()
   ↓
2. HTTP REQUEST
   ↓
   GET /api/analytics/gender
   ↓
3. EXPRESS ROUTE
   ↓
   route matches "/gender"
   ↓
4. CONTROLLER
   ↓
   getGenderDistribution(req, res)
   ├─ Extract query params (startDate, endDate)
   ├─ Build filter object
   ↓
5. MONGODB SERVICE
   ↓
   mongoService.getGenderDistribution(filter)
   ├─ Ensure connected to MongoDB
   ├─ Get residents collection
   ↓
6. AGGREGATION PIPELINE
   ↓
   db.residents.aggregate([
     { $match: filter },
     { $group: {
       _id: gender,
       count: { $sum: 1 }
     }},
     { $sort: { count: -1 }}
   ])
   ↓
7. MONGODB EXECUTION
   ↓
   Process on MongoDB server
   Return results
   ↓
8. SERVICE RESPONSE
   ↓
   {
     success: true,
     data: [{type: 'Male', value: 500}, ...],
     total: 1000,
     timestamp: "..."
   }
   ↓
9. CONTROLLER RESPONSE
   ↓
   res.json(result)
   ↓
10. HTTP RESPONSE
    ↓
    200 OK + JSON body
    ↓
11. REACT QUERY
    ↓
    Update cache
    Render component
    ↓
12. DISPLAY IN UI
    ↓
    Pie chart with gender distribution
```

## Connection Pattern

```
┌─────────────────────────────────────────────┐
│  Singleton Pattern                          │
│                                             │
│  getMongoAnalyticsService() {              │
│    if (!instance) {                        │
│      instance = new Service()              │
│    }                                        │
│    return instance                         │
│  }                                          │
└──────────┬──────────────────────────────────┘
           │
           ├─ First Call
           │  ├─ Create new service
           │  ├─ Connect to MongoDB
           │  └─ Store instance
           │
           └─ Subsequent Calls
              └─ Return cached instance
                 (reuse connection)
```

## Request Routing

```
                     HTTP REQUEST
                          │
                          ▼
              ┌────────────────────────┐
              │   Express Middleware   │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  analyticsRoutes.ts    │
              │                        │
              │  router.get('/...')    │
              └────────────┬───────────┘
                           │
              ┌────────────┴─────────────┐
              │                         │
              ▼                         ▼
      Controller Function    Controller Function
      (getGenderDist...)     (getPersonalInfo...)
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  mongoAnalyticsService │
              │  (singleton)           │
              └────────────┬───────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   MongoDB    │
                    └──────────────┘
```

## Collection Access Pattern

```
┌─────────────────────────────────────────────────────┐
│  MongoDB Instance                                   │
│  URI: mongodb://localhost:27017/barangay-system    │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ Database: barangay-system                   │  │
│  │                                             │  │
│  │ ┌──────────────────────────────────┐       │  │
│  │ │ Collection: residents            │       │  │
│  │ │                                  │       │  │
│  │ │ Documents: {                     │       │  │
│  │ │   _id: ObjectId,                 │       │  │
│  │ │   sex: "Male",                   │       │  │
│  │ │   age: 35,                       │       │  │
│  │ │   occupation: "Teacher",         │       │  │
│  │ │   nationality: "Filipino",       │       │  │
│  │ │   bloodType: "O+",               │       │  │
│  │ │   ... (15+ fields)               │       │  │
│  │ │ }                                │       │  │
│  │ │                                  │       │  │
│  │ │ Indexed on: createdAt, sex, ...  │       │  │
│  │ └──────────────────────────────────┘       │  │
│  │                                             │  │
│  │ ┌──────────────────────────────────┐       │  │
│  │ │ Collection: documentrequests     │       │  │
│  │ │                                  │       │  │
│  │ │ Documents: {                     │       │  │
│  │ │   _id: ObjectId,                 │       │  │
│  │ │   documentType: "Barangay ID",   │       │  │
│  │ │   status: "completed",           │       │  │
│  │ │   createdAt: Date,               │       │  │
│  │ │   ... (other fields)             │       │  │
│  │ │ }                                │       │  │
│  │ │                                  │       │  │
│  │ │ Indexed on: createdAt, status    │       │  │
│  │ └──────────────────────────────────┘       │  │
│  │                                             │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ◄─ Direct Driver Connection                      │
│  ◄─ No ORM Abstraction                            │
│  ◄─ Connection Pooling Enabled                    │
│  ◄─ Read-Only for Analytics                       │
└─────────────────────────────────────────────────────┘
```

## Response Flow

```
MongoDB Server
     │
     │ Aggregation Results
     ▼
[{type: 'Male', value: 500}, {type: 'Female', value: 450}]
     │
     │ Convert to AnalyticsResult
     ▼
{
  success: true,
  data: [...],
  total: 950,
  timestamp: "2025-12-14T10:30:00Z"
}
     │
     │ Controller wraps
     ▼
res.json(result)
     │
     │ HTTP 200
     ▼
Express sends to client
     │
     │ React Query receives
     ▼
Cache updated
     │
     │ useGenderAnalytics() subscribers notified
     ▼
Component re-renders
     │
     │ ECharts renders pie chart
     ▼
Display in UI
```

## Performance Characteristics

```
┌─────────────────────────────────────────┐
│  Latency Timeline                       │
│                                         │
│  Request ──────┐                       │
│                 ├─ Network: 1-2ms      │
│                 │                      │
│  Arrive ────────┤                      │
│                 ├─ Route Matching: <1ms│
│                 │                      │
│  Route ─────────┤                      │
│                 ├─ Controller: 1-2ms   │
│                 │                      │
│  Controller ────┤                      │
│                 ├─ Get Collection: <1ms│
│                 │                      │
│  Collection ────┤                      │
│                 ├─ Aggregation: 20-50ms│
│                 │  (on MongoDB server) │
│                 │                      │
│  Results ───────┤                      │
│                 ├─ Serialize: 1-5ms    │
│                 │                      │
│  Response ──────┤                      │
│                 ├─ Network: 1-2ms      │
│                 │                      │
│  Client ────────┘                      │
│                                         │
│  TOTAL: 25-65ms (typical)              │
│                                         │
└─────────────────────────────────────────┘
```

## Error Handling Flow

```
Request to Endpoint
        │
        ▼
Try {
  Get Service
        │
        ▼
  Call Method
        │
        ▼
  Return Result
}
        │
        └─ Catch Error
             │
             ▼
           Log Error
             │
             ▼
           Format Response
             {
               success: false,
               error: "Error message",
               timestamp: "..."
             }
             │
             ▼
           HTTP 500
             │
             ▼
           Client Receives Error
             │
             ▼
           Query marked as error
             │
             ▼
           UI shows error message
```

---

This architecture enables:
- ✅ High performance (direct MongoDB)
- ✅ Scalability (connection pooling)
- ✅ Reliability (error handling)
- ✅ Maintainability (service abstraction)
- ✅ Type safety (full TypeScript)
