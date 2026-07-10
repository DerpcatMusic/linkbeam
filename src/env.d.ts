/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Env = {
  DB: D1Database;
  LINK_CACHE: KVNamespace;
  ARTWORK: R2Bucket;
  ANALYTICS?: AnalyticsEngineDataset;
  CONVERSION_EVENTS?: Queue;
  PUBLIC_BASE_URL: string;
  WORKER_NAME?: string;
  META_PIXEL_ID?: string;
  META_ACCESS_TOKEN?: string;
  META_API_VERSION?: string;
  META_TEST_EVENT_CODE?: string;
  META_CONVERSION_VALUE?: string;
  META_CURRENCY?: string;
  META_AD_ACCOUNT_ID?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  RATE_LIMIT_SECRET?: string;
  SUBSCRIBER_RETENTION_DAYS?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
};

declare namespace App {
  interface Locals {
    runtime?: {
      env: Env;
      cf?: IncomingRequestCfProperties;
      ctx: ExecutionContext;
    };
  }
}
