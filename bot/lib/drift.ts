import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolContext } from "@grok/agent-sdk/tools";

type Kv = ToolContext["host"]["kv"];

export const OPS_CHANNEL_ID = "C0CFQGAKT71";
export const OPS_CHANNEL_NAME = "#cornerstone-ops";
export const OPS_OWNER_USER_ID = "U0CG7N34MCH";
export const REPORT_MAX_CHARS = 8000;
export const STORE_KEY = "process-drift/store";

const OBSERVATION_TEXT_MAX = 1500;
const LIST_TEXT_MAX = 360;
const LIST_MAX = 120;
const RETENTION_DAYS = 45;
const MAX_OBSERVATIONS = 500;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type TriggerKind = "report" | "build";

export type Observation = {
  id: string;
  channelId: string;
  ts: string;
  threadTs: string;
  userId: string;
  userName: string;
  text: string;
  at: string;
  source: "slack" | "manual";
};

export type HandledProcess = {
  processName: string;
  skillName: string;
  notedAt: string;
};

type DriftStore = {
  observations: Observation[];
  handled: HandledProcess[];
  lastScheduledWeek: string;
  lastScheduledAt: string;
};

const REQUIRED_REPORT_SECTIONS = [
  "Process Drift & Automation Report",
  "Summary",
  "Top candidates",
  "Already handled",
  "Watch list",
] as const;

export function classifyTrigger(text: string): TriggerKind | null {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized.includes("run the process drift report now")) return "report";
  if (normalized.includes("build the skill for")) return "build";
  if (
    /\bapproved\b/.test(normalized) &&
    /\b(candidate|process drift|skill)\b/.test(normalized)
  ) {
    return "build";
  }
  return null;
}

export function tagLine(): string {
  return `<@${OPS_OWNER_USER_ID}> Egg bot`;
}

export function etYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isoWeekKey(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function etMonday(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - delta);
  return date.toISOString().slice(0, 10);
}

export function missingReportSections(body: string): string[] {
  return REQUIRED_REPORT_SECTIONS.filter((section) => !body.includes(section));
}

export async function recordObservation(
  kv: Kv,
  input: {
    channelId: string;
    ts: string;
    threadTs?: string;
    userId?: string;
    userName?: string;
    text: string;
    source?: "slack" | "manual";
    at?: string;
  },
): Promise<{ stored: boolean; duplicate: boolean; id: string; kept: number }> {
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, OBSERVATION_TEXT_MAX);
  const id = `${input.channelId}:${input.ts}`;
  if (text.length === 0) {
    return { stored: false, duplicate: false, id, kept: 0 };
  }
  const store = await readStore(kv);
  if (store.observations.some((item) => item.id === id)) {
    return { stored: true, duplicate: true, id, kept: store.observations.length };
  }
  const observation: Observation = {
    id,
    channelId: input.channelId,
    ts: input.ts,
    threadTs: input.threadTs ?? input.ts,
    userId: input.userId ?? "",
    userName: input.userName ?? "",
    text,
    at: input.at ?? slackTsToIso(input.ts),
    source: input.source ?? "slack",
  };
  store.observations.push(observation);
  prune(store, Date.now());
  await writeStore(kv, store);
  return { stored: true, duplicate: false, id, kept: store.observations.length };
}

export async function listObservations(
  kv: Kv,
  sinceDays = 30,
  now = new Date(),
): Promise<{
  today: string;
  timezone: "America/New_York";
  weekKey: string;
  sinceDays: number;
  totalInWindow: number;
  thisWeek: number;
  returned: number;
  truncated: boolean;
  observations: Array<Omit<Observation, "text"> & { text: string }>;
  handled: HandledProcess[];
}> {
  const store = await readStore(kv);
  const today = etYmd(now);
  const monday = etMonday(today);
  const cutoff = now.getTime() - sinceDays * 24 * 60 * 60 * 1000;
  const inWindow = store.observations.filter((item) => {
    const at = Date.parse(item.at);
    return Number.isFinite(at) && at >= cutoff;
  });
  const thisWeek = inWindow.filter((item) => etYmd(new Date(item.at)) >= monday).length;
  const truncated = inWindow.length > LIST_MAX;
  const selected = inWindow.slice(-LIST_MAX);
  return {
    today,
    timezone: "America/New_York",
    weekKey: isoWeekKey(today),
    sinceDays,
    totalInWindow: inWindow.length,
    thisWeek,
    returned: selected.length,
    truncated,
    observations: selected.map((item) => ({
      ...item,
      text: item.text.slice(0, LIST_TEXT_MAX),
    })),
    handled: store.handled,
  };
}

