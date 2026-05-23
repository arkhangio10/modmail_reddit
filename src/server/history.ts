import { reddit } from "@devvit/web/server";

// Known karma-farm subreddit name fragments (lowercase).
const KARMA_FARM_FRAGMENTS = [
  "karma",
  "freekarma",
  "upvote",
  "rateme",
  "hivemind",
];

function isKarmaFarm(subreddit: string): boolean {
  const lower = subreddit.toLowerCase();
  return KARMA_FARM_FRAGMENTS.some((f) => lower.includes(f));
}

export async function getUserSummary(
  username: string,
  subredditName: string,
): Promise<string> {
  const lines: string[] = [];

  // --- Account basics ---
  let user;
  try {
    user = await reddit.getUserByUsername(username);
  } catch {
    // Suspended or deleted accounts will throw — still useful to know.
    return `u/${username}: account not found or suspended.`;
  }
  if (!user) {
    return `u/${username}: account not found.`;
  }

  const ageMs = Date.now() - user.createdAt.getTime();
  const ageDays = Math.floor(ageMs / 86_400_000);
  const ageStr =
    ageDays < 30
      ? `${ageDays}d old`
      : ageDays < 365
        ? `${Math.floor(ageDays / 30)}mo old`
        : `${(ageDays / 365).toFixed(1)}yr old`;

  const totalKarma = user.linkKarma + user.commentKarma;
  lines.push(
    `Account: ${ageStr}, ${totalKarma.toLocaleString()} total karma (${user.linkKarma.toLocaleString()} post / ${user.commentKarma.toLocaleString()} comment).`,
  );

  // --- Mod notes for this subreddit ---
  try {
    const notesList = reddit.getModNotes({
      subreddit: subredditName,
      user: username,
      limit: 10,
    });
    const notes: string[] = [];
    for await (const note of notesList) {
      const label = note.userNote?.label ?? note.type;
      const text = note.userNote?.note ?? "";
      notes.push(text ? `${label}: "${text}"` : label);
    }
    if (notes.length > 0) {
      lines.push(`Mod notes in r/${subredditName}: ${notes.join("; ")}.`);
    }
  } catch {
    // Mod notes may fail if the app doesn't have mod access yet.
  }

  // --- Recent posts (last 25) ---
  const subCounts: Record<string, number> = {};
  const postHours: number[] = [];
  let removedPosts = 0;
  let totalPosts = 0;
  let totalScore = 0;

  try {
    const posts = reddit.getPostsByUser({
      username,
      sort: "new",
      limit: 25,
      pageSize: 25,
    });
    for await (const post of posts) {
      totalPosts++;
      const sub = post.subredditName ?? "unknown";
      subCounts[sub] = (subCounts[sub] ?? 0) + 1;
      postHours.push(post.createdAt.getUTCHours());
      totalScore += post.score;
      if (post.removed || post.spam) removedPosts++;
    }
  } catch {
    // Fine if they have few or no posts.
  }

  if (totalPosts > 0) {
    const avgScore = Math.round(totalScore / totalPosts);
    const uniqueSubs = Object.keys(subCounts).length;
    const topSubs = Object.entries(subCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => `r/${s}`)
      .join(", ");
    lines.push(
      `Recent posts: ${totalPosts} posts across ${uniqueSubs} subreddit(s) (top: ${topSubs}), avg score ${avgScore}.`,
    );
    if (removedPosts > 0) {
      lines.push(
        `Flags: ${removedPosts} of the last ${totalPosts} posts were removed or marked spam.`,
      );
    }

    // Karma-farm detection
    const farmSubs = Object.keys(subCounts).filter(isKarmaFarm);
    if (farmSubs.length > 0) {
      lines.push(
        `Possible karma-farming: ${farmSubs.map((s) => `r/${s}`).join(", ")}.`,
      );
    }

    // Posting-hour clustering (bot signal)
    if (postHours.length >= 5) {
      const hourBin: number[] = new Array(24).fill(0);
      for (const h of postHours) hourBin[h]++;
      const maxBin = Math.max(...hourBin);
      const maxHour = hourBin.indexOf(maxBin);
      const clusterRatio = maxBin / postHours.length;
      if (clusterRatio >= 0.5) {
        lines.push(
          `Unusual posting pattern: ${Math.round(clusterRatio * 100)}% of recent posts at hour ${maxHour}:00–${maxHour + 1}:00 UTC (possible bot or scheduler).`,
        );
      }
    }
  }

  return lines.join(" ") || `u/${username}: no additional history found.`;
}
