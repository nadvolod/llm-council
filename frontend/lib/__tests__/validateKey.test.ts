import { describe, it, expect, vi } from "vitest";
import { validateOpenRouterKey } from "../openrouter-validate";

describe("validateOpenRouterKey", () => {
  it("returns ok with last4 when OpenRouter responds 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await validateOpenRouterKey("sk-or-abcd1234", fetchImpl);
    expect(result).toEqual({ ok: true, last4: "1234" });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(options.headers.Authorization).toBe("Bearer sk-or-abcd1234");
  });

  it("returns not-ok when OpenRouter responds 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const result = await validateOpenRouterKey("bad-key", fetchImpl);
    expect(result.ok).toBe(false);
  });

  it("returns not-ok when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const result = await validateOpenRouterKey("sk-or-x", fetchImpl);
    expect(result.ok).toBe(false);
  });

  it("returns not-ok for an empty key", async () => {
    const fetchImpl = vi.fn();
    const result = await validateOpenRouterKey("", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
