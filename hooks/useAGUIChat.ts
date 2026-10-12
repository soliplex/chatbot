// hooks/useAGUIChat.ts
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { AGUIClient, AGUIEvent, ToolDefinition, ToolCall, ChatMessage } from "@/lib/agui-client";

// Re-export for consumers
export type { ChatMessage, ToolCall };

interface UseAGUIChatOptions {
  baseUrl: string;
  roomId: string;
  tools?: ToolDefinition[];
  getAccessToken?: () => string | null;
  /** When true, render raw tool-call results as JSON in the chat. */
  debug?: boolean;
  /**
   * When true (default), the thread id and message history are stored in
   * localStorage so the conversation resumes across page reloads.
   */
  persist?: boolean;
}

/**
 * The run a turn is waiting on. It is saved whenever a run starts, so that if
 * the page is left mid-reply the next load can reconnect to the run (the
 * backend keeps it going and stores its events), and removed once the turn
 * settles.
 */
interface PendingRun {
  threadId: string | null;
  /** Null until the backend has created the run. */
  runId: string | null;
  /** The conversation when the run started; replaying the run adds the rest. */
  messages: ChatMessage[];
  /** What was sent to the backend for this run; tool continuations build on it. */
  sent: ChatMessage[];
  /** Client-side tool rounds already taken in this turn. */
  depth: number;
}

const MAX_TOOL_ROUNDS = 5; // Prevent infinite tool-call loops

// A run still unfinished after this long is taken as dead (e.g. the backend
// restarted mid-run): reconnecting to it would wait forever.
const STALE_RUN_MS = 30 * 60 * 1000;

const INTERRUPTED_MESSAGE = "The previous response was interrupted. Please try again.";

function isAbortError(err: unknown, signal: AbortSignal) {
  return signal.aborted || (err instanceof DOMException && err.name === "AbortError");
}

/** A stream closed before its run reported that it ended. */
class ConnectionLostError extends Error {
  constructor() {
    super("The connection was lost before the reply finished. Reload the page to pick it up again.");
  }
}

// The turn was cut off rather than answered, e.g. because the page was left:
// fetch rejects with a TypeError when a request fails or is cancelled. The
// run goes on in the backend, so the pending run is kept for the next load.
function isConnectionLoss(err: unknown, signal: AbortSignal) {
  return isAbortError(err, signal) || err instanceof TypeError || err instanceof ConnectionLostError;
}

