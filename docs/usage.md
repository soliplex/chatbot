# Soliplex Chat Widget - Usage Guide

This guide explains how to embed the Soliplex Chat widget into any website.

## Quick Start

Add the following to your HTML page:

```html
<script src="https://your-domain.com/soliplex-chat.js"></script>
<script>
  SoliplexChat.init({
    baseUrl: "https://my-server.example.com"
  });
</script>
```

That's it! A chat bubble will appear in the bottom-right corner of your page. When clicked, users will see a list of available chat rooms to choose from.

If you omit `baseUrl`, the widget will prompt the user to enter a server URL when opened:

```html
<script>
  SoliplexChat.init({
    title: "Connect to Chat"
  });
</script>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | `undefined` | Backend API URL. If omitted, the widget prompts the user for a server URL |
| `roomIds` | string[] | `[]` | Room IDs to show; empty or omit to show all available rooms |
| `autoHideSeconds` | number | `0` | Seconds until bubble auto-hides (0 = never hide) |
| `position` | string | `"bottom-right"` | `"bottom-right"` or `"bottom-left"` |
| `bubbleColor` | string | `"#2563eb"` | CSS color for the chat bubble |
| `title` | string | `"Chat with us"` | Title shown in the chat header (room selector screen) |
| `placeholder` | string | - | Placeholder text for empty chat (overrides room's welcome message) |
| `persist` | boolean | `true` | Save the thread id, message history, open state, and selected room in `localStorage` so the widget reopens in the same room and the conversation resumes after a page reload. Use the header's **Start new conversation** button (or set to `false`) to start fresh |
| `debug` | boolean | `false` | Render raw client-side tool-call results as JSON in the chat |
| `tools` | array | `[]` | Custom client-side tools (see below) |
| `containerId` | string | `"soliplex-chat-widget"` | DOM element ID for the widget container |

> **Note:** The `roomId` option is still supported for backwards compatibility and will be converted to `roomIds: [roomId]`.

### Example with All Options

```html
<script src="https://your-domain.com/soliplex-chat.js"></script>
<script>
  SoliplexChat.init({
    baseUrl: "https://api.example.com",
    roomIds: ["support", "sales"],  // Only show these rooms
    autoHideSeconds: 30,
    position: "bottom-left",
    bubbleColor: "#10b981",
    title: "Need help?",
    containerId: "my-chat-widget"
  });
</script>
```

### Room Selection Behavior

The widget fetches available rooms from `GET /api/v1/rooms` when opened:

- **No `roomIds` specified**: Shows all available rooms from the backend
- **`roomIds` with multiple IDs**: Shows only those rooms, user picks one
- **`roomIds` with single ID**: Auto-selects that room, skips room selection
- **`roomIds` with IDs not in backend**: Those rooms are filtered out

Once a room is selected, the header shows the room's name and a back button (if multiple rooms are available) to return to room selection.

## API Methods

### `SoliplexChat.init(config)`

Initializes the widget with the given configuration. Can only be called once. Call `destroy()` first if you need to reinitialize.

### `SoliplexChat.open()`

Programmatically opens the chat panel.

```javascript
document.getElementById('help-button').addEventListener('click', () => {
  SoliplexChat.open();
});
```

### `SoliplexChat.close()`

Programmatically closes the chat panel.

### `SoliplexChat.destroy()`

Completely removes the widget from the page. Useful for cleanup or reinitializing with different config.

```javascript
// Change configuration
SoliplexChat.destroy();
SoliplexChat.init({ ...newConfig });
```

## Auto-Hide Feature

Set `autoHideSeconds` to automatically hide the bubble after a period of inactivity:

```javascript
SoliplexChat.init({
  baseUrl: "https://my-server.example.com",
  autoHideSeconds: 15  // Hide after 15 seconds if user hasn't interacted
});
```

The bubble will reappear when the user moves their mouse near the corner where it was positioned.

## Client-Side Tools

Tools allow the AI agent to execute JavaScript functions in the user's browser. This is useful for:

- Getting information from the current page
- Interacting with your application's state
- Performing client-side actions

### Tool Definition Structure

```javascript
{
  name: "tool_name",           // Unique identifier (snake_case recommended)
  description: "...",          // What the tool does (helps the AI decide when to use it)
  parameters: {                // JSON Schema for the tool's arguments
    type: "object",
    properties: {
      param1: { type: "string", description: "..." },
      param2: { type: "number", description: "..." }
    },
    required: ["param1"]       // Optional: list of required parameters
  },
  handler: "path.to.function"  // String path OR inline function
}
```

### Handler Types

**String Reference** - Points to a function on the `window` object:

```javascript
window.myApp = {
  tools: {
    getUser: async () => ({ name: "John", email: "john@example.com" })
  }
};