export async function markHandled(
  kv: Kv,
  input: { processName: string; skillName: string; notedAt?: string },
): Promise<{ handled: HandledProcess[]; updated: boolean }> {
  const processName = input.processName.trim();
  const skillName = input.skillName.trim();
  const store = await readStore(kv);
  const notedAt = input.notedAt ?? new Date().toISOString();
  const existing = store.handled.find(
    (item) => item.processName.toLowerCase() === processName.toLowerCase(),
  );
  if (existing) {
    const updated =
      existing.skillName !== skillName || existing.notedAt !== notedAt;
    existing.skillName = skillName;
    existing.notedAt = notedAt;
    if (updated) await writeStore(kv, store);
    return { handled: store.handled, updated };
  }
  store.handled.push({ processName, skillName, notedAt });
  await writeStore(kv, store);
  return { handled: store.handled, updated: true };
}

export async function scheduledPostStatus(
  kv: Kv,
  weekKey: string,
): Promise<{ alreadyPosted: boolean }> {
  const store = await readStore(kv);
  return { alreadyPosted: store.lastScheduledWeek === weekKey };
}

export async function claimScheduledPost(
  kv: Kv,
  weekKey: string,
  at: string,
): Promise<{ alreadyPosted: boolean }> {
  const store = await readStore(kv);
  if (store.lastScheduledWeek === weekKey) {
    return { alreadyPosted: true };
  }
  store.lastScheduledWeek = weekKey;
  store.lastScheduledAt = at;
  await writeStore(kv, store);
  return { alreadyPosted: false };
}

export async function listKnownSkills(): Promise<
  Array<{ name: string; description: string }>
> {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../skills");
  const entries = await readdir(root, { withFileTypes: true });
  const skills: Array<{ name: string; description: string }> = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = entry.isDirectory()
      ? join(root, entry.name, "SKILL.md")
      : entry.name.endsWith(".md")
        ? join(root, entry.name)
        : "";
    if (path.length === 0) continue;
    const name = entry.isDirectory()
      ? entry.name
      : entry.name.replace(/\.md$/, "");
    try {
      const text = await readFile(path, "utf8");
      skills.push({ name, description: descriptionFromMarkdown(text) });
    } catch {
      continue;
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function descriptionFromMarkdown(text: string): string {
  const match = text.match(/^---\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/);
  if (match?.[1]) return match[1].trim();
  const line = text
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0 && !item.startsWith("---") && !item.startsWith("#"));
  return line ?? "";
}

function slackTsToIso(ts: string): string {
  const seconds = Number(ts.split(".")[0]);
  if (!Number.isFinite(seconds) || seconds < 1_000_000_000) {
    return new Date().toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}

function emptyStore(): DriftStore {
  return {
    observations: [],
    handled: [],
    lastScheduledWeek: "",
    lastScheduledAt: "",
  };
}

async function readStore(kv: Kv): Promise<DriftStore> {
  const value = await kv.get(STORE_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyStore();
  }
  const record = value as Record<string, unknown>;
  return {
    observations: Array.isArray(record.observations)
      ? record.observations.flatMap((item) => {
          const observation = asObservation(item);
          return observation ? [observation] : [];
        })
      : [],
    handled: Array.isArray(record.handled)
      ? record.handled.flatMap((item) => {
          const handled = asHandled(item);
          return handled ? [handled] : [];
        })
      : [],
    lastScheduledWeek:
      typeof record.lastScheduledWeek === "string" ? record.lastScheduledWeek : "",
    lastScheduledAt:
      typeof record.lastScheduledAt === "string" ? record.lastScheduledAt : "",
  };
}

async function writeStore(kv: Kv, store: DriftStore): Promise<void> {
  const value: Parameters<Kv["put"]>[1] = JSON.parse(JSON.stringify(store));
  await kv.put(STORE_KEY, value);
}

function prune(store: DriftStore, nowMs: number): void {
  const cutoff = nowMs - RETENTION_MS;
  store.observations = store.observations.filter((item) => {
    const at = Date.parse(item.at);
    return Number.isFinite(at) && at >= cutoff;
  });
  if (store.observations.length > MAX_OBSERVATIONS) {
    store.observations = store.observations.slice(-MAX_OBSERVATIONS);
  }
}

function asObservation(value: unknown): Observation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.channelId !== "string" ||
    typeof item.ts !== "string" ||
    typeof item.text !== "string" ||
    typeof item.at !== "string"
  ) {
    return undefined;
  }
  return {
    id: item.id,
    channelId: item.channelId,
    ts: item.ts,
    threadTs: typeof item.threadTs === "string" ? item.threadTs : item.ts,
    userId: typeof item.userId === "string" ? item.userId : "",
    userName: typeof item.userName === "string" ? item.userName : "",
    text: item.text,
    at: item.at,
    source: item.source === "manual" ? "manual" : "slack",
  };
}

function asHandled(value: unknown): HandledProcess | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.processName !== "string" ||
    typeof item.skillName !== "string" ||
    typeof item.notedAt !== "string"
  ) {
    return undefined;
  }
  return {
    processName: item.processName,
    skillName: item.skillName,
    notedAt: item.notedAt,
  };
}
