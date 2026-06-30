# Step 4: Attendance Core Logic - Technical Documentation

## Overview
Completed the core attendance logic flow: **Team → Roster → Shift Template → Agent Clock In → Status Detection**

This step implements the complete attendance tracking system with multi-team support, automatic detection of late arrivals, early departures, and absences.

## Architecture Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     ATTENDANCE FLOW                           │
└──────────────────────────────────────────────────────────────┘

Team (WorkGroup)
    │
    ├─→ Roster (Team/Month/Shift)
    │   ├─→ Team-Level (employeeId = null)
    │   │   └─→ All Team Members inherit
    │   └─→ Employee-Level Override (employeeId specified)
    │
    ├─→ ShiftTemplate
    │   ├─→ startTime, endTime
    │   ├─→ lateAfter (minutes)
    │   └─→ earlyLeave (tolerance minutes)
    │
    └─→ Employee Clock In/Out
        │
        ├─→ resolveScheduleForDate()
        │   ├─→ Priority 1: RosterDetail (date-level)
        │   ├─→ Priority 2: Employee Roster (monthly)
        │   ├─→ Priority 3: Team Roster (multi-team support)
        │   └─→ Priority 4: Default Schedule
        │
        ├─→ Late Detection
        │   ├─→ checkIn > lateThreshold?
        │   ├─→ Calculate lateMinutes
        │   └─→ Set status = 'LATE'
        │
        ├─→ Early Leave Detection
        │   ├─→ checkOut < (scheduledEnd - tolerance)?
        │   ├─→ Calculate earlyLeaveMinutes
        │   └─→ Set status = 'EARLY_LEAVE'
        │
        └─→ Absence Detection
            ├─→ Has Roster but no checkIn?
            ├─→ Mark as EMPLOYEE_LEVEL or TEAM_LEVEL absent
            └─→ Return absence records
```

## Key Features Implemented

### 1. Multi-Team Schedule Resolution (4-Level Priority)

**Level 1: RosterDetail (Date-Level)**
```sql
SELECT shiftTemplate 
FROM RosterDetail 
WHERE date = @day 
  AND roster.employeeId = @employeeId 
  AND companyId = @companyId
```

**Level 2: Employee Roster (Monthly)**
```sql
SELECT shift 
FROM Roster 
WHERE employeeId = @employeeId 
  AND month = @month 
  AND companyId = @companyId
```

**Level 3: Team Roster (NEW - Multi-Team Support)**
```sql
SELECT shift 
FROM Roster 
WHERE employeeId IS NULL 
  AND workGroupId = @employee.workGroupId 
  AND month = @month 
  AND companyId = @companyId
```

### 2. Late Detection Logic

```typescript
private computeLateMinutes(checkIn: Date | null, schedule: ScheduleDecision): number | null {
  if (!checkIn) return null;
  if (checkIn.getTime() <= schedule.lateThreshold.getTime()) return 0;
  
  return Math.max(
    0,
    Math.floor((checkIn.getTime() - schedule.scheduledStart.getTime()) / 60_000)
  );
}

// In checkIn():
const lateMinutes = this.computeLateMinutes(checkInAt, schedule) || 0;
const isLate = lateMinutes > 0;
status = isLate ? 'LATE' : 'PRESENT';
```

### 3. Early Leave Detection Logic

```typescript
private computeEarlyLeaveMinutes(
  checkOut: Date | null, 
  schedule: ScheduleDecision
): number | null {
  if (!checkOut || !schedule.scheduledEnd) return null;
  
  const earlyLeaveThreshold = new Date(schedule.scheduledEnd);
  earlyLeaveThreshold.setMinutes(
    earlyLeaveThreshold.getMinutes() 
      - Math.max(0, schedule.earlyLeaveToleranceMinutes)
  );
  
  if (checkOut.getTime() >= earlyLeaveThreshold.getTime()) return 0;
  
  return Math.max(
    0,
    Math.floor((schedule.scheduledEnd.getTime() - checkOut.getTime()) / 60_000)
  );
}

// In checkOut():
const earlyLeaveMinutes = this.computeEarlyLeaveMinutes(now, schedule) || 0;
let finalStatus = record.status || 'PRESENT';
if (earlyLeaveMinutes > 0) {
  finalStatus = 'EARLY_LEAVE';
} else if (lateMinutes > 0) {
  finalStatus = 'LATE';
}
```

### 4. Absence Detection API

**Endpoint**: `POST /attendance/detect-absents?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**Logic**:
1. Find all Rosters in date range
2. For each Roster:
   - If Employee-level (employeeId != null):
     - Check if attendance exists for this date
   - If Team-level (employeeId = null):
     - For each team member:
       - Check if attendance exists for this date