// In config:
handler: "myApp.tools.getUser"
```

**Inline Function** - Define the handler directly:

```javascript
handler: async (args) => {
  return { result: args.value * 2 };
}
```

---

## Examples

### Example 1: Page Information Tool

Get information about the current page:

```html
<script src="soliplex-chat.js"></script>
<script>
  window.pageTools = {
    getPageInfo: async () => ({
      title: document.title,
      url: window.location.href,
      referrer: document.referrer,
      scrollPosition: window.scrollY,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight
    })
  };

  SoliplexChat.init({
    baseUrl: "https://my-server.example.com",
    roomIds: ["support"],
    tools: [
      {
        name: "get_page_info",
        description: "Get information about the current page including URL, title, and scroll position",
        parameters: { type: "object", properties: {} },
        handler: "pageTools.getPageInfo"
      }
    ]
  });
</script>
```

### Example 2: E-commerce Tools

Tools for an e-commerce site:

```html
<script src="soliplex-chat.js"></script>
<script>
  window.shopTools = {
    getCart: async () => {
      // Your cart implementation
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      return {
        items: cart,
        itemCount: cart.length,
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
      };
    },

    addToCart: async ({ productId, quantity = 1 }) => {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const existing = cart.find(item => item.productId === productId);

      if (existing) {
        existing.quantity += quantity;
      } else {
        // Fetch product details from your API
        cart.push({ productId, quantity, price: 29.99, name: `Product ${productId}` });
      }

      localStorage.setItem('cart', JSON.stringify(cart));
      return { success: true, cartSize: cart.length };
    },

    searchProducts: async ({ query, category }) => {
      // Mock search - replace with your API
      return {
        results: [
          { id: "1", name: "Blue T-Shirt", price: 29.99, category: "clothing" },
          { id: "2", name: "Red Sneakers", price: 89.99, category: "shoes" }
        ].filter(p =>
          p.name.toLowerCase().includes(query.toLowerCase()) &&
          (!category || p.category === category)
        )
      };
    }
  };

  SoliplexChat.init({
    baseUrl: "https://my-server.example.com",
    roomIds: ["shop-assistant"],
    bubbleColor: "#f97316",
    title: "Shopping Assistant",
    tools: [
      {
        name: "get_cart",
        description: "Get the current shopping cart contents and total",
        parameters: { type: "object", properties: {} },
        handler: "shopTools.getCart"
      },
      {
        name: "add_to_cart",
        description: "Add a product to the shopping cart",
        parameters: {
          type: "object",
          properties: {
            productId: {
              type: "string",
              description: "The product ID to add"
            },
            quantity: {
              type: "number",
              description: "Quantity to add (default: 1)"
            }
          },
          required: ["productId"]
        },
        handler: "shopTools.addToCart"
      },
      {
        name: "search_products",
        description: "Search for products by name or category",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query"
            },
            category: {
              type: "string",
              description: "Optional category filter"
            }
          },
          required: ["query"]
        },
        handler: "shopTools.searchProducts"
      }
    ]
  });
</script>
```

### Example 3: Form Helper Tools

Tools to help users fill out forms:

```html
<script src="soliplex-chat.js"></script>
<script>
  window.formTools = {
    getFormFields: async () => {
      const form = document.querySelector('form');
      if (!form) return { error: "No form found on page" };

      const fields = Array.from(form.elements)
        .filter(el => el.name)
        .map(el => ({
          name: el.name,
          type: el.type,
          label: document.querySelector(`label[for="${el.id}"]`)?.textContent || el.name,
          value: el.value,
          required: el.required
        }));

      return { fields };
    },

    fillField: async ({ fieldName, value }) => {
      const field = document.querySelector(`[name="${fieldName}"]`);
      if (!field) return { error: `Field "${fieldName}" not found` };

      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true, field: fieldName, newValue: value };
    },

    validateForm: async () => {
      const form = document.querySelector('form');
      if (!form) return { error: "No form found" };

      const errors = [];
      form.querySelectorAll('[required]').forEach(field => {
        if (!field.value.trim()) {
          errors.push({
            field: field.name,
            message: `${field.name} is required`
          });
        }
      });

      return {
        valid: errors.length === 0,
        errors
      };
    }
  };

  SoliplexChat.init({
    baseUrl: "https://my-server.example.com",
    roomIds: ["form-helper"],
    title: "Form Assistant",
    tools: [
      {
        name: "get_form_fields",
        description: "Get all form fields on the current page with their labels and values",
        parameters: { type: "object", properties: {} },
        handler: "formTools.getFormFields"
      },
      {
        name: "fill_field",
        description: "Fill a form field with a value",
        parameters: {
          type: "object",
          properties: {
            fieldName: { type: "string", description: "The name attribute of the field" },
            value: { type: "string", description: "The value to set" }
          },
          required: ["fieldName", "value"]
        },
        handler: "formTools.fillField"
      },
      {
        name: "validate_form",
        description: "Check if all required form fields are filled",
        parameters: { type: "object", properties: {} },
        handler: "formTools.validateForm"
      }
    ]
  });
