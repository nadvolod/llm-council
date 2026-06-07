"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ModelResponse } from "@/lib/api";
import "./Stage1.css";

interface Stage1Props {
  responses: ModelResponse[] | null | undefined;
}

export default function Stage1({ responses }: Stage1Props) {
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  // Clamp on read: activeTab may exceed the list after a conversation switch.
  const safeTab = activeTab < responses.length ? activeTab : 0;

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? "active" : ""}`}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split("/")[1] || resp.model}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="model-name">{responses[safeTab].model}</div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{responses[safeTab].response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
