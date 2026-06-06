import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useUserMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useUser: () => useUserMock(),
}));

vi.mock("@/app/actions/openrouter-key", () => ({
  setOpenRouterKey: vi.fn(),
  clearOpenRouterKey: vi.fn(),
}));

import ApiKeyPanel from "../ApiKeyPanel";

describe("ApiKeyPanel", () => {
  beforeEach(() => {
    useUserMock.mockReset();
  });

  it("renders the add-key form when the user has no key", () => {
    useUserMock.mockReturnValue({
      user: { publicMetadata: { hasKey: false }, reload: vi.fn() },
    });
    render(<ApiKeyPanel />);
    expect(screen.getByText(/Add your OpenRouter key/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/OpenRouter API key/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save key/i })
    ).toBeInTheDocument();
  });

  it("renders the masked state with last4 when the user has a key", () => {
    useUserMock.mockReturnValue({
      user: {
        publicMetadata: { hasKey: true, last4: "9876" },
        reload: vi.fn(),
      },
    });
    render(<ApiKeyPanel />);
    expect(screen.getByText(/9876/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Replace/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Remove/i })
    ).toBeInTheDocument();
    // The add-key form should not be shown.
    expect(
      screen.queryByText(/Add your OpenRouter key/i)
    ).not.toBeInTheDocument();
  });
});
