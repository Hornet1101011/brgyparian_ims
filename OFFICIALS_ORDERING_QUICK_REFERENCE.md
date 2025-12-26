# Officials Ordering System - Quick Reference

## File Structure

```
client/
├── src/
│   ├── components/
│   │   ├── admin/
│   │   │   ├── OfficialsReorder.tsx        [NEW] Drag-drop component
│   │   │   └── SystemSettings.tsx          [UPDATED] Uses new component
│   │   └── LoginForm.tsx                   [AUTO] Uses sorted officials
│   └── services/
│       └── api.ts                          [HAS] reorderOfficials method

server/
├── routes/
│   ├── officials.js                        [HAS] /reorder endpoint
│   └── publicOfficials.js                  [UPDATED] Sorts by displayOrder
└── models/
    └── Official.js                         [HAS] displayOrder field
```

## Key Code Snippets

### 1. Drag-and-Drop Handler
```typescript
const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
  e.preventDefault();
  if (draggedItem === null || draggedItem === dropIndex) return;

  // Reorder local state
  const newOfficials = [...officials];
  const draggedOfficial = newOfficials[draggedItem];
  newOfficials.splice(draggedItem, 1);
  newOfficials.splice(dropIndex, 0, draggedOfficial);

  // Update displayOrder
  const reorderedOfficials = newOfficials.map((off, idx) => ({
    ...off,
    displayOrder: idx
  }));

  onOfficialUpdate(reorderedOfficials);
  await saveOrder(reorderedOfficials);
};
```

### 2. Server Reorder Endpoint
```javascript
router.post('/reorder', isAdmin, async (req, res) => {
  const { order } = req.body; // Array of official IDs
  
  for (let i = 0; i < order.length; i++) {
    await Official.findByIdAndUpdate(order[i], { displayOrder: i });
  }
  
  const updated = await Official.find().sort({ displayOrder: 1, createdAt: -1 });
  res.json({ message: 'Reordered', officials: updated });
});
```

### 3. Public Officials Query
```javascript
const list = await Official.find()
  .select('name title term photoFileId photoPath photoContentType createdAt displayOrder')
  .sort({ displayOrder: 1, createdAt: -1 }); // Sort by displayOrder FIRST
```

## API Endpoints

### Admin Reorder Officials
```http
POST /admin/officials/reorder
Authorization: Bearer {token}
Content-Type: application/json

{
  "order": ["id1", "id2", "id3"]
}

Response: 200 OK
{
  "message": "Reordered",
  "officials": [
    { "_id": "id1", "name": "...", "displayOrder": 0, ... },
    { "_id": "id2", "name": "...", "displayOrder": 1, ... }
  ]
}
```

### Public Get Officials
```http
GET /api/officials
Accept: application/json

Response: 200 OK
[
  { "_id": "id1", "name": "...", "displayOrder": 0, "photoUrl": "..." },
  { "_id": "id2", "name": "...", "displayOrder": 1, "photoUrl": "..." }
]
```

## State Management

### React State (SystemSettings)
```typescript
const [officials, setOfficials] = useState<Official[]>([]);
const [draggedItem, setDraggedItem] = useState<number | null>(null);
const [savingOrder, setSavingOrder] = useState(false);
const [orderError, setOrderError] = useState<string | null>(null);
```

### Event Handlers
```typescript
handleDragStart(e, index) - Initiate drag
handleDragOver(e) - Allow drop
handleDrop(e, index) - Complete reorder
saveOrder() - Save to server
```

## Database Schema

### Official Collection
```javascript
{
  _id: ObjectId,
  name: String,
  title: String,
  term: String,
  photoFileId: ObjectId,    // GridFS reference
  photoContentType: String,
  photoPath: String,        // Legacy
  photo: Buffer,            // Legacy
  displayOrder: Number,     // Default: 0 (KEY FIELD)
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

### Index (implicit)
```javascript
// Recommended for performance
db.officials.createIndex({ displayOrder: 1, createdAt: -1 })
```

## Component Props

### OfficialsReorder Component
```typescript
interface OfficialsReorderProps {
  officials: Official[];
  onOfficialUpdate: (officials: Official[]) => void;
  onAddOfficial: () => void;
  onDeleteOfficial: (id?: string) => Promise<void>;
  officialsLoading: boolean;
  savingOfficials: boolean;
  autoSaveTimers: React.MutableRefObject<Record<string, number>>;
  onNameChange: (id: string | undefined, value: string) => void;
  onTitleChange: (id: string | undefined, value: string) => void;
  onTermChange: (id: string | undefined, value: string) => void;
  previewUrlsRef: React.MutableRefObject<Record<string, string>>;
  manualSaveError?: string | null;
}
```

## Error Handling

### Try-Catch Pattern
```typescript
try {
  setSavingOrder(true);
  const orderIds = reorderedOfficials
    .map(off => off._id)
    .filter(id => id && !id.toString().startsWith('new-'));
  
  await adminAPI.reorderOfficials(orderIds as string[]);
  antdMessage.success('Officials reordered');
} catch (err) {
  console.error('Failed to save order', err);
  setOrderError('Failed to save order');
  antdMessage.error('Failed to save order');
} finally {
  setSavingOrder(false);
}
```

## Testing Scenarios

### Test Case 1: Basic Reordering
```
1. Have 3 officials: A, B, C
2. Drag B to position 1
3. Expected: B=0, A=1, C=2
4. Verify: Save succeeds, LoginForm shows B first
```

### Test Case 2: Multiple Drags
```
1. Drag C to top: C, A, B
2. Drag A to middle: C, A, B
3. Expected: No crash, correct displayOrder
```

### Test Case 3: Error Handling
```
1. Disconnect network
2. Drag official
3. Expected: Error message, can retry
4. Reconnect, retry succeeds
```

### Test Case 4: New Official
```
1. Add new official (not yet saved)
2. Try to drag: Should not be reorderable
3. Save official first
4. Now can be dragged
```

## Debugging Checklist

- [ ] Check browser console for errors
- [ ] Verify Network tab shows POST /admin/officials/reorder
- [ ] Check MongoDB that displayOrder is updated
- [ ] Verify publicOfficials query sorts by displayOrder
- [ ] Test LoginForm displays officials in correct order
- [ ] Clear browser cache if order not updating
- [ ] Check server logs for reorder operation
- [ ] Verify auth token is valid for admin endpoints
- [ ] Check that official IDs in order array exist in DB

## Performance Considerations

### Optimization Tips
```typescript
// Debounce field changes to avoid too many saves
debounce(() => save(), 900ms)

// Use lean() for public read-only queries
Official.find().lean().sort({ displayOrder: 1 })

// Index displayOrder for faster sorting
db.officials.createIndex({ displayOrder: 1, createdAt: -1 })

// Batch updates instead of individual saves
for (let i = 0; i < order.length; i++) {
  await Official.findByIdAndUpdate(...)
}
```

## Rollback Plan

If issues occur:

1. **Remove drag-and-drop component**
   - Remove `OfficialsReorder.tsx` import
   - Revert SystemSettings to show officials as list

2. **Keep displayOrder data**
   - displayOrder field remains in database
   - Can be used for other sorting in future

3. **Fallback to creation order**
   - Remove displayOrder from sort query
   - Use only createdAt for ordering

## Migration Notes

- No database migration required
- Existing officials default to displayOrder: 0
- First time admin opens System Settings, all officials have displayOrder: 0
- First drag-and-drop operation normalizes displayOrder values
- Fully backward compatible with existing code

## Version Info

- Created: December 27, 2025
- Implementation: Complete
- Testing: Ready
- Status: Ready for production deployment
