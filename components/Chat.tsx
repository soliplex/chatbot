// components/Chat.tsx
"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { useAGUIChat, ChatMessage } from "@/hooks/useAGUIChat";
import { ToolDefinition } from "@/lib/agui-client";
import { injectStyles, ThemeMode } from "@/lib/theme";

// =============================================================================
// ICONS - Inline SVG components
// =============================================================================

const Icons = {
  Chat: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Tool: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  AlertCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

// =============================================================================
// CLIENT-SIDE TOOLS
// =============================================================================

function useClientTools(): ToolDefinition[] {
  return useMemo(
    () => [
      {
        name: "get_current_time",
        description:
          "Get the current time in the user's local timezone. Only use when the user explicitly asks about the current time or date. Do not call repeatedly.",
        parameters: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["12h", "24h"],
              description: "Time format preference (default: 12h)",
            },
            includeDate: {
              type: "boolean",
              description: "Whether to include the full date (default: true)",
            },
          },
        },
        handler: async (args) => {
          const format = (args.format as string) || "12h";
          const includeDate = args.includeDate !== false;

          const now = new Date();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

          const timeOptions: Intl.DateTimeFormatOptions = {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: format === "12h",
            timeZoneName: "short",
          };

          const dateOptions: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          };

          const timeStr = now.toLocaleTimeString(undefined, timeOptions);
          const dateStr = includeDate
            ? now.toLocaleDateString(undefined, dateOptions)
            : null;

          return {
            time: timeStr,
            date: dateStr,
            timezone,
            iso: now.toISOString(),
            timestamp: now.getTime(),
          };
        },
      },
    ],
    []
  );
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Escape HTML special characters so raw model output can't inject markup.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Only allow safe URL schemes in links; anything else becomes an inert anchor.
 */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/)/i.test(trimmed)) {
    return trimmed;
  }
  return "#";
}

/**
 * Inline markdown (links, emphasis) for a single, already HTML-escaped line.
 */
function parseInlineMarkdown(text: string): string {
  return text
    // Markdown links: [text](url) with an optional "title"
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_m, label, url) =>
        `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
    // Bare URLs (not already inside an href="...") become links
    .replace(
      /(^|[\s(])(https?:\/\/[^\s<]+)/g,
      (_m, pre, url) =>
        `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    )
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    // Italic
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/**
 * Simple markdown-to-HTML converter for common patterns. Code is extracted
 * first so its contents are never treated as markdown, the remaining text is
 * HTML-escaped, and block-level constructs (headings, lists) are parsed line
 * by line before inline markdown is applied.
 */
function parseSimpleMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let src = text.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_m, _lang, code) => {
      codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      return `\u0000CODE${codeBlocks.length - 1}\u0000`;
    }
  );

  const inlineCodes: string[] = [];
  src = src.replace(/`([^`]+)`/g, (_m, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000ICODE${inlineCodes.length - 1}\u0000`;
  });

  src = escapeHtml(src);

  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of src.split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const ulItem = line.match(/^\s*[-*+]\s+(.*)$/);
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${parseInlineMarkdown(heading[2])}</h${level}>`);
    } else if (ulItem) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${parseInlineMarkdown(ulItem[1])}</li>`);
    } else if (olItem) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${parseInlineMarkdown(olItem[1])}</li>`);
    } else if (line.trim() === "") {
      closeList();
      out.push("");
    } else if (/^\u0000CODE\d+\u0000$/.test(line)) {
      // A fenced code-block placeholder on its own line; leave it untouched.
      closeList();
      out.push(line);
    } else {
      closeList();
      out.push(`${parseInlineMarkdown(line)}<br />`);
    }
  }
  closeList();

  let html = out.join("\n");
  html = html.replace(/\u0000ICODE(\d+)\u0000/g, (_m, i) => inlineCodes[+i]);
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => codeBlocks[+i]);
  return html;
}

// =============================================================================
// COMPONENTS
// =============================================================================

interface ChatProps {
  baseUrl: string;
  roomId: string;
  externalTools?: ToolDefinition[];
  showHeader?: boolean;
  placeholder?: string;
  title?: string;
  roomDescription?: string;
  suggestions?: string[];
  getAccessToken?: () => string | null;
  debug?: boolean;
  /** Persist the conversation across reloads (default true). */
  persist?: boolean;
  /**
   * Receives a callback that starts a new conversation. Lets a parent (e.g.
   * the floating widget's own header) trigger a reset from outside.
   */
  onRegisterReset?: (reset: () => void) => void;
  /**
   * Colour scheme when Chat is rendered on its own (default "auto", which
   * follows the OS). Ignored when nested in the floating widget, which owns
   * the theme for everything inside it.
   */
  theme?: ThemeMode;
  /** Set by the floating widget, which already provides the themed root. */
  nested?: boolean;
}

function Chat({
  baseUrl,
  roomId,
  externalTools = [],
  showHeader = true,
  placeholder = 'Ask me anything or try "What time is it?"',
  title = "AI Assistant",
  roomDescription,
  suggestions = [],
  getAccessToken,
  debug = false,
  persist = true,
  onRegisterReset,
  theme = "auto",
  nested = false,
}: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const builtInTools = useClientTools();

  // Synchronous and idempotent, so the first paint is already styled.
  injectStyles();

  // Only include built-in tools (get_current_time) when external tools are provided.
  // This avoids sending unnecessary tool definitions to the LLM when the embedder
  // hasn't opted in to client-side tools.
  const tools = useMemo(
    () => externalTools.length > 0 ? [...builtInTools, ...externalTools] : [],
    [builtInTools, externalTools]
  );

  const { messages, isLoading, error, sendMessage, clearMessages } =
    useAGUIChat({
      baseUrl,
      roomId,
      tools,
      getAccessToken,
      debug,
      persist,
    });

  // Expose the reset action so an external header can start a new conversation.
  useEffect(() => {
    onRegisterReset?.(clearMessages);
  }, [onRegisterReset, clearMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The input stays editable while a reply streams, so the next message can
    // be drafted; only sending waits, and the draft is kept until then.
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      className={nested ? "soliplex-chat" : "soliplex-root soliplex-chat"}
      data-sp-theme={nested ? undefined : theme}
    >
      {/* Header */}
      {showHeader && (
        <header className="sp-header">
          <div className="sp-header-start">
            <span className="sp-header-title">{title}</span>
          </div>
          <button
            type="button"
            onClick={clearMessages}
            className="sp-icon-btn"
            title="Start new conversation"
            aria-label="Start new conversation"
          >
            <Icons.Trash />
          </button>
        </header>
      )}

      {/* Messages */}
      <div className="soliplex-chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <EmptyState
            roomDescription={roomDescription}
            suggestions={suggestions}
            onSuggestionClick={(suggestion) => {
              sendMessage(suggestion);
            }}
          />
        ) : (
          messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))
        )}

        {isLoading && <TypingIndicator />}

        {error && <ErrorAlert message={error} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="soliplex-input-form">
        <div className="soliplex-input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            className="soliplex-input"
            aria-label="Message input"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="soliplex-send-btn"
            title={isLoading ? "Waiting for the reply to finish" : "Send message"}
            aria-label={isLoading ? "Waiting for the reply to finish" : "Send message"}
            aria-busy={isLoading}
          >
            {isLoading ? <Spinner /> : <Icons.Send />}
          </button>
        </div>
        <p className="soliplex-input-hint">Press Enter to send, Shift+Enter for new line</p>
      </form>
    </div>
  );
}

// Empty state component
const EmptyState = memo(function EmptyState({
  roomDescription,
  suggestions,
  onSuggestionClick,
}: {
  roomDescription?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}) {
  return (
    <div className="soliplex-chat-empty">
      <div className="sp-screen-icon">
        <Icons.Chat />
      </div>
      <p className="soliplex-chat-empty-title">Start a conversation</p>
      {roomDescription && (
        <p className="soliplex-chat-empty-description">{roomDescription}</p>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="soliplex-chat-suggestions">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              className="soliplex-chat-suggestion"
              onClick={() => onSuggestionClick?.(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

// Message component
const Message = memo(function Message({ message }: { message: ChatMessage }) {
  if (message.role === "tool") {
    return <ToolMessage message={message} />;
  }

  const isUser = message.role === "user";

  return (
    <div className={`soliplex-msg ${isUser ? "soliplex-msg-user" : "soliplex-msg-assistant"}`}>
      <div className={`soliplex-bubble ${isUser ? "soliplex-bubble-user" : "soliplex-bubble-assistant"}`}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: parseSimpleMarkdown(message.content) }} />
        )}
      </div>
    </div>
  );
});

// Tool message component
const ToolMessage = memo(function ToolMessage({ message }: { message: ChatMessage }) {
  let formattedOutput = message.content;
  try {
    formattedOutput = JSON.stringify(JSON.parse(message.content), null, 2);
  } catch {
    // Keep original content if not valid JSON
  }

  return (
    <div className="soliplex-tool-msg">
      <div className="soliplex-tool-badge">
        <Icons.Tool />
        <span>{message.toolName || "Tool"}</span>
      </div>
      <pre className="soliplex-tool-output">{formattedOutput}</pre>
    </div>
  );
});

// Typing indicator
const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="soliplex-typing" role="status" aria-label="Assistant is typing">
      <span className="soliplex-typing-dot" />
      <span className="soliplex-typing-dot" />
      <span className="soliplex-typing-dot" />
    </div>
  );
});

// Error alert
const ErrorAlert = memo(function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="sp-alert" role="alert">
      <Icons.AlertCircle />
      <span>{message}</span>
    </div>
  );
});

// Loading spinner
const Spinner = memo(function Spinner() {
  return <div className="sp-spinner" />;
});

export default Chat;
