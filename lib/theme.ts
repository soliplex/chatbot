// lib/theme.ts
// Soliplex design tokens and the widget's stylesheet.
//
// The token values mirror the Soliplex design system
// (soliplex_frontend: design_system/tokens.css, which mirrors the production
// `soliplex_design` Flutter package). Do not invent values here: when one is
// missing, add it to the design system first.
//
// Everything is scoped under `.soliplex-root` so the widget neither leaks
// styles into the host page nor depends on the host defining anything.

export type ThemeMode = "light" | "dark" | "auto";

const lightColors: Record<string, string> = {
  background: "#ffffff",
  foreground: "#0A0A0A",
  primary: "#030213",
  "on-primary": "#ffffff",
  "primary-container": "#E0DDDA",
  "on-primary-container": "#0A0A0A",
  secondary: "#F3F3FA",
  "on-secondary": "#030213",
  "tertiary-container": "#F3F4F6",
  "on-tertiary-container": "#374151",
  accent: "#E9EBEF",
  "on-accent": "#030213",
  muted: "#ECECF0",
  "muted-foreground": "#595968",
  destructive: "#D4183D",
  "on-destructive": "#ffffff",
  "error-container": "#FEE2E2",
  "on-error-container": "#991B1B",
  border: "rgba(0,0,0,0.10)",
  outline: "#C0C0C4",
  "input-background": "#F3F3F5",
  "hint-text": "#666666",
  "surface-container-low": "#EFEFEF",
  "surface-container-highest": "#E4E4E4",
  link: "#2563EB",
};

const darkColors: Record<string, string> = {
  background: "#111111",
  foreground: "#FAFAFA",
  primary: "#FAFAFA",
  "on-primary": "#222222",
  "primary-container": "#2A2A2A",
  "on-primary-container": "#FAFAFA",
  secondary: "#2A2A2A",
  "on-secondary": "#FFFFFF",
  "tertiary-container": "#2A2A2A",
  "on-tertiary-container": "#D1D5DB",
  accent: "#2A2A2A",
  "on-accent": "#FFFFFF",
  muted: "#444444",
  "muted-foreground": "#AAAAAA",
  destructive: "#D4183D",
  "on-destructive": "#FFFFFF",
  "error-container": "#3D1A1A",
  "on-error-container": "#FCA5A5",
  border: "#2A2A2A",
  outline: "#555555",
  "input-background": "#333333",
  "hint-text": "#A3A3A3",
  "surface-container-low": "#1A1A1A",
  "surface-container-highest": "#333333",
  link: "#60A5FA",
};

function colorVars(colors: Record<string, string>): string {
  return Object.entries(colors)
    .map(([name, value]) => `--sp-${name}: ${value};`)
    .join("\n      ");
}

const LIGHT = `${colorVars(lightColors)}\n      color-scheme: light;`;
const DARK = `${colorVars(darkColors)}\n      color-scheme: dark;`;

