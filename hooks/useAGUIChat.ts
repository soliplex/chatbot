// hooks/useAGUIChat.ts
import { useState, useCallback, useRef, useMemo } from "react";
import { AGUIClient, AGUIEvent, ToolDefinition } from "@/lib/agui-client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

interface UseAGUIChatOptions {
  baseUrl: string;
  roomId: string;
  tools?: ToolDefinition[];
}

export function useAGUIChat({ baseUrl, roomId, tools = [] }: UseAGUIChatOptions) {
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
      clientRef.current = new AGUIClient({ baseUrl, roomId });
    }
    return clientRef.current;
  }, [baseUrl, roomId]);

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
              break;

            case "TOOL_CALL_ARGS":
              currentToolArgs += evt.delta as string;
              break;

            case "TOOL_CALL_END":
              // Execute client-side tool
              try {
                const args = JSON.parse(currentToolArgs || "{}");
                const result = await executeClientTool(currentToolName, args);

                // Add tool result message
                const toolResultMessage: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: "tool",
                  content: JSON.stringify(result),
                  toolCallId: currentToolCallId,
                  toolName: currentToolName,
                };
                setMessages(prev => [...prev, toolResultMessage]);

                // Continue conversation with tool result
                // The server should handle the continuation
              } catch (err) {
                console.error("Tool execution failed:", err);
              }
              break;

            case "RUN_ERROR":
              setError(evt.message as string);
              break;

            default:
              // Log unhandled events for debugging
              console.debug("Unhandled AGUI event:", event.type, event);
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