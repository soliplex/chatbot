// components/Chat.tsx
"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { useAGUIChat, ChatMessage } from "@/hooks/useAGUIChat";
import { ToolDefinition } from "@/lib/agui-client";

// =============================================================================
// STYLES - Injected CSS with CSS Custom Properties for theming
// =============================================================================

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.id = "soliplex-chat-styles";
  style.textContent = `
    /* CSS Custom Properties for theming */
    .soliplex-chat {
      --chat-primary: #6366f1;
      --chat-primary-hover: #4f46e5;
      --chat-primary-light: rgba(99, 102, 241, 0.1);
      --chat-secondary: #8b5cf6;
      --chat-success: #10b981;
      --chat-error: #ef4444;
      --chat-warning: #f59e0b;

      --chat-bg: #ffffff;
      --chat-bg-secondary: #f8fafc;
      --chat-bg-tertiary: #f1f5f9;

      --chat-text: #0f172a;
      --chat-text-secondary: #64748b;
      --chat-text-muted: #94a3b8;

      --chat-border: #e2e8f0;
      --chat-border-light: #f1f5f9;

      --chat-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --chat-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      --chat-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);

      --chat-radius-sm: 6px;
      --chat-radius: 12px;
      --chat-radius-lg: 16px;
      --chat-radius-full: 9999px;

      --chat-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --chat-font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;

      --chat-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
      --chat-transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Container */
    .soliplex-chat {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--chat-bg);
      font-family: var(--chat-font);
      color: var(--chat-text);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Header */
    .soliplex-chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: linear-gradient(135deg, var(--chat-primary) 0%, var(--chat-secondary) 100%);
      color: white;
      border-bottom: 1px solid transparent;
    }

    .soliplex-chat-header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 15px;
      letter-spacing: -0.01em;
    }

    .soliplex-chat-header-icon {
      width: 20px;
      height: 20px;
      opacity: 0.9;
    }

    .soliplex-chat-header-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.15);
      border: none;
      border-radius: var(--chat-radius-sm);
      cursor: pointer;
      transition: all var(--chat-transition);
      color: white;
    }

    .soliplex-chat-header-btn:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: scale(1.05);
    }

    .soliplex-chat-header-btn:active {
      transform: scale(0.95);
    }

    .soliplex-chat-header-btn svg {
      width: 16px;
      height: 16px;
    }

    /* Messages Container */
    .soliplex-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scroll-behavior: smooth;
    }

    .soliplex-chat-messages::-webkit-scrollbar {
      width: 6px;
    }

    .soliplex-chat-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .soliplex-chat-messages::-webkit-scrollbar-thumb {
      background: var(--chat-border);
      border-radius: var(--chat-radius-full);
    }

    .soliplex-chat-messages::-webkit-scrollbar-thumb:hover {
      background: var(--chat-text-muted);
    }

    /* Empty State */
    .soliplex-chat-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      text-align: center;
      color: var(--chat-text-muted);
      padding: 40px 20px;
    }

    .soliplex-chat-empty-icon {
      width: 56px;
      height: 56px;
      margin-bottom: 16px;
      padding: 14px;
      background: var(--chat-bg-tertiary);
      border-radius: var(--chat-radius-lg);
      color: var(--chat-text-muted);
    }

    .soliplex-chat-empty-icon svg {
      width: 100%;
      height: 100%;
    }

    .soliplex-chat-empty-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--chat-text-secondary);
      margin-bottom: 6px;
    }

    .soliplex-chat-empty-subtitle {
      font-size: 13px;
      color: var(--chat-text-muted);
      max-width: 280px;
    }

    .soliplex-chat-empty-description {
      font-size: 14px;
      color: var(--chat-text-secondary);
      max-width: 320px;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .soliplex-chat-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
      justify-content: center;
      max-width: 320px;
    }

    .soliplex-chat-suggestion {
      display: inline-flex;
      align-items: center;
      padding: 8px 14px;
      background: var(--chat-bg-secondary);
      border: 1px solid var(--chat-border);
      border-radius: var(--chat-radius-full);
      font-size: 13px;
      color: var(--chat-text-secondary);
      cursor: pointer;
      transition: all var(--chat-transition);
      font-family: var(--chat-font);
    }

    .soliplex-chat-suggestion:hover {
      background: var(--chat-primary-light);
      border-color: var(--chat-primary);
      color: var(--chat-primary);
      transform: translateY(-1px);
    }

    .soliplex-chat-suggestion:active {
      transform: translateY(0);
    }

    /* Background image support */
    .soliplex-chat-messages.has-bg-image {
      position: relative;
    }

    .soliplex-chat-messages.has-bg-image .soliplex-bubble-assistant {
      background: rgba(248, 250, 252, 0.95);
    }

    .soliplex-chat-messages.has-bg-image .soliplex-chat-empty {
      background: rgba(255, 255, 255, 0.9);
      border-radius: var(--chat-radius-lg);
      padding: 24px;
      margin: 20px;
    }

    .soliplex-chat-messages.has-bg-image .soliplex-typing-bubble {
      background: rgba(248, 250, 252, 0.95);
    }

    .soliplex-chat-messages.has-bg-image .soliplex-error {
      background: rgba(254, 242, 242, 0.95);
    }

    /* Message Base */
    .soliplex-msg {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      max-width: 85%;
      animation: soliplex-msg-in 0.25s ease-out;
    }

    @keyframes soliplex-msg-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .soliplex-msg-user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .soliplex-msg-assistant {
      align-self: flex-start;
    }

    /* Avatar */
    .soliplex-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--chat-radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: linear-gradient(135deg, var(--chat-primary) 0%, var(--chat-secondary) 100%);
      color: white;
      box-shadow: var(--chat-shadow-sm);
    }

    .soliplex-avatar svg {
      width: 16px;
      height: 16px;
    }

    .soliplex-avatar-user {
      background: linear-gradient(135deg, var(--chat-success) 0%, #059669 100%);
    }

    /* Message Bubble */
    .soliplex-bubble {
      padding: 12px 16px;
      border-radius: var(--chat-radius-lg);
      line-height: 1.6;
      font-size: 14px;
      word-break: break-word;
    }

    .soliplex-bubble-user {
      background: linear-gradient(135deg, var(--chat-primary) 0%, var(--chat-secondary) 100%);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .soliplex-bubble-assistant {
      background: var(--chat-bg-secondary);
      color: var(--chat-text);
      border-bottom-left-radius: 4px;
      border: 1px solid var(--chat-border-light);
    }

    .soliplex-bubble p {
      margin: 0;
      white-space: pre-wrap;
    }

    /* Markdown-like styling in assistant bubbles */
    .soliplex-bubble-assistant code {
      background: var(--chat-bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--chat-font-mono);
      font-size: 13px;
    }

    .soliplex-bubble-assistant pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 12px 14px;
      border-radius: var(--chat-radius);
      overflow-x: auto;
      margin: 8px 0;
      font-family: var(--chat-font-mono);
      font-size: 13px;
      line-height: 1.5;
    }

    .soliplex-bubble-assistant pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    .soliplex-bubble-assistant strong {
      font-weight: 600;
    }

    .soliplex-bubble-assistant em {
      font-style: italic;
    }

    .soliplex-bubble-assistant ul, .soliplex-bubble-assistant ol {
      margin: 8px 0;
      padding-left: 20px;
    }

    .soliplex-bubble-assistant li {
      margin: 4px 0;
    }

    /* Tool Message */
    .soliplex-tool-msg {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      margin-left: 42px;
      max-width: calc(85% - 42px);
      animation: soliplex-msg-in 0.25s ease-out;
    }

    .soliplex-tool-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border: 1px solid #fcd34d;
      border-radius: var(--chat-radius-full);
      font-size: 12px;
      font-weight: 500;
      color: #92400e;
    }

    .soliplex-tool-badge svg {
      width: 12px;
      height: 12px;
    }

    .soliplex-tool-output {
      background: #1e293b;
      color: #e2e8f0;
      padding: 10px 14px;
      border-radius: var(--chat-radius);
      font-size: 12px;
      font-family: var(--chat-font-mono);
      overflow-x: auto;
      margin: 0;
      max-width: 100%;
      box-shadow: var(--chat-shadow-sm);
    }

    /* Typing Indicator */
    .soliplex-typing {
      display: flex;
      align-items: center;
      gap: 10px;
      animation: soliplex-msg-in 0.25s ease-out;
    }

    .soliplex-typing-bubble {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--chat-bg-secondary);
      padding: 14px 18px;
      border-radius: var(--chat-radius-lg);
      border-bottom-left-radius: 4px;
      border: 1px solid var(--chat-border-light);
    }

    .soliplex-typing-dot {
      width: 8px;
      height: 8px;
      background: var(--chat-text-muted);
      border-radius: var(--chat-radius-full);
      animation: soliplex-typing 1.4s infinite;
    }

    .soliplex-typing-dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .soliplex-typing-dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes soliplex-typing {
      0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.4;
      }
      30% {
        transform: translateY(-6px);
        opacity: 1;
      }
    }

    /* Error Alert */
    .soliplex-error {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: var(--chat-radius);
      color: #dc2626;
      font-size: 13px;
      animation: soliplex-msg-in 0.25s ease-out;
    }

    .soliplex-error svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* Input Form */
    .soliplex-input-form {
      padding: 16px 20px;
      background: var(--chat-bg);
      border-top: 1px solid var(--chat-border-light);
    }

    .soliplex-input-wrapper {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      background: var(--chat-bg-secondary);
      border: 2px solid var(--chat-border);
      border-radius: var(--chat-radius-lg);
      padding: 6px 6px 6px 14px;
      transition: all var(--chat-transition);
    }

    .soliplex-input-wrapper:focus-within {
      border-color: var(--chat-primary);
      box-shadow: 0 0 0 3px var(--chat-primary-light);
      background: var(--chat-bg);
    }

    .soliplex-input {
      flex: 1;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.5;
      padding: 8px 0;
      outline: none;
      font-family: var(--chat-font);
      color: var(--chat-text);
      min-height: 24px;
      max-height: 120px;
    }

    .soliplex-input::placeholder {
      color: var(--chat-text-muted);
    }

    .soliplex-input:disabled {
      opacity: 0.6;
    }

    .soliplex-send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: var(--chat-radius);
      background: linear-gradient(135deg, var(--chat-primary) 0%, var(--chat-secondary) 100%);
      color: white;
      cursor: pointer;
      transition: all var(--chat-transition);
      flex-shrink: 0;
    }

    .soliplex-send-btn:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: var(--chat-shadow);
    }

    .soliplex-send-btn:active:not(:disabled) {
      transform: scale(0.95);
    }

    .soliplex-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: var(--chat-border);
    }

    .soliplex-send-btn svg {
      width: 18px;
      height: 18px;
    }

    .soliplex-input-hint {
      font-size: 11px;
      color: var(--chat-text-muted);
      margin-top: 8px;
      text-align: center;
    }

    /* Spinner */
    .soliplex-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: var(--chat-radius-full);
      animation: soliplex-spin 0.8s linear infinite;
    }

    @keyframes soliplex-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;
  document.head.appendChild(style);
}

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
  Bot: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  ),
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
  MessageSquare: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
          "Get the current time in the user's local timezone. Use this when the user asks about the current time, date, or wants to know what time it is.",
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
 * Simple markdown-to-HTML converter for common patterns
 */
function parseSimpleMarkdown(text: string): string {
  return text
    // Code blocks (must come before inline code)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n/g, '<br />');
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
  backgroundImage?: string | null;
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
  backgroundImage,
}: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const builtInTools = useClientTools();

  // Inject styles on mount
  useEffect(() => {
    injectStyles();
  }, []);

  // Combine built-in tools with external tools
  const tools = useMemo(
    () => [...builtInTools, ...externalTools],
    [builtInTools, externalTools]
  );

  const { messages, isLoading, error, sendMessage, clearMessages } =
    useAGUIChat({
      baseUrl,
      roomId,
      tools,
    });

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
    <div className="soliplex-chat">
      {/* Header */}
      {showHeader && (
        <header className="soliplex-chat-header">
          <div className="soliplex-chat-header-title">
            <span className="soliplex-chat-header-icon">
              <Icons.Chat />
            </span>
            <span>{title}</span>
          </div>
          <button
            onClick={clearMessages}
            className="soliplex-chat-header-btn"
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <Icons.Trash />
          </button>
        </header>
      )}

      {/* Messages */}
      <div
        className={`soliplex-chat-messages${backgroundImage ? ' has-bg-image' : ''}`}
        style={backgroundImage ? {
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'local',
        } : undefined}
      >
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
            disabled={isLoading}
            rows={1}
            className="soliplex-input"
            aria-label="Message input"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="soliplex-send-btn"
            title="Send message"
            aria-label="Send message"
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
      <div className="soliplex-chat-empty-icon">
        <Icons.MessageSquare />
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
      <div className={`soliplex-avatar ${isUser ? "soliplex-avatar-user" : ""}`}>
        {isUser ? <Icons.User /> : <Icons.Bot />}
      </div>
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
    <div className="soliplex-typing">
      <div className="soliplex-avatar">
        <Icons.Bot />
      </div>
      <div className="soliplex-typing-bubble">
        <span className="soliplex-typing-dot" />
        <span className="soliplex-typing-dot" />
        <span className="soliplex-typing-dot" />
      </div>
    </div>
  );
});

// Error alert
const ErrorAlert = memo(function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="soliplex-error">
      <Icons.AlertCircle />
      <span>{message}</span>
    </div>
  );
});

// Loading spinner
const Spinner = memo(function Spinner() {
  return <div className="soliplex-spinner" />;
});

export default Chat;
