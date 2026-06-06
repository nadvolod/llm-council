"use client";

import Reveal from "./Reveal";
import "./landing.css";

const STAGES = [
  {
    num: "STAGE 1",
    title: "Parallel answers",
    body: "Every council model answers your question independently, in parallel — no model sees another's response.",
  },
  {
    num: "STAGE 2",
    title: "Anonymized peer review",
    body: "Each model reviews and ranks the others' answers, presented anonymously as Response A, B, C — so no model can play favorites.",
  },
  {
    num: "STAGE 3",
    title: "Chairman synthesis",
    body: "A chairman model weighs every answer and ranking, then synthesizes one clear, trusted verdict.",
  },
];

export default function HowItWorks() {
  return (
    <section className="landing-section" id="how-it-works">
      <Reveal>
        <h2>How it works</h2>
        <p className="lead">
          Three stages turn four opinions into one well-reasoned answer.
        </p>
      </Reveal>
      <div className="steps">
        {STAGES.map((stage, i) => (
          <Reveal key={stage.num} delay={i * 0.1} className="step">
            <div className="step-num">{stage.num}</div>
            <h3>{stage.title}</h3>
            <p>{stage.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
