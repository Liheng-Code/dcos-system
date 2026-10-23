// License error contract (design section 7.6): HTTP 403 with { error, code } and,
// where relevant, { used, limit }.

export type LicenseErrorCode =
  | "LIC_MODULE_NOT_LICENSED"
  | "LIC_FEATURE_NOT_LICENSED"
  | "LIC_SEAT_LIMIT"
  | "LIC_VIEWER_LIMIT"
  | "LIC_PROJECT_LIMIT"
  | "LIC_READ_ONLY"
  | "LIC_LOCKED"
  | "LIC_SUSPENDED"
  | "LIC_UNVERIFIED";

export interface LicenseDenial {
  code: LicenseErrorCode;
  message: string;
  used?: number;
  limit?: number | null;
}

export function denialBody(denial: LicenseDenial) {
  return { error: denial.message, code: denial.code, used: denial.used, limit: denial.limit };
}