export function useAGUIChat({ baseUrl, roomId, tools = [], getAccessToken, debug = false, persist = true }: UseAGUIChatOptions) {
  // Storage keys are scoped per server + room so multiple widgets on the same
  // page don't clobber each other's history.
  const messagesKey = `soliplex-chat:${baseUrl}:${roomId}:messages`;
  const threadKey = `soliplex-chat:${baseUrl}:${roomId}:thread`;
  const pendingKey = `soliplex-chat:${baseUrl}:${roomId}:pending`;

  const canPersist = persist && typeof window !== "undefined";

  const readPending = (): PendingRun | null => {
    if (!canPersist) return null;
    try {
      const raw = window.localStorage.getItem(pendingKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && Array.isArray(parsed.messages) && Array.isArray(parsed.sent)
        ? (parsed as PendingRun)
        : null;
    } catch {
      return null;
    }
  };

  // A reply that was still streaming when the page was left: show the
  // conversation as it was and stay in the loading state until it resumes.
  const [initialPending] = useState(readPending);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!canPersist) return [];
    if (initialPending) return initialPending.messages;
    try {
      const raw = window.localStorage.getItem(messagesKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(initialPending !== null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<AGUIClient | null>(null);
  // Aborts the turn in progress (on reset, unmount or when a new turn starts).
  const abortRef = useRef<AbortController | null>(null);
  const toolsMap = useMemo(
    () => new Map(tools.map(t => [t.name, t])),
    [tools]
  );

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new AGUIClient({ baseUrl, roomId, getAccessToken });
      // Resume the previous backend thread, if one was persisted.
      if (canPersist) {
        const storedThreadId = window.localStorage.getItem(threadKey);
        if (storedThreadId) clientRef.current.setThreadId(storedThreadId);
      }
    }
    return clientRef.current;
  }, [baseUrl, roomId, getAccessToken, canPersist, threadKey]);

  // Persist message history (and the current thread id) once a turn settles.
  // Skipping writes while streaming avoids hitting localStorage on every token;
  // an unfinished turn is covered by the pending run instead.
  useEffect(() => {
    if (!canPersist || isLoading) return;
    try {
      if (messages.length === 0) {
        window.localStorage.removeItem(messagesKey);
      } else {
        window.localStorage.setItem(messagesKey, JSON.stringify(messages));
      }
      const threadId = clientRef.current?.getThreadId();
      if (threadId) window.localStorage.setItem(threadKey, threadId);
    } catch {
      // Ignore quota / serialization errors; persistence is best-effort.
    }
  }, [messages, isLoading, canPersist, messagesKey, threadKey]);

  const savePending = useCallback(
    (pending: PendingRun) => {
      if (!canPersist) return;
      try {
        window.localStorage.setItem(pendingKey, JSON.stringify(pending));
        window.localStorage.setItem(messagesKey, JSON.stringify(pending.messages));
        if (pending.threadId) window.localStorage.setItem(threadKey, pending.threadId);
      } catch {
        // Best-effort, like the rest of persistence.
      }
    },
    [canPersist, pendingKey, messagesKey, threadKey]
  );

  const clearPending = useCallback(() => {
    if (!canPersist) return;
    try {
      window.localStorage.removeItem(pendingKey);
    } catch {
      // Best-effort cleanup.
    }
  }, [canPersist, pendingKey]);

  const executeClientTool = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      const tool = toolsMap.get(toolName);
      if (!tool) throw new Error(`Unknown tool: ${toolName}`);
      return tool.handler(args);
    },
    [toolsMap]
  );

  /**
   * Runs one turn: streams the run that `openStream` starts (or reconnects
   * to), executes client-side tools and follows their continuation runs, and
   * keeps the pending run up to date so a reload can pick the turn up again.
   * `replay` marks a reconnect stream, which the backend closes only once the
   * run has finished, even if that run never reported its end.
   */
  const runTurn = useCallback(
    async (
      pending: PendingRun,
      openStream: (client: AGUIClient, signal: AbortSignal) => Promise<AsyncGenerator<AGUIEvent>>,
      replay = false,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;
      const client = getClient();

      // The turn keeps its own copy of the message list, so it can save a
      // snapshot of it whenever a continuation run starts.
      let turnMessages = pending.messages;
      const commit = (next: ChatMessage[]) => {
        if (signal.aborted) throw new DOMException("Turn aborted", "AbortError");
        turnMessages = next;
        setMessages(next);
      };

      setMessages(turnMessages);
      setIsLoading(true);
      setError(null);
      // Whether the turn ended (finished or failed), as opposed to being
      // aborted or cut off with its run still going in the backend.
      let settled = false;

      try {
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
        const processStream = async (
          stream: AsyncGenerator<AGUIEvent>,
          baseMessages: ChatMessage[],
          depth: number = 0,
          isReplay: boolean = false,
        ) => {
          let eventIdx = 0;
          let runEnded = false;
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
                runEnded = true;
                break;

              case "THINKING_TEXT_MESSAGE_CONTENT":
              case "THINKING_START":
              case "THINKING_END":
                break;

              case "TEXT_MESSAGE_START":
                // Don't add the message yet: the backend can emit empty
                // START/END pairs with no content in between, which would
                // otherwise show up as blank bubbles. The message is added
                // on its first non-empty content delta instead.
                currentMessageId = evt.messageId as string;
                currentContent = "";
                break;

              case "TEXT_MESSAGE_CONTENT": {
                const delta = evt.delta as string;
                if (!delta) break;
                const isFirstDelta = currentContent === "";
                currentContent += delta;
                const messageId = currentMessageId;
                const content = currentContent;
                commit(
                  isFirstDelta && !turnMessages.some(m => m.id === messageId)
                    ? [...turnMessages, { id: messageId, role: "assistant", content }]
                    : turnMessages.map(m =>
                        m.id === messageId ? { ...m, content } : m
                      )
                );
                break;
              }

              case "TEXT_MESSAGE_END":
                break;

              case "TOOL_CALL_START":
                currentToolCallId = evt.toolCallId as string;
                currentToolName = evt.toolCallName as string;
                currentToolArgs = "";
                if (!currentMessageId && toolsMap.has(currentToolName)) {
                  currentMessageId = crypto.randomUUID();
                  commit([
                    ...turnMessages,
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
                  let resultStr: string;
                  try {
                    const args = JSON.parse(currentToolArgs || "{}");
                    resultStr = JSON.stringify(await executeClientTool(currentToolName, args));
                  } catch (err) {
                    console.error("Client tool execution failed:", err);
                    setError(err instanceof Error ? err.message : "Tool execution failed");
                    break;
                  }

                  // Show the raw tool result in the UI only in debug mode.
                  // Otherwise the result is still sent to the backend (below)
                  // and surfaced to the user via the assistant's reply.
                  if (debug) {
                    const toolResultMessage: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: "tool",
                      content: resultStr,
                      toolCallId: currentToolCallId,
                      toolName: currentToolName,
                    };
                    commit([...turnMessages, toolResultMessage]);
                  }

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

                    const continuationStream = await client.chat(updatedMessages, tools, signal);
                    // The turn now waits on the continuation run. Until this
                    // point a reload replays the previous run and runs the
                    // tool again, since its result never reached the backend.
                    savePending({
                      threadId: client.getThreadId(),
                      runId: client.getCurrentRunId(),
                      messages: turnMessages,
                      sent: updatedMessages,
                      depth: depth + 1,
                    });

                    // Recursively process continuation (handles nested tool calls)
                    await processStream(
                      continuationStream,
                      updatedMessages,
                      depth + 1,
                    );
                  }
                } else {
                  console.log("[AGUI] Server-side tool called:", currentToolName);
                }
                break;
              }

              case "RUN_ERROR":
                setError(evt.message as string);
                runEnded = true;
                break;

              default:
                console.debug("Unhandled AGUI event:", event.type, event);
                break;
            }
          }
          console.log(`[AGUI processStream] Finished at depth=${depth}, processed ${eventIdx} events`);
          if (!runEnded && !isReplay) throw new ConnectionLostError();
        };

        const stream = await openStream(client, signal);
        savePending({
          ...pending,
          threadId: client.getThreadId(),
          runId: client.getCurrentRunId(),
        });
        await processStream(stream, pending.sent, pending.depth, replay);
        settled = true;
      } catch (err) {
        if (!isAbortError(err, signal)) {
          settled = !isConnectionLoss(err, signal);
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (settled) clearPending();
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [getClient, toolsMap, executeClientTool, debug, tools, savePending, clearPending]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      const turnMessages = [...messages, userMessage];

      // Clean message history before sending to backend:
      // Strip toolCalls from assistant messages and remove tool result messages.
      // Client-side tool execution was already handled via continuation requests;
      // the backend doesn't need this history again on subsequent messages.
      const sent = turnMessages.filter(m => m.role !== "tool").map(m => {
        if (m.toolCalls) {
          const { toolCalls, ...rest } = m;
          return rest as ChatMessage;
        }
        return m;
      });

      const pending: PendingRun = {
        threadId: getClient().getThreadId(),
        runId: null,
        messages: turnMessages,
        sent,
        depth: 0,
      };
      // Save the question right away, so it isn't lost if the page is left
      // before the backend run exists.
      savePending(pending);

      await runTurn(pending, (client, signal) => client.chat(sent, tools, signal));
    },
    [messages, tools, getClient, savePending, runTurn]
  );

  // Pick up a reply that was still streaming when the page was left (or the
  // chat was closed). Replaying the run from its first event rebuilds the
  // reply, then the stream follows the run live until it finishes; a client
  // tool call in it is executed here, as it would have been originally.
  useEffect(() => {
    const pending = readPending();
    if (!pending) return;

    void runTurn(pending, async (client, signal) => {
      const { threadId, runId } = pending;
      if (!threadId || !runId) throw new Error(INTERRUPTED_MESSAGE);

      // An unreachable backend keeps the pending run for a later retry; an
      // error response means the run is gone.
      const run = await client.getRun(threadId, runId, signal).catch(err => {
        if (isConnectionLoss(err, signal)) throw err;
        return null;
      });
      // No saved input means the run request never reached the backend.
      if (!run?.run_input) throw new Error(INTERRUPTED_MESSAGE);
      if (!run.finished) {
        const created = Date.parse(
          /[zZ]|[+-]\d\d:?\d\d$/.test(run.created) ? run.created : `${run.created}Z`
        );
        if (Date.now() - created > STALE_RUN_MS) throw new Error(INTERRUPTED_MESSAGE);
      }

      return client.resumeRun(threadId, runId, -1, signal);
    }, true);

    // Leaving keeps the pending run, so the reply resumes on the next mount.
    return () => abortRef.current?.abort();
    // Runs once per conversation: runTurn is taken from the first render.
  }, [pendingKey]);

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsLoading(false);
    setError(null);
    clientRef.current = null; // Reset thread
    if (canPersist) {
      try {
        window.localStorage.removeItem(messagesKey);
        window.localStorage.removeItem(threadKey);
        window.localStorage.removeItem(pendingKey);
      } catch {
        // Best-effort cleanup.
      }
    }
  }, [canPersist, messagesKey, threadKey, pendingKey]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    threadId: clientRef.current?.getThreadId() ?? null,
  };
}