</script>
```

### Example 4: User Context Tools

Tools that provide user context to the AI:

```html
<script src="soliplex-chat.js"></script>
<script>
  window.userTools = {
    getUserInfo: async () => {
      // Get from your auth system
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      return user ? {
        loggedIn: true,
        name: user.name,
        email: user.email,
        memberSince: user.createdAt,
        plan: user.subscription
      } : {
        loggedIn: false
      };
    },

    getPreferences: async () => {
      return {
        theme: localStorage.getItem('theme') || 'light',
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notifications: localStorage.getItem('notifications') === 'true'
      };
    },

    getBrowserInfo: async () => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      screenSize: `${screen.width}x${screen.height}`,
      windowSize: `${window.innerWidth}x${window.innerHeight}`
    })
  };

  SoliplexChat.init({
    baseUrl: "https://my-server.example.com",
    roomIds: ["support"],
    tools: [
      {
        name: "get_user_info",
        description: "Get information about the currently logged in user",
        parameters: { type: "object", properties: {} },
        handler: "userTools.getUserInfo"
      },
      {
        name: "get_preferences",
        description: "Get the user's preferences and settings",
        parameters: { type: "object", properties: {} },
        handler: "userTools.getPreferences"
      },
      {
        name: "get_browser_info",
        description: "Get technical information about the user's browser for debugging",
        parameters: { type: "object", properties: {} },
        handler: "userTools.getBrowserInfo"
      }
    ]
  });
</script>
```

### Example 5: Navigation Tools

Tools to help users navigate your site:

```html
<script src="soliplex-chat.js"></script>
<script>
  window.navTools = {
    navigateTo: async ({ path }) => {
      window.location.href = path;
      return { navigating: true, destination: path };
    },

    scrollToSection: async ({ sectionId }) => {
      const element = document.getElementById(sectionId);
      if (!element) return { error: `Section "${sectionId}" not found` };

      element.scrollIntoView({ behavior: 'smooth' });
      return { success: true, scrolledTo: sectionId };
    },

    getSiteMap: async () => {
      // Return your site structure
      return {
        pages: [
          { path: "/", name: "Home" },
          { path: "/products", name: "Products" },
          { path: "/about", name: "About Us" },
          { path: "/contact", name: "Contact" },
          { path: "/faq", name: "FAQ" }
        ]
      };
    },

    highlightElement: async ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) return { error: "Element not found" };

      const originalOutline = element.style.outline;
      element.style.outline = "3px solid #2563eb";
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      setTimeout(() => {
        element.style.outline = originalOutline;
      }, 3000);

      return { success: true, highlighted: selector };
    }
  };

  SoliplexChat.init({
    baseUrl: "https://my-server.example.com",
    roomIds: ["navigator"],
    title: "Site Guide",
    tools: [
      {
        name: "navigate_to",
        description: "Navigate to a different page on the site",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "The URL path to navigate to" }
          },
          required: ["path"]
        },
        handler: "navTools.navigateTo"
      },
      {
        name: "scroll_to_section",
        description: "Scroll to a specific section on the current page",
        parameters: {
          type: "object",
          properties: {
            sectionId: { type: "string", description: "The ID of the section to scroll to" }
          },
          required: ["sectionId"]
        },
        handler: "navTools.scrollToSection"
      },
      {
        name: "get_site_map",
        description: "Get a list of all pages on the site",
        parameters: { type: "object", properties: {} },
        handler: "navTools.getSiteMap"
      },
      {
        name: "highlight_element",
        description: "Highlight an element on the page to show the user where something is",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector for the element to highlight" }
          },
          required: ["selector"]
        },
        handler: "navTools.highlightElement"
      }
    ]
  });
</script>
```

## Built-in Tools

The widget includes a built-in `get_current_time` tool that returns the current time in the user's local timezone. This is automatically available without any configuration.

## Plone Integration

A ready-made set of Plone tools ships as a companion script, `plone_soliplex_tool.js`, served alongside the widget bundle. It exposes a small [plone.restapi](https://plonerestapi.readthedocs.io/) client on `window.PloneSoliplex` and a set of tool definitions the agent can use to work with the logged-in user's content.

### Quick Start

```html
<script src="soliplex-chat.js"></script>
<script src="plone_soliplex_tool.js"></script>
<script>
  SoliplexChat.init({
    baseUrl: "https://soliplex.example.com",
    roomId: "assistant",
    tools: PloneSoliplex.getToolDefinitions(),
  });
</script>
```

Once wired up, users can ask questions such as **"What are the most recent changes in my folder?"** — the agent calls `plone_get_current_user` to identify the user, then `plone_recent_changes_in_my_folder` to list the most recently modified content.

### Provided Tools

| Tool | Description |
|------|-------------|
| `plone_get_current_user` | Id, full name, email and roles of the logged-in user |
| `plone_recent_changes_in_my_folder` | Most recently modified items in the user's personal folder (falls back to content the user authored anywhere on the site) |
| `plone_search` | Catalog search (`@search`) with text / type / path / creator / workflow-state filters |
| `plone_list_folder_contents` | List the immediate children of a folder |
| `plone_get_content` | Fetch a single content item by path |

Tools that take a `path` accept the `path` or `url` value from a previous result (or a site-relative path); the client normalizes it, so paths that already include the site id (e.g. `/Plone/...`) are not duplicated.

### Authentication

The tools authenticate the same way the browser already does, so no extra setup is needed on a same-origin Plone site:

1. If a Plone/Volto JWT is present in `localStorage` (Volto's default key is `auth_token`), it is sent as a `Bearer` token.
2. Otherwise, same-origin session cookies are sent (`credentials: "include"`), which covers Plone Classic logins.
3. As a last resort, the Soliplex widget's own OIDC token is reused (useful when Plone and Soliplex share an identity provider).

The current user id is read from the JWT `sub` / `preferred_username` claim. The server still enforces authorization on every request — the token is only used as a client-side identity hint.

**Cookie-only sessions (Plone Classic):** when there is no JWT, the user id cannot be derived on the client (the `__ac` cookie is `HttpOnly` and opaque). As a final fallback, the client asks the server via the `@logged-in-user` endpoint (configurable with `loggedInUserEndpoint`), which returns `{ userid, fullname, email }` for the authenticated session. If that endpoint is not installed it responds with `404` and the client simply reports the user as unknown. You can also supply the id yourself from a template with `PloneSoliplex.configure({ userId })`.

### Configuration

Call `PloneSoliplex.configure(...)` before `SoliplexChat.init(...)` to override defaults:

```javascript
PloneSoliplex.configure({
  baseUrl: "https://plone.example.com", // site root; auto-detected when omitted
  memberFolderBase: "/Members",         // where per-user folders live
  userId: "bob",                        // force a user id if auto-detection fails
  getUserId: () => window.myApp.currentUser, // or provide a resolver (may be async)
  allowWrites: false,                   // keep the REST client read-only (default)
  defaultLimit: 10,                     // default number of search results
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `baseUrl` | auto-detected | Plone site root that plone.restapi is served from |
| `token` | `null` | Explicit Bearer token (skips localStorage lookup) |
| `tokenKey` | `"auth_token"` | localStorage key holding the Plone/Volto JWT |
| `useSoliplexToken` | `true` | Fall back to the Soliplex widget's OIDC token |
| `userId` | `null` | Force a specific user id |
| `getUserId` | `null` | Callback returning the user id (may be async) |
| `memberFolderBase` | `"/Members"` | Base path for per-user folders |
| `allowWrites` | `false` | Allow non-GET REST requests |
| `defaultLimit` | `10` | Default number of search results |
| `loggedInUserEndpoint` | `"@logged-in-user"` | Server endpoint for resolving the user from a cookie session (set to `null` to disable) |

### Using the client directly

Every helper is also available programmatically on `window.PloneSoliplex`:

```javascript
await PloneSoliplex.getCurrentUser();
await PloneSoliplex.getRecentChangesInMyFolder({ limit: 5 });
await PloneSoliplex.search({ text: "budget", portal_type: "File" });
await PloneSoliplex.listFolderContents("/news", { limit: 20 });
await PloneSoliplex.getContent("/news/my-item");
```

See [plone-example.html](plone-example.html) for a complete embed example.

## Troubleshooting

### Widget doesn't appear

1. Check browser console for errors
2. Verify `baseUrl` is correct and the backend is running (or omit it to let users enter the URL manually)
3. Ensure the script is loaded before calling `init()`

### Tools not working

1. Check that the handler path is correct (e.g., `"myApp.tools.myFunction"`)
2. Verify the function exists on the `window` object before `init()` is called
3. Check browser console for "Handler not found" errors
4. Ensure your handler returns a Promise or is an async function

### CORS errors

Ensure your backend allows requests from your frontend domain:

```python
# FastAPI example
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
