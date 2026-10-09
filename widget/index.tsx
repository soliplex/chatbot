// widget/index.tsx
// Entry point for the embeddable chat widget

import React from "react";
import ReactDOM from "react-dom/client";
import ChatWidget, { ChatWidgetConfig } from "@/components/ChatWidget";

// Type for external tool definition (without handler initially)
interface ExternalToolConfig {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: string | ((args: Record<string, unknown>) => Promise<unknown>);
}

// Full widget configuration
interface WidgetInitConfig extends ChatWidgetConfig {
  tools?: ExternalToolConfig[];
  containerId?: string;
  // Legacy support: if roomId is provided, convert to roomIds array
  roomId?: string;
}

// Global namespace for the widget
declare global {
  interface Window {
    SoliplexChat: {
      init: (config: WidgetInitConfig) => void;
      destroy: () => void;
      open: () => void;
      close: () => void;
      _instance?: {
        root: ReactDOM.Root;
        container: HTMLElement;
        controls?: { open: () => void; close: () => void };
      };
    };
  }
}

// Resolve tool handlers from string references
function resolveToolHandlers(
  tools: ExternalToolConfig[]
): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}> {
  return tools.map((tool) => {
    let handler: (args: Record<string, unknown>) => Promise<unknown>;

    if (typeof tool.handler === "string") {
      // Resolve from window object (e.g., "myApp.tools.getWeather")
      const parts = tool.handler.split(".");
      let fn: unknown = window;
      for (const part of parts) {
        fn = (fn as Record<string, unknown>)[part];
      }
      if (typeof fn !== "function") {
        console.error(`Handler "${tool.handler}" is not a function`);
        handler = async () => ({ error: `Handler not found: ${tool.handler}` });
      } else {
        handler = async (args) => {
          const result = (fn as (args: Record<string, unknown>) => unknown)(args);
          return result instanceof Promise ? result : Promise.resolve(result);
        };
      }
    } else {
      handler = tool.handler;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler,
    };
  });
}

// Widget wrapper component to expose controls via ref
function WidgetWrapper({
  config,
  tools,
  onMount,
}: {
  config: ChatWidgetConfig;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
  onMount: (controls: { open: () => void; close: () => void }) => void;
}) {
  const widgetRef = React.useRef<{ open: () => void; close: () => void; toggle: () => void; isOpen: () => boolean } | null>(null);

  React.useEffect(() => {
    if (widgetRef.current) {
      onMount({
        open: () => widgetRef.current?.open(),
        close: () => widgetRef.current?.close(),
      });
    }
  }, [onMount]);

  return <ChatWidget ref={widgetRef} config={config} tools={tools} />;
}

// Initialize the widget
function init(config: WidgetInitConfig) {
  if (window.SoliplexChat._instance) {
    console.warn("SoliplexChat is already initialized. Call destroy() first.");
    return;
  }

  // Create container
  const containerId = config.containerId || "soliplex-chat-widget";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    document.body.appendChild(container);
  }

  // Resolve tool handlers
  const tools = config.tools ? resolveToolHandlers(config.tools) : [];

  // roomId is shorthand for roomIds: [roomId] and wins when both are set,
  // as documented. The room still comes from the room list, so an
  // inaccessible room falls through to fallbackRoomIds like any other.
  let roomIds = config.roomIds;
  if (config.roomId) {
    if (roomIds && roomIds.length > 0) {
      console.warn("SoliplexChat: roomIds ignored because roomId is set");
    }
    roomIds = [config.roomId];
  }

  // Normalize fallbackRoomIds to a de-duplicated list of non-empty IDs that
  // aren't already primaries. Fallbacks only apply when roomIds is set.
  let fallbackRoomIds: string[] | undefined;
  if (config.fallbackRoomIds !== undefined && !Array.isArray(config.fallbackRoomIds)) {
    console.warn("SoliplexChat: fallbackRoomIds ignored because it is not an array");
  } else if (config.fallbackRoomIds !== undefined) {
    const ids: string[] = [];
    for (const id of config.fallbackRoomIds as unknown[]) {
      if (typeof id === "string" && id !== "" && !ids.includes(id) && !roomIds?.includes(id)) {
        ids.push(id);
      }
    }
    if (ids.length > 0) {
      if (roomIds && roomIds.length > 0) {
        fallbackRoomIds = ids;
      } else {
        console.warn("SoliplexChat: fallbackRoomIds ignored because roomIds is empty");
      }
    }
  }

  // Extract widget config
  const widgetConfig: ChatWidgetConfig = {
    baseUrl: config.baseUrl, // May be undefined - widget will show server URL prompt
    roomIds: roomIds,
    fallbackRoomIds: fallbackRoomIds,
    autoHideSeconds: config.autoHideSeconds,
    position: config.position,
    bubbleColor: config.bubbleColor,
    theme: config.theme,
    title: config.title,
    placeholder: config.placeholder,
    debug: config.debug,
    persist: config.persist,
  };

  // Create React root and render
  const root = ReactDOM.createRoot(container);

  let controlsRef: { open: () => void; close: () => void } | undefined;

  root.render(
    <React.StrictMode>
      <WidgetWrapper
        config={widgetConfig}
        tools={tools}
        onMount={(controls) => {
          controlsRef = controls;
          // Update instance with controls once mounted
          if (window.SoliplexChat._instance) {
            window.SoliplexChat._instance.controls = controls;
          }
        }}
      />
    </React.StrictMode>
  );

  window.SoliplexChat._instance = {
    root,
    container,
    controls: controlsRef,
  };
}

// Destroy the widget
function destroy() {
  if (!window.SoliplexChat._instance) return;

  const { root, container } = window.SoliplexChat._instance;
  root.unmount();
  container.remove();
  window.SoliplexChat._instance = undefined;
}

// Open the chat
function open() {
  window.SoliplexChat._instance?.controls?.open();
}

// Close the chat
function close() {
  window.SoliplexChat._instance?.controls?.close();
}

// Export to window
window.SoliplexChat = {
  init,
  destroy,
  open,
  close,
};

export { init, destroy, open, close };
