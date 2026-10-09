"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from "react";
import Chat from "./Chat";
import { useAuth, type AuthSystem } from "@/hooks/useAuth";
import { accentOverrides, injectStyles, type ThemeMode } from "@/lib/theme";

// Room information from the API
export interface Room {
  id: string;
  name: string;
  description: string;
  welcome_message: string;
  suggestions: string[];
}

export interface ChatWidgetConfig {
  baseUrl?: string; // If not set, shows a prompt to enter the server URL
  roomIds?: string[]; // Optional list of room IDs to show; if empty/undefined, show all
  fallbackRoomIds?: string[]; // Tried in order when none of roomIds is accessible; first accessible wins
  autoHideSeconds?: number; // 0 = never hide
  position?: "bottom-right" | "bottom-left";
  bubbleColor?: string; // Accent for the launcher and primary buttons; defaults to the Soliplex primary
  theme?: ThemeMode; // "light", "dark", or "auto" (follow the OS, default)
  title?: string;
  placeholder?: string; // Empty-state message; overrides the room's welcome message
  debug?: boolean; // If true, show raw tool-call results as JSON in the chat
  persist?: boolean; // Resume the conversation across reloads (default true)
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
    // Synchronous and idempotent, so the first paint is already styled.
    injectStyles();

    // Widget open/room state is persisted (scoped per server) so a reload
    // reopens the widget in the room the user was last using.
    const persistWidgetState =
      (config.persist ?? true) && typeof window !== "undefined";
    const openKey = `soliplex-widget:${config.baseUrl ?? ""}:open`;
    const roomKey = `soliplex-widget:${config.baseUrl ?? ""}:room`;

    const [isOpen, setIsOpen] = useState<boolean>(() => {
      if (!persistWidgetState) return false;
      try {
        return window.localStorage.getItem(openKey) === "1";
      } catch {
        return false;
      }
    });
    const [isVisible, setIsVisible] = useState(true);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [isLoadingRooms, setIsLoadingRooms] = useState(false);
    const [roomsError, setRoomsError] = useState<string | null>(null);
    const [customBaseUrl, setCustomBaseUrl] = useState<string | null>(null);

    // Populated by the embedded Chat so the header can start a new conversation.
    const resetChatRef = useRef<(() => void) | null>(null);
    const handleRegisterReset = useCallback((reset: () => void) => {
      resetChatRef.current = reset;
    }, []);

    // Remember whether the widget is open across reloads.
    useEffect(() => {
      if (!persistWidgetState) return;
      try {
        window.localStorage.setItem(openKey, isOpen ? "1" : "0");
      } catch {
        // Best-effort.
      }
    }, [isOpen, persistWidgetState, openKey]);

    // Remember which room is selected across reloads. Only write on select;
    // clearing is done explicitly when the user leaves a room, so the initial
    // null state on mount doesn't wipe the id before it can be restored.
    useEffect(() => {
      if (!persistWidgetState || !selectedRoom) return;
      try {
        window.localStorage.setItem(roomKey, selectedRoom.id);
      } catch {
        // Best-effort.
      }
    }, [selectedRoom, persistWidgetState, roomKey]);

    const clearPersistedRoom = useCallback(() => {
      if (!persistWidgetState) return;
      try {
        window.localStorage.removeItem(roomKey);
      } catch {
        // Best-effort.
      }
    }, [persistWidgetState, roomKey]);

    const {
      roomIds,
      fallbackRoomIds,
      autoHideSeconds = 0,
      position = "bottom-right",
      bubbleColor,
      theme = "auto",
      title = "Chat with us",
      placeholder,
      debug = false,
      persist = true,
    } = config;

    // Resolved baseUrl: from config or user-provided custom URL
    const baseUrl = config.baseUrl || customBaseUrl;

    // Authentication hook - only activate when we have a baseUrl
    const {
      isLoading: isAuthLoading,
      isAuthenticated,
      authRequired,
      authSystems,
      userInfo,
      error: authError,
      login,
      logout,
      getAccessToken,
    } = useAuth({ baseUrl: baseUrl || "", autoCheck: !!baseUrl });

