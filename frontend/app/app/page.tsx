"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";
import Sidebar from "@/components/council/Sidebar";
import ChatInterface from "@/components/council/ChatInterface";
import { createApi } from "@/lib/api";
import type { ConversationSummary } from "@/lib/api";
import type { CouncilConversation, CouncilMessage } from "@/components/council/types";
import ApiKeyPanel from "@/components/settings/ApiKeyPanel";
import "./app.css";

export default function CouncilApp() {
  const { getToken } = useAuth();
  const api = useMemo(() => createApi(getToken), [getToken]);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [currentConversation, setCurrentConversation] =
    useState<CouncilConversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  // Monotonic counter so a slow earlier load can't overwrite a newer selection.
  const conversationReqSeq = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, [api]);

  const loadConversation = useCallback(
    async (id: string) => {
      const reqSeq = ++conversationReqSeq.current;
      try {
        const conv = (await api.getConversation(id)) as CouncilConversation;
        // Ignore if a newer selection superseded this request.
        if (reqSeq === conversationReqSeq.current) {
          setCurrentConversation(conv);
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
      }
    },
    [api]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId, loadConversation]);

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations((prev) => [
        {
          id: newConv.id,
          created_at: newConv.created_at,
          title: newConv.title,
          message_count: 0,
        },
        ...prev,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content: string, files: File[] = []) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    setNeedsKey(false);
    try {
      const userMessage: CouncilMessage = {
        role: "user",
        content,
        documents: files.map((f) => ({ filename: f.name })),
      };
      setCurrentConversation((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, userMessage] }
          : prev
      );

      const assistantMessage: CouncilMessage = {
        role: "assistant",
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: { stage1: false, stage2: false, stage3: false },
      };

      setCurrentConversation((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, assistantMessage] }
          : prev
      );

      await api.sendMessageStream(
        currentConversationId,
        content,
        files,
        (eventType, event) => {
          switch (eventType) {
            case "stage1_start":
              setCurrentConversation((prev) => {
                if (!prev) return prev;
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.loading = { ...lastMsg.loading!, stage1: true };
                return { ...prev, messages };
              });
              break;

            case "stage1_complete":
              setCurrentConversation((prev) => {
                if (!prev) return prev;
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.stage1 = event.data as CouncilMessage["stage1"];
                lastMsg.loading = { ...lastMsg.loading!, stage1: false };
                return { ...prev, messages };
              });
              break;

            case "stage2_start":
              setCurrentConversation((prev) => {
                if (!prev) return prev;
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.loading = { ...lastMsg.loading!, stage2: true };
                return { ...prev, messages };
              });
              break;

            case "stage2_complete":
              setCurrentConversation((prev) => {
                if (!prev) return prev;
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.stage2 = event.data as CouncilMessage["stage2"];
                lastMsg.metadata = event.metadata as CouncilMessage["metadata"];
                lastMsg.loading = { ...lastMsg.loading!, stage2: false };
                return { ...prev, messages };
              });
              break;

            case "stage3_start":
              setCurrentConversation((prev) => {
                if (!prev) return prev;
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.loading = { ...lastMsg.loading!, stage3: true };
                return { ...prev, messages };
              });
              break;

            case "stage3_complete":
              setCurrentConversation((prev) => {
                if (!prev) return prev;
                const messages = [...prev.messages];
                const lastMsg = messages[messages.length - 1];
                lastMsg.stage3 = event.data as CouncilMessage["stage3"];
                lastMsg.loading = { ...lastMsg.loading!, stage3: false };
                return { ...prev, messages };
              });
              break;

            case "title_complete":
              loadConversations();
              break;

            case "complete":
              loadConversations();
              setIsLoading(false);
              break;

            case "error":
              console.error("Stream error:", event.message);
              setIsLoading(false);
              break;

            default:
              console.log("Unknown event type:", eventType);
          }
        }
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      if ((error as { status?: number }).status === 409) {
        setNeedsKey(true);
      }
      setCurrentConversation((prev) =>
        prev ? { ...prev, messages: prev.messages.slice(0, -2) } : prev
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      <div className="app-main">
        <div className="app-topbar">
          <UserButton afterSignOutUrl="/" />
        </div>
        {needsKey && (
          <div className="api-key-banner">
            <ApiKeyPanel />
          </div>
        )}
        <ChatInterface
          conversation={currentConversation}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