3. Return records where attendance.checkIn is null

**Response**:
```json
{
  "count": 2,
  "absents": [
    {
      "employeeId": "uuid",
      "employeeName": "Charlie Wilson",
      "date": "2026-06-30",
      "rosterType": "TEAM_LEVEL",
      "teamName": "A morning",
      "shiftStartTime": "08:30"
    }
  ],
  "dateRange": {"start": "2026-06-30", "end": "2026-06-30"}
}
```

### 5. Enhanced Today Endpoint

**Response Structure**:
```json
{
  "attendance": {
    "id": "uuid",
    "date": "2026-06-30",
    "checkIn": "2026-06-30T08:45:00Z",
    "checkOut": null,
    "status": "LATE"
  },
  "today": "2026-06-30T00:00:00Z",
  "scheduled": {
    "startTime": "08:30",
    "endTime": "20:30",
    "lateAfterMinutes": 10,
    "earlyLeaveToleranceMinutes": 10,
    "source": "MONTH_ROSTER"
  },
  "status": "PRESENT" // or "NOT_CHECKED_IN", "NO_SCHEDULE"
}
```

## Database Models

### Roster Model (Multi-Team Support)
```prisma
model Roster {
  id String @id @default(uuid())
  month String                    // 2026-06
  employeeId String?              // NULL = Team-level
  workGroupId String              // Team reference
  shiftId String
  companyId String
  status String @default("ASSIGNED")
  
  employee Employee? @relation(...)
  workGroup WorkGroup @relation(...)
  shift ShiftTemplate @relation(...)
  
  @@unique([employeeId, month, workGroupId])
}
```

### Attendance Model
```prisma
model Attendance {
  id String @id @default(uuid())
  employeeId String
  companyId String
  date DateTime @db.Date
  
  checkIn DateTime?
  checkOut DateTime?
  breakStart DateTime?
  breakEnd DateTime?
  
  totalHours Decimal? @db.Decimal(5, 2)
  status String @default("PRESENT") // LATE, EARLY_LEAVE, ABSENT
  
  @@unique([employeeId, date])
}
```

## API Endpoints

### 1. Check In
**POST /attendance/check-in**
- Automatic schedule resolution
- Late detection on check-in
- Status determination

### 2. Check Out
**POST /attendance/check-out/:id**
- Early leave detection
- Final status determination
- Total hours calculation

### 3. Today
**GET /attendance/today**
- Current attendance record (if exists)
- Today's scheduled shift
- Current status

### 4. Detect Absents (NEW)
**POST /attendance/detect-absents?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD**
- Find employees with schedule but no check-in
- Distinguish between Team-level and Employee-level rosters
- RBAC-aware results

## Test Verification

```
✅ Multi-team Roster Support
   - Found 2 rosters for test teams
   - Both Team-level with 2026-06 month

✅ Absence Detection
   - Detected 2 absence records
   - Correctly identified as TEAM_LEVEL rosters

✅ Backend Compilation
   - No TypeScript errors
   - All types properly resolved

✅ API Functionality
   - Endpoints responding correctly
   - Proper error handling
```

## Code Changes Summary

### attendance.service.ts
- **resolveScheduleForDate()**: Enhanced with 4-level priority system
- **checkOut()**: Improved status determination (EARLY_LEAVE > LATE > PRESENT)
- **today()**: Returns comprehensive schedule + status info
- **detectAbsents()**: New method for absence detection

### attendance.controller.ts
- **POST /attendance/detect-absents**: New endpoint

## Performance Considerations

1. **Caching**: Schedule cache used in history queries
2. **Indexing**: 
   - Attendance: (employeeId, date)
   - Roster: (month, workGroupId)
3. **Query Efficiency**: Uses findFirst with specific select fields

## RBAC Integration

- **attendance:manage**: Check-in, Check-out, Break operations
- **attendance:view**: View attendance records, history, today
- **Visibility Scoping**: Respects company and employee visibility

## Future Enhancements

1. Automatic absence record creation during month-end process
2. Shift swapping for team members
3. Break time validation
4. Attendance reporting and analytics
5. Integration with leave management (cross-check against approved leaves)

## Commit Information

- **Hash**: 352f2d6
- **Branch**: master → origin/master
- **Files Changed**: 3
  - backend/src/attendance/attendance.service.ts
  - backend/src/attendance/attendance.controller.ts
  - backend/test-attendance-step4.js (test script)
