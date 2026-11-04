// Data access for the E-Leave > Leave History page.

import type { EmployeeLeaveHistory, LeaveHistoryEmployee } from "@/lib/hr/employee-leave-history";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export interface LeaveHistoryEmployeeList {
  employees: LeaveHistoryEmployee[];
  /** "all" for owner and admin accounts, "self" for everyone else. */
  scope: "all" | "self";
  /** The signed-in user's profile id. */
  me: string;
}

export function fetchLeaveHistoryEmployees(year: number): Promise<LeaveHistoryEmployeeList> {
  return getJson<LeaveHistoryEmployeeList>(`/api/hr/leave/history?year=${year}`);
}

export function fetchEmployeeLeaveHistory(employeeId: string): Promise<EmployeeLeaveHistory> {
  return getJson<EmployeeLeaveHistory>(`/api/hr/leave/history/${employeeId}`);
}
