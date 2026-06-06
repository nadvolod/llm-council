"use client";

import Reveal from "./Reveal";
import "./landing.css";

const STEPS = [
  { num: "1", title: "Sign up", body: "Create an account with email and password." },
  {
    num: "2",
    title: "Paste your key",
    body: "Add your own OpenRouter API key — it's validated and stored securely in Clerk, never in our database.",
  },
  {
    num: "3",
    title: "Run your council",
    body: "Ask anything. You pay OpenRouter directly for the models you use.",
  },
];

export default function Byok() {
  return (
    <section className="landing-section" id="byok">
      <Reveal>
        <h2>Bring your own key</h2>
        <p className="lead">
          Free to use — you only pay OpenRouter directly. Your key, your data.
        </p>
      </Reveal>
      <div className="steps">
        {STEPS.map((step, i) => (
          <Reveal key={step.num} delay={i * 0.1} className="step">
            <div className="step-num">STEP {step.num}</div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
