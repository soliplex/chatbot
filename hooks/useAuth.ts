// hooks/useAuth.ts
// React hook for Soliplex authentication

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AuthService, AuthSystem, AuthTokens, UserInfo } from "@/lib/auth-service";

export type { AuthSystem, AuthTokens, UserInfo };

interface UseAuthOptions {
  baseUrl: string;
  /** Auto-check if auth is required on mount */
  autoCheck?: boolean;
  /** Callback when auth state changes */
  onAuthChange?: (authenticated: boolean) => void;
}

interface UseAuthResult {
  /** Whether authentication is being checked */
  isLoading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth is required (OIDC systems are configured) */
  authRequired: boolean | null;
  /** Available authentication systems */
  authSystems: Record<string, AuthSystem>;
  /** Current user info (if authenticated) */
  userInfo: UserInfo | null;
  /** Error message if any */
  error: string | null;
  /** Login with a specific auth system */
  login: (systemId: string) => Promise<void>;
  /** Logout the user */
  logout: () => void;
  /** Get the current access token */
  getAccessToken: () => string | null;
  /** Refresh auth check */
  checkAuth: () => Promise<void>;
}

export function useAuth({
  baseUrl,
  autoCheck = true,
  onAuthChange,
}: UseAuthOptions): UseAuthResult {
  const [isLoading, setIsLoading] = useState(autoCheck);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [authSystems, setAuthSystems] = useState<Record<string, AuthSystem>>({});
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create auth service instance
  const authService = useMemo(() => new AuthService(baseUrl), [baseUrl]);

  // Set up auth change callback
  useEffect(() => {
    authService.setOnAuthChange((authenticated) => {
      setIsAuthenticated(authenticated);
      if (!authenticated) {
        setUserInfo(null);
      }
      onAuthChange?.(authenticated);
    });
  }, [authService, onAuthChange]);

  // Check for redirect callback tokens on mount
  useEffect(() => {
    const tokens = authService.handleRedirectCallback();
    if (tokens) {
      setIsAuthenticated(true);
      // Fetch user info
      authService.getUserInfo().then(info => {
        if (info) setUserInfo(info);
      });
    }
  }, [authService]);

  // Check if auth is required and fetch auth systems
  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch available auth systems
      const systems = await authService.getAuthSystems();
      setAuthSystems(systems);

      // Auth is required if there are any configured systems
      const required = Object.keys(systems).length > 0;
      setAuthRequired(required);

      // Check current auth state
      const authenticated = authService.isAuthenticated();
      setIsAuthenticated(authenticated);

      // Fetch user info if authenticated
      if (authenticated) {
        const info = await authService.getUserInfo();
        setUserInfo(info);
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      setError(err instanceof Error ? err.message : "Failed to check authentication");
      // If we can't fetch auth systems, assume auth is not required
      setAuthRequired(false);
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  // Auto-check on mount
  useEffect(() => {
    if (autoCheck) {
      checkAuth();
    }
  }, [autoCheck, checkAuth]);

  // Login function
  const login = useCallback(
    async (systemId: string) => {
      setError(null);
      setIsLoading(true);

      try {
        await authService.loginWithPopup(systemId);
        setIsAuthenticated(true);

        // Fetch user info after login
        const info = await authService.getUserInfo();
        setUserInfo(info);
      } catch (err) {
        console.error("Login failed:", err);
        setError(err instanceof Error ? err.message : "Login failed");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [authService]
  );

  // Logout function
  const logout = useCallback(() => {
    authService.logout();
    setIsAuthenticated(false);
    setUserInfo(null);
  }, [authService]);

  // Get access token
  const getAccessToken = useCallback(() => {
    return authService.getAccessToken();
  }, [authService]);

  return {
    isLoading,
    isAuthenticated,
    authRequired,
    authSystems,
    userInfo,
    error,
    login,
    logout,
    getAccessToken,
    checkAuth,
  };
}
