/**
 * Pure, Clerk-free helper that validates an OpenRouter API key by listing
 * models. Extracted from the server action so it is unit-testable.
 */

export interface ValidateResult {
  ok: boolean;
  last4?: string;
}

export type FetchImpl = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number }>;

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function validateOpenRouterKey(
  key: string,
  fetchImpl: FetchImpl
): Promise<ValidateResult> {
  if (!key || !key.trim()) {
    return { ok: false };
  }
  try {
    const response = await fetchImpl(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.ok) {
      return { ok: true, last4: key.slice(-4) };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
