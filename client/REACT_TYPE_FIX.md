# React Type Compatibility Fix

## Problem
You're seeing TypeScript errors like:
- `TS2694: Namespace '"react"' has no exported member 'FC'`
- `TS2694: Namespace '"react"' has no exported member 'ReactNode'`
- `TS2347: Untyped function calls may not accept type arguments`

This is a React type export issue, likely due to TypeScript configuration or React version compatibility.

## Solution Implemented

### 1. Created Type Compatibility Layer
**File**: `src/types/react-compat.ts`
- Provides type aliases for common React types
- Can be imported instead of using `React.FC`, `React.ReactNode`, etc.

### 2. Updated TypeScript Configuration
**File**: `tsconfig.json`
- Added `typeRoots` to include both `node_modules/@types` and `src/types`
- Added explicit `types` array for better type resolution

### 3. Global React Types Declaration
**File**: `src/types/global-react.d.ts`
- Augments React namespace with commonly used types
- Ensures backward compatibility

## How to Use

### Option A: Import from react-compat (Recommended)
```typescript
import { FC, ReactNode, ComponentProps } from '../../../types/react-compat';

const MyComponent: FC<{ children: ReactNode }> = ({ children }) => {
  return <div>{children}</div>;
};
```

### Option B: Use React namespace directly (Should work now)
```typescript
const MyComponent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div>{children}</div>;
};
```

## Migration Path

### For new files:
Use the `react-compat` module for all React type imports.

### For existing files:
The global type augmentation should fix most issues automatically. However, for consistency, consider migrating to use `react-compat`.

### Files that need updating (priority order):
1. **High Priority** - Admin components that have @ts-nocheck:
   - `src/components/admin/SystemSettings.tsx`
   - `src/components/admin/AdminDashboard.tsx`
   - `src/components/admin/Statistics.tsx`

2. **Medium Priority** - Common component types:
   - `src/components/AppAvatar.tsx`
   - `src/components/Dashboard.tsx`
   - `src/context/AuthContext.tsx`
   - `src/contexts/AuthContext.tsx`

3. **Low Priority** - Individual utility components:
   - All other `.tsx` files

## Quick Fix Commands

After rebuilding, the errors should be resolved. If you still see errors:

1. **Clear build cache**:
   ```bash
   rm -rf node_modules/.cache
   npm start
   ```

2. **Reinstall types**:
   ```bash
   npm install --save-dev @types/react@^18.2.0 @types/react-dom@^18.2.0
   ```

3. **Check React installation**:
   ```bash
   npm list react react-dom
   ```

## Expected Result
- No more `TS2694` errors for React type exports
- All `React.FC`, `React.ReactNode`, etc. should work
- Full type checking on React components

## Additional Notes
- The `skipLibCheck: true` in tsconfig.json is already enabled, which helps with type compatibility
- The `@ts-nocheck` comments in some files can be removed after this fix
- Consider running `npm start` to trigger a full recompile

---
Created: 2026-02-01
React Version: 18.2.0
TypeScript Version: 5.0.0
