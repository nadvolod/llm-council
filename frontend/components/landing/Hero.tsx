"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import "./landing.css";

const NODE_LABELS = ["GPT", "Claude", "Gemini", "Grok"];

export default function Hero() {
  const reduce = useReducedMotion();

  const orbit = (i: number) => {
    const angle = (i / NODE_LABELS.length) * Math.PI * 2;
    const radius = 130;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  return (
    <section className="hero">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={reduce ? {} : { opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <h1>
          Four minds. <span className="accent">One verdict.</span>
        </h1>
        <p className="subhead">
          A council of leading AI models answers your hardest questions —
          debating, ranking each other anonymously, and synthesizing a single
          trusted answer.
        </p>
        <Link href="/sign-up" className="landing-btn landing-btn-primary">
          Start your council →
        </Link>
      </motion.div>

      <div className="hero-nodes" aria-hidden="true">
        {NODE_LABELS.map((label, i) => {
          const target = orbit(i);
          return (
            <motion.div
              key={label}
              className="hero-node"
              initial={reduce ? { x: target.x, y: target.y } : { x: 0, y: 0, opacity: 0 }}
              animate={
                reduce
                  ? { x: target.x, y: target.y }
                  : { x: target.x, y: target.y, opacity: 1 }
              }
              transition={{ duration: 1.2, delay: 0.2 + i * 0.12, ease: "easeOut" }}
            >
              {label}
            </motion.div>
          );
        })}
        <motion.div
          className="hero-core"
          animate={reduce ? {} : { scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </section>
  );
}
