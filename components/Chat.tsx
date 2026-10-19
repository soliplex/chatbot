// components/Chat.tsx
"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { useAGUIChat, ChatMessage } from "@/hooks/useAGUIChat";
import { ToolDefinition } from "@/lib/agui-client";
import { injectStyles, ThemeMode } from "@/lib/theme";
import { parseSimpleMarkdown } from "@/lib/markdown";

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
// COMPONENTS
// =============================================================================

interface ChatProps {
  baseUrl: string;
  roomId: string;
  externalTools?: ToolDefinition[];
  showHeader?: boolean;
  /** Message shown while the conversation is empty. */
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
  placeholder = "Ask me anything...",
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
            message={placeholder}
            roomDescription={roomDescription}
            suggestions={suggestions}
            onSuggestionClick={(suggestion) => {
              sendMessage(suggestion);
            }}
          />
        ) : (
          messages
            // Skip assistant messages that never received any text (empty
            // TEXT_MESSAGE_START/END pairs, possibly from saved history).
            .filter((msg) => msg.role !== "assistant" || msg.content)
            .map((msg) => (
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
  message,
  roomDescription,
  suggestions,
  onSuggestionClick,
}: {
  message: string;
  roomDescription?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}) {
  return (
    <div className="soliplex-chat-empty">
      <div className="sp-screen-icon">
        <Icons.Chat />
      </div>
      <p className="soliplex-chat-empty-title">{message}</p>
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
