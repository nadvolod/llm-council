"use client";

import Reveal from "./Reveal";
import "./landing.css";

const VALUES = [
  {
    title: "Anonymized review kills favoritism",
    body: "Models rank each other blind, so a strong answer wins on merit — not on brand loyalty.",
  },
  {
    title: "Diverse models catch errors",
    body: "Different architectures fail in different ways. A council surfaces blind spots a single model would miss.",
  },
  {
    title: "Full transparency",
    body: "Every individual response, peer ranking, and the final synthesis is inspectable. Nothing is hidden.",
  },
];

export default function WhyCouncil() {
  return (
    <section className="landing-section" id="why-council">
      <Reveal>
        <h2>Why a council beats one model</h2>
        <p className="lead">
          One model gives you one perspective. A council gives you a verdict.
        </p>
      </Reveal>
      <div className="card-grid">
        {VALUES.map((value, i) => (
          <Reveal key={value.title} delay={i * 0.1} className="card">
            <h3>{value.title}</h3>
            <p>{value.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
