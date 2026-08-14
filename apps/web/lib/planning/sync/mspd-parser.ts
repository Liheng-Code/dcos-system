// Parses Microsoft Project Data Interchange (MSPDI) XML into a normalized
// schedule. Runs in the browser (DOMParser); used by the sync dashboard before
// POSTing the normalized payload to the preview API.
//
// MSPDI structure: <Project xmlns="http://schemas.microsoft.com/project">
//   <Tasks><Task><UID/><Name/><OutlineLevel/><OutlineNumber/><WBS/>...
//     <PredecessorLink><PredecessorUID/><Type/></PredecessorLink>...</Task></Tasks>
// </Project>

import type { DependencyType, MspSchedule, MspTask, MspPredecessor } from "./types";
import { MSP_PREDECESSOR_TYPE_MAP } from "./types";

export function parseMspdXml(
  xmlText: string,
  opts: { fileName?: string; syncLevel?: number } = {},
): MspSchedule {
  const syncLevel = opts.syncLevel ?? 3;
  const trimmed = xmlText.trim();

  if (trimmed.startsWith("PK")) {
    throw new Error(
      "This looks like a compressed/binary project file. Export the schedule as XML (MSPDI) from Project Desktop (File > Save As > XML Format).",
    );
  }
  if (!trimmed.includes("<Project") && !trimmed.includes("<msx:Project")) {
    throw new Error("Not a Microsoft Project XML file (missing <Project> root).");
  }

  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The XML could not be parsed (malformed document).");
  }

  const project =
    doc.getElementsByTagName("Project")[0] ||
    doc.getElementsByTagNameNS("*", "Project")[0];
  if (!project) {
    throw new Error("No <Project> element found in the XML.");
  }

  const allTasks: MspTask[] = Array.from(collectTasks(project)).map(parseTask);

  const meta = {
    projectName: text(project, "Name"),
    projectTitle: text(project, "Title"),
    company: text(project, "Company"),
    sourceIdentifier: text(project, "UID") || text(project, "Guid"),
  };

  return {
    source: "mspdi",
    fileName: opts.fileName,
    ...meta,
    parsedAt: new Date().toISOString(),
    taskCount: allTasks.length,
    allTasks,
    level3Tasks: allTasks
      .filter((t) => t.outlineLevel === syncLevel)
      .sort((a, b) => a.id - b.id),
  };
}

function collectTasks(project: Element): Element[] {
  const direct = Array.from(project.getElementsByTagName("Task"));
  if (direct.length > 0) return direct;
  return Array.from(project.getElementsByTagNameNS("*", "Task"));
}

function parseTask(el: Element): MspTask {
  const predecessors: MspPredecessor[] = Array.from(
    el.getElementsByTagName("PredecessorLink"),
  ).map((link) => {
    const rawType = parseInt(text(link, "Type") || "", 10);
    return {
      uid: text(link, "PredecessorUID") || "",
      type:
        (MSP_PREDECESSOR_TYPE_MAP[rawType] as DependencyType | undefined) ?? "FS",
      lag: parseInt(text(link, "LinkLag") || "0", 10),
    };
  });

  const outlineLevel =
    parseInt(text(el, "OutlineLevel") || "", 10) ||
    countDots(text(el, "OutlineNumber")) + 1 ||
    3;

  return {
    uid: text(el, "UID") || "",
    id: parseInt(text(el, "ID") || "0", 10) || 0,
    name: text(el, "Name") || "",
    wbs: text(el, "WBS") || undefined,
    outlineLevel,
    outlineNumber: text(el, "OutlineNumber") || "",
    summary: text(el, "Summary") === "1",
    milestone: text(el, "Milestone") === "1",
    start: normalizeDate(text(el, "Start")),
    finish: normalizeDate(text(el, "Finish")),
    duration: text(el, "Duration") || undefined,
    percentComplete: parseInt(text(el, "PercentComplete") || "0", 10) || 0,
    notes: text(el, "Notes") || undefined,
    work: text(el, "Work") || undefined,
    resourceNames: splitResourceNames(text(el, "ResourceNames")),
    cost: parseFloat(text(el, "Cost") || "0") || undefined,
    predecessors,
  };
}

// Reads the text content of the first child element whose LOCAL tag name
// matches (namespace-agnostic).
function text(el: Element, localName: string): string {
  const children = Array.from(el.children);
  for (const child of children) {
    if (child.localName === localName) {
      return (child.textContent || "").trim();
    }
  }
  return "";
}

function countDots(s: string): number {
  return s ? s.split(".").length - 1 : 0;
}

function normalizeDate(s: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function splitResourceNames(s: string): string[] | undefined {
  if (!s) return undefined;
  return s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}
