import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "../Footer";

describe("Footer", () => {
  it("renders the attribution and a LinkedIn link", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: /Nikolay Advolodkin/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toMatch(/linkedin\.com/i);
  });

  it("renders the vibe-code warning", () => {
    render(<Footer />);
    expect(screen.getByText(/Vibe Code Alert/i)).toBeInTheDocument();
  });

  it("renders a GitHub repo link", () => {
    render(<Footer />);
    const gh = screen.getByRole("link", { name: /GitHub repo/i });
    expect(gh.getAttribute("href")).toMatch(/github\.com/i);
  });
});