const STYLES = `
    /* ---------------------------------------------------------------- tokens */
    .soliplex-root {
      ${LIGHT}

      --sp-space-1: 4px;
      --sp-space-2: 8px;
      --sp-space-3: 12px;
      --sp-space-4: 16px;
      --sp-space-6: 24px;

      --sp-radius-sm: 6px;
      --sp-radius-md: 12px;
      --sp-radius-lg: 16px;
      --sp-radius-xl: 24px;

      --sp-font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --sp-font-mono: "SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace;

      --sp-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.25);
      --sp-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .soliplex-root[data-sp-theme="dark"] {
      ${DARK}
    }

    @media (prefers-color-scheme: dark) {
      .soliplex-root[data-sp-theme="auto"] {
        ${DARK}
      }
    }

    /* ------------------------------------------------------------------ base */
    .soliplex-root {
      font-family: var(--sp-font-sans);
      font-size: 16px;
      font-weight: 400;
      line-height: 1.5;
      color: var(--sp-foreground);
      text-align: left;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .soliplex-root *,
    .soliplex-root *::before,
    .soliplex-root *::after {
      box-sizing: border-box;
    }

    /* Resets sit at single-class specificity via :where(), so they beat the
       host page's element selectors but lose to the component classes below. */
    .soliplex-root :where(button, input, select, textarea) {
      font: inherit;
      color: inherit;
      margin: 0;
    }

    .soliplex-root :where(h1, h2, h3, h4, h5, h6, p, ul, ol, li, pre, label) {
      color: inherit;
      font-family: inherit;
      letter-spacing: normal;
      text-transform: none;
    }

    .soliplex-root :where(button) { cursor: pointer; }
    .soliplex-root :where(button:disabled) { cursor: not-allowed; }

    .soliplex-root :focus-visible {
      outline: 2px solid var(--sp-primary);
      outline-offset: 2px;
    }

    .soliplex-root svg {
      display: block;
      flex-shrink: 0;
    }

    /* ---------------------------------------------------------- widget frame */
    .sp-widget {
      position: fixed;
      bottom: var(--sp-space-4);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--sp-space-4);
      background: transparent;
    }

    .sp-widget-right { right: var(--sp-space-4); }
    .sp-widget-left { left: var(--sp-space-4); align-items: flex-start; }

    .sp-panel {
      display: flex;
      flex-direction: column;
      width: min(380px, calc(100vw - 2 * var(--sp-space-4)));
      height: min(600px, calc(100vh - 120px));
      background: var(--sp-background);
      border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius-lg);
      box-shadow: var(--sp-shadow);
      overflow: hidden;
    }

    .sp-panel-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .sp-launcher {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--sp-primary);
      color: var(--sp-on-primary);
      box-shadow: var(--sp-shadow);
      transition: transform var(--sp-transition);
    }

    .sp-launcher:hover { transform: scale(1.05); }
    .sp-launcher:active { transform: scale(0.95); }
    .sp-launcher svg { width: 24px; height: 24px; }

    /* ---------------------------------------------------------------- header */
    .sp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-space-2);
      min-height: 56px;
      padding: var(--sp-space-2);
      padding-left: var(--sp-space-4);
      background: var(--sp-background);
      color: var(--sp-foreground);
      border-bottom: 1px solid var(--sp-border);
      flex-shrink: 0;
    }

    .sp-header-start,
    .sp-header-actions {
      display: flex;
      align-items: center;
      gap: var(--sp-space-1);
      min-width: 0;
    }

    .sp-header-title {
      font-size: 16px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sp-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: var(--sp-radius-md);
      background: transparent;
      color: var(--sp-foreground);
      transition: background-color var(--sp-transition);
    }

    .sp-icon-btn:hover { background: var(--sp-accent); color: var(--sp-on-accent); }
    .sp-icon-btn svg { width: 20px; height: 20px; }

    /* --------------------------------------------- pre-chat screens & controls */
    .sp-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-space-2);
      padding: var(--sp-space-6);
      text-align: center;
      overflow-y: auto;
    }

    .sp-screen-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin-bottom: var(--sp-space-2);
      border-radius: var(--sp-radius-md);
      background: var(--sp-secondary);
      color: var(--sp-on-secondary);
    }

    .sp-screen-icon svg { width: 24px; height: 24px; }

    .sp-screen-title {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
      line-height: 1.5;
    }

    .sp-screen-subtitle {
      margin: 0;
      font-size: 13px;
      color: var(--sp-muted-foreground);
    }

    .sp-screen-status {
      display: flex;
      align-items: center;
      gap: var(--sp-space-2);
      font-size: 13px;
      color: var(--sp-muted-foreground);
    }

    .sp-stack {
      display: flex;
      flex-direction: column;
      gap: var(--sp-space-2);
      width: 100%;
      max-width: 320px;
      margin-top: var(--sp-space-2);
      text-align: left;
    }

    .sp-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--sp-muted-foreground);
    }

    .sp-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--sp-space-2);
      min-height: 40px;
      padding: var(--sp-space-2) var(--sp-space-4);
      border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius-md);
      background: var(--sp-primary);
      color: var(--sp-on-primary);
      font-weight: 500;
      transition: background-color var(--sp-transition);
    }

    .sp-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--sp-primary) 85%, var(--sp-on-primary));
    }

    .sp-btn:disabled {
      background: var(--sp-muted);
      color: var(--sp-muted-foreground);
    }

    .sp-btn-outlined {
      background: transparent;
      color: var(--sp-foreground);
    }

    .sp-btn-outlined:hover:not(:disabled) {
      background: var(--sp-accent);
      color: var(--sp-on-accent);
    }

    .sp-field {
      width: 100%;
      min-height: 48px;
      padding: var(--sp-space-3);
      border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius-md);
      background: var(--sp-input-background);
      color: var(--sp-foreground);
      outline: none;
    }

    .sp-field::placeholder { color: var(--sp-hint-text); }

    .sp-field:focus,
    .sp-field:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 1px var(--sp-border);
    }

    .sp-field[aria-invalid="true"] { border-color: var(--sp-destructive); }
    .sp-field[aria-invalid="true"]:focus {
      box-shadow: inset 0 0 0 1px var(--sp-destructive);
    }

    .sp-alert {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-space-2);
      width: 100%;
      padding: var(--sp-space-3);
      border-radius: var(--sp-radius-md);
      background: var(--sp-error-container);
      color: var(--sp-on-error-container);
      font-size: 13px;
      text-align: left;
      word-break: break-word;
    }

    .sp-alert svg { width: 18px; height: 18px; margin-top: 1px; }

    .sp-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: sp-spin 0.8s linear infinite;
      flex-shrink: 0;
    }

    @keyframes sp-spin { to { transform: rotate(360deg); } }

    /* ------------------------------------------------------------------ chat */
    .soliplex-chat {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
      background: var(--sp-background);
      color: var(--sp-foreground);
    }

    .soliplex-chat-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: var(--sp-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--sp-space-3);
    }

    .soliplex-chat-messages::-webkit-scrollbar { width: 6px; }
    .soliplex-chat-messages::-webkit-scrollbar-track { background: transparent; }
    .soliplex-chat-messages::-webkit-scrollbar-thumb {
      background: var(--sp-outline);
      border-radius: var(--sp-radius-sm);
    }

    /* Empty state */
    .soliplex-chat-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-space-2);
      padding: var(--sp-space-6) var(--sp-space-4);
      text-align: center;
    }

    .soliplex-chat-empty-title {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }

    .soliplex-chat-empty-description {
      margin: 0;
      max-width: 320px;
      font-size: 13px;
      color: var(--sp-muted-foreground);
    }

    .soliplex-chat-suggestions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--sp-space-2);
      max-width: 320px;
      margin-top: var(--sp-space-2);
    }

    .soliplex-chat-suggestion {
      padding: var(--sp-space-2) var(--sp-space-3);
      border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius-md);
      background: var(--sp-input-background);
      color: var(--sp-foreground);
      font-size: 13px;
      text-align: left;
      transition: background-color var(--sp-transition);
    }

    .soliplex-chat-suggestion:hover {
      background: var(--sp-accent);
      color: var(--sp-on-accent);
    }

    /* Messages */
    .soliplex-msg {
      display: flex;
      max-width: 85%;
      animation: sp-msg-in 0.2s ease-out;
    }

    .soliplex-msg-user { align-self: flex-end; }
    .soliplex-msg-assistant { align-self: flex-start; }

    @keyframes sp-msg-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Chat bubbles use 14/10 padding: the one documented exception to the
       spacing scale. */
    .soliplex-bubble {
      min-width: 0;
      padding: 10px 14px;
      border-radius: var(--sp-radius-md);
      word-break: break-word;
    }

    .soliplex-bubble-user {
      background: var(--sp-primary-container);
      color: var(--sp-on-primary-container);
    }

    .soliplex-bubble-assistant {
      background: var(--sp-surface-container-low);
      color: var(--sp-foreground);
    }

    .soliplex-bubble p {
      margin: 0;
      white-space: pre-wrap;
    }

    /* Markdown inside assistant bubbles */
    .soliplex-bubble-assistant code {
      padding: 0 var(--sp-space-1);
      border-radius: var(--sp-radius-sm);
      background: var(--sp-surface-container-highest);
      font-family: var(--sp-font-mono);
      font-size: 13px;
    }

    .soliplex-bubble-assistant pre {
      margin: var(--sp-space-2) 0;
      padding: var(--sp-space-2) var(--sp-space-3);
      border-radius: var(--sp-radius-md);
      background: var(--sp-surface-container-highest);
      color: var(--sp-foreground);
      font-family: var(--sp-font-mono);
      font-size: 13px;
      overflow-x: auto;
    }

    .soliplex-bubble-assistant pre code {
      padding: 0;
      background: none;
    }

    .soliplex-bubble-assistant strong { font-weight: 600; }
    .soliplex-bubble-assistant em { font-style: italic; }

    .soliplex-bubble-assistant ul,
    .soliplex-bubble-assistant ol {
      margin: var(--sp-space-1) 0;
      padding-left: var(--sp-space-6);
    }

    .soliplex-bubble-assistant li { margin: var(--sp-space-1) 0; }

    .soliplex-bubble-assistant a {
      color: var(--sp-link);
      text-decoration: underline;
      word-break: break-word;
    }

    .soliplex-bubble-assistant h1,
    .soliplex-bubble-assistant h2,
    .soliplex-bubble-assistant h3,
    .soliplex-bubble-assistant h4,
    .soliplex-bubble-assistant h5,
    .soliplex-bubble-assistant h6 {
      margin: var(--sp-space-2) 0 var(--sp-space-1);
      font-weight: 500;
      line-height: 1.5;
    }

    .soliplex-bubble-assistant h1 { font-size: 24px; }
    .soliplex-bubble-assistant h2 { font-size: 20px; }
    .soliplex-bubble-assistant h3,
    .soliplex-bubble-assistant h4,
    .soliplex-bubble-assistant h5,
    .soliplex-bubble-assistant h6 { font-size: 16px; }

    .soliplex-bubble-assistant > div > :first-child { margin-top: 0; }

    /* Tool calls (debug mode) */
    .soliplex-tool-msg {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--sp-space-2);
      max-width: 85%;
      animation: sp-msg-in 0.2s ease-out;
    }

    .soliplex-tool-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-space-1);
      padding: var(--sp-space-1) var(--sp-space-2);
      border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius-md);
      background: var(--sp-tertiary-container);
      color: var(--sp-on-tertiary-container);
      font-size: 12px;
      font-weight: 500;
    }

    .soliplex-tool-badge svg { width: 12px; height: 12px; }

    .soliplex-tool-output {
      max-width: 100%;
      max-height: 240px;
      margin: 0;
      padding: var(--sp-space-2) var(--sp-space-3);
      border-radius: var(--sp-radius-md);
      background: var(--sp-surface-container-highest);
      color: var(--sp-foreground);
      font-family: var(--sp-font-mono);
      font-size: 12px;
      overflow: auto;
    }

    /* Typing indicator */
    .soliplex-typing {
      display: flex;
      align-self: flex-start;
      gap: var(--sp-space-1);
      padding: 14px;
      border-radius: var(--sp-radius-md);
      background: var(--sp-surface-container-low);
      animation: sp-msg-in 0.2s ease-out;
    }

    .soliplex-typing-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sp-muted-foreground);
      animation: sp-typing 1.4s infinite;
    }

    .soliplex-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .soliplex-typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes sp-typing {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    /* Input */
    .soliplex-input-form {
      flex-shrink: 0;
      padding: var(--sp-space-3) var(--sp-space-4);
      background: var(--sp-background);
      border-top: 1px solid var(--sp-border);
    }

    .soliplex-input-wrapper {
      display: flex;
      align-items: flex-end;
      gap: var(--sp-space-2);
      padding: var(--sp-space-1);
      padding-left: var(--sp-space-3);
      border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius-md);
      background: var(--sp-input-background);
    }

    .soliplex-input-wrapper:focus-within {
      box-shadow: inset 0 0 0 1px var(--sp-border);
    }

    .soliplex-input {
      flex: 1;
      min-height: 24px;
      max-height: 120px;
      padding: var(--sp-space-2) 0;
      border: none;
      background: transparent;
      color: var(--sp-foreground);
      resize: none;
      outline: none;
    }

    .soliplex-input:focus-visible { outline: none; }
    .soliplex-input::placeholder { color: var(--sp-hint-text); }

    .soliplex-send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: var(--sp-radius-md);
      background: var(--sp-primary);
      color: var(--sp-on-primary);
      transition: background-color var(--sp-transition);
    }

    .soliplex-send-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--sp-primary) 85%, var(--sp-on-primary));
    }

    /* Nothing to send yet: a muted well whose icon still reads clearly. */
    .soliplex-send-btn:disabled {
      background: var(--sp-muted);
      color: var(--sp-muted-foreground);
    }

    /* Busy keeps the primary fill so the spinner is visible against it. */
    .soliplex-send-btn[aria-busy="true"] {
      background: var(--sp-primary);
      color: var(--sp-on-primary);
    }

    .soliplex-send-btn svg { width: 18px; height: 18px; }

    .soliplex-input-hint {
      margin: var(--sp-space-2) 0 0;
      font-size: 12px;
      color: var(--sp-muted-foreground);
      text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .soliplex-root *,
      .soliplex-root *::before,
      .soliplex-root *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      .sp-spinner { animation-iteration-count: infinite !important; animation-duration: 0.8s !important; }
    }
`;

