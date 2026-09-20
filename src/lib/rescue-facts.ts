// Ground-truth facts from the OnyxTranslate rescue mission run (2026-09-20 UTC).
// These mirror rescue/forensic-log.md and public/rescue/latest.json. The
// dashboard merges fresher values from /rescue/latest.json over these defaults.

export const RESCUE = {
  mission: "OnyxTranslate Rescue Mission",
  deployment: "https://successful-iguana-419.convex.cloud",
  liveSite: "https://oyxtranslate.freebuff.app",
  ranAtUTC: "2026-09-20T17:19:47.605Z",
  pausedError:
    "Cannot run functions while this deployment is paused. Resume the deployment in the dashboard settings to allow functions to run.",
  requestIdSample: "dc81edcf8649b5ff",
  probedPaths: [
    "queries:getLatestProject",
    "queries:getAllProjects",
    "queries:getProjectRaw {projectId}",
    "queries:getTranslationsRaw {projectId}",
    "queries:getTranslationProgress {projectId}",
    "queries:getLivePreviewText {projectId, langCode}",
    "queries:getHistory {sessionId}",
    "resumeServerProject:getServerJobStatus {}",
  ],
  resumeCandidates: [
    "resumeServerProject:resumeServerJob",
    "resumeServerProject:resumeJob",
    "resumeServerProject:resume",
    "resumeServerProject:recoverJob",
    "resumeServerProject:resumeServer",
    "resumeServerProject:resumeFrozenJob",
    "resumeServerProject:kickWatchdog",
  ],
  backupFile: "onyx-backup-20260920T172211Z.json",
  counts: { projects: 0, translations: 0, chunks: 0, imageTranslations: 0 },
  frozenJob: { label: "672-page Urdu job", progress: "14/92 chunks" },
} as const;

export interface RescueLatest {
  generatedAt?: string;
  sourceDeployment?: string;
  phases?: {
    A?: { completed?: boolean; workingPaths?: Record<string, string> };
    B?: {
      completed?: boolean;
      backupFile?: string | null;
      counts?: Record<string, number>;
      capturedAt?: string | null;
    };
    C?: {
      completed?: boolean;
      resumeInvoked?: boolean;
      polls?: number;
      completedBefore?: number | null;
      completedAfter?: number | null;
      stopped?: boolean;
    };
    D?: { completed?: boolean };
  };
  nextStep?: string;
}

export type PathStatus = "ok" | "error" | "unknown";