    // Fetch room(s) when widget opens and user is authenticated (or auth not required)
    useEffect(() => {
      const canFetchRooms = isOpen && availableRooms.length === 0 && !selectedRoom && !isLoadingRooms;
      const authReady = authRequired === false || isAuthenticated;

      if (canFetchRooms && authReady) {
        fetchRooms();
      }
    }, [isOpen, authRequired, isAuthenticated]);

    const fetchRooms = async () => {
      setIsLoadingRooms(true);
      setRoomsError(null);
      try {
        const headers: Record<string, string> = {};
        const token = getAccessToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const response = await fetch(`${baseUrl}/api/v1/rooms`, { headers });
        if (!response.ok) {
          throw new Error(`Failed to fetch rooms: ${response.status}`);
        }
        const roomsData: Record<string, Room> = await response.json();

        // The backend only lists rooms the caller may access.
        const allRooms: Room[] = Object.entries(roomsData).map(([id, room]) => ({
          ...room,
          id,
        }));

        // Narrow to the configured roomIds (in that order). If none of them
        // is accessible, use the first accessible fallback room instead.
        let rooms = allRooms;
        if (roomIds && roomIds.length > 0) {
          rooms = roomIds
            .map((id) => allRooms.find((room) => room.id === id))
            .filter((room): room is Room => room !== undefined);
          if (rooms.length === 0 && fallbackRoomIds) {
            const fallback = fallbackRoomIds
              .map((id) => allRooms.find((room) => room.id === id))
              .find((room) => room !== undefined);
            if (fallback) {
              rooms = [fallback];
              if (debug) {
                console.info(
                  "[SoliplexChat] primary room(s) not accessible, using fallback room",
                  fallback.id
                );
              }
            }
          }
        }

        setAvailableRooms(rooms);

        // Restore the room the user was last in (across reloads), else
        // auto-select when there's only one room.
        let restoredRoomId: string | null = null;
        if (persistWidgetState) {
          try {
            restoredRoomId = window.localStorage.getItem(roomKey);
          } catch {
            restoredRoomId = null;
          }
        }
        const restoredRoom = restoredRoomId
          ? rooms.find((room) => room.id === restoredRoomId)
          : undefined;
        if (restoredRoom) {
          setSelectedRoom(restoredRoom);
        } else if (rooms.length === 1) {
          setSelectedRoom(rooms[0]);
        }
      } catch (err) {
        setRoomsError(err instanceof Error ? err.message : "Failed to load rooms");
      } finally {
        setIsLoadingRooms(false);
      }
    };

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

    const handleBackToRooms = useCallback(() => {
      setSelectedRoom(null);
      clearPersistedRoom();
    }, [clearPersistedRoom]);

    const handleLogout = useCallback(() => {
      logout();
      // Clear room state so user sees login screen after logging out
      setAvailableRooms([]);
      setSelectedRoom(null);
      setRoomsError(null);
      clearPersistedRoom();
    }, [logout, clearPersistedRoom]);

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

    const accentStyle = useMemo(
      () => accentOverrides(bubbleColor) as React.CSSProperties | undefined,
      [bubbleColor]
    );

    if (!isVisible && !isOpen) {
      return null;
    }

