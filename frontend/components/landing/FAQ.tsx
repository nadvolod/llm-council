"use client";

import Reveal from "./Reveal";
import "./landing.css";

const FAQS = [
  {
    q: "Is it free?",
    a: "The app is free to use. You bring your own OpenRouter API key and pay OpenRouter directly for the model usage — we add no markup.",
  },
  {
    q: "Where is my key stored?",
    a: "Your key is validated against OpenRouter and stored in Clerk's server-only private metadata. It never touches our database and is never returned to the browser.",
  },
  {
    q: "Which models are used?",
    a: "A curated council of leading models plus a chairman that synthesizes the final answer. The lineup is fixed for now.",
  },
  {
    q: "Is my data private?",
    a: "Your conversations are scoped to your account. Other users can never see them, and your API key is never logged.",
  },
];

export default function FAQ() {
  return (
    <section className="landing-section" id="faq">
      <Reveal>
        <h2>FAQ</h2>
      </Reveal>
      <div>
        {FAQS.map((item, i) => (
          <Reveal key={item.q} delay={i * 0.05} className="faq-item">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
