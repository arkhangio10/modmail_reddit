import type { IncomingMessage } from "node:http";
import type { TriggerResponse } from "@devvit/web/shared";
import { once } from "node:events";

// Phase 1: log only. Real shape lives in
// node_modules/@devvit/protos/types/devvit/reddit/v2alpha/modmail.d.ts.
// Filter + business logic land in Phase 2 after we've seen the actual payload.
type ModMailEvent = Record<string, unknown>;

async function readJSON<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  await once(req, "end");
  return JSON.parse(`${Buffer.concat(chunks)}`);
}

export async function onModMail(req: IncomingMessage): Promise<TriggerResponse> {
  try {
    const event = await readJSON<ModMailEvent>(req);
    console.log("[modmail-event]", JSON.stringify(event));
  } catch (err) {
    // Hard Rule #9: never let a failure block the mod workflow.
    console.error("[modmail-event] failed to read body:", err);
  }
  return {};
}
