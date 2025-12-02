// lib/agui-client.ts
// Tool call made by assistant (AG-UI protocol format)
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// Message type that supports both regular messages and tool results
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  // For assistant messages that make tool calls
  toolCalls?: ToolCall[];
  // For tool result messages
  toolCallId?: string;
  toolName?: string;
}

interface ThreadResponse {
  thread_id: string;
  room_id: string;
  runs: Record<string, RunResponse>;
  created: string;
  metadata?: Record<string, unknown> | null;
}

interface RunResponse {
  run_id: string;
  room_id: string;
  thread_id: string;
  parent_run_id?: string | null;
  created: string;
  run_input?: RunAgentInput | null;
  events?: unknown[];
  metadata?: Record<string, unknown> | null;
}

interface AGUIClientConfig {
  baseUrl: string;
  roomId: string;
}

export class AGUIClient {
  private baseUrl: string;
  private roomId: string;
  private threadId: string | null = null;
  private currentRunId: string | null = null;

  constructor(config: AGUIClientConfig) {
    this.baseUrl = config.baseUrl;
    this.roomId = config.roomId;
  }

  private get baseEndpoint() {
    return `${this.baseUrl}/api/v1/rooms/${this.roomId}/agui`;
  }

  /**
   * Creates a new thread. The backend also creates an initial run.
   * Returns both thread_id and the initial run_id.
   */
  async createThread(): Promise<{ threadId: string; runId: string }> {
    const res = await fetch(this.baseEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
    const data: ThreadResponse = await res.json();
    this.threadId = data.thread_id;

    // Backend creates initial run with thread - extract first run_id
    const runIds = Object.keys(data.runs);
    if (runIds.length === 0) {
      throw new Error("Thread created but no initial run returned");
    }
    const runId = runIds[0];
    this.currentRunId = runId;

    return { threadId: data.thread_id, runId };
  }

  /**
   * Creates a new run for an existing thread.
   * Only needed for subsequent messages after the first.
   */
  async createRun(threadId: string): Promise<string> {
    const res = await fetch(`${this.baseEndpoint}/${threadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Failed to create run: ${res.status}`);
    const data: RunResponse = await res.json();
    this.currentRunId = data.run_id;
    return data.run_id;
  }

  async *streamRun(
    threadId: string,
    runId: string,
    input: RunAgentInput
  ): AsyncGenerator<AGUIEvent> {
    const res = await fetch(`${this.baseEndpoint}/${threadId}/${runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) throw new Error(`Failed to stream run: ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            yield JSON.parse(data) as AGUIEvent;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[] = []): Promise<AsyncGenerator<AGUIEvent>> {
    let threadId: string;
    let runId: string;

    if (!this.threadId) {
      // First message: create thread (which includes initial run)
      const result = await this.createThread();
      threadId = result.threadId;
      runId = result.runId;
    } else {
      // Subsequent messages: create new run for existing thread
      threadId = this.threadId;
      runId = await this.createRun(threadId);
    }

    // Build the AG-UI RunAgentInput with required thread_id and run_id
    // Assistant messages with tool calls need toolCalls array
    // Tool result messages need toolCallId field
    const formattedMessages = messages.map((m, idx) => {
      const base: AGUIMessage = {
        id: `msg_${idx}`,
        role: m.role,
        content: m.content,
      };
      // Assistant messages may have tool calls
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        base.toolCalls = m.toolCalls;
      }
      // Tool result messages must include toolCallId
      if (m.role === "tool" && m.toolCallId) {
        base.toolCallId = m.toolCallId;
      }
      return base;
    });

    // Debug: log what we're sending
    console.log("[AGUI] Sending messages:", JSON.stringify(formattedMessages, null, 2));

    const input: RunAgentInput = {
      thread_id: threadId,
      run_id: runId,
      messages: formattedMessages,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      context: [],
      state: null,
      forwarded_props: null,
    };

    return this.streamRun(threadId, runId, input);
  }

  getThreadId(): string | null {
    return this.threadId;
  }

  setThreadId(id: string) {
    this.threadId = id;
  }
}

// AG-UI Protocol Types

// Message format for AG-UI protocol
export interface AGUIMessage {
  id: string;
  role: string;
  content: string;
  // For assistant messages that make tool calls
  toolCalls?: ToolCall[];
  // For tool result messages (required when role="tool")
  toolCallId?: string;
}

export interface RunAgentInput {
  thread_id: string;
  run_id: string;
  parent_run_id?: string | null;
  messages: AGUIMessage[];
  tools?: ToolDef[];
  context?: ContextItem[];
  state?: Record<string, unknown> | null;
  forwarded_props?: Record<string, unknown> | null;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ContextItem {
  type: string;
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// AG-UI Event types - backend uses UPPERCASE types
export type AGUIEvent =
  | { type: "TEXT_MESSAGE_START"; messageId: string }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "TOOL_CALL_START"; toolCallId: string; toolCallName: string }
  | { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string }
  | { type: "TOOL_CALL_END"; toolCallId: string }
  | { type: "RUN_STARTED"; runId: string; threadId: string }
  | { type: "RUN_FINISHED"; runId: string; threadId: string }
  | { type: "RUN_ERROR"; message: string }
  | { type: "THINKING_START" }
  | { type: "THINKING_TEXT_MESSAGE_CONTENT"; delta: string }
  | { type: "THINKING_END" }
  | { type: string; [key: string]: unknown }; // Catch-all for other events