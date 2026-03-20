# Appointment Scheduling Fix - AppointmentSlots Collection Integration

## Problem
When staff scheduled appointments through the StaffCalendar component, the appointment was created as an Inquiry but **AppointmentSlot entries were NOT being created**. This prevented:
- Appointments from appearing in the AppointmentSlots collection
- Residents from seeing appointments in their "Your Appointments" dashboard card

## Root Cause
The appointment workflow had two separate API endpoints:
1. `POST /inquiries` - `createInquiry()` - Creates Inquiry document but does NOT create AppointmentSlots
2. `PUT /inquiries/:id/schedule` - `updateInquiry()` - Creates AppointmentSlots and updates inquiry with scheduledDates

The `saveSingleAppointment()` function was only calling the first endpoint and not the second.

## Solution Implemented
Modified `client/src/components/staff/StaffCalendar.tsx` to chain two API calls:

### Step 1: Create Inquiry
```typescript
const payload = {
  username: singleResident.username,
  type: 'SCHEDULE_APPOINTMENT',
  status: 'scheduled',
  locationType: singleLocationType,
  location: singleLocation,
  description: singleDescription,
  urgency: singleUrgency,
};
const created = await contactAPI.submitInquiry(payload);
```
This creates the Inquiry document without appointment dates.

### Step 2: Schedule Appointment (Create AppointmentSlots)
```typescript
const scheduledDates = [{ date: singleDate, startTime: singleStartTime, endTime: singleEndTime }];
const scheduled = await contactAPI.scheduleInquiry(created._id, scheduledDates);
```
This calls the scheduling endpoint which:
- Validates the scheduled date/time
- Updates the Inquiry with `scheduledDates` array
- Creates AppointmentSlot documents in the database
- Sends notification email to resident

## Complete Appointment Workflow

### 1. Staff Creates Appointment (StaffCalendar)
```
Staff selects resident + date + time
    ↓
saveSingleAppointment() called
    ↓
Step 1: submitInquiry() → POST /inquiries → Creates Inquiry
    ↓
Step 2: scheduleInquiry() → POST /inquiries/:id → Creates AppointmentSlots
    ↓
Inquiry saved with:
  - type: 'SCHEDULE_APPOINTMENT'
  - status: 'scheduled'
  - scheduledDates: [{ date, startTime, endTime }]
  
AppointmentSlot created with:
  - inquiryId: reference to Inquiry
  - residentId: resident ID
  - date: appointment date
  - startTime/endTime: time range
```

### 2. Data Persistence (Server - inquiryController.ts)
When `updateInquiry()` is called:
1. Validates scheduledDates (no past dates, no weekends)
2. Validates time ranges (within office hours 8AM-5PM)
3. Checks for conflicts with existing appointments
4. Saves scheduledDates to Inquiry document
5. Creates/replaces AppointmentSlot entries (deleteMany then insertMany)
6. Logs appointment change to audit log
7. Sends notification email to resident

### 3. Resident Sees Appointment (Dashboard)
```
Resident logs in
    ↓
Dashboard calls contactAPI.getMyInquiries()
    ↓
Filters inquiries for:
  - type === 'SCHEDULE_APPOINTMENT'
  - status === 'scheduled'
  - scheduledDates.length > 0
    ↓
Displays in "Your Appointments" card:
  - Appointment date/time from scheduledDates
  - Staff member name
  - Location
  - Status
```

## Files Modified
- `client/src/components/staff/StaffCalendar.tsx` - Updated `saveSingleAppointment()` to chain API calls

## Technologies Used
- **Frontend API**: `contactAPI.submitInquiry()` and `contactAPI.scheduleInquiry()`
- **Backend Endpoints**:
  - `POST /inquiries` (createInquiry)
  - `POST /inquiries/:id` (updateInquiry - fallback for PATCH)
  - `PUT /inquiries/:id/schedule` (updateInquiry - explicit scheduling)
- **Database Collections**:
  - Inquiry: stores appointment requests with scheduledDates
  - AppointmentSlot: stores individual time slots for calendar availability
  - User: resident/staff information

## Testing Flow
1. ✅ Staff navigates to StaffCalendar component
2. ✅ Fills in appointment details (resident, date, time)
3. ✅ Clicks "Schedule Appointment"
4. ✅ Inquiry is created (Step 1)
5. ✅ AppointmentSlots are created (Step 2)
6. ✅ Resident receives email notification
7. ✅ Resident logs in and sees appointment in "Your Appointments" card
8. ✅ Appointment details match what staff entered

## Error Handling
- If inquiry creation fails → Alert and stop
- If appointment scheduling fails → Alert with error message
- Logs all operations for debugging via console.log in StaffCalendar

## Notes
- `status` is not explicitly set to 'scheduled' in createInquiry (uses default logic)
- Status is explicitly set to 'scheduled' in scheduleInquiry step
- Dashboard filters appointments by `status === 'scheduled'` OR has `scheduledDates`
- This ensures backwards compatibility if status field has other meanings
