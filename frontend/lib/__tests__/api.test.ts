import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApi } from "../api";

function makeFile(name: string, content = "data") {
  return new File([content], name, { type: "text/plain" });
}

function sseBody(events: object[]) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

const getToken = () => Promise.resolve("jwt-token-123");

describe("createApi", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("listConversations attaches the Authorization header", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: "c1" }],
    });
    const api = createApi(getToken);
    const result = await api.listConversations();
    expect(result).toEqual([{ id: "c1" }]);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toContain("/api/conversations");
    expect(options.headers.Authorization).toBe("Bearer jwt-token-123");
  });

  it("createConversation posts with the Authorization header", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "c2", messages: [] }),
    });
    const api = createApi(getToken);
    await api.createConversation();
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer jwt-token-123");
  });

  it("sendMessage builds multipart FormData with content and files + auth header", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ stage1: [], stage2: [], stage3: null }),
    });
    const api = createApi(getToken);
    await api.sendMessage("cid", "hello", [
      makeFile("a.txt"),
      makeFile("b.txt"),
    ]);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toContain("/api/conversations/cid/message");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("content")).toBe("hello");
    const files = options.body.getAll("files");
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("a.txt");
    expect(options.headers.Authorization).toBe("Bearer jwt-token-123");
  });

  it("sendMessageStream posts FormData and emits parsed SSE events", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: sseBody([
        { type: "stage1_start" },
        { type: "stage1_complete", data: [{ model: "m", response: "r" }] },
        { type: "complete" },
      ]),
    });
    const api = createApi(getToken);
    const onEvent = vi.fn();
    await api.sendMessageStream("cid", "q", [], onEvent);

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toContain("/api/conversations/cid/message/stream");
    expect(options.headers.Authorization).toBe("Bearer jwt-token-123");
    expect(onEvent.mock.calls.map((c) => c[0])).toEqual([
      "stage1_start",
      "stage1_complete",
      "complete",
    ]);
    expect(onEvent.mock.calls[1][1].data[0].model).toBe("m");
  });

  it("sendMessageStream throws on non-OK response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });
    const api = createApi(getToken);
    await expect(
      api.sendMessageStream("cid", "q", [], vi.fn())
    ).rejects.toThrow(/Failed to send message/);
  });
});
