import { getRetryableCapiLogs, logCapiResult, markCapiLogRetried } from "@lib/capi-log";
import type { RuntimeEnv } from "@lib/runtime";
import { sendMetaBatch, type QueuedMetaEvent } from "@lib/tracking";

export async function retryFailedCapiEvents(env: RuntimeEnv): Promise<void> {
  const rows = await getRetryableCapiLogs(env);
  for (const row of rows) {
    let event: QueuedMetaEvent;
    try {
      event = JSON.parse(row.payload) as QueuedMetaEvent;
    } catch {
      continue;
    }

    try {
      const result = await sendMetaBatch(env, [event], { kind: row.kind, attempt: row.attempt + 1, skipRetryLog: true });
      await logCapiResult(env, { event, kind: row.kind, attempt: row.attempt + 1 }, result);
    } catch (error) {
      await logCapiResult(env, { event, kind: row.kind, attempt: row.attempt + 1 }, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Retry failed"
      });
    } finally {
      await markCapiLogRetried(env, row.id);
    }
  }
}
