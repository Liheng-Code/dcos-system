"use client";

import { GenericSchedule } from "./arc-schedules";
export { GenericSchedule };

export function StrCalcNotes() { return <GenericSchedule config={{ title: "Calculation Note", table: "design_str_calc_notes", orderField: "calc_no", fields: [{ key: "calc_no", label: "Calc No" }, { key: "title", label: "Title" }, { key: "calc_type", label: "Type" }, { key: "software", label: "Software" }, { key: "status", label: "Status" }] }} />; }
export function StrModelRegister() { return <GenericSchedule config={{ title: "Model Register", table: "design_str_model_register", orderField: "model_no", fields: [{ key: "model_no", label: "Model No" }, { key: "model_name", label: "Name" }, { key: "software", label: "Software" }, { key: "version", label: "Version" }, { key: "status", label: "Status" }] }} />; }
export function StrRebarReview() { return <GenericSchedule config={{ title: "Rebar/Shop Drawing Review", table: "design_str_rebar_review", orderField: "review_no", fields: [{ key: "review_no", label: "Review No" }, { key: "drawing_ref", label: "Drawing Ref" }, { key: "element_type", label: "Element" }, { key: "reviewer", label: "Reviewer" }, { key: "status", label: "Status" }] }} />; }
export function StrTechnicalQueries() { return <GenericSchedule config={{ title: "Technical Query", table: "design_str_technical_queries", orderField: "tq_no", fields: [{ key: "tq_no", label: "TQ No" }, { key: "title", label: "Title" }, { key: "priority", label: "Priority" }, { key: "status", label: "Status" }, { key: "due_date", label: "Due" }] }} />; }
export function StrDesignChanges() { return <GenericSchedule config={{ title: "Design Change", table: "design_str_design_changes", orderField: "change_no", fields: [{ key: "change_no", label: "Change No" }, { key: "title", label: "Title" }, { key: "reason", label: "Reason" }, { key: "status", label: "Status" }] }} />; }
