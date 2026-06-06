import type {
  ModelResponse,
  Ranking,
  ChairmanResponse,
  CouncilMetadata,
} from "@/lib/api";

export interface MessageDocument {
  filename: string;
}

export interface StageLoading {
  stage1: boolean;
  stage2: boolean;
  stage3: boolean;
}

export interface CouncilMessage {
  role: "user" | "assistant";
  content?: string;
  documents?: MessageDocument[];
  stage1?: ModelResponse[] | null;
  stage2?: Ranking[] | null;
  stage3?: ChairmanResponse | null;
  metadata?: CouncilMetadata | null;
  loading?: StageLoading;
}

export interface CouncilConversation {
  id: string;
  title?: string;
  created_at: string;
  messages: CouncilMessage[];
}
