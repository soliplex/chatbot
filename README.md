# Soliplex Chat Widget

A React-based embeddable chat widget that connects to a Soliplex/PydanticAI backend using the AG-UI protocol. Supports OIDC authentication via popup flow.

**[Live Demo](https://soliplex.github.io/chatbot/)**

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build embeddable widget
npm run build:widget
```

## Embedding the Widget

Add to any HTML page:

```html
<script src="https://soliplex.github.io/chatbot/soliplex-chat.js"></script>
<script>
  SoliplexChat.init({
    baseUrl: "http://localhost:8000",
    title: "Chat with us",
    placeholder: "Ask me anything..."
  });
</script>
```

The widget will:
1. Check if authentication is required (fetches `/api/login`)
2. If auth is configured, show a login screen with available providers
3. After authentication (or if no auth required), fetch available rooms from `/api/v1/rooms`
4. Display a room selector if multiple rooms exist, or auto-select if only one

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | *required* | Backend API URL |
| `roomId` | string | `undefined` | Single room ID - skip room selection and go directly to this room |
| `roomIds` | string[] | `undefined` | Optional list of room IDs to show (filters the available rooms) |
| `title` | string | `"Chat with us"` | Chat header title |
| `placeholder` | string | `"Ask me anything..."` | Empty state message |
| `bubbleColor` | string | `"#2563eb"` | Chat bubble color |
| `position` | string | `"bottom-right"` | `"bottom-right"` or `"bottom-left"` |
| `autoHideSeconds` | number | `0` | Auto-hide delay (0 = never) |
| `tools` | array | `[]` | Custom client-side tools |

**Note:** If `roomId` is set, the widget will skip the room selector and go directly to the specified room after authentication (if auth is enabled).

## Authentication

The widget supports OIDC authentication through the Soliplex backend. When auth systems are configured on the backend:

1. The widget fetches available auth providers from `/api/login`
2. User clicks a provider button to start OAuth flow
3. A popup window opens for authentication (no page redirect)
4. On success, tokens are passed back to the widget via `postMessage`
5. All subsequent API calls include the Bearer token

### Auth Callback Page

For the popup flow to work, the widget bundle includes a callback page (`soliplex-auth-callback.html`) that must be served from the same origin as the widget. This page captures tokens from URL parameters and sends them to the parent window.

### Backend Configuration

Enable OIDC on the backend by creating a config file (e.g., `oidc/config.yaml`):

```yaml
oidc_client_pem_path: "./cacert.pem"

auth_systems:
  - id: "keycloak"
    title: "Sign in with Keycloak"
    server_url: "https://your-keycloak.example.com/realms/your-realm"
    client_id: "your-client-id"
    client_secret: "your-client-secret"
    scope: "openid email profile"
    token_validation_pem: |
        -----BEGIN PUBLIC KEY-----
        ...your public key...
        -----END PUBLIC KEY-----
```

## Development with Docker

For local testing with the nginx proxy (handles CORS and auth redirects):

```bash
docker compose up
```

This starts:
- `soliplex_backend` on port 8000
- `chatbot_widget` (nginx) on port 8080 serving the widget files

Access the widget at `http://localhost:8080`

## Documentation

- [Development Guide](docs/readme.md) - Setup, architecture, and customization
- [Widget Usage Guide](docs/usage.md) - Embedding examples and tool definitions

## License

MIT
