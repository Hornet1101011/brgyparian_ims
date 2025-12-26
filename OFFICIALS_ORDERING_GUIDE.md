# Officials Drag-and-Drop Ordering System

## Overview
A new drag-and-drop officials ordering system has been implemented in the System Settings component. Administrators can now easily reorder officials by dragging them from 1st to last position (top to bottom alignment), and this order is automatically reflected on the LoginForm.

## Features

### 1. **Drag-and-Drop Interface** (OfficialsReorder Component)
- Visual drag-and-drop component with intuitive interface
- Display order badges showing position (1st, 2nd, 3rd, etc.)
- Real-time visual feedback during dragging (color change, opacity adjustment)
- Smooth transitions and animations

### 2. **Display Order Management**
- Each official has a `displayOrder` field (default: 0)
- Display order is persisted to the database
- Reordering saves to database via `/admin/officials/reorder` endpoint
- Officials sort by `displayOrder` first, then by creation date as fallback

### 3. **LoginForm Integration**
- Officials fetched from `/api/officials` endpoint now sorted by `displayOrder`
- Officials carousel respects the custom order set in System Settings
- Order updates are reflected immediately on login page

## Components

### Client-Side

#### `OfficialsReorder.tsx` (New Component)
Located at: `client/src/components/admin/OfficialsReorder.tsx`

**Props:**
- `officials` - Array of official objects to reorder
- `onOfficialUpdate` - Callback when officials list changes
- `onAddOfficial` - Handler for adding new officials
- `onDeleteOfficial` - Handler for deleting officials
- `officialsLoading` - Loading state
- `savingOfficials` - Saving state
- `autoSaveTimers` - Ref for debounced saves
- `onNameChange` - Handler for name field changes
- `onTitleChange` - Handler for title field changes
- `onTermChange` - Handler for term field changes
- `previewUrlsRef` - Ref for preview URLs
- `manualSaveError` - Error state for manual saves

**Features:**
- Drag-and-drop reordering with visual feedback
- Order badges showing position numbers
- Automatic save to server when reordering
- Error handling and user feedback
- Integration with existing photo upload functionality

#### Updated `SystemSettings.tsx`
- Imports new `OfficialsReorder` component
- Replaced manual officials list rendering with component
- Cleaner component structure and separation of concerns
- All existing functionality preserved

#### Updated API Methods
In `client/src/services/api.ts`:
- `reorderOfficials(order: string[])` - Sends reorder request to server
  - Endpoint: `POST /admin/officials/reorder`
  - Body: `{ order: array of official IDs in new order }`

### Server-Side

#### Updated Routes

**Admin Route: `POST /admin/officials/reorder`** 
Located in: `server/routes/officials.js`

```javascript
router.post('/reorder', isAdmin, async (req, res) => {
  const { order } = req.body; // Array of official IDs in desired order
  
  // Updates displayOrder for each official sequentially
  // Returns updated officials sorted by displayOrder
  // Logs action to audit log
});
```

**Public Route: `GET /api/officials`**
Located in: `server/routes/publicOfficials.js`

- Updated to sort by `displayOrder` first, then by creation date
- Includes `displayOrder` in response for client-side handling
- Maintains full backward compatibility with existing clients

## Database

### Official Schema Updates
`server/models/Official.js`

Already includes:
```javascript
displayOrder: { type: Number, default: 0 }
```

No migration needed - existing officials will use default value of 0.

## How to Use

### As an Administrator:

1. **Open System Settings**
   - Navigate to Admin Dashboard → System Settings

2. **Reorder Officials**
   - In the "Barangay Officials" section, drag officials to desired positions
   - Visual indicators show:
     - Position number (1st, 2nd, 3rd, etc.)
     - Drag handle icon
     - Hover effects
   - Dragging automatically saves the new order

3. **Add/Edit/Delete Officials**
   - Click "Add" button to add new officials
   - Edit name, position, and term directly
   - Delete officials with the "Delete" button
   - Upload/change official photos with "Upload Photo" button

### Order Reflection:

- **LoginForm Officials Carousel**: Updates immediately when you reorder and save
- **Public Views**: Anyone visiting the login page will see officials in the new order
- **API Responses**: Both admin and public endpoints respect the custom order

## Example Flow

1. Admin has 3 officials: John (Punong Barangay), Mary (Councillor), David (SK Chair)
2. Admin wants Mary to appear first
3. Admin drags Mary to the top position
4. System saves: displayOrder updates (Mary=0, John=1, David=2)
5. LoginForm fetches officials and displays them in order: Mary → John → David

## Technical Details

### Reordering Algorithm
- Dragged item is removed from its original position
- Item is inserted at the new position
- All items are updated with sequential displayOrder values (0, 1, 2, ...)
- Entire updated array is sent to server
- Server updates each official's displayOrder atomically

### Error Handling
- Network failures show error alerts to user
- Local reordering is maintained until successful server save
- Failed saves prompt retry
- Existing officials list functionality is unaffected

### Performance Considerations
- Drag operations are optimized with React state updates
- Server saves only occur on drop, not during drag
- Debounced field changes (900ms) for name/title/term
- GridFS bucket reuse for efficient photo storage

## Browser Compatibility
- HTML5 Drag and Drop API
- Tested on modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful degradation for older browsers

## Future Enhancements
Possible improvements:
- Bulk reordering via rank input fields
- Save custom display names for officials
- Category-based grouping (Executive, Councillors, SK)
- Template presets for common office structures

## Troubleshooting

### Officials not in custom order on login page:
1. Check System Settings → Barangay Officials
2. Verify officials are saved (✓ button turns green)
3. Clear browser cache and reload
4. Check server logs for reorder errors

### Drag-and-drop not working:
1. Ensure JavaScript is enabled
2. Try refreshing the page
3. Check browser console for errors
4. Try different browser if issue persists

### Photo not uploading:
1. File must be less than 2 MB
2. Ensure official is saved first
3. Check file format (JPEG, PNG, WebP)
4. Check server disk space and upload folder permissions
