"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import Chat from "./Chat";

export interface ChatWidgetConfig {
  baseUrl: string;
  roomId: string;
  autoHideSeconds?: number; // 0 = never hide
  position?: "bottom-right" | "bottom-left";
  bubbleColor?: string;
  title?: string;
  placeholder?: string;
}

export interface ChatWidgetRef {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

interface ChatWidgetProps {
  config: ChatWidgetConfig;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
  onOpenChange?: (isOpen: boolean) => void;
}

const ChatWidget = forwardRef<ChatWidgetRef, ChatWidgetProps>(
  function ChatWidget({ config, tools = [], onOpenChange }, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [hasInteracted, setHasInteracted] = useState(false);

    const {
      baseUrl,
      roomId,
      autoHideSeconds = 0,
      position = "bottom-right",
      bubbleColor = "#2563eb",
      title = "Chat with us",
      placeholder,
    } = config;

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      open: () => {
        setIsOpen(true);
        setHasInteracted(true);
        setIsVisible(true);
        onOpenChange?.(true);
      },
      close: () => {
        setIsOpen(false);
        onOpenChange?.(false);
      },
      toggle: () => {
        setIsOpen((prev) => {
          const newState = !prev;
          if (newState) {
            setHasInteracted(true);
            setIsVisible(true);
          }
          onOpenChange?.(newState);
          return newState;
        });
      },
      isOpen: () => isOpen,
    }), [isOpen, onOpenChange]);

    // Auto-hide logic
    useEffect(() => {
      if (autoHideSeconds > 0 && !hasInteracted && !isOpen) {
        const timer = setTimeout(() => {
          setIsVisible(false);
        }, autoHideSeconds * 1000);

        return () => clearTimeout(timer);
      }
    }, [autoHideSeconds, hasInteracted, isOpen]);

    const handleOpen = useCallback(() => {
      setIsOpen(true);
      setHasInteracted(true);
      setIsVisible(true);
      onOpenChange?.(true);
    }, [onOpenChange]);

    const handleClose = useCallback(() => {
      setIsOpen(false);
      onOpenChange?.(false);
    }, [onOpenChange]);

    // Show bubble on mouse movement near edge (if hidden)
    useEffect(() => {
      if (!isVisible && !isOpen) {
        const handleMouseMove = (e: MouseEvent) => {
          const threshold = 100;
          const isNearEdge =
            position === "bottom-right"
              ? e.clientX > window.innerWidth - threshold &&
                e.clientY > window.innerHeight - threshold
              : e.clientX < threshold && e.clientY > window.innerHeight - threshold;

          if (isNearEdge) {
            setIsVisible(true);
          }
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
      }
    }, [isVisible, isOpen, position]);

    const positionClasses =
      position === "bottom-right" ? "right-4" : "left-4";

    if (!isVisible && !isOpen) {
      return null;
    }

    return (
      <div
        className={`fixed bottom-4 ${positionClasses} z-[9999]`}
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        {/* Chat Panel */}
        {isOpen && (
          <div
            className="mb-4 bg-white rounded-lg shadow-2xl overflow-hidden"
            style={{
              width: "380px",
              height: "600px",
              maxHeight: "calc(100vh - 120px)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 text-white"
              style={{ backgroundColor: bubbleColor }}
            >
              <span className="font-medium">{title}</span>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                aria-label="Close chat"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Chat Content */}
            <div style={{ height: "calc(100% - 52px)" }}>
              <ChatEmbed baseUrl={baseUrl} roomId={roomId} tools={tools} placeholder={placeholder} />
            </div>
          </div>
        )}

        {/* Floating Bubble */}
        <button
          onClick={isOpen ? handleClose : handleOpen}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
          style={{ backgroundColor: bubbleColor }}
          aria-label={isOpen ? "Close chat" : "Open chat"}
        >
          {isOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      </div>
    );
  }
);

// Simplified Chat component for embedding
function ChatEmbed({
  baseUrl,
  roomId,
  tools,
  placeholder,
}: {
  baseUrl: string;
  roomId: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
  placeholder?: string;
}) {
  return (
    <div className="h-full">
      <Chat baseUrl={baseUrl} roomId={roomId} externalTools={tools} showHeader={false} placeholder={placeholder} />
    </div>
  );
}

export default ChatWidget;
