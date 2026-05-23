import { redis } from "@devvit/web/server";
import type { LLMClassification, LLMSeverity } from "./prompts.ts";

// Keys: stats:${sub}:${YYYY-MM-DD}:calls         — total LLM calls
//        stats:${sub}:${YYYY-MM-DD}:class:${cat}  — per-classification counter
//        stats:${sub}:${YYYY-MM-DD}:sev:${level}  — per-severity counter
const STATS_TTL_S = 8 * 24 * 3600; // keep 8 days so we can show 7 full days

function dayKey(sub: string, date: string, field: string): string {
  return `stats:${sub}:${date}:${field}`;
}

function dateStr(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function recordStats(
  sub: string,
  classification: LLMClassification,
  severity: LLMSeverity,
): Promise<void> {
  const today = dateStr();
  const keys = [
    dayKey(sub, today, "calls"),
    dayKey(sub, today, `class:${classification}`),
    dayKey(sub, today, `sev:${severity}`),
  ];
  await Promise.all(
    keys.map(async (k) => {
      const n = await redis.incrBy(k, 1);
      if (n === 1) await redis.expire(k, STATS_TTL_S);
    }),
  );
}

type DaySummary = {
  date: string;
  calls: number;
  bySeverity: { low: number; med: number; high: number };
  byClass: Partial<Record<LLMClassification, number>>;
};

const ALL_CLASSES: LLMClassification[] = [
  "ban_appeal",
  "rule_question",
  "content_removal_question",
  "report_other_user",
  "feedback",
  "spam",
  "harassment_against_user",
  "harassment_against_mods",
  "other",
];

export async function getWeeklyStats(sub: string): Promise<DaySummary[]> {
  const days: DaySummary[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = dateStr(i);
    const callsStr = await redis.get(dayKey(sub, date, "calls"));
    const calls = callsStr ? parseInt(callsStr, 10) : 0;
    if (calls === 0) {
      days.push({ date, calls: 0, bySeverity: { low: 0, med: 0, high: 0 }, byClass: {} });
      continue;
    }

    const [lowStr, medStr, highStr] = await Promise.all([
      redis.get(dayKey(sub, date, "sev:low")),
      redis.get(dayKey(sub, date, "sev:med")),
      redis.get(dayKey(sub, date, "sev:high")),
    ]);
    const byClass: Partial<Record<LLMClassification, number>> = {};
    await Promise.all(
      ALL_CLASSES.map(async (c) => {
        const v = await redis.get(dayKey(sub, date, `class:${c}`));
        if (v) byClass[c] = parseInt(v, 10);
      }),
    );
    days.push({
      date,
      calls,
      bySeverity: {
        low: lowStr ? parseInt(lowStr, 10) : 0,
        med: medStr ? parseInt(medStr, 10) : 0,
        high: highStr ? parseInt(highStr, 10) : 0,
      },
      byClass,
    });
  }
  return days;
}

export function formatStatsPost(sub: string, days: DaySummary[]): string {
  const totalCalls = days.reduce((s, d) => s + d.calls, 0);
  const totalHigh = days.reduce((s, d) => s + d.bySeverity.high, 0);

  const classTotal: Partial<Record<LLMClassification, number>> = {};
  for (const d of days) {
    for (const [c, n] of Object.entries(d.byClass) as [LLMClassification, number][]) {
      classTotal[c] = (classTotal[c] ?? 0) + n;
    }
  }
  const topClasses = Object.entries(classTotal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, n]) => `• \`${c}\`: **${n}**`)
    .join("\n");

  const dayRows = days
    .map((d) => {
      const bar =
        d.calls === 0
          ? "—"
          : `🟢×${d.bySeverity.low} 🟡×${d.bySeverity.med} 🔴×${d.bySeverity.high}`;
      return `| ${d.date} | ${d.calls} | ${bar} |`;
    })
    .join("\n");

  return [
    `## 🤖 ModMail Copilot — r/${sub} stats (last 7 days)`,
    "",
    `**Total AI drafts generated:** ${totalCalls}  |  **High-severity messages:** ${totalHigh}`,
    "",
    "### Daily breakdown",
    "",
    "| Date | Drafts | Severity (low/med/high) |",
    "|------|--------|------------------------|",
    dayRows,
    "",
    "### Top classifications",
    "",
    topClasses || "No data yet.",
    "",
    `*Generated ${new Date().toUTCString()}*`,
  ].join("\n");
}
