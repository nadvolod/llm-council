"use client";

import { useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import {
  setOpenRouterKey,
  clearOpenRouterKey,
} from "@/app/actions/openrouter-key";
import "./ApiKeyPanel.css";

export default function ApiKeyPanel() {
  const { user } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const publicMeta = (user?.publicMetadata || {}) as {
    hasKey?: boolean;
    last4?: string;
  };
  const hasKey = Boolean(publicMeta.hasKey);

  const handleSet = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await setOpenRouterKey(formData);
      if (!result.ok) {
        setError(result.error || "Failed to save key.");
        return;
      }
      setReplacing(false);
      await user?.reload();
    });
  };

  const handleClear = () => {
    setError(null);
    startTransition(async () => {
      const result = await clearOpenRouterKey();
      if (!result.ok) {
        setError(result.error || "Failed to remove key.");
        return;
      }
      await user?.reload();
    });
  };

  if (hasKey && !replacing) {
    return (
      <div className="api-key-panel">
        <div className="api-key-status">
          <span className="api-key-masked">
            Key ••••&nbsp;{publicMeta.last4 ?? "····"}
          </span>
          <span className="api-key-actions">
            <button
              type="button"
              className="api-key-link"
              onClick={() => setReplacing(true)}
              disabled={isPending}
            >
              Replace
            </button>
            <span className="api-key-dot">·</span>
            <button
              type="button"
              className="api-key-link api-key-danger"
              onClick={handleClear}
              disabled={isPending}
            >
              Remove
            </button>
          </span>
        </div>
        {error && (
          <p className="api-key-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="api-key-panel">
      <h3 className="api-key-heading">Add your OpenRouter key</h3>
      <p className="api-key-help">
        The council runs on your own OpenRouter key. It is validated and stored
        securely in Clerk — it never touches our database.
      </p>
      <form action={handleSet} className="api-key-form">
        <input
          type="password"
          name="key"
          className="api-key-input"
          placeholder="sk-or-..."
          aria-label="OpenRouter API key"
          autoComplete="off"
          required
        />
        <button
          type="submit"
          className="api-key-submit"
          disabled={isPending}
        >
          {isPending ? "Saving…" : "Save key"}
        </button>
        {hasKey && (
          <button
            type="button"
            className="api-key-link"
            onClick={() => setReplacing(false)}
            disabled={isPending}
          >
            Cancel
          </button>
        )}
      </form>
      {error && (
        <p className="api-key-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