    return (
      <div
        className={`soliplex-root sp-widget ${
          position === "bottom-left" ? "sp-widget-left" : "sp-widget-right"
        }`}
        data-sp-theme={theme}
        style={accentStyle}
      >
        {/* Chat Panel */}
        {isOpen && (
          <div
            className="sp-panel"
            role="dialog"
            aria-label={selectedRoom ? selectedRoom.name : title}
          >
            <header className="sp-header">
              <div className="sp-header-start">
                {selectedRoom && availableRooms.length > 1 && (
                  <button
                    type="button"
                    onClick={handleBackToRooms}
                    className="sp-icon-btn"
                    aria-label="Back to rooms"
                    title="Back to rooms"
                  >
                    <Icons.Back />
                  </button>
                )}
                <span className="sp-header-title">
                  {selectedRoom ? selectedRoom.name : title}
                </span>
              </div>
              <div className="sp-header-actions">
                {/* Start a new conversation - only while chatting in a room */}
                {selectedRoom && (
                  <button
                    type="button"
                    onClick={() => resetChatRef.current?.()}
                    className="sp-icon-btn"
                    aria-label="Start new conversation"
                    title="Start new conversation"
                  >
                    <Icons.NewChat />
                  </button>
                )}
                {/* Logout button - only show when authenticated */}
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="sp-icon-btn"
                    aria-label="Sign out"
                    title="Sign out"
                  >
                    <Icons.SignOut />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="sp-icon-btn"
                  aria-label="Close chat"
                  title="Close chat"
                >
                  <Icons.Close />
                </button>
              </div>
            </header>

            <div className="sp-panel-body">
              {/* Server URL prompt when baseUrl is not configured */}
              {!baseUrl ? (
                <ServerUrlPrompt onConnect={(url) => setCustomBaseUrl(url)} />
              ) : isAuthLoading ? (
                <StatusScreen message="Checking authentication…" />
              ) : authRequired && !isAuthenticated ? (
                <LoginSelector
                  authSystems={authSystems}
                  onLogin={login}
                  error={authError}
                />
              ) : isLoadingRooms ? (
                <StatusScreen message="Loading rooms…" />
              ) : roomsError ? (
                <div className="sp-screen">
                  <div className="sp-alert" role="alert">
                    <Icons.AlertCircle />
                    <span>{roomsError}</span>
                  </div>
                  <div className="sp-stack">
                    <button
                      type="button"
                      onClick={() => fetchRooms()}
                      className="sp-btn"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : selectedRoom ? (
              <ChatEmbed
                baseUrl={baseUrl!}
                room={selectedRoom}
                tools={tools}
                placeholder={placeholder}
                getAccessToken={getAccessToken}
                debug={debug}
                persist={persist}
                onRegisterReset={handleRegisterReset}
              />
            ) : (
              <RoomSelector
                rooms={availableRooms}
                onSelect={setSelectedRoom}
              />
            )}
          </div>
        </div>
      )}

      {/* Floating launcher */}
      <button
        type="button"
        onClick={isOpen ? handleClose : handleOpen}
        className="sp-launcher"
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
      >
        {isOpen ? <Icons.Close /> : <Icons.Chat />}
      </button>
    </div>
  );
}
);

// =============================================================================
// ICONS - Inline SVG components (same stroke family as Chat.tsx)
// =============================================================================

const svgProps = {
viewBox: "0 0 24 24",
fill: "none",
stroke: "currentColor",
strokeWidth: 2,
strokeLinecap: "round" as const,
strokeLinejoin: "round" as const,
"aria-hidden": true,
};

const Icons = {
Chat: () => (
  <svg {...svgProps}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
),
Close: () => (
  <svg {...svgProps}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
),
Back: () => (
  <svg {...svgProps}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
),
NewChat: () => (
  <svg {...svgProps}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
),
SignOut: () => (
  <svg {...svgProps}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
),
User: () => (
  <svg {...svgProps}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
),
Server: () => (
  <svg {...svgProps}>
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
),
AlertCircle: () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
),
};

// A centred progress message for the panel's loading states
function StatusScreen({ message }: { message: string }) {
return (
  <div className="sp-screen" role="status">
    <div className="sp-screen-status">
      <span className="sp-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  </div>
);
}

// Login selector component for authentication
function LoginSelector({
authSystems,
onLogin,
error,
}: {
authSystems: Record<string, AuthSystem>;
onLogin: (systemId: string) => Promise<void>;
error: string | null;
}) {
const [isLoggingIn, setIsLoggingIn] = useState(false);
const [loginError, setLoginError] = useState<string | null>(null);

const systems = Object.values(authSystems);

const handleLogin = async (systemId: string) => {
  setIsLoggingIn(true);
  setLoginError(null);
  try {
    await onLogin(systemId);
  } catch (err) {
    setLoginError(err instanceof Error ? err.message : "Login failed");
  } finally {
    setIsLoggingIn(false);
  }
};

if (systems.length === 0) {
  return (
    <div className="sp-screen">
      <p className="sp-screen-subtitle">No authentication providers configured</p>
    </div>
  );
}

return (
  <div className="sp-screen">
    <div className="sp-screen-icon">
      <Icons.User />
    </div>
    <h3 className="sp-screen-title">Sign in to continue</h3>
    <p className="sp-screen-subtitle">Please sign in to access the chat</p>

    <div className="sp-stack">
      {(error || loginError) && (
        <div className="sp-alert" role="alert">
          <Icons.AlertCircle />
          <span>{error || loginError}</span>
        </div>
      )}
      {systems.map((system) => (
        <button
          key={system.id}
          type="button"
          onClick={() => handleLogin(system.id)}
          disabled={isLoggingIn}
          className="sp-btn"
        >
          {isLoggingIn ? "Signing in…" : system.title}
        </button>
      ))}
    </div>
  </div>
);
}

