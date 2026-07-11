import { handle } from "@astrojs/cloudflare/handler";
import { retryFailedCapiEvents } from "@lib/capi-retry";
import { deleteExpiredMetaEventClaims, processConversionQueueBatch, type ConversionQueueMessage } from "@lib/tracking";
import type { RuntimeEnv } from "@lib/runtime";
import { deleteExpiredSubscribers } from "@lib/subscriber-privacy";

export default {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([retryFailedCapiEvents(env), deleteExpiredSubscribers(env), deleteExpiredMetaEventClaims(env)]).then(() => undefined));
  },
  async queue(batch: MessageBatch<ConversionQueueMessage>, env: RuntimeEnv): Promise<void> {
    await processConversionQueueBatch(batch, env);
  }
} satisfies ExportedHandler<RuntimeEnv, ConversionQueueMessage>;
