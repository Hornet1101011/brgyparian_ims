# Quick Fix: Statistics Component Error Handling

## What Was Wrong
The `GET http://localhost:3000/api/analytics/personal-info 500` errors occurred because:
1. ❌ Package.json had proxy hardcoded to localhost:5000
2. ❌ .env files didn't point to Render backend
3. ❌ analyticsFetching.ts used plain axios instead of configured axiosInstance

## What Was Fixed
1. ✅ Removed proxy from package.json
2. ✅ Added REACT_APP_API_URL to .env and .env.production
3. ✅ Updated analyticsFetching.ts to use axiosInstance
4. ✅ Updated API endpoint paths (now relative to /api base)

## Steps to Verify the Fix

### Step 1: Restart Frontend Server
```powershell
# In the client directory
npm start
# Or if using craco:
npm run start
```

### Step 2: Clear Browser Cache
- Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
- Clear cookies and cache for localhost:3000
- Refresh the page

### Step 3: Open DevTools & Check Network
1. Press `F12` to open Developer Tools
2. Go to "Network" tab
3. Navigate to Analytics page
4. Look for requests to:
   - `https://alphaversion.onrender.com/api/analytics/personal-info`
   - `https://alphaversion.onrender.com/api/analytics/document-requests`
5. Should see ✅ 200 OK responses (not 500 errors)

### Step 4: Verify Charts Load
- Check that statistics charts render with data
- No red error messages should appear
- Summary cards should show resident counts

## Immediate Improvements to Add

### 1. Add Error Alert (5 min)
In `Statistics.tsx`, add error alerts for failed queries:

```typescript
{/* Error Alerts */}
{chartIds.map(id => {
  const q = allQueries[id as keyof typeof allQueries];
  if (q?.isError) {
    return (
      <Alert
        key={id}
        message={`Error loading ${CHART_DEFINITIONS[id as ChartId].title}`}
        description={(q.error as any)?.message || 'Failed to fetch data. Check backend connection.'}
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }
  return null;
})}
```

### 2. Add Loading Spinners (10 min)
Show skeleton loaders while fetching:

```typescript
{selectedCharts.map((chartId) => {
  const q = allQueries[chartId as keyof typeof allQueries];
  
  if (q?.isLoading || chartLoading[chartId]) {
    return (
      <Col key={chartId} xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      </Col>
    );
  }
  
  // ... rest of chart rendering
})}
```

### 3. Add Data Quality Badge (5 min)
Show quality indicator on each chart:

```typescript
<Card
  title={
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{CHART_DEFINITIONS[chartId].title}</span>
      <Tag color={
        allQueries[chartId].data?.metadata?.dataQuality === 'high' ? 'green' :
        allQueries[chartId].data?.metadata?.dataQuality === 'medium' ? 'orange' : 'red'
      }>
        {allQueries[chartId].data?.metadata?.dataQuality?.toUpperCase()}
      </Tag>
    </div>
  }
  // ...
>
```

### 4. Add Record Count (2 min)
Show "n=XXX records" in subtitle:

```typescript
<Card
  title={CHART_DEFINITIONS[chartId].title}
  extra={<small>{allQueries[chartId].data?.metadata?.total || 0} records</small>}
  // ...
>
```

## Environment Variables Recap

**During Development (.env)**:
```
GENERATE_SOURCEMAP=false
REACT_APP_API_URL=https://alphaversion.onrender.com/api
```

**During Production (.env.production)**:
```
REACT_APP_API_URL=https://alphaversion.onrender.com/api
```

**What axiosInstance Will Use**:
- Primary: Runtime config from `/config.json` (if available)
- Secondary: `REACT_APP_API_URL` environment variable
- Fallback: Relative `/api` path (not used anymore)

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Still getting 500 errors | Frontend not restarted | Stop/restart `npm start` |
| Getting 404 errors | Wrong backend URL | Check .env files and axiosInstance config |
| Charts not updating | Stale cache | Clear browser cache or analytics cache |
| CORS errors | Backend not accepting requests | Check backend CORS settings |
| Empty charts | No resident data | Backend needs populated database |

## Testing with curl

Verify backend is responding correctly:

```powershell
# Test backend directly
curl -X GET "https://alphaversion.onrender.com/api/analytics/personal-info" `
  -H "Content-Type: application/json" `
  -v

# Expected: 200 OK with JSON array or data object
```

If this works but the frontend still fails, the issue is in frontend configuration.

## File Changes Summary

| File | Change | Reason |
|------|--------|--------|
| `package.json` | Removed proxy | Avoid hardcoded localhost |
| `.env` | Added REACT_APP_API_URL | Dev backend URL |
| `.env.production` | Set correct backend URL | Prod backend URL |
| `analyticsFetching.ts` | Use axiosInstance | Use configured base URL |

## Next Steps

After confirming the fix works:

1. Commit changes: `git push origin test-fixes`
2. Deploy frontend build with correct .env.production
3. Test in production environment
4. Implement the suggested improvements from STATISTICS_IMPROVEMENTS.md
5. Monitor analytics page for any remaining errors

## Support Information

- Backend URL: `https://alphaversion.onrender.com`
- Frontend URL: `http://localhost:3000` (dev) or production domain
- API Base Path: `/api`
- Analytics Endpoints: `/api/analytics/*`

