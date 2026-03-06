// hooks/useAGUIChat.ts
import { useState, useCallback, useRef, useMemo } from "react";
import { AGUIClient, AGUIEvent, ToolDefinition, ToolCall, ChatMessage } from "@/lib/agui-client";

// Re-export for consumers
export type { ChatMessage, ToolCall };

interface UseAGUIChatOptions {
  baseUrl: string;
  roomId: string;
  tools?: ToolDefinition[];
  getAccessToken?: () => string | null;
}

export function useAGUIChat({ baseUrl, roomId, tools = [], getAccessToken }: UseAGUIChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<AGUIClient | null>(null);
  const toolsMap = useMemo(
    () => new Map(tools.map(t => [t.name, t])),
    [tools]
  );

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new AGUIClient({ baseUrl, roomId, getAccessToken });
    }
    return clientRef.current;
  }, [baseUrl, roomId, getAccessToken]);

  const executeClientTool = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      const tool = toolsMap.get(toolName);
      if (!tool) throw new Error(`Unknown tool: ${toolName}`);
      return tool.handler(args);
    },
    [toolsMap]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const client = getClient();
      setIsLoading(true);
      setError(null);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      setMessages(prev => [...prev, userMessage]);

      try {
        // Clean message history before sending to backend:
        // Strip toolCalls from assistant messages and remove tool result messages.
        // Client-side tool execution was already handled via continuation requests;
        // the backend doesn't need this history again on subsequent messages.
        const allMessages = [...messages, userMessage].filter(m => m.role !== "tool").map(m => {
          if (m.toolCalls) {
            const { toolCalls, ...rest } = m;
            return rest as ChatMessage;
          }
          return m;
        });

        // Shared mutable state for stream processing
        let currentMessageId = "";
        let currentContent = "";
        let currentToolCallId = "";
        let currentToolName = "";
        let currentToolArgs = "";

        // Process a stream of AG-UI events, handling tool calls recursively.
        // When a client-side tool call is encountered, it executes the tool,
        // sends a continuation request, and processes the continuation stream
        // (which may itself contain more tool calls).
        const MAX_TOOL_ROUNDS = 5; // Prevent infinite tool-call loops

        const processStream = async (
          stream: AsyncGenerator<AGUIEvent>,
          baseMessages: ChatMessage[],
          depth: number = 0,
        ) => {
          let eventIdx = 0;
          console.log(`[AGUI processStream] Starting at depth=${depth}`);

          for await (const event of stream) {
            eventIdx++;
            const evt = event as Record<string, unknown>;

            // Log every event type (skip content deltas for brevity)
            if (event.type !== "TEXT_MESSAGE_CONTENT" && event.type !== "TOOL_CALL_ARGS" && event.type !== "THINKING_TEXT_MESSAGE_CONTENT") {
              console.log(`[AGUI processStream] depth=${depth} event #${eventIdx}: ${event.type}`, JSON.stringify(evt).slice(0, 300));
            }

            switch (event.type) {
              case "RUN_STARTED":
                // New run (or sub-run after server-side tool execution).
                // Reset message tracking so the next TEXT_MESSAGE_START
                // creates a fresh assistant message.
                currentMessageId = "";
                currentContent = "";
                break;

              case "RUN_FINISHED":
                // Run complete — nothing to do, stream may continue
                // with more sub-runs if the backend executed tools.
                break;

              case "THINKING_TEXT_MESSAGE_CONTENT":
              case "THINKING_START":
              case "THINKING_END":
                break;

              case "TEXT_MESSAGE_START":
                currentMessageId = evt.messageId as string;
                currentContent = "";
                setMessages(prev => [
                  ...prev,
                  { id: currentMessageId, role: "assistant", content: "" },
                ]);
                break;

              case "TEXT_MESSAGE_CONTENT":
                currentContent += evt.delta as string;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === currentMessageId
                      ? { ...m, content: currentContent }
                      : m
                  )
                );
                break;

              case "TEXT_MESSAGE_END":
                break;

              case "TOOL_CALL_START":
                currentToolCallId = evt.toolCallId as string;
                currentToolName = evt.toolCallName as string;
                currentToolArgs = "";
                if (!currentMessageId && toolsMap.has(currentToolName)) {
                  currentMessageId = crypto.randomUUID();
                  setMessages(prev => [
                    ...prev,
                    { id: currentMessageId, role: "assistant", content: "" },
                  ]);
                }
                break;

              case "TOOL_CALL_ARGS":
                currentToolArgs += evt.delta as string;
                break;

              case "TOOL_CALL_END": {
                const isClientSideTool = toolsMap.has(currentToolName);

                if (isClientSideTool) {
                  try {
                    const args = JSON.parse(currentToolArgs || "{}");
                    const result = await executeClientTool(currentToolName, args);
                    const resultStr = JSON.stringify(result);

                    // Show tool result in UI
                    const toolResultMessage: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: "tool",
                      content: resultStr,
                      toolCallId: currentToolCallId,
                      toolName: currentToolName,
                    };
                    setMessages(prev => [...prev, toolResultMessage]);

                    // For the continuation request, send the tool result as a plain
                    // user message instead of formal tool_calls/tool messages.
                    // This avoids OpenAI's "tool_calls must be followed by tool messages"
                    // validation errors caused by the backend's own thread history
                    // containing unmatched tool_calls.
                    const toolResultAsUser: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: "user",
                      content: `[Tool "${currentToolName}" result: ${resultStr}]`,
                    };

                    const updatedMessages: ChatMessage[] = [
                      ...baseMessages,
                      toolResultAsUser,
                    ];

                    if (depth >= MAX_TOOL_ROUNDS) {
                      console.warn(`[AGUI] Max tool call depth (${MAX_TOOL_ROUNDS}) reached, stopping`);
                      setError("Too many consecutive tool calls. Please try again.");
                    } else {
                      console.log("[AGUI] Continuing with client tool result (depth:", depth + 1, ")");

                      const continuationStream = await client.chat(updatedMessages, tools);

                      // Recursively process continuation (handles nested tool calls)
                      await processStream(
                        continuationStream,
                        updatedMessages,
                        depth + 1,
                      );
                    }
                  } catch (err) {
                    console.error("Client tool execution failed:", err);
                    setError(err instanceof Error ? err.message : "Tool execution failed");
                  }
                } else {
                  console.log("[AGUI] Server-side tool called:", currentToolName);
                }
                break;
              }

              case "RUN_ERROR":
                setError(evt.message as string);
                break;

              default:
                console.debug("Unhandled AGUI event:", event.type, event);
                break;
            }
          }
          console.log(`[AGUI processStream] Finished at depth=${depth}, processed ${eventIdx} events`);
        };

        const stream = await client.chat(allMessages, tools);
        await processStream(stream, allMessages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [messages, tools, getClient, executeClientTool]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    clientRef.current = null; // Reset thread
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    threadId: clientRef.current?.getThreadId() ?? null,
  };
}