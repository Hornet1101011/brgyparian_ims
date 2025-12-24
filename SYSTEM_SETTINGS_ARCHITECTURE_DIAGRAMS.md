# System Settings Integration - Architecture Diagrams

## 1. Complete System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    COMPLETE SYSTEM FLOW                            │
└────────────────────────────────────────────────────────────────────┘

                           ADMIN SIDE
                       (authenticated)
                       ──────────────

                    ┌──────────────────┐
                    │  Admin Panel     │
                    │  System Settings │
                    └────────┬─────────┘
                             │
                    Update Barangay Info
                    Update Contact Info
                             │
                             ↓
                  ┌─────────────────────┐
                  │ Save Button Click   │
                  └────────┬────────────┘
                           │
                  PATCH /api/admin/settings
                  (requires auth token)
                           │
                           ↓
                  ┌─────────────────────┐
                  │  Express Server     │
                  │  (Backend API)      │
                  └────────┬────────────┘
                           │
                  Validate & Process
                           │
                           ↓
                  ┌─────────────────────┐
                  │  MongoDB Database   │
                  │  SystemSetting      │
                  │  Collection         │
                  │                     │
                  │  Fields:            │
                  │  • siteName         │
                  │  • barangayName     │
                  │  • barangayAddress  │
                  │  • contactEmail     │
                  │  • contactPhone     │
                  │  • systemNotice     │
                  │  • smtp config      │
                  │  • maintenance mode │
                  └─────────┬───────────┘
                            │
                   Data persisted
                            │
                            ↓


                       VISITOR SIDE
                    (unauthenticated)
                    ────────────────

                    ┌──────────────────┐
                    │  Login Page      │
                    │  (Browser)       │
                    └────────┬─────────┘
                             │
              useSystemSettings Hook initializes
                             │
                             ↓
              ┌─────────────────────────────┐
              │  Fetch From API             │
              │  GET /api/settings/public   │
              │  (NO auth required)         │
              └────────┬────────────────────┘
                       │
                       ├─→ Success
                       │   ├─→ Set systemSettings state
                       │   ├─→ Start 30s auto-refresh timer
                       │   └─→ Re-render components
                       │
                       └─→ Error
                           ├─→ Set error state
                           ├─→ Use fallback defaults
                           └─→ Continue with empty state
                             │
                             ↓
            ┌─────────────────────────────────┐
            │  LoginForm Components Render    │
            ├─────────────────────────────────┤
            │  1. BarangayInfoCard            │
            │     ├─ Displays: siteName       │
            │     ├─ Displays: barangayName   │
            │     └─ Displays: barangayAddress│
            │                                 │
            │  2. ContactInfoCard             │
            │     ├─ Email link (if valid)   │
            │     └─ Phone link (if valid)   │
            └────────┬────────────────────────┘
                     │
             Every 30 seconds:
             Hook auto-refreshes
             GET /api/settings/public
                     │
                     ↓
             Data updated in state
                     │
                     ↓
             Components re-render
             with new information
                     │
                     ↓
            ┌──────────────────┐
            │  Visitor Sees    │
            │  Updated Info    │
            │  (within 30s)    │
            └──────────────────┘
