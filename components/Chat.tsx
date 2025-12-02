// components/Chat.tsx
"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAGUIChat, ChatMessage } from "@/hooks/useAGUIChat";
import { ToolDefinition } from "@/lib/agui-client";

// Client-side tool definitions
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

interface ChatProps {
  baseUrl: string;
  roomId: string;
  externalTools?: ToolDefinition[];
  showHeader?: boolean;
  placeholder?: string;
}

export default function Chat({ baseUrl, roomId, externalTools = [], showHeader = true, placeholder = 'Ask me anything or try "What time is it?"' }: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const builtInTools = useClientTools();

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
    <div className="chat-container">
      {/* Header */}
      {showHeader && (
        <header className="chat-header">
          <div className="chat-header-title">
            <svg className="chat-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>AI Assistant</span>
          </div>
          <button onClick={clearMessages} className="chat-clear-btn" title="Clear conversation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </header>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="chat-empty-title">Start a conversation</p>
            <p className="chat-empty-subtitle">{placeholder}</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={index === messages.length - 1}
          />
        ))}

        {isLoading && (
          <div className="chat-typing">
            <div className="chat-typing-indicator">
              <TypingDots />
            </div>
            <span className="chat-typing-text">AI is thinking...</span>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="chat-input-form">
        <div className="chat-input-container">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isLoading}
            rows={1}
            className="chat-input"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="chat-send-btn"
            title="Send message"
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="chat-hint">Press Enter to send, Shift+Enter for new line</p>
      </form>

      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: linear-gradient(180deg, #fafafa 0%, #ffffff 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
        }

        .chat-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          font-size: 16px;
        }

        .chat-header-icon {
          width: 22px;
          height: 22px;
        }

        .chat-clear-btn {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          border-radius: 8px;
          padding: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: white;
        }

        .chat-clear-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: scale(1.05);
        }

        .chat-clear-btn svg {
          width: 18px;
          height: 18px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .chat-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: #9ca3af;
          padding: 40px;
        }

        .chat-empty-icon {
          width: 64px;
          height: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .chat-empty-icon svg {
          width: 100%;
          height: 100%;
        }

        .chat-empty-title {
          font-size: 18px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .chat-empty-subtitle {
          font-size: 14px;
          color: #9ca3af;
        }

        .chat-typing {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
        }

        .chat-typing-indicator {
          background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
          padding: 12px 16px;
          border-radius: 18px;
          border-bottom-left-radius: 4px;
        }

        .chat-typing-text {
          font-size: 13px;
          color: #9ca3af;
          font-style: italic;
        }

        .chat-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border: 1px solid #fecaca;
          border-radius: 12px;
          color: #dc2626;
          font-size: 14px;
        }

        .chat-error svg {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .chat-input-form {
          padding: 20px 24px;
          background: white;
          border-top: 1px solid #f3f4f6;
        }

        .chat-input-container {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 16px;
          padding: 8px 8px 8px 16px;
          transition: all 0.2s ease;
        }

        .chat-input-container:focus-within {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          background: white;
        }

        .chat-input {
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          font-size: 14px;
          line-height: 1.5;
          padding: 8px 0;
          outline: none;
          font-family: inherit;
          color: #1f2937;
        }

        .chat-input::placeholder {
          color: #b0b7c3;
          font-size: 13px;
        }

        .chat-input:disabled {
          opacity: 0.6;
        }

        .chat-send-btn {
          width: 44px;
          height: 44px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .chat-send-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .chat-send-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: #d1d5db;
        }

        .chat-send-btn svg {
          width: 20px;
          height: 20px;
        }

        .chat-hint {
          font-size: 11px;
          color: #b0b7c3;
          margin-top: 10px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isTool) {
    return (
      <div className="tool-message">
        <div className="tool-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>{message.toolName}</span>
        </div>
        <pre className="tool-output">
          {JSON.stringify(JSON.parse(message.content), null, 2)}
        </pre>
        <style jsx>{`
          .tool-message {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            margin: 8px 0;
          }

          .tool-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 1px solid #fcd34d;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            color: #92400e;
          }

          .tool-badge svg {
            width: 14px;
            height: 14px;
          }

          .tool-output {
            background: #1e293b;
            color: #e2e8f0;
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 12px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            max-width: 90%;
            overflow-x: auto;
            margin: 0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`message ${isUser ? "message-user" : "message-assistant"}`}>
      {!isUser && (
        <div className="avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      )}
      <div className={`bubble ${isUser ? "bubble-user" : "bubble-assistant"} ${isLast && !isUser ? "bubble-last" : ""}`}>
        <p>{message.content}</p>
      </div>
      {isUser && (
        <div className="avatar avatar-user">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          </svg>
        </div>
      )}
      <style jsx>{`
        .message {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          max-width: 85%;
        }

        .message-user {
          align-self: flex-end;
          flex-direction: row;
        }

        .message-assistant {
          align-self: flex-start;
        }

        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .avatar svg {
          width: 18px;
          height: 18px;
          color: white;
        }

        .avatar-user {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .bubble {
          padding: 16px 20px;
          border-radius: 20px;
          line-height: 1.6;
          font-size: 14px;
        }

        .bubble p {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .bubble-user {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom-right-radius: 4px;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);
        }

        .bubble-assistant {
          background: white;
          color: #1f2937;
          border-bottom-left-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          border: 1px solid #f3f4f6;
        }

        .bubble-last {
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="typing-dots">
      <span />
      <span />
      <span />
      <style jsx>{`
        .typing-dots {
          display: flex;
          gap: 4px;
        }

        .typing-dots span {
          width: 8px;
          height: 8px;
          background: #9ca3af;
          border-radius: 50%;
          animation: typing 1.4s infinite;
        }

        .typing-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="spinner">
      <style jsx>{`
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
