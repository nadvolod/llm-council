/**
 * Typed API client for the LLM Council backend.
 *
 * Every request carries `Authorization: Bearer <clerk_jwt>`. The token is
 * supplied by the caller via `getToken` (e.g. Clerk's `useAuth().getToken`),
 * keeping this module testable without Clerk.
 */

export interface ModelResponse {
  model: string;
  response: string;
}

export interface Ranking {
  model: string;
  ranking: string;
  parsed_ranking?: string[];
}

export interface AggregateRanking {
  model: string;
  average_rank: number;
  rankings_count: number;
}

export interface CouncilMetadata {
  label_to_model?: Record<string, string>;
  aggregate_rankings?: AggregateRanking[];
}

export interface ChairmanResponse {
  model: string;
  response: string;
}

export interface MessageResult {
  stage1: ModelResponse[];
  stage2: Ranking[];
  stage3: ChairmanResponse | null;
  metadata?: CouncilMetadata;
}

export interface ConversationSummary {
  id: string;
  created_at: string;
  title?: string;
  message_count: number;
}

export interface Conversation {
  id: string;
  created_at: string;
  title?: string;
  messages: unknown[];
}

export type GetToken = () => Promise<string | null>;

export type StreamEventHandler = (
  eventType: string,
  event: Record<string, unknown>
) => void;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

function buildMessageFormData(content: string, files?: File[]): FormData {
  const formData = new FormData();
  formData.append("content", content);
  for (const file of files || []) {
    formData.append("files", file, file.name);
  }
  return formData;
}

export function createApi(getToken: GetToken) {
  async function authHeaders(
    extra: Record<string, string> = {}
  ): Promise<Record<string, string>> {
    const token = await getToken();
    const headers: Record<string, string> = { ...extra };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  return {
    async listConversations(): Promise<ConversationSummary[]> {
      const response = await fetch(`${API_BASE}/api/conversations`, {
        headers: await authHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to list conversations");
      }
      return response.json();
    },

    async createConversation(): Promise<Conversation> {
      const response = await fetch(`${API_BASE}/api/conversations`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error("Failed to create conversation");
      }
      return response.json();
    },

    async getConversation(conversationId: string): Promise<Conversation> {
      const response = await fetch(
        `${API_BASE}/api/conversations/${conversationId}`,
        { headers: await authHeaders() }
      );
      if (!response.ok) {
        throw new Error("Failed to get conversation");
      }
      return response.json();
    },

    async sendMessage(
      conversationId: string,
      content: string,
      files: File[] = []
    ): Promise<MessageResult> {
      const response = await fetch(
        `${API_BASE}/api/conversations/${conversationId}/message`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: buildMessageFormData(content, files),
        }
      );
      if (!response.ok) {
        const err = new Error("Failed to send message") as Error & {
          status?: number;
        };
        err.status = response.status;
        throw err;
      }
      return response.json();
    },

    async sendMessageStream(
      conversationId: string,
      content: string,
      files: File[] | undefined,
      onEvent: StreamEventHandler
    ): Promise<void> {
      const response = await fetch(
        `${API_BASE}/api/conversations/${conversationId}/message/stream`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: buildMessageFormData(content, files),
        }
      );

      if (!response.ok) {
        const err = new Error("Failed to send message") as Error & {
          status?: number;
        };
        err.status = response.status;
        throw err;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data);
              onEvent(event.type, event);
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
          }
        }
      }
    },
  };
}

export type CouncilApi = ReturnType<typeof createApi>;
