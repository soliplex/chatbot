// lib/auth-service.ts
// Authentication service using soliplex OIDC endpoints with popup flow

export interface AuthSystem {
  id: string;
  title: string;
  server_url: string;
  client_id: string;
  scope: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
}

export interface UserInfo {
  sub?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  [key: string]: unknown;
}

// Message types for popup communication
interface AuthSuccessMessage {
  type: "soliplex-auth-success";
  tokens: AuthTokens;
}

interface AuthErrorMessage {
  type: "soliplex-auth-error";
  error: string;
}

type AuthMessage = AuthSuccessMessage | AuthErrorMessage;

// Storage key for persisting auth state
const STORAGE_KEY = "soliplex-auth";

interface StoredAuthState {
  tokens: AuthTokens;
  tokenExpiresAt: number | null;
}

export class AuthService {
  private baseUrl: string;
  private tokens: AuthTokens | null = null;
  private userInfo: UserInfo | null = null;
  private tokenExpiresAt: number | null = null;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private onAuthChange?: (authenticated: boolean) => void;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.loadFromStorage();
  }

  /**
   * Load tokens from localStorage if available and not expired
   */
  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const state: StoredAuthState = JSON.parse(stored);

      // Check if token is expired
      if (state.tokenExpiresAt && Date.now() >= state.tokenExpiresAt) {
        // Token expired, clear storage
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.tokens = state.tokens;
      this.tokenExpiresAt = state.tokenExpiresAt;

      // Schedule refresh if we have expiry info
      if (this.tokenExpiresAt && state.tokens.refreshToken) {
        const refreshIn = this.tokenExpiresAt - Date.now() - 60000; // 1 minute before expiry
        if (refreshIn > 0) {
          this.scheduleTokenRefresh(refreshIn);
        }
      }
    } catch (error) {
      console.error("Failed to load auth state from storage:", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Save tokens to localStorage
   */
  private saveToStorage() {
    if (!this.tokens) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    try {
      const state: StoredAuthState = {
        tokens: this.tokens,
        tokenExpiresAt: this.tokenExpiresAt,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Failed to save auth state to storage:", error);
    }
  }

  /**
   * Clear stored auth state
   */
  private clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear auth state from storage:", error);
    }
  }

  /**
   * Set callback for authentication state changes
   */
  setOnAuthChange(callback: (authenticated: boolean) => void) {
    this.onAuthChange = callback;
  }

  /**
   * Fetch available authentication systems from /api/login
   */
  async getAuthSystems(): Promise<Record<string, AuthSystem>> {
    const response = await fetch(`${this.baseUrl}/api/login`);
    if (!response.ok) {
      throw new Error(`Failed to fetch auth systems: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Check if authentication is required (auth systems are configured)
   */
  async isAuthRequired(): Promise<boolean> {
    try {
      const systems = await this.getAuthSystems();
      return Object.keys(systems).length > 0;
    } catch {
      // If we can't fetch auth systems, assume auth is not required
      return false;
    }
  }

  /**
   * Start the OAuth flow in a popup window
   */
  async loginWithPopup(systemId: string): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      // Generate a unique callback identifier
      const callbackId = crypto.randomUUID();

      // Build the callback URL - points to our callback page
      // The callback page will be embedded in the widget bundle
      const callbackUrl = this.buildCallbackUrl(callbackId);

      // Build the login URL
      const loginUrl = `${this.baseUrl}/api/login/${systemId}?return_to=${encodeURIComponent(callbackUrl)}`;

      // Open popup window
      const popupWidth = 500;
      const popupHeight = 600;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const popup = window.open(
        loginUrl,
        "soliplex-auth-popup",
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
      );

      if (!popup) {
        reject(new Error("Failed to open authentication popup. Please allow popups for this site."));
        return;
      }

      // Set up message listener for the popup callback
      const messageHandler = (event: MessageEvent) => {
        // Validate origin - accept messages from our base URL or same origin
        const expectedOrigins = [
          this.baseUrl,
          window.location.origin,
        ];

        if (!expectedOrigins.some(origin => event.origin === origin || event.origin === new URL(origin).origin)) {
          return; // Ignore messages from other origins
        }

        const data = event.data as AuthMessage;

        if (data.type === "soliplex-auth-success") {
          window.removeEventListener("message", messageHandler);
          clearInterval(pollInterval);
          popup.close();

          this.setTokens(data.tokens);
          resolve(data.tokens);
        } else if (data.type === "soliplex-auth-error") {
          window.removeEventListener("message", messageHandler);
          clearInterval(pollInterval);
          popup.close();

          reject(new Error(data.error));
        }
      };

      window.addEventListener("message", messageHandler);

      // Poll to check if popup was closed manually
      const pollInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollInterval);
          window.removeEventListener("message", messageHandler);
          reject(new Error("Authentication cancelled"));
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        window.removeEventListener("message", messageHandler);
        if (!popup.closed) {
          popup.close();
        }
        reject(new Error("Authentication timed out"));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Build the callback URL that the popup will redirect to
   * The callback page must be served from the same origin as the widget
   */
  private buildCallbackUrl(_callbackId: string): string {
    // The callback page is served alongside the widget bundle
    // It captures tokens from URL params and sends them to the parent window
    // Use the same directory path as the current page (e.g., /chatbot/ on GitHub Pages)
    const pathParts = window.location.pathname.split('/');
    pathParts.pop();
    const basePath = pathParts.join('/') || '';
    return `${window.location.origin}${basePath}/soliplex-auth-callback.html`;
  }

  /**
   * Alternative: Login by opening in same window (full redirect)
   * This is simpler but navigates away from the current page
   */
  loginWithRedirect(systemId: string, returnTo?: string): void {
    const callbackUrl = returnTo || window.location.href;
    const loginUrl = `${this.baseUrl}/api/login/${systemId}?return_to=${encodeURIComponent(callbackUrl)}`;
    window.location.href = loginUrl;
  }

  /**
   * Handle the redirect callback (for full-page redirect flow)
   * Call this on page load to check for tokens in URL
   */
  handleRedirectCallback(): AuthTokens | null {
    const params = new URLSearchParams(window.location.search);

    const token = params.get("token");
    if (!token) {
      return null;
    }

    const tokens: AuthTokens = {
      accessToken: token,
      refreshToken: params.get("refresh_token") || undefined,
      expiresIn: params.get("expires_in") ? parseInt(params.get("expires_in")!, 10) : undefined,
      refreshExpiresIn: params.get("refresh_expires_in") ? parseInt(params.get("refresh_expires_in")!, 10) : undefined,
    };

    this.setTokens(tokens);

    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    url.searchParams.delete("refresh_token");
    url.searchParams.delete("expires_in");
    url.searchParams.delete("refresh_expires_in");
    window.history.replaceState({}, "", url.toString());

    return tokens;
  }

  /**
   * Store tokens and set up refresh timer
   */
  private setTokens(tokens: AuthTokens) {
    this.tokens = tokens;

    if (tokens.expiresIn) {
      this.tokenExpiresAt = Date.now() + tokens.expiresIn * 1000;

      // Set up refresh timer (refresh 1 minute before expiry)
      const refreshIn = (tokens.expiresIn - 60) * 1000;
      if (refreshIn > 0 && tokens.refreshToken) {
        this.scheduleTokenRefresh(refreshIn);
      }
    }

    // Persist to localStorage
    this.saveToStorage();

    this.onAuthChange?.(true);
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(delayMs: number) {
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
    }

    this.refreshTimeoutId = setTimeout(async () => {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        console.error("Token refresh failed:", error);
        this.logout();
      }
    }, delayMs);
  }

  /**
   * Refresh the access token using the refresh token
   * Note: This requires a token refresh endpoint on the backend
   */
  async refreshAccessToken(): Promise<AuthTokens | null> {
    if (!this.tokens?.refreshToken) {
      return null;
    }

    // The soliplex backend would need a refresh endpoint
    // For now, we'll require re-authentication
    console.warn("Token refresh not implemented - user will need to re-authenticate");
    return null;
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    if (!this.tokens) {
      return null;
    }

    // Check if token is expired
    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) {
      return null;
    }

    return this.tokens.accessToken;
  }

  /**
   * Get the current tokens
   */
  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  /**
   * Fetch user info from the backend
   */
  async getUserInfo(): Promise<UserInfo | null> {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }

    if (this.userInfo) {
      return this.userInfo;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/user_info`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token invalid, clear auth state
          this.logout();
          return null;
        }
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      this.userInfo = await response.json();
      return this.userInfo;
    } catch (error) {
      console.error("Failed to fetch user info:", error);
      return null;
    }
  }

  /**
   * Check if the user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  /**
   * Log out the user
   */
  logout() {
    this.tokens = null;
    this.userInfo = null;
    this.tokenExpiresAt = null;

    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }

    // Clear persisted state
    this.clearStorage();

    this.onAuthChange?.(false);
  }
}

/**
 * Parse tokens from URL (used by callback page)
 */
export function parseTokensFromUrl(url: string = window.location.href): AuthTokens | null {
  const urlObj = new URL(url);
  const params = new URLSearchParams(urlObj.search);

  const token = params.get("token");
  if (!token) {
    return null;
  }

  return {
    accessToken: token,
    refreshToken: params.get("refresh_token") || undefined,
    expiresIn: params.get("expires_in") ? parseInt(params.get("expires_in")!, 10) : undefined,
    refreshExpiresIn: params.get("refresh_expires_in") ? parseInt(params.get("refresh_expires_in")!, 10) : undefined,
  };
}

/**
 * Send tokens to parent window (used by callback page)
 */
export function sendTokensToParent(tokens: AuthTokens) {
  if (window.opener) {
    window.opener.postMessage(
      { type: "soliplex-auth-success", tokens },
      "*" // The parent will validate the message content
    );
  }
}

/**
 * Send error to parent window (used by callback page)
 */
export function sendErrorToParent(error: string) {
  if (window.opener) {
    window.opener.postMessage(
      { type: "soliplex-auth-error", error },
      "*"
    );
  }
}
