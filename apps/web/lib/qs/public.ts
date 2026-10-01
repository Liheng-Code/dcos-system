// Quantity Surveying public API (commercial side).
//
// The only parts of lib/qs/qs-service.ts that other modules and core may use.
// Everything else in the QS service is internal and may change freely. Adding a
// name here widens the contract between QS and the rest of DCOS, so it is a
// deliberate, reviewed change.
//
// Tender-side names are in ./public-tender.ts.

export {
  // Contract snapshot and post-contract figures (project and dashboard screens)
  getContractSnapshot,
  getPostcontractKpis,
  type ContractSnapshot,

  // WBS cost tab
  getWbsBudgetRollup,
  getWbsCommercialSummary,
  type CommercialSummary,

  // Award conversion: carry the tender into the contract
  carryOverBoq,
  carryOverPreliminaries,
  carryOverPriceList,
  carryOverRisks,
  createContractSnapshot,

  // BOQ access for BIM quantity promotion and procurement
  createBoqItem as createQsBoqItem,
  getBoqList,
  getBoqSections,
  type BoqItemForPr,
  type QsBoqSection,
  type QsBoqSummary,

  // Printing
  type QsClaimItem,
  type QsProgressClaim,
} from "./qs-service";
