export const ATTENDANCE_RULE = {
  WORK_DATE_STRATEGY: 'CHECK_IN_DATE',
  LATE_THRESHOLD: '09:15',
} as const;

export type AttendanceRule = typeof ATTENDANCE_RULE;