const STYLE_ID = "soliplex-chat-styles";

/** Inject the widget stylesheet once per document. */
export function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * CSS variable overrides that recolor the primary role with a host-supplied
 * accent, pairing it with whichever of white or the Soliplex foreground
 * contrasts more — the same rule `soliplex_design` uses to derive on-colors.
 * Returns undefined when the color cannot be parsed, keeping the default.
 */
export function accentOverrides(
  color: string | undefined
): Record<string, string> | undefined {
  if (!color || typeof document === "undefined") return undefined;
  const rgb = parseColor(color);
  if (!rgb) return undefined;
  const luminance = relativeLuminance(rgb);
  const onWhite = 1.05 / (luminance + 0.05);
  const onDark = (luminance + 0.05) / (relativeLuminance([10, 10, 10]) + 0.05);
  return {
    "--sp-primary": color,
    "--sp-on-primary": onWhite >= onDark ? "#ffffff" : "#0A0A0A",
  };
}

function parseColor(color: string): [number, number, number] | null {
  // Let the browser resolve any CSS color syntax (names, hex, rgb(), hsl()).
  const probe = document.createElement("span");
  probe.style.color = color;
  if (!probe.style.color) return null;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  // Wide-gamut syntaxes (oklch(), color()) can resolve to something other
  // than rgb(); keep the default palette rather than guess.
  if (!resolved.startsWith("rgb")) return null;
  const match = resolved.match(/(\d+(?:\.\d+)?)/g);
  if (!match || match.length < 3) return null;
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
