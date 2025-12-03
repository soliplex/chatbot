**[Live Demo](https://soliplex.github.io/chatbot/embed-example.html)**

# Soliplex Chat Widget

A React-based embeddable chat widget that connects to a Soliplex/PydanticAI backend using the AG-UI protocol.

## Project Structure

```
/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Main page (standalone chat UI)
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles (Tailwind)
├── components/
│   ├── Chat.tsx           # Core chat component
│   └── ChatWidget.tsx     # Floating widget wrapper
├── hooks/
│   └── useAGUIChat.ts     # Chat state management hook
├── lib/
│   └── agui-client.ts     # AG-UI protocol client
├── widget/
│   └── index.tsx          # Embeddable widget entry point
├── public/
│   ├── soliplex-chat.js   # Built widget bundle (after build)
│   └── embed-example.html # Example embed page
├── docs/
│   ├── readme.md          # This file
│   └── usage.md           # Widget usage guide
├── esbuild.config.mjs     # Widget build configuration
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## Prerequisites

- Node.js 18+
- npm or yarn
- A running Soliplex backend (default: `http://localhost:8000`)

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env.local` file:

```bash
# Backend API URL
NEXT_PUBLIC_AGUI_BASE_URL=http://localhost:8000
```

### 3. Start Development Server

```bash
npm run dev
```

This starts the Next.js development server at `http://localhost:3000`.

### 4. Start the Backend

In a separate terminal, start your Soliplex backend:

```bash
cd /path/to/soliplex
uvicorn soliplex.main:app --reload --port 8000
```

### 5. Open in Browser

Navigate to `http://localhost:3000` to see the standalone chat interface.

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server with hot reload |
| `npm run build` | Build Next.js app for production |
| `npm run start` | Start production Next.js server |
| `npm run lint` | Run ESLint |
| `npm run build:widget` | Build embeddable widget bundle |
| `npm run build:widget:watch` | Build widget with watch mode |

## Building for Production

### Option 1: Next.js App

Build and deploy as a standard Next.js application:

```bash
npm run build
npm run start
```

### Option 2: Embeddable Widget

Build a standalone JavaScript bundle that can be embedded in any website:

```bash
npm run build:widget
```

This creates `public/soliplex-chat.js` (~200KB minified).

#### Widget Build Output

```
public/
├── soliplex-chat.js      # Main bundle (minified)
└── soliplex-chat.js.map  # Source map (for debugging)
```

#### Serving the Widget

You can serve the widget from:

1. **Your CDN** - Upload to S3, CloudFront, Cloudflare, etc.
2. **Your backend** - Serve from your FastAPI static files
3. **npm package** - Publish as an npm package

Example FastAPI static file serving:

```python
from fastapi.staticfiles import StaticFiles

app.mount("/static", StaticFiles(directory="static"), name="static")
# Widget available at: https://your-api.com/static/soliplex-chat.js
```

## Widget Development

### Watch Mode

For rapid widget development:

```bash
npm run build:widget:watch
```

Then serve the `public/` directory and open `embed-example.html`:

```bash
# In another terminal
cd public
python -m http.server 8080
# Open http://localhost:8080/embed-example.html
```

### Testing Changes

1. Make changes to widget code
2. Watch mode rebuilds automatically
3. Refresh the embed example page

## Architecture

### AG-UI Protocol Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │     │   Backend   │     │   LLM API   │
│  (Widget)   │     │  (FastAPI)  │     │  (Claude)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ POST /agui       │                   │
       │ (create thread)   │                   │
       │──────────────────>│                   │
       │<──────────────────│                   │
       │ { thread_id, run_id }                 │
       │                   │                   │
       │ POST /agui/{thread}/{run}             │
       │ (RunAgentInput)   │                   │
       │──────────────────>│                   │
       │                   │ Stream request    │
       │                   │──────────────────>│
       │                   │                   │
       │    SSE Stream     │<──────────────────│
       │<──────────────────│  Stream response  │
       │                   │                   │
       │ TEXT_MESSAGE_START│                   │
       │ TEXT_MESSAGE_CONTENT (delta)          │
       │ TEXT_MESSAGE_END  │                   │
       │ TOOL_CALL_START   │                   │
       │ TOOL_CALL_ARGS    │                   │
       │ TOOL_CALL_END     │                   │
       │ RUN_FINISHED      │                   │
       │                   │                   │
```

### Client-Side Tool Execution

When the AI requests a tool call:

1. `TOOL_CALL_START` - Widget receives tool name and ID
2. `TOOL_CALL_ARGS` - Widget accumulates JSON arguments
3. `TOOL_CALL_END` - Widget executes the local handler
4. Result is displayed in chat (future: sent back to continue conversation)

### Key Files

- **`lib/agui-client.ts`** - Low-level AG-UI protocol implementation
- **`hooks/useAGUIChat.ts`** - React hook managing chat state and streaming
- **`components/Chat.tsx`** - Chat UI with message rendering
- **`components/ChatWidget.tsx`** - Floating bubble wrapper
- **`widget/index.tsx`** - Standalone bundle entry point

## Customization

### Styling

The widget includes embedded CSS to work without external dependencies. To customize:

1. **Widget bundle** - Modify styles in `widget/index.tsx` `injectStyles()` function
2. **Next.js app** - Edit `app/globals.css` and Tailwind config

### Adding Built-in Tools

Edit `components/Chat.tsx` `useClientTools()` to add tools available to all users:

```typescript
function useClientTools(): ToolDefinition[] {
  return useMemo(() => [
    // Existing get_current_time tool...
    {
      name: "my_new_tool",
      description: "Description for the AI",
      parameters: { /* JSON Schema */ },
      handler: async (args) => {
        // Implementation
        return { result: "..." };
      }
    }
  ], []);
}
```

### Theming

The widget accepts a `bubbleColor` prop. For deeper theming, modify the `ChatWidget.tsx` component or extend the configuration.

## Troubleshooting

### "Failed to create thread" Error

- Verify backend is running at the configured `baseUrl`
- Check CORS settings on the backend
- Ensure the room exists and user has access

### No Messages Appearing

- Check browser console for event type mismatches
- Verify backend sends UPPERCASE event types (`TEXT_MESSAGE_START`, not `text_message_start`)
- Check that `messageId` field exists in events (not `message_id`)

### Widget Not Rendering

- Ensure `SoliplexChat.init()` is called after the script loads
- Check for JavaScript errors in console
- Verify container element doesn't have conflicting CSS

### Tool Not Executing

- Confirm handler function exists before `init()` is called
- Check the handler path is correct (e.g., `"window.myTools.func"` vs `"myTools.func"`)
- Ensure handler is async or returns a Promise

## Related Documentation

- [Widget Usage Guide](./usage.md) - Embedding and tool examples
- [AG-UI Protocol](https://github.com/ag-ui-org/ag-ui) - Protocol specification
- [PydanticAI](https://ai.pydantic.dev/) - Backend agent framework
