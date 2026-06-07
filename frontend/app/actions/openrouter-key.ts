"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { validateOpenRouterKey } from "@/lib/openrouter-validate";

export interface KeyActionResult {
  ok: boolean;
  error?: string;
  last4?: string;
}

/**
 * Validate an OpenRouter key against OpenRouter, then store it in the user's
 * Clerk privateMetadata. Non-secret status is mirrored into publicMetadata.
 */
export async function setOpenRouterKey(
  formData: FormData
): Promise<KeyActionResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Not authenticated" };
  }

  const key = String(formData.get("key") || "").trim();
  if (!key) {
    return { ok: false, error: "Please enter your OpenRouter API key." };
  }

  const validation = await validateOpenRouterKey(
    key,
    fetch as unknown as Parameters<typeof validateOpenRouterKey>[1]
  );
  if (!validation.ok) {
    return {
      ok: false,
      error:
        "That key was rejected by OpenRouter. Double-check it and try again.",
    };
  }

  try {
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      privateMetadata: { openrouterKey: key },
      publicMetadata: {
        hasKey: true,
        last4: validation.last4,
        validatedAt: Date.now(),
      },
    });
  } catch {
    return { ok: false, error: "Couldn't save your key right now. Please retry." };
  }

  return { ok: true, last4: validation.last4 };
}

/**
 * Clear the stored OpenRouter key from Clerk metadata.
 */
export async function clearOpenRouterKey(): Promise<KeyActionResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Not authenticated" };
  }

  try {
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      privateMetadata: { openrouterKey: null },
      publicMetadata: { hasKey: false },
    });
  } catch {
    return { ok: false, error: "Couldn't remove your key right now. Please retry." };
  }

  return { ok: true };
}
