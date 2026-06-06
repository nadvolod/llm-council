import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...props }: any, ref: any) => {
      // Strip motion-only props so they don't leak onto the DOM element.
      const {
        initial,
        animate,
        transition,
        whileInView,
        viewport,
        whileHover,
        exit,
        variants,
        style,
        ...rest
      } = props;
      return React.createElement(tag, { ref, style, ...rest }, children);
    });
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, key: string) => passthrough(key),
      }
    ),
    useReducedMotion: () => false,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  };
});

import Hero from "../Hero";

describe("Hero", () => {
  it("renders the headline", () => {
    render(<Hero />);
    expect(screen.getByText(/Four minds/i)).toBeInTheDocument();
    expect(screen.getByText(/One verdict/i)).toBeInTheDocument();
  });

  it("renders a CTA linking to /sign-up", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /Start your council/i });
    expect(cta).toHaveAttribute("href", "/sign-up");
  });
});