```

---

## 2. Component Connection Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     LoginForm.tsx                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  const { settings, loading } =                       │ │
│  │    useSystemSettings(true);                          │ │
│  └──────────────────┬───────────────────────────────────┘ │
│                     │                                      │
│  ┌──────────────────┴───────────────────────────────────┐ │
│  │        Data Available                               │ │
│  │  systemSettings: {                                  │ │
│  │    siteName: "...",                                │ │
│  │    barangayName: "...",                            │ │
│  │    barangayAddress: "...",                         │ │
│  │    contactEmail: "...",                            │ │
│  │    contactPhone: "..."                             │ │
│  │  }                                                 │ │
│  │  loading: boolean                                 │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                     │
│        ┌────────────┴────────────┐                        │
│        ↓                         ↓                        │
│  ┌─────────────────┐      ┌──────────────────┐           │
│  │BarangayInfoCard│      │ContactInfoCard   │           │
│  ├─────────────────┤      ├──────────────────┤           │
│  │ Displays:       │      │ Displays:        │           │
│  │ • siteName      │      │ • contactEmail   │           │
│  │ • barangayName  │      │   (if valid)     │           │
│  │ • barangayAddr  │      │ • contactPhone   │           │
│  │ • Loading state │      │   (if valid)     │           │
│  │ • Empty msg     │      │ • Loading state  │           │
│  │ • Error state   │      │ • Empty msg      │           │
│  └────────┬────────┘      └────────┬─────────┘           │
│           │                        │                     │
│           └────────┬───────────────┘                     │
│                    ↓                                     │
│           Rendered on Login Page                        │
│                    │                                     │
│           ┌────────┴────────┐                           │
│           ↓                 ↓                           │
│        Glass Card 1    Glass Card 2                     │
│        (Barangay)      (Contact)                        │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Hook State Machine

```
┌──────────────────────────────────────────────────────────┐
│           useSystemSettings Hook States                 │
└──────────────────────────────────────────────────────────┘

                    [INITIAL]
                        │
                        │ Mount + fetchSettings()
                        ↓
                    [LOADING]
                        │ (loading = true)
                        │
                    API Request
                    GET /api/settings/public
                        │
        ┌───────────────┴───────────────┐
        │                               │
    Success                         Failure
        │                               │
        ↓                               ↓
    [READY]                        [ERROR]
        │                               │
        │ (loading = false)             │ (loading = false)
        │ (settings = data)             │ (error = message)
        │ (error = null)                │ (settings = defaults)
        │                               │
        │ Timer: 30s                    │ Timer: 30s
        │                               │
        └───────────────┬───────────────┘
                        │
                        │ Auto-refresh triggered
                        │
                    [REFRESHING]
                        │
                    API Request
                    GET /api/settings/public
                        │
                    Back to [READY] or [ERROR]
                        │
        ┌───────────────┴──────────────┐
        │                              │
    (Repeat every 30 seconds until unmount)

                    [CLEANUP]
                        │
                        │ Unmount
                        ↓
                    Clear timers
                    Revoke URLs
                    Clean state
```

---

## 4. Data Transformation Pipeline

```
┌──────────────────────────────────────────────────────────┐
│         Data Journey: Admin → Database → UI            │
└──────────────────────────────────────────────────────────┘

STEP 1: ADMIN INPUT
═════════════════
    ┌──────────────────────────┐
    │ Admin edits form fields: │
    │ • barangayName: "Parian" │
    │ • barangayAddress: "..."  │
    └────────────┬─────────────┘
                 │
                 │ Click Save
                 ↓
STEP 2: VALIDATION (Client)
═══════════════════════════
    ┌──────────────────────────┐
    │ Email validation:        │
    │ Match pattern: /.+@.+\./ │
    │ Valid? → Include in req  │
    │ Invalid? → Skip          │
    └────────────┬─────────────┘
                 │
                 │ Build payload
                 ↓
STEP 3: TRANSMISSION
═══════════════════
    ┌──────────────────────────┐
    │ PATCH /api/admin/settings│
    │ Content-Type: JSON       │
    │ Auth: Bearer token       │
    │ Body: {settings}         │
    └────────────┬─────────────┘
                 │
                 │ Network
                 ↓
STEP 4: SERVER PROCESSING
═════════════════════════
    ┌──────────────────────────┐
    │ Express middleware:      │
    │ • Check auth (admin?)    │
    │ • Validate input         │
    │ • Encrypt password       │
    │ • Process request        │
    └────────────┬─────────────┘
                 │
                 │ Validated
                 ↓
STEP 5: DATABASE STORAGE
════════════════════════
    ┌──────────────────────────┐
    │ MongoDB update:          │
    │ db.systemsettings        │
    │ {                        │
    │   siteName: "...",       │
    │   barangayName: "Parian",│
    │   contactEmail: "..."    │
    │ }                        │
    └────────────┬─────────────┘
                 │
                 │ Persisted
                 ↓
STEP 6: FETCHING (PUBLIC)
═════════════════════════
    ┌──────────────────────────┐
    │ GET /api/settings/public │
    │ (No auth required)       │
    │ Returns ONLY public      │
    │ fields (sanitized)       │
    └────────────┬─────────────┘
                 │
                 │ Response: {data}
                 ↓
STEP 7: HOOK PROCESSING
═══════════════════════
    ┌──────────────────────────┐
    │ useSystemSettings:       │
    │ • Fetch response         │
    │ • Validate data          │
    │ • Set state              │
    │ • Update UI              │
    └────────────┬─────────────┘
                 │
                 │ Data ready
                 ↓
STEP 8: COMPONENT RENDERING
════════════════════════════
    ┌──────────────────────────┐
    │ LoginForm reads state:   │
    │ • If loading: show spin  │
    │ • If error: show message │
    │ • If ready: render cards │
    └────────────┬─────────────┘
                 │
                 │ Component re-render
                 ↓
STEP 9: USER DISPLAY
════════════════════
    ┌──────────────────────────┐
    │ Visitor sees on page:    │
    │ • Barangay Parian        │
    │ • email@example.com (✓)  │
    │ • phone@number (✓)       │
    │                          │
    │ (Updated within 30s)     │
    └──────────────────────────┘
