import { describe, expect, it } from "vitest";
import { fromLocalInput, registrationErrors, registrationFormFrom, toLocalInput } from "@/lib/project/projects/tender-registration";
import type { Project } from "@/lib/project/projects/project-types";

const project = {
  id: "p1", project_code: "PJR-2026-002", project_name: "Tower", project_type: "tender", client_id: "c1", consultant_id: null,
  contract_type: "lump_sum", contract_number: null, contract_value: null, currency: "USD", start_date: null, end_date: null,
  project_status: "draft", project_manager_id: "u1", project_director_id: null, engineering_manager_id: null, planning_manager_id: null,
  description: null, short_name: null, category: "residential", building_type: null, location: null, latitude: null, longitude: null,
  time_zone: null, dlp_period: null, retention: null, advance_payment: null, duration: "18", source_tender_project_id: null,
  created_at: "", updated_at: "",
} as Project;

describe("toLocalInput / fromLocalInput", () => {
  it("round-trips a timestamp through a datetime-local value", () => {
    const iso = new Date(2026, 9, 31, 14, 30).toISOString();
    expect(toLocalInput(iso)).toBe("2026-10-31T14:30");
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it("treats missing or invalid values as empty", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("not a date")).toBe("");
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("registrationFormFrom", () => {
  it("fills the form from the project, its details and its tender", () => {
    const f = registrationFormFrom({
      project,
      details: { tender_type: "open", procurement_method: "public_bid", submission_deadline: null, tender_days: 45 },
      tender: { tender_no: "CLIENT-REF-9", issue_date: "2026-10-01", budget_range: 2500000 },
    });
    expect(f.tender_reference).toBe("CLIENT-REF-9");
    expect(f.tender_type).toBe("open");
    expect(f.budget_range).toBe("2500000");
    expect(f.tender_days).toBe("45");
    expect(f.duration).toBe("18");
  });

  it("uses the wizard's defaults when the tender has no details yet", () => {
    const f = registrationFormFrom({ project, details: { tender_type: null, procurement_method: null, submission_deadline: null }, tender: null });
    expect([f.tender_type, f.procurement_method, f.tender_days, f.tender_reference]).toEqual(["selective", "limited_bid", "30", ""]);
  });
});

describe("registrationErrors", () => {
  const base = registrationFormFrom({ project, details: { tender_type: null, procurement_method: null, submission_deadline: "2026-11-01T03:00:00Z" }, tender: null });

  it("accepts a complete registration", () => {
    expect(registrationErrors(base)).toEqual([]);
  });

  it("lists every missing required field", () => {
    const errors = registrationErrors({ ...base, project_name: " ", client_id: "", submission_deadline: "", project_manager_id: "" });
    expect(errors).toHaveLength(4);
  });

  it("rejects an end date before the start date", () => {
    expect(registrationErrors({ ...base, start_date: "2027-02-01", end_date: "2027-01-01" })).toEqual(["The planned end date is before the start date."]);
  });
});
