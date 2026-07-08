import type { APIRoute } from "astro";
import {
  getOnboardingStatus,
  parseSkippedSteps,
  serializeSkippedSteps,
  type OnboardingStepId
} from "@lib/onboarding";
import { badRequest, json, readJson } from "@lib/http";
import { getRuntimeEnv, publicBaseUrl, requireAdmin } from "@lib/runtime";
import {
  getSetting,
  setOnboardingCompleted,
  setOnboardingStep,
  setSetting
} from "@lib/settings";
import { onboardingBodySchema } from "@lib/validation";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  const status = await getOnboardingStatus(env, {
    isDev: import.meta.env.DEV,
    publicBaseUrl: publicBaseUrl(env, context.request)
  });

  return json(status);
};

export const PATCH: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const body = onboardingBodySchema.parse(await readJson<unknown>(context.request));

    if (body.skipWizard) {
      await setOnboardingCompleted(env, true);
      await setOnboardingStep(env, "complete");
      return json({ ok: true, completed: true });
    }

    if (body.completed !== undefined) {
      await setOnboardingCompleted(env, body.completed);
      if (body.completed) await setOnboardingStep(env, "complete");
    }

    if (body.step) {
      await setOnboardingStep(env, body.step);
    }

    if (body.skipStep) {
      const skipped = parseSkippedSteps(await getSetting(env, "onboarding_skipped_steps"));
      const nextSkipped = new Set<OnboardingStepId>([...skipped, body.skipStep]);
      await setSetting(env, "onboarding_skipped_steps", serializeSkippedSteps(nextSkipped));
    }

    const status = await getOnboardingStatus(env, {
      step: body.step,
      isDev: import.meta.env.DEV,
      publicBaseUrl: publicBaseUrl(env, context.request)
    });

    return json({ ok: true, status });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Onboarding update failed.");
  }
};