// Server URL prompt component (shown when baseUrl is not configured)
function ServerUrlPrompt({
onConnect,
}: {
onConnect: (url: string) => void;
}) {
const [url, setUrl] = useState("");
const [error, setError] = useState<string | null>(null);

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const trimmed = url.trim().replace(/\/+$/, ""); // Remove trailing slashes
  if (!trimmed) {
    setError("Please enter a server URL");
    return;
  }
  try {
    new URL(trimmed);
  } catch {
    setError("Please enter a valid URL (e.g. https://example.com)");
    return;
  }
  setError(null);
  onConnect(trimmed);
};

return (
  <div className="sp-screen">
    <div className="sp-screen-icon">
      <Icons.Server />
    </div>
    <h3 className="sp-screen-title">Connect to server</h3>
    <p className="sp-screen-subtitle">Enter the URL of the Soliplex server</p>

    <form onSubmit={handleSubmit} className="sp-stack" noValidate>
      <label htmlFor="soliplex-server-url" className="sp-label">
        Server URL
      </label>
      <input
        id="soliplex-server-url"
        type="url"
        inputMode="url"
        autoComplete="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com:8000"
        className="sp-field"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "soliplex-server-url-error" : undefined}
      />
      {error && (
        <div id="soliplex-server-url-error" className="sp-alert" role="alert">
          <Icons.AlertCircle />
          <span>{error}</span>
        </div>
      )}
      <button type="submit" className="sp-btn">
        Connect
      </button>
    </form>
  </div>
);
}

// Room selector component with dropdown
function RoomSelector({
rooms,
onSelect,
}: {
rooms: Room[];
onSelect: (room: Room) => void;
}) {
const [selectedId, setSelectedId] = useState<string>("");

if (rooms.length === 0) {
  return (
    <div className="sp-screen">
      <p className="sp-screen-subtitle">No rooms available</p>
    </div>
  );
}

const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  const roomId = e.target.value;
  setSelectedId(roomId);
  const room = rooms.find(r => r.id === roomId);
  if (room) {
    onSelect(room);
  }
};

return (
  <div className="sp-screen">
    <div className="sp-stack">
      <label htmlFor="soliplex-room-select" className="sp-label">
        Select a conversation
      </label>
      <select
        id="soliplex-room-select"
        value={selectedId}
        onChange={handleChange}
        className="sp-field"
      >
        <option value="" disabled>Choose a room…</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name} ({room.id})
          </option>
        ))}
      </select>
    </div>
  </div>
);
}

// Simplified Chat component for embedding
function ChatEmbed({
  baseUrl,
  room,
  tools,
  placeholder,
  getAccessToken,
  debug,
  persist,
  onRegisterReset,
}: {
  baseUrl: string;
  room: Room;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
  placeholder?: string;
  getAccessToken?: () => string | null;
  debug?: boolean;
  persist?: boolean;
  onRegisterReset?: (reset: () => void) => void;
}) {
  return (
    <Chat
      baseUrl={baseUrl}
      roomId={room.id}
      externalTools={tools}
      showHeader={false}
      // The configured message wins, then the room's own welcome message;
      // with neither, Chat falls back to its default.
      placeholder={placeholder || room.welcome_message || undefined}
      roomDescription={room.description}
      suggestions={room.suggestions}
      getAccessToken={getAccessToken}
      debug={debug}
      persist={persist}
      onRegisterReset={onRegisterReset}
      nested
    />
  );
}

export default ChatWidget;
