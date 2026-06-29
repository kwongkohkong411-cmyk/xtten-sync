import client from './client';

export type LeaveTypeCategory = 'PAID' | 'UNPAID';
export type LeaveBalancePeriod = 'MONTHLY' | 'YEARLY';

export type LeaveTypeDto = {
  id: string;
  companyId: string;
  name: string;
  category: LeaveTypeCategory;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeaveBalanceSettingDto = {
  id: string;
  companyId: string;
  leaveTypeId: string;
  period: LeaveBalancePeriod;
  days: number | string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  leaveType?: LeaveTypeDto;
};

export type LeaveApproverDto = {
  id: string;
  companyId: string;
  employeeId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    name?: string;
    user?: {
      id: string;
      username?: string;
    };
    role?: string;
    position?: string;
  };
};

export const getLeaveTypes = (companyId?: string) =>
  client.get('/leave-settings/types', { params: { companyId } });

export const createLeaveType = (data: {
  companyId?: string;
  name: string;
  category: LeaveTypeCategory;
  active?: boolean;
}) => client.post('/leave-settings/types', data);

export const updateLeaveType = (
  id: string,
  data: Partial<{
    name: string;
    category: LeaveTypeCategory;
    active: boolean;
  }>,
) => client.patch(`/leave-settings/types/${id}`, data);

export const deleteLeaveType = (id: string) =>
  client.delete(`/leave-settings/types/${id}`);

export const getLeaveBalanceSettings = (companyId?: string) =>
  client.get('/leave-settings/balances', { params: { companyId } });

export const createLeaveBalanceSetting = (data: {
  companyId?: string;
  leaveTypeId: string;
  period: LeaveBalancePeriod;
  days: number;
  active?: boolean;
}) => client.post('/leave-settings/balances', data);

export const updateLeaveBalanceSetting = (
  id: string,
  data: Partial<{
    leaveTypeId: string;
    period: LeaveBalancePeriod;
    days: number;
    active: boolean;
  }>,
) => client.patch(`/leave-settings/balances/${id}`, data);

export const deleteLeaveBalanceSetting = (id: string) =>
  client.delete(`/leave-settings/balances/${id}`);

export const getLeaveApprovers = (companyId?: string) =>
  client.get('/leave-settings/approvers', { params: { companyId } });

export const createLeaveApprover = (data: {
  companyId?: string;
  employeeId: string;
  active?: boolean;
}) => client.post('/leave-settings/approvers', data);

export const updateLeaveApprover = (
  id: string,
  data: Partial<{
    employeeId: string;
    active: boolean;
  }>,
) => client.patch(`/leave-settings/approvers/${id}`, data);

export const deleteLeaveApprover = (id: string) =>
  client.delete(`/leave-settings/approvers/${id}`);
