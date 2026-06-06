"use client";

import Link from "next/link";
import Reveal from "./Reveal";
import "./landing.css";

export default function FinalCTA() {
  return (
    <section className="final-cta" id="final-cta">
      <Reveal>
        <h2>Convene your council</h2>
        <Link href="/sign-up" className="landing-btn landing-btn-primary">
          Convene your council →
        </Link>
      </Reveal>
    </section>
  );
}
