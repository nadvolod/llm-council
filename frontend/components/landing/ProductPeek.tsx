"use client";

import Reveal from "./Reveal";
import "./landing.css";

const RANKINGS = [
  { rank: "#1", model: "claude", score: "Avg 1.33", votes: "3 votes" },
  { rank: "#2", model: "gpt-5.1", score: "Avg 2.00", votes: "3 votes" },
  { rank: "#3", model: "gemini", score: "Avg 2.67", votes: "3 votes" },
];

export default function ProductPeek() {
  return (
    <section className="landing-section" id="product-peek">
      <Reveal>
        <h2>See the whole deliberation</h2>
        <p className="lead">
          Inspect every stage — individual answers, anonymized rankings, and the
          aggregate street-cred leaderboard.
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="product-peek" aria-hidden="true">
          <div className="peek-tabs">
            <span className="peek-tab">Stage 1</span>
            <span className="peek-tab active">Stage 2: Rankings</span>
            <span className="peek-tab">Stage 3</span>
          </div>
          <div className="peek-body">
            {RANKINGS.map((r) => (
              <div className="peek-rank-row" key={r.model}>
                <strong style={{ minWidth: 36 }}>{r.rank}</strong>
                <span style={{ flex: 1, fontFamily: "monospace" }}>
                  {r.model}
                </span>
                <span style={{ opacity: 0.7 }}>{r.score}</span>
                <span style={{ opacity: 0.5 }}>{r.votes}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
