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
        const allMessages = [...messages, userMessage];
        const stream = await client.chat(allMessages, tools);

        let currentMessageId = "";
        let currentContent = "";
        let currentToolCallId = "";
        let currentToolName = "";
        let currentToolArgs = "";
        // Track tool calls for the current assistant message
        const pendingToolCalls: ToolCall[] = [];

        for await (const event of stream) {
          // Cast to access properties - backend uses camelCase field names
          const evt = event as Record<string, unknown>;

          switch (event.type) {
            case "THINKING_TEXT_MESSAGE_CONTENT":
              // Optional: handle intermediate thinking messages
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
              // Message complete
              break;

            case "TOOL_CALL_START":
              currentToolCallId = evt.toolCallId as string;
              currentToolName = evt.toolCallName as string;
              currentToolArgs = "";
              // Only create an assistant message for client-side tools
              // Server-side tools will get their message from TEXT_MESSAGE_START
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
              // Build the tool call object for the assistant message
              const toolCall: ToolCall = {
                id: currentToolCallId,
                type: "function",
                function: {
                  name: currentToolName,
                  arguments: currentToolArgs || "{}",
                },
              };
              pendingToolCalls.push(toolCall);

              // Build the assistant message with tool calls (for sending back to server)
              const assistantMessageWithToolCalls: ChatMessage = {
                id: currentMessageId,
                role: "assistant",
                content: currentContent,
                toolCalls: [...pendingToolCalls],
              };

              // Update assistant message with tool calls in UI
              setMessages(prev =>
                prev.map(m =>
                  m.id === currentMessageId
                    ? assistantMessageWithToolCalls
                    : m
                )
              );

              // Check if this is a client-side tool (defined in our tools map)
              const isClientSideTool = toolsMap.has(currentToolName);

              if (isClientSideTool) {
                // Execute client-side tool locally
                try {
                  const args = JSON.parse(currentToolArgs || "{}");
                  const result = await executeClientTool(currentToolName, args);

                  // Build tool result message
                  const toolResultMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: "tool",
                    content: JSON.stringify(result),
                    toolCallId: currentToolCallId,
                    toolName: currentToolName,
                  };

                  // Add tool result to UI
                  setMessages(prev => [...prev, toolResultMessage]);

                  // Build updated message history for continuation request
                  const updatedMessages: ChatMessage[] = [
                    ...allMessages.slice(0, -1),
                    userMessage,
                    assistantMessageWithToolCalls,
                    toolResultMessage,
                  ];

                  console.log("[AGUI] Continuing with client tool result");

                  // Continue conversation with tool result
                  const continuationStream = await client.chat(updatedMessages, tools);

                  // Process the continuation response
                  for await (const contEvent of continuationStream) {
                    const contEvt = contEvent as Record<string, unknown>;

                    switch (contEvent.type) {
                      case "TEXT_MESSAGE_START":
                        currentMessageId = contEvt.messageId as string;
                        currentContent = "";
                        setMessages(prev => [
                          ...prev,
                          { id: currentMessageId, role: "assistant", content: "" },
                        ]);
                        break;

                      case "TEXT_MESSAGE_CONTENT":
                        currentContent += contEvt.delta as string;
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

                      case "RUN_ERROR":
                        setError(contEvt.message as string);
                        break;

                      default:
                        // Skip noisy thinking events
                        if (!contEvent.type.startsWith("THINKING")) {
                          console.debug("Unhandled continuation event:", contEvent.type, contEvent);
                        }
                        break;
                    }
                  }
                } catch (err) {
                  console.error("Client tool execution failed:", err);
                  setError(err instanceof Error ? err.message : "Tool execution failed");
                }
              } else {
                // Server-side tool - the backend handles execution
                // The response will come in subsequent events in the same stream
                console.log("[AGUI] Server-side tool called:", currentToolName);
              }
              break;
            }

            case "RUN_ERROR":
              setError(evt.message as string);
              break;

            default:
              // Log unhandled events for debugging (skip noisy thinking events)
              if (!event.type.startsWith("THINKING")) {
                console.debug("Unhandled AGUI event:", event.type, event);
              }
              break;
          }
        }
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