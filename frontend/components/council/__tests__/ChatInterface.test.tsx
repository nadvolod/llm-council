import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInterface from "../ChatInterface";
import type { CouncilConversation, CouncilMessage } from "../types";

function makeConversation(
  messages: CouncilMessage[] = []
): CouncilConversation {
  return { id: "c1", title: "T", created_at: "", messages };
}

function makeFile(
  name: string,
  { size = 100, type = "text/plain" }: { size?: number; type?: string } = {}
) {
  const content = "x".repeat(size);
  return new File([content], name, { type });
}

describe("ChatInterface", () => {
  let onSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSendMessage = vi.fn();
  });

  describe("form visibility (regression for hidden-after-first-message bug)", () => {
    it("renders input form when conversation is empty", () => {
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      expect(
        screen.getByPlaceholderText(/Ask your question/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Send$/i })
      ).toBeInTheDocument();
    });

    it("still renders input form after a user message exists", () => {
      const conv = makeConversation([
        { role: "user", content: "first" },
        {
          role: "assistant",
          stage1: [{ model: "m", response: "r" }],
          stage2: [],
          stage3: { model: "m", response: "final" },
        },
      ]);
      render(
        <ChatInterface
          conversation={conv}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      expect(
        screen.getByPlaceholderText(/Ask your question/i)
      ).toBeInTheDocument();
    });
  });

  describe("sending messages", () => {
    it("calls onSendMessage with text and empty file list", async () => {
      const user = userEvent.setup();
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      await user.type(
        screen.getByPlaceholderText(/Ask your question/i),
        "Hi there"
      );
      await user.click(screen.getByRole("button", { name: /^Send$/i }));
      expect(onSendMessage).toHaveBeenCalledWith("Hi there", []);
    });

    it("does not send when input is whitespace only", async () => {
      const user = userEvent.setup();
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      await user.type(screen.getByPlaceholderText(/Ask your question/i), "   ");
      expect(screen.getByRole("button", { name: /^Send$/i })).toBeDisabled();
    });

    it("Enter submits, Shift+Enter inserts newline", async () => {
      const user = userEvent.setup();
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      const textarea = screen.getByPlaceholderText(/Ask your question/i);
      await user.type(textarea, "line1");
      await user.keyboard("{Shift>}{Enter}{/Shift}");
      await user.type(textarea, "line2");
      expect(onSendMessage).not.toHaveBeenCalled();
      await user.keyboard("{Enter}");
      expect(onSendMessage).toHaveBeenCalledWith("line1\nline2", []);
    });
  });

  describe("file upload", () => {
    function selectFiles(files: File[]) {
      const input = screen.getByTestId("file-input");
      fireEvent.change(input, { target: { files } });
    }

    it("accepts valid pdf/docx/txt files and displays chips", () => {
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      const f1 = makeFile("spec.pdf", { type: "application/pdf" });
      const f2 = makeFile("notes.docx");
      selectFiles([f1, f2]);
      expect(screen.getByText(/spec\.pdf/)).toBeInTheDocument();
      expect(screen.getByText(/notes\.docx/)).toBeInTheDocument();
    });

    it("rejects unsupported extension with inline error", () => {
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      selectFiles([makeFile("evil.exe")]);
      expect(screen.getByRole("alert").textContent).toMatch(/Unsupported/);
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });

    it("rejects file larger than 10 MB", () => {
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      selectFiles([
        makeFile("huge.pdf", {
          size: 11 * 1024 * 1024,
          type: "application/pdf",
        }),
      ]);
      expect(screen.getByRole("alert").textContent).toMatch(/exceeds/i);
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });

    it("caps at 10 files when 11 are selected (boundary)", () => {
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      const files = Array.from({ length: 11 }, (_, i) => makeFile(`f${i}.txt`));
      selectFiles(files);
      const chips = screen.getAllByRole("listitem");
      expect(chips).toHaveLength(10);
      expect(screen.getByRole("alert").textContent).toMatch(/Maximum 10/);
    });

    it("accepts exactly 10 files (boundary)", () => {
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      const files = Array.from({ length: 10 }, (_, i) => makeFile(`f${i}.txt`));
      selectFiles(files);
      expect(screen.getAllByRole("listitem")).toHaveLength(10);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("removes individual file via × button", async () => {
      const user = userEvent.setup();
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      selectFiles([makeFile("a.txt"), makeFile("b.txt")]);
      await user.click(screen.getByLabelText("Remove a.txt"));
      expect(screen.queryByText(/a\.txt/)).not.toBeInTheDocument();
      expect(screen.getByText(/b\.txt/)).toBeInTheDocument();
    });

    it("sends files alongside text on submit and clears state", async () => {
      const user = userEvent.setup();
      render(
        <ChatInterface
          conversation={makeConversation([])}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      const file = makeFile("ref.pdf", { type: "application/pdf" });
      selectFiles([file]);
      await user.type(
        screen.getByPlaceholderText(/Ask your question/i),
        "analyze"
      );
      await user.click(screen.getByRole("button", { name: /^Send$/i }));

      expect(onSendMessage).toHaveBeenCalledTimes(1);
      const [content, sentFiles] = onSendMessage.mock.calls[0];
      expect(content).toBe("analyze");
      expect(sentFiles).toHaveLength(1);
      expect(sentFiles[0].name).toBe("ref.pdf");
      expect(screen.queryByText(/ref\.pdf/)).not.toBeInTheDocument();
    });
  });

  describe("rendering attached documents on past messages", () => {
    it("shows attachment chips on a user message that has documents", () => {
      const conv = makeConversation([
        {
          role: "user",
          content: "see attached",
          documents: [{ filename: "spec.pdf" }, { filename: "plan.docx" }],
        },
      ]);
      render(
        <ChatInterface
          conversation={conv}
          onSendMessage={onSendMessage}
          isLoading={false}
        />
      );
      expect(screen.getByText(/spec\.pdf/)).toBeInTheDocument();
      expect(screen.getByText(/plan\.docx/)).toBeInTheDocument();
    });
  });
});
