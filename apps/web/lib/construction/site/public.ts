// Construction public API: the parts of the site daily-report service that
// other modules and core may use. Adding a name here widens the contract, so it
// is a deliberate, reviewed change.

export {
  // Site diary entries recorded against a planned activity
  getTaskSiteDiaryHistory,
  type TaskSiteDiaryHistory,
} from "./daily-report-service";
