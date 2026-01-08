"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import Chat from "./Chat";
import { useAuth, type AuthSystem } from "@/hooks/useAuth";

// Room information from the API
export interface Room {
  id: string;
  name: string;
  description: string;
  welcome_message: string;
  suggestions: string[];
}

export interface ChatWidgetConfig {
  baseUrl: string;
  roomIds?: string[]; // Optional list of room IDs to show; if empty/undefined, show all
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
    const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [isLoadingRooms, setIsLoadingRooms] = useState(false);
    const [roomsError, setRoomsError] = useState<string | null>(null);

    const {
      baseUrl,
      roomIds,
      autoHideSeconds = 0,
      position = "bottom-right",
      bubbleColor = "#2563eb",
      title = "Chat with us",
      placeholder,
    } = config;

    // Authentication hook
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
    } = useAuth({ baseUrl });

    // Fetch available rooms when widget opens and user is authenticated (or auth not required)
    useEffect(() => {
      const canFetchRooms = isOpen && availableRooms.length === 0 && !isLoadingRooms;
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

        // Convert to array and filter if roomIds specified
        let rooms = Object.entries(roomsData).map(([id, room]) => ({
          ...room,
          id,
        }));

        // Filter to only specified roomIds if provided
        if (roomIds && roomIds.length > 0) {
          rooms = rooms.filter(room => roomIds.includes(room.id));
        }

        setAvailableRooms(rooms);

        // Auto-select if only one room
        if (rooms.length === 1) {
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
    }, []);

    const handleLogout = useCallback(() => {
      logout();
      // Clear room state so user sees login screen after logging out
      setAvailableRooms([]);
      setSelectedRoom(null);
      setRoomsError(null);
    }, [logout]);

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
              <div className="flex items-center gap-2">
                {selectedRoom && availableRooms.length > 1 && (
                  <button
                    onClick={handleBackToRooms}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                    aria-label="Back to rooms"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
                <span className="font-medium">
                  {selectedRoom ? selectedRoom.name : title}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* Logout button - only show when authenticated */}
                {isAuthenticated && (
                  <button
                    onClick={handleLogout}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                    aria-label="Logout"
                    title="Logout"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
                {/* Close button */}
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
            </div>

            {/* Content Area */}
            <div style={{ height: "calc(100% - 52px)" }}>
              {/* Auth loading state */}
              {isAuthLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-gray-500">Checking authentication...</div>
                </div>
              ) : /* Auth required but not authenticated */
              authRequired && !isAuthenticated ? (
                <LoginSelector
                  authSystems={authSystems}
                  onLogin={login}
                  error={authError}
                  bubbleColor={bubbleColor}
                />
              ) : isLoadingRooms ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-gray-500">Loading rooms...</div>
                </div>
              ) : roomsError ? (
                <div className="h-full flex flex-col items-center justify-center p-4">
                  <div className="text-red-700 text-center mb-4">{roomsError}</div>
                  <button
                    onClick={fetchRooms}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : selectedRoom ? (
                <ChatEmbed
                  baseUrl={baseUrl}
                  room={selectedRoom}
                  tools={tools}
                  placeholder={placeholder}
                  getAccessToken={getAccessToken}
                />
              ) : (
                <RoomSelector
                  rooms={availableRooms}
                  onSelect={setSelectedRoom}
                  bubbleColor={bubbleColor}
                />
              )}
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

// Login selector component for authentication
function LoginSelector({
  authSystems,
  onLogin,
  error,
  bubbleColor,
}: {
  authSystems: Record<string, AuthSystem>;
  onLogin: (systemId: string) => Promise<void>;
  error: string | null;
  bubbleColor: string;
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
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-gray-500 text-center">No authentication providers configured</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: bubbleColor }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-white"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: "#111827" }}>
        Sign in to continue
      </h3>
      <p className="text-sm text-center mb-4" style={{ color: "#6b7280" }}>
        Please sign in to access the chat
      </p>

      {(error || loginError) && (
        <div className="w-full max-w-xs mb-4 p-3 rounded-lg text-sm text-center"
          style={{ backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
          {error || loginError}
        </div>
      )}

      <div className="w-full max-w-xs space-y-2">
        {systems.map((system) => (
          <button
            key={system.id}
            onClick={() => handleLogin(system.id)}
            disabled={isLoggingIn}
            className="w-full p-3 rounded-lg text-white font-medium transition-all"
            style={{
              backgroundColor: isLoggingIn ? "#9ca3af" : bubbleColor,
              cursor: isLoggingIn ? "not-allowed" : "pointer",
            }}
          >
            {isLoggingIn ? "Signing in..." : system.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// Room selector component with dropdown
function RoomSelector({
  rooms,
  onSelect,
  bubbleColor,
}: {
  rooms: Room[];
  onSelect: (room: Room) => void;
  bubbleColor: string;
}) {
  const [selectedId, setSelectedId] = useState<string>("");

  if (rooms.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-gray-500 text-center">No rooms available</div>
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
    <div className="h-full p-4">
      <label
        htmlFor="room-select"
        className="block text-sm font-medium mb-2"
        style={{ color: "#374151" }}
      >
        Select a conversation:
      </label>
      <select
        id="room-select"
        value={selectedId}
        onChange={handleChange}
        className="w-full p-3 rounded-lg border text-base"
        style={{
          borderColor: "#d1d5db",
          backgroundColor: "#ffffff",
          color: "#111827",
          outline: "none",
        }}
      >
        <option value="" disabled>Choose a room...</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name} ({room.id})
          </option>
        ))}
      </select>
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
}) {
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  // Fetch background image when room changes
  useEffect(() => {
    let cancelled = false;

    const fetchBackgroundImage = async () => {
      const url = `${baseUrl}/api/v1/rooms/${room.id}/bg_image`;
      console.log('[ChatEmbed] Fetching background image:', url);
      try {
        const headers: Record<string, string> = {};
        const token = getAccessToken?.();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const response = await fetch(url, { headers });
        if (response.ok) {
          const blob = await response.blob();
          if (!cancelled) {
            const imageUrl = URL.createObjectURL(blob);
            setBackgroundImage(imageUrl);
          }
        } else {
          // No image available or error
          if (!cancelled) {
            setBackgroundImage(null);
          }
        }
      } catch {
        // Failed to fetch image
        if (!cancelled) {
          setBackgroundImage(null);
        }
      }
    };

    fetchBackgroundImage();

    return () => {
      cancelled = true;
      // Clean up the object URL when component unmounts or room changes
      if (backgroundImage) {
        URL.revokeObjectURL(backgroundImage);
      }
    };
  }, [baseUrl, room.id]);

  return (
    <div className="h-full">
      <Chat
        baseUrl={baseUrl}
        roomId={room.id}
        externalTools={tools}
        showHeader={false}
        placeholder={placeholder || room.welcome_message}
        roomDescription={room.description}
        suggestions={room.suggestions}
        backgroundImage={backgroundImage}
        getAccessToken={getAccessToken}
      />
    </div>
  );
}

export default ChatWidget;
