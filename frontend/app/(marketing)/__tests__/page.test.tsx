import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...props }: any, ref: any) => {
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
    motion: new Proxy({}, { get: (_t, key: string) => passthrough(key) }),
    useReducedMotion: () => false,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  };
});

vi.mock("next/link", () => {
  const React = require("react");
  return {
    default: ({ children, href, ...rest }: any) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

import LandingPage from "../page";

describe("Landing page", () => {
  it("renders all core section headings in order", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Four minds/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /How it works/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Why a council beats one model/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /See the whole deliberation/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Bring your own key/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^FAQ$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Convene your council/i })
    ).toBeInTheDocument();
  });
});
