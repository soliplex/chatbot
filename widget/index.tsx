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

// Inject Tailwind styles
function injectStyles() {
  if (document.getElementById("soliplex-chat-styles")) return;

  const style = document.createElement("style");
  style.id = "soliplex-chat-styles";
  style.textContent = `
    /* Reset and base styles for the widget */
    #soliplex-chat-widget * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    #soliplex-chat-widget {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }

    /* Tailwind-like utility classes */
    .fixed { position: fixed; }
    .absolute { position: absolute; }
    .relative { position: relative; }
    .bottom-4 { bottom: 1rem; }
    .right-4 { right: 1rem; }
    .left-4 { left: 1rem; }
    .z-\\[9999\\] { z-index: 9999; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-8 { margin-top: 2rem; }
    .p-1 { padding: 0.25rem; }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-1 { flex: 1 1 0%; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .justify-start { justify-content: flex-start; }
    .justify-end { justify-content: flex-end; }
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .h-5 { height: 1.25rem; }
    .h-6 { height: 1.5rem; }
    .h-14 { height: 3.5rem; }
    .h-full { height: 100%; }
    .h-screen { height: 100vh; }
    .w-2 { width: 0.5rem; }
    .h-2 { height: 0.5rem; }
    .w-5 { width: 1.25rem; }
    .w-6 { width: 1.5rem; }
    .w-14 { width: 3.5rem; }
    .max-w-3xl { max-width: 48rem; }
    .max-w-md { max-width: 28rem; }
    .max-w-\\[80\\%\\] { max-width: 80%; }
    .w-full { width: 100%; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .text-left { text-align: left; }
    .overflow-hidden { overflow: hidden; }
    .overflow-y-auto { overflow-y: auto; }
    .overflow-x-auto { overflow-x: auto; }
    .rounded { border-radius: 0.25rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-full { border-radius: 9999px; }
    .rounded-br-sm { border-bottom-right-radius: 0.125rem; }
    .rounded-bl-sm { border-bottom-left-radius: 0.125rem; }
    .border { border-width: 1px; border-style: solid; border-color: #e5e7eb; }
    .border-b { border-bottom-width: 1px; border-bottom-style: solid; border-bottom-color: #e5e7eb; }
    .border-t { border-top-width: 1px; border-top-style: solid; border-top-color: #e5e7eb; }
    .bg-white { background-color: #ffffff; }
    .bg-gray-100 { background-color: #f3f4f6; }
    .bg-gray-400 { background-color: #9ca3af; }
    .bg-blue-600 { background-color: #2563eb; }
    .bg-red-50 { background-color: #fef2f2; }
    .text-white { color: #ffffff; }
    .text-gray-500 { color: #6b7280; }
    .text-gray-600 { color: #4b5563; }
    .text-gray-900 { color: #111827; }
    .text-red-700 { color: #b91c1c; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .text-xl { font-size: 1.25rem; }
    .text-center { text-align: center; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .whitespace-pre-wrap { white-space: pre-wrap; }
    .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); }
    .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
    .transition-all { transition: all 0.3s ease; }
    .transition-colors { transition: color 0.15s ease, background-color 0.15s ease; }
    .duration-300 { transition-duration: 300ms; }
    .hover\\:scale-110:hover { transform: scale(1.1); }
    .hover\\:bg-white\\/20:hover { background-color: rgba(255,255,255,0.2); }
    .hover\\:bg-gray-100:hover { background-color: #f3f4f6; }
    .hover\\:bg-blue-50:hover { background-color: #eff6ff; }
    .hover\\:bg-blue-700:hover { background-color: #1d4ed8; }
    .hover\\:border-blue-300:hover { border-color: #93c5fd; }
    .hover\\:text-gray-900:hover { color: #111827; }
    .focus\\:outline-none:focus { outline: none; }
    .focus\\:ring-2:focus { box-shadow: 0 0 0 2px #3b82f6; }
    .disabled\\:bg-gray-100:disabled { background-color: #f3f4f6; }
    .disabled\\:bg-gray-400:disabled { background-color: #9ca3af; }
    .disabled\\:cursor-not-allowed:disabled { cursor: not-allowed; }

    /* Animation */
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-25%); }
    }
    .animate-bounce { animation: bounce 1s infinite; }
  `;
  document.head.appendChild(style);
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

  injectStyles();

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

  // Handle legacy roomId -> roomIds conversion
  let roomIds = config.roomIds;
  if (!roomIds && config.roomId) {
    roomIds = [config.roomId];
  }

  // Extract widget config
  const widgetConfig: ChatWidgetConfig = {
    baseUrl: config.baseUrl,
    roomIds: roomIds,
    autoHideSeconds: config.autoHideSeconds,
    position: config.position,
    bubbleColor: config.bubbleColor,
    title: config.title,
    placeholder: config.placeholder,
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
