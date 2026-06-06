"use client";

import ReactMarkdown from "react-markdown";
import type { ChairmanResponse } from "@/lib/api";
import "./Stage3.css";

interface Stage3Props {
  finalResponse: ChairmanResponse | null | undefined;
}

export default function Stage3({ finalResponse }: Stage3Props) {
  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <h3 className="stage-title">Stage 3: Final Council Answer</h3>
      <div className="final-response">
        <div className="chairman-label">
          Chairman: {finalResponse.model.split("/")[1] || finalResponse.model}
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
