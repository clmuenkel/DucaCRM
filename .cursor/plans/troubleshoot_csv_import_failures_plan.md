# Troubleshoot CSV Import Failures - 206 Contacts Failed

## Problem Analysis

**Issue**: 206 out of 416 contacts failed to import completely.

**Potential Root Causes**:
1. **Required field missing**: `first_name` is NOT NULL in database schema - if CSV rows have empty first names, inserts will fail
2. **Data validation errors**: Invalid data types, constraints violations
3. **Silent errors**: Errors being caught but not properly logged/reported
4. **Network/timeout issues**: InsForge API calls timing out or failing
5. **Missing required fields**: Other NOT NULL constraints not being satisfied
6. **Data type mismatches**: Wrong types being sent to database

## Investigation Strategy

### Step 1: Add Comprehensive Error Logging
- Log full error details including error code, message, and contact data
- Export failed contacts to downloadable file for review
- Show error breakdown by type (required field, constraint, network, etc.)

### Step 2: Add Data Validation Before Insert
- Validate required fields (`first_name` is NOT NULL)
- Provide fallback values for missing required fields
- Validate data types before sending to database
- Skip invalid contacts with clear error messages

### Step 3: Fix Root Causes
- Handle empty `first_name` by using fallback (e.g., "Unknown", last name, or email prefix)
- Ensure all required fields have defaults or fallbacks
- Fix any data type issues

### Step 4: Add Retry Logic
- Retry failed inserts with exponential backoff
- Handle transient network errors
- Skip only permanent errors (constraints, validation)

## Files to Fix

### Primary File

1. **[src/components/import/csv-import.tsx](src/components/import/csv-import.tsx)**
   - **Issues**:
     - No validation of required fields before insert
     - Errors may not show full details
     - No fallback for missing `first_name`
     - No export of failed contacts for review
   
   - **Fixes**:
     - Add validation function to check required fields
     - Provide fallback for `first_name` if empty
     - Log full error details with contact data
     - Export failed contacts to downloadable JSON/CSV
     - Add error categorization (required field, constraint, network, etc.)

2. **[src/lib/csv-parser.ts](src/lib/csv-parser.ts)**
   - **Issues**:
     - `mapApolloToContact` and `mapToContact` don't validate required fields
     - No fallback for empty `first_name`
   
   - **Fixes**:
     - Add validation in mapping functions
     - Provide fallback: `first_name: row.firstName || row.lastName || "Unknown" || extractFromEmail(row.email)`

## Implementation Plan

### Fix 1: Add Required Field Validation

**Location**: `src/components/import/csv-import.tsx` and `src/lib/csv-parser.ts`

**Add validation function**:
```typescript
function validateContactData(contactData: any): { valid: boolean; error?: string } {
  // first_name is REQUIRED (NOT NULL)
  if (!contactData.first_name || contactData.first_name.trim() === "") {
    return { valid: false, error: "first_name is required but was empty" };
  }
  
  // user_id is REQUIRED
  if (!contactData.user_id) {
    return { valid: false, error: "user_id is required" };
  }
  
  return { valid: true };
}

function ensureRequiredFields(contactData: any): any {
  // Ensure first_name has a value
  if (!contactData.first_name || contactData.first_name.trim() === "") {
    // Try fallbacks in order: last_name, email prefix, "Unknown"
    contactData.first_name = 
      contactData.last_name?.trim() || 
      (contactData.email ? contactData.email.split("@")[0] : null) ||
      "Unknown";
  }
  
  return contactData;
}
```

### Fix 2: Improve Error Logging and Export

**Location**: `src/components/import/csv-import.tsx`

**Add**:
- Detailed error logging with full error object
- Error categorization (required field, constraint, network, unknown)
- Export failed contacts to downloadable file
- Show error breakdown in UI

**Code Pattern**:
```typescript
if (insertError) {
  const errorDetails = {
    message: insertError.message,
    code: (insertError as any).code,
    details: (insertError as any).details,
    hint: (insertError as any).hint,
    contactData: contactData, // Include the data that failed
  };
  
  console.error(`[Import] Full error details:`, errorDetails);
  
  failures.push({
    row,
    type: "contact",
    error: insertError.message,
    errorCode: (insertError as any).code,
    errorDetails: errorDetails, // Add full details
    contactData: contactData, // Include failed data
  });
}
```

### Fix 3: Fix Mapping Functions to Handle Empty first_name

**Location**: `src/lib/csv-parser.ts`

**Fix `mapApolloToContact`**:
```typescript
export function mapApolloToContact(...) {
  // ... existing code ...
  
  // Ensure first_name is never empty
  let firstName = row.firstName?.trim();
  if (!firstName) {
    // Fallback: use last name, email prefix, or "Unknown"
    firstName = row.lastName?.trim() || 
                (row.email ? row.email.split("@")[0] : null) ||
                "Unknown";
  }
  
  return {
    // ... existing fields ...
    first_name: firstName,
    // ...
  };
}
```

**Fix `mapToContact`** similarly.

### Fix 4: Add Failed Contacts Export

**Location**: `src/components/import/csv-import.tsx`

**Add export functionality**:
```typescript
const exportFailedContacts = () => {
  const csv = [
    ["Email", "First Name", "Last Name", "Company", "Error", "Error Code"].join(","),
    ...failures.map(f => [
      f.row.email || "",
      f.row.firstName || f.row.first_name || "",
      f.row.lastName || f.row.last_name || "",
      f.row.companyName || f.row.company || "",
      f.error,
      f.errorCode || "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `failed-contacts-${new Date().toISOString()}.csv`;
  a.click();
};
```

### Fix 5: Add Error Categorization

**Location**: `src/components/import/csv-import.tsx`

**Categorize errors**:
```typescript
function categorizeError(error: any): string {
  const message = error.message?.toLowerCase() || "";
  const code = error.code || "";
  
  if (code === "23502" || message.includes("null value") || message.includes("not null")) {
    return "required_field_missing";
  }
  if (code === "23505" || message.includes("duplicate") || message.includes("unique")) {
    return "duplicate_entry";
  }
  if (code === "23503" || message.includes("foreign key") || message.includes("reference")) {
    return "reference_error";
  }
  if (message.includes("timeout") || message.includes("network") || message.includes("fetch")) {
    return "network_error";
  }
  return "unknown_error";
}
```

## Testing Plan

1. **Test with Missing first_name**:
   - Create test CSV with empty first_name
   - Verify fallback is applied
   - Verify contact is imported successfully

2. **Test Error Logging**:
   - Intentionally cause errors (invalid data)
   - Verify full error details are logged
   - Verify failed contacts can be exported

3. **Test Full Import**:
   - Import 416 contacts
   - Verify all are processed (created, updated, or failed with clear reason)
   - Check console for detailed logs
   - Export and review failed contacts

## Success Criteria

1. ✅ All 416 contacts are processed (either imported or failed with clear reason)
2. ✅ Contacts with missing `first_name` get fallback value and import successfully
3. ✅ Full error details are logged for all failures
4. ✅ Failed contacts can be exported for review
5. ✅ Error breakdown shows categories (required field, constraint, network, etc.)
6. ✅ Console shows detailed progress and errors for debugging

## Error Prevention

- Validate all required fields before insert
- Provide sensible fallbacks for missing required fields
- Log full error details including contact data
- Export failed contacts for manual review
- Categorize errors to identify patterns
- Continue processing even when some contacts fail