```

---

## 5. Validation Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│           Validation & Display Decision Flow           │
└─────────────────────────────────────────────────────────┘

CONTACT EMAIL FIELD
═══════════════════

        Input: contactEmail
                │
                ↓
    ┌───────────────────────────┐
    │ Is email empty/null?      │
    └────────┬──────────────────┘
             │
        Yes  │  No
            │      │
            ↓      ↓
        HIDDEN   ┌─────────────────────────┐
                 │ Does match pattern:     │
                 │ /^[^\s@]+@[^\s@]+.../?  │
                 └────────┬────────────────┘
                          │
                      Yes │  No
                         │      │
                         ↓      ↓
                    VISIBLE   HIDDEN


CONTACT PHONE FIELD
═══════════════════

        Input: contactPhone
                │
                ↓
    ┌───────────────────────────┐
    │ Is phone empty/null?      │
    └────────┬──────────────────┘
             │
        Yes  │  No
            │      │
            ↓      ↓
        HIDDEN   ┌─────────────────────────┐
                 │ Remove non-digits       │
                 │ Count remaining         │
                 └────────┬────────────────┘
                          │
                    ┌─────┴─────┐
                    │           │
              ≥ 7 digits    < 7 digits
                    │           │
                    ↓           ↓
                 VISIBLE     HIDDEN


RENDER DECISION
═══════════════

    ┌──────────────────────────────┐
    │ if (settingsLoading)         │
    │   → Show Spin               │
    │ else if (no valid data)     │
    │   → Show placeholder msg    │
    │ else                        │
    │   → Show valid data with ✓  │
    └──────────────────────────────┘
```

---

## 6. Timing Diagram

```
┌────────────────────────────────────────────────────────┐
│       Auto-Refresh Timing & User Experience         │
└────────────────────────────────────────────────────────┘

Admin's Timeline              Login Page Timeline
──────────────────           ──────────────────

00:00  [Click Save]          00:00  User loads page
       │                           │
       ↓                           ├─ Start loading
00:01  [DB Updated]          00:01  │
       │                           ├─ Fetch settings
00:15  [Waiting...]          00:15  ├─ Display data
       │                           ├─ Start 30s timer
       │                           │
       │                     00:30  ├─ Timer fires
       │                           ├─ Auto-refresh fires
       │                     00:31  ├─ New data received
00:31  [Data Live!]          00:31  ├─ Components update
                                   │
                             00:32  └─ User sees update ✓


Maximum Delay: 30 seconds from save to display

Faster Option: Manual refresh (instant)
```

---

## 7. Error Handling Decision Tree

```
┌─────────────────────────────────────────────────────┐
│      Error Handling in useSystemSettings Hook     │
└─────────────────────────────────────────────────────┘

                   Fetch Initiated
                        │
                        ↓
            ┌────────────────────────┐
            │ Try fetching from API  │
            │ GET /api/settings      │
            │ /public                │
            └────┬───────────────────┘
                 │
         ┌───────┴────────┐
         │                │
    Success           Network Error
         │                │
         ↓                ├─ Timeout
    [SUCCESS]             ├─ CORS error
    Use fetched data       ├─ 500 error
    Set settings           ├─ 404 error
    Clear error            │
                           ↓
                    [ERROR STATE]
                    Set error message
                    Use default fallback
                    │
                    ├─ siteName: "Barangay..."
                    ├─ barangayName: ""
                    ├─ contactEmail: ""
                    └─ ...all empty
                    │
                    ↓
            App continues working
            with empty values
            User sees helpful messages
```

---

## 8. Integration Points

```
┌───────────────────────────────────────────────────────┐
│              System Integration Map                  │
└───────────────────────────────────────────────────────┘

Frontend                 API                 Database
────────                 ───                 ────────

LoginForm.tsx ────┐
                  │
useSystemSettings ├──→ GET /api/settings   ←──── SystemSetting
                  │    /public (public)        collection
                  │
SystemSettings.tsx ──→ PATCH /api/admin    ←──── SystemSetting
                      /settings (auth)         collection
                      │
                      └─ Update
                      └─ Encrypt password
                      └─ Validate input


Data Sync Points
════════════════
1. Admin saves → Sync to DB immediately
2. Frontend loads → Fetch from public endpoint
3. Auto-refresh → Fetch every 30 seconds
4. Manual refresh → Fetch on demand
```

---

These diagrams provide complete visualization of the system architecture, data flow, validation logic, timing, error handling, and integration points.
