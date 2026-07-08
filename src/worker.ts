import { handle } from "@astrojs/cloudflare/handler";
import { retryFailedCapiEvents } from "@lib/capi-retry";
import { processConversionQueueBatch, type ConversionQueueMessage } from "@lib/tracking";
import type { RuntimeEnv } from "@lib/runtime";

export default {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(retryFailedCapiEvents(env));
  },
  async queue(batch: MessageBatch<ConversionQueueMessage>, env: RuntimeEnv): Promise<void> {
    await processConversionQueueBatch(batch, env);
  }
} satisfies ExportedHandler<RuntimeEnv, ConversionQueueMessage>;
