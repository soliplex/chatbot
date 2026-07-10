/**
 * plone_soliplex_tool.js
 * -----------------------------------------------------------------------------
 * Client-side Plone tooling for the Soliplex chat widget.
 *
 * Drop this script on any Plone page next to `soliplex-chat.js`. It exposes a
 * small Plone REST API client on `window.PloneSoliplex` and a set of ready-made
 * tool definitions you can hand to the widget so the AI agent can search
 * content, read the logged-in user, and answer questions such as
 * "What are the most recent changes in my folder?".
 *
 * Usage (Plone 6 Volto / Classic, widget embedded on the same origin):
 *
 *   <script src="soliplex-chat.js"></script>
 *   <script src="plone_soliplex_tool.js"></script>
 *   <script>
 *     // Optional: override any of the defaults (see DEFAULTS below).
 *     PloneSoliplex.configure({ baseUrl: "https://plone.example.com" });
 *
 *     SoliplexChat.init({
 *       baseUrl: "https://soliplex.example.com",
 *       roomId: "assistant",
 *       tools: PloneSoliplex.getToolDefinitions(),
 *     });
 *   </script>
 *
 * The tools use the standard plone.restapi endpoints (`@search`, `@users`) and
 * authenticate the same way the browser already does:
 *   - if a Plone/Volto JWT is present in localStorage it is sent as a Bearer
 *     token, otherwise
 *   - same-origin session cookies are sent (`credentials: "include"`), which
 *     covers Plone Classic logins.
 * -----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  var DEFAULTS = {
    // Site root that plone.restapi is served from. Auto-detected when null
    // (see detectBaseUrl). Set this explicitly when the widget is embedded on
    // a different origin than the Plone site.
    baseUrl: null,

    // Explicit Bearer token. When null the token is read from localStorage
    // (tokenKey) and, as a fallback, from the Soliplex widget's own auth state.
    token: null,

    // localStorage key holding a Plone/Volto JWT (Volto's default is
    // "auth_token"). The value may be the raw JWT or JSON `{ token: "..." }`.
    tokenKey: "auth_token",

    // Fall back to the Soliplex widget's OIDC token when no Plone token exists.
    useSoliplexToken: true,
    soliplexTokenKey: "soliplex-auth",

    // Force a specific user id (skips auto-detection), or provide a callback
    // returning the id (may be async). Auto-detection reads the JWT `sub`.
    userId: null,
    getUserId: null,

    // Where per-user member folders live, if the site uses them. The user's
    // folder is looked up at `${memberFolderBase}/${userId}`.
    memberFolderBase: "/Members",

    // Only allow read (GET) requests through the generic REST tool unless this
    // is turned on. Keeps the agent from mutating content by default.
    allowWrites: false,

    // Default number of search results.
    defaultLimit: 10,

    // Sent on every request so Plone Classic cookie sessions authenticate.
    credentials: "include",

    // Last-resort endpoint for resolving the current user from the session
    // cookie (useful for Plone Classic logins with no JWT). Expected to return
    // { userid, fullname, email } for an authenticated user, an Unauthorized
    // error body when anonymous, or 404 when the endpoint is not installed.
    loggedInUserEndpoint: "@logged-in-user",
  };

  var config = Object.assign({}, DEFAULTS);

  // Memoised result of the @logged-in-user lookup: `undefined` = not fetched,
  // `null` = fetched but no authenticated user, object = the resolved user.
  var loggedInUserCache;

  function configure(overrides) {
    Object.assign(config, overrides || {});
    loggedInUserCache = undefined; // config change may affect identity
    return config;
  }

  // ---------------------------------------------------------------------------
  // Low-level helpers
  // ---------------------------------------------------------------------------

  function stripTrailingSlash(url) {
    return String(url).replace(/\/+$/, "");
  }

  // Best-effort discovery of the Plone site root. Prefer an explicit
  // config.baseUrl; otherwise look at the well-known hooks Plone leaves in the
  // page, and finally fall back to the current origin.
  function detectBaseUrl() {
    if (config.baseUrl) return stripTrailingSlash(config.baseUrl);

    var body = typeof document !== "undefined" ? document.body : null;
    if (body) {
      var attr =
        body.getAttribute("data-portal-url") ||
        body.getAttribute("data-portalurl") ||
        body.getAttribute("data-base-url");
      if (attr) return stripTrailingSlash(attr);
    }

    if (typeof window !== "undefined" && window.portal_url) {
      return stripTrailingSlash(window.portal_url);
    }

    var baseEl =
      typeof document !== "undefined"
        ? document.querySelector("base[href]")
        : null;
    if (baseEl) {
      try {
        return stripTrailingSlash(new URL(baseEl.href).href);
      } catch (e) {
        /* ignore malformed base href */
      }
    }

    return typeof window !== "undefined" ? window.location.origin : "";
  }

  // Decode a JWT payload without verifying the signature (client-side identity
  // hint only — the server still enforces authorization on every request).
  function decodeJwt(token) {
    if (!token || typeof token !== "string") return null;
    var parts = token.split(".");
    if (parts.length < 2) return null;
    try {
      var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var pad = payload.length % 4;
      if (pad) payload += "====".slice(pad);
      var json = decodeURIComponent(
        atob(payload)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function readStoredToken(key) {
    if (typeof localStorage === "undefined") return null;
    var raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    // Volto stores the bare JWT string; some setups store JSON.
    try {
      var parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") {
        return parsed.token || parsed.access_token || parsed.accessToken || null;
      }
    } catch (e) {
      return raw; // a bare JWT is not valid JSON — use it as-is
    }
    return raw;
  }

  function getToken() {
    if (config.token) return config.token;

    var ploneToken = readStoredToken(config.tokenKey);
    if (ploneToken) return ploneToken;

    if (config.useSoliplexToken && typeof localStorage !== "undefined") {
      try {
        var raw = localStorage.getItem(config.soliplexTokenKey);
        if (raw) {
          var state = JSON.parse(raw);
          return (state && state.tokens && state.tokens.accessToken) || null;
        }
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  function buildQuery(params) {
    if (!params) return "";
    var usp = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (item !== undefined && item !== null && item !== "") {
            usp.append(key, item);
          }
        });
      } else {
        usp.append(key, value);
      }
    });
    var qs = usp.toString();
    return qs ? "?" + qs : "";
  }

  // Split the detected site root into its origin and site path, e.g.
  // "http://localhost:8080/Plone" -> { origin: "http://localhost:8080",
  // sitePath: "/Plone" }. When Plone is served at the domain root sitePath
  // is "".
  function siteParts() {
    var base = detectBaseUrl();
    try {
      var u = new URL(base);
      return {
        origin: u.origin,
        sitePath: u.pathname.replace(/\/+$/, ""),
        base: base,
      };
    } catch (e) {
      return { origin: base, sitePath: "", base: base };
    }
  }

  // Resolve a path or URL into an absolute request URL, without duplicating the
  // site path. Accepts:
  //   - a full URL (an item's "@id")            -> used as-is
  //   - a physical path incl. site id ("/Plone/x") -> origin + path
  //   - a site-relative path ("/x" or "@search")   -> origin + sitePath + path
  function resolveUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    var p = String(pathOrUrl);
    if (p.charAt(0) !== "/") p = "/" + p;
    var s = siteParts();
    if (s.sitePath && (p === s.sitePath || p.indexOf(s.sitePath + "/") === 0)) {
      return s.origin + p; // already includes the site id
    }
    return s.origin + s.sitePath + p;
  }

  // Normalise a path or URL into a catalog path (the physical path including the
  // site id, e.g. "/Plone/folder"). This is what the @search "path.query"
  // parameter expects.
  function toCatalogPath(pathOrUrl) {
    var p;
    if (/^https?:\/\//i.test(pathOrUrl)) {
      try {
        p = new URL(pathOrUrl).pathname;
      } catch (e) {
        p = String(pathOrUrl);
      }
    } else {
      p = String(pathOrUrl);
      if (p.charAt(0) !== "/") p = "/" + p;
    }
    p = p.replace(/\/+$/, "") || "/";
    var s = siteParts();
    if (!s.sitePath) return p;
    if (p === s.sitePath || p.indexOf(s.sitePath + "/") === 0) return p;
    return s.sitePath + p;
  }

  function apiUrl(pathOrUrl, params) {
    return resolveUrl(pathOrUrl) + buildQuery(params);
  }

  /**
   * Perform a plone.restapi request. Returns the parsed JSON body (or raw text
   * when the response is not JSON). Throws on non-2xx responses.
   */
  async function request(method, path, options) {
    options = options || {};
    method = (method || "GET").toUpperCase();

    if (method !== "GET" && !config.allowWrites) {
      throw new Error(
        "Refusing " +
          method +
          " request: writes are disabled. Call PloneSoliplex.configure({ allowWrites: true }) to enable."
      );
    }

    var headers = Object.assign(
      { Accept: "application/json" },
      options.headers || {}
    );
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    var fetchOptions = {
      method: method,
      headers: headers,
      credentials: config.credentials,
    };

    if (options.body !== undefined && options.body !== null) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body =
        typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
    }

    var url = apiUrl(path, options.params);
    var res = await fetch(url, fetchOptions);
    var text = await res.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }

    if (!res.ok) {
      var detail =
        (data &&
          ((data.error && (data.error.message || data.error.type)) ||
            data.message)) ||
        res.status + " " + res.statusText;
      throw new Error("Plone REST " + method + " " + url + " failed: " + detail);
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /**
   * Last-resort identity lookup: ask the server who is logged in via the
   * session cookie. This is the only way to identify a Plone Classic user who
   * authenticated with `__ac` and has no JWT.
   *
   * Returns { userId, fullname, email } when authenticated, or null when the
   * user is anonymous (Unauthorized) or the endpoint is not installed (404).
   * The result is memoised so repeated calls do not re-hit the network.
   */
  async function fetchLoggedInUser() {
    if (loggedInUserCache !== undefined) return loggedInUserCache;
    if (!config.loggedInUserEndpoint) {
      loggedInUserCache = null;
      return null;
    }

    try {
      var headers = { Accept: "application/json" };
      var token = getToken();
      if (token) headers["Authorization"] = "Bearer " + token;

      // Raw fetch (not request()) so we can inspect 401/404 instead of throwing.
      var res = await fetch(apiUrl(config.loggedInUserEndpoint), {
        method: "GET",
        headers: headers,
        credentials: config.credentials,
      });

      // 404 -> endpoint not installed; treat as "unknown", not an error.
      if (res.status === 404) {
        loggedInUserCache = null;
        return null;
      }

      var text = await res.text();
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = null;
        }
      }

      // Anonymous: 401, or an Unauthorized error body.
      if (
        res.status === 401 ||
        (data && data.error) ||
        !res.ok
      ) {
        loggedInUserCache = null;
        return null;
      }

      var userId =
        (data && (data.userid || data.userId || data.username)) || null;
      loggedInUserCache = userId
        ? {
            userId: userId,
            fullname: (data && data.fullname) || null,
            email: (data && data.email) || null,
          }
        : null;
      return loggedInUserCache;
    } catch (e) {
      // Network/CORS failure — don't cache so a later call can retry.
      loggedInUserCache = undefined;
      return null;
    }
  }

  async function resolveUserId() {
    if (config.userId) return config.userId;

    if (typeof config.getUserId === "function") {
      try {
        var provided = await config.getUserId();
        if (provided) return provided;
      } catch (e) {
        /* ignore and continue with auto-detection */
      }
    }

    var claims = decodeJwt(getToken());
    if (claims) {
      // Plone JWTs put the user id in `sub`; OIDC tokens usually carry a
      // human-readable `preferred_username` that matches the Plone login.
      return (
        claims.preferred_username ||
        claims.sub ||
        claims.username ||
        claims.login ||
        null
      );
    }

    // Last resort: ask the server via the session cookie (Plone Classic).
    var loggedIn = await fetchLoggedInUser();
    if (loggedIn && loggedIn.userId) return loggedIn.userId;

    return null;
  }

  /**
   * Resolve the current user's id and profile. Combines JWT claims with a
   * plone.restapi `@users/{id}` lookup when possible.
   */
  async function getCurrentUser() {
    var userId = await resolveUserId();
    var claims = decodeJwt(getToken());
    // resolveUserId() populates the cache when it consults @logged-in-user;
    // reuse it here without triggering another request.
    var loggedIn = loggedInUserCache || null;

    var user = {
      userId: userId,
      username: userId,
      fullname:
        (loggedIn && loggedIn.fullname) ||
        (claims && (claims.fullname || claims.name)) ||
        null,
      email: (loggedIn && loggedIn.email) || (claims && claims.email) || null,
      source: claims ? "token" : loggedIn ? "logged-in-user" : "session",
    };

    if (!userId) {
      user.loggedIn = false;
      user.note =
        "Could not determine the logged-in user. The user may be anonymous, " +
        "or you may need to configure PloneSoliplex.configure({ userId }) or a token.";
      return user;
    }

    user.loggedIn = true;

    try {
      var record = await request("GET", "@users/" + encodeURIComponent(userId));
      if (record && typeof record === "object") {
        user.fullname = record.fullname || user.fullname;
        user.email = record.email || user.email;
        user.home_page = record.home_page || null;
        user.roles = record.roles || null;
        user.source = "restapi";
      }
    } catch (e) {
      // Not fatal: the id from the token is still useful for scoping searches.
      user.profileError = e.message;
    }

    return user;
  }

  /**
   * Return the path (relative to the site root) of the user's personal folder,
   * or null when the site does not use member folders.
   */
  async function getMyFolderPath(userId) {
    userId = userId || (await resolveUserId());
    if (!userId) return null;
    if (!config.memberFolderBase) return null;

    var candidate =
      stripTrailingSlash(config.memberFolderBase) +
      "/" +
      encodeURIComponent(userId);

    try {
      var content = await request("GET", candidate);
      if (content && content["@id"]) {
        try {
          return new URL(content["@id"]).pathname;
        } catch (e) {
          return candidate;
        }
      }
    } catch (e) {
      /* no member folder — caller falls back to authored content */
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  function simplifyItem(item) {
    return {
      title: item.title || item.id || null,
      description: item.description || null,
      url: item["@id"] || null,
      path: item["@id"] ? safePathname(item["@id"]) : null,
      type: item["@type"] || null,
      review_state: item.review_state || null,
      created: item.created || null,
      modified: item.modified || null,
      creator: item.Creator || null,
    };
  }

  function safePathname(url) {
    try {
      return new URL(url).pathname;
    } catch (e) {
      return null;
    }
  }

  /**
   * Query the plone.restapi `@search` endpoint.
   *
   * Accepted keys: text, portal_type, path, pathDepth, creator, review_state,
   * subject, sortOn, sortOrder, limit, start, fullobjects.
   */
  async function search(query) {
    query = query || {};
    var params = {};

    if (query.text) params.SearchableText = query.text;
    if (query.portal_type) params.portal_type = query.portal_type;
    if (query.creator) params.Creator = query.creator;
    if (query.review_state) params.review_state = query.review_state;
    if (query.subject) params.Subject = query.subject;

    if (query.path) {
      // path.query expects the physical catalog path including the site id.
      params["path.query"] = toCatalogPath(query.path);
      if (query.pathDepth !== undefined && query.pathDepth !== null) {
        params["path.depth"] = query.pathDepth;
      }
    }

    params.sort_on = query.sortOn || "modified";
    params.sort_order = query.sortOrder || "descending";
    params.b_size = query.limit || config.defaultLimit;
    if (query.start) params.b_start = query.start;
    if (query.fullobjects) params.fullobjects = "true";

    // Ask the catalog to return the metadata we surface in results.
    params.metadata_fields = [
      "modified",
      "created",
      "Creator",
      "Type",
      "review_state",
      "Description",
    ];

    var data = await request("GET", "@search", { params: params });
    var items = (data && data.items) || [];
    return {
      total: (data && data.items_total) || items.length,
      count: items.length,
      items: items.map(simplifyItem),
    };
  }

  /**
   * The headline capability: "What are the most recent changes in my folder?".
   * Resolves the logged-in user, finds their folder (or falls back to content
   * they authored anywhere on the site), and returns the most recently
   * modified items.
   */
  async function getRecentChangesInMyFolder(options) {
    options = options || {};
    var userId = await resolveUserId();

    if (!userId) {
      return {
        loggedIn: false,
        message:
          "I could not determine who you are. Please make sure you are logged " +
          "in to the Plone site.",
      };
    }

    var folderPath = await getMyFolderPath(userId);
    var scoped = { limit: options.limit || config.defaultLimit };

    if (folderPath) {
      scoped.path = folderPath;
    } else {
      // No member folder: show the content this user has authored anywhere.
      scoped.creator = userId;
    }

    var result = await search(scoped);
    return {
      loggedIn: true,
      user: userId,
      folder: folderPath,
      scope: folderPath ? "member-folder" : "authored-content",
      count: result.count,
      total: result.total,
      items: result.items,
    };
  }

  /**
   * Fetch a single content item. `path` may be a full URL (an item's "@id"),
   * a physical path ("/Plone/x") or a site-relative path ("/x"). Pass
   * `{ fullobjects: true }` to expand any contained children in the response.
   */
  async function getContent(path, options) {
    if (!path) throw new Error("getContent requires a path");
    options = options || {};
    var params = {};
    if (options.fullobjects) params.fullobjects = "1";
    return request("GET", path, { params: params });
  }

  /**
   * List the immediate children of a folder. In plone.restapi a GET on a
   * folderish item returns its contained items in an `items` array (with
   * `items_total` and batching), so this simply reads that. `path` may be a
   * full URL, a physical path or a site-relative path.
   */
  async function listFolderContents(path, options) {
    if (!path) throw new Error("listFolderContents requires a path");
    options = options || {};
    var params = { b_size: options.limit || config.defaultLimit };
    if (options.start) params.b_start = options.start;

    var data = await request("GET", path, { params: params });
    var items = (data && data.items) || [];
    return {
      path: data && data["@id"] ? safePathname(data["@id"]) : toCatalogPath(path),
      type: (data && data["@type"]) || null,
      title: (data && data.title) || null,
      count: items.length,
      total: (data && data.items_total) || items.length,
      items: items.map(simplifyItem),
    };
  }

  // ---------------------------------------------------------------------------
  // Tool definitions for the Soliplex widget
  // ---------------------------------------------------------------------------

  function getToolDefinitions() {
    return [
      {
        name: "plone_get_current_user",
        description:
          "Get the currently logged-in Plone user's id, full name, email and " +
          "roles. Use this to find out who the user is before answering " +
          "questions about 'my' content, folder, or profile.",
        parameters: { type: "object", properties: {} },
        handler: function () {
          return getCurrentUser();
        },
      },
      {
        name: "plone_recent_changes_in_my_folder",
        description:
          "List the most recently modified content in the logged-in user's " +
          "personal folder. If the site has no member folders, falls back to " +
          "the most recent content the user has authored. Use this for " +
          "questions like 'What are the most recent changes in my folder?'.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of items to return (default 10).",
            },
          },
        },
        handler: function (args) {
          return getRecentChangesInMyFolder({ limit: args && args.limit });
        },
      },
      {
        name: "plone_search",
        description:
          "Search the Plone site using the catalog (@search). Returns matching " +
          "content sorted by most recently modified by default.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Full-text query (SearchableText).",
            },
            portal_type: {
              type: "string",
              description:
                "Restrict to a content type, e.g. 'Document', 'News Item', 'File'.",
            },
            path: {
              type: "string",
              description:
                "Restrict the search to a folder. Pass the 'path' or 'url' " +
                "value from a previous result, or a site-relative path.",
            },
            creator: {
              type: "string",
              description: "Restrict to content authored by this user id.",
            },
            review_state: {
              type: "string",
              description:
                "Restrict to a workflow state, e.g. 'published', 'private'.",
            },
            sortOn: {
              type: "string",
              description:
                "Catalog index to sort on (default 'modified'). e.g. 'created', 'sortable_title'.",
            },
            sortOrder: {
              type: "string",
              enum: ["ascending", "descending"],
              description: "Sort direction (default 'descending').",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default 10).",
            },
          },
        },
        handler: function (args) {
          return search(args || {});
        },
      },
      {
        name: "plone_list_folder_contents",
        description:
          "List the immediate children of a Plone folder. Use this to see what " +
          "is inside a folder. Pass the 'path' or 'url' value from a previous " +
          "result (e.g. from plone_search or plone_get_current_user).",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "The folder's 'path' or 'url' from a previous result, or a " +
                "site-relative path, e.g. '/news'.",
            },
            limit: {
              type: "number",
              description: "Maximum number of children to return (default 10).",
            },
          },
          required: ["path"],
        },
        handler: function (args) {
          return listFolderContents(args && args.path, {
            limit: args && args.limit,
          });
        },
      },
      {
        name: "plone_get_content",
        description:
          "Fetch a single Plone content item to read its full details. Pass " +
          "the 'path' or 'url' value from a previous result, or a site-relative " +
          "path. To list what is inside a folder, use plone_list_folder_contents.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "The item's 'path' or 'url' from a previous result, or a " +
                "site-relative path, e.g. '/news/my-item'.",
            },
          },
          required: ["path"],
        },
        handler: function (args) {
          return getContent(args && args.path);
        },
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  var api = {
    configure: configure,
    get config() {
      return config;
    },
    // Low-level
    request: request,
    apiUrl: apiUrl,
    getToken: getToken,
    decodeJwt: decodeJwt,
    detectBaseUrl: detectBaseUrl,
    // Domain helpers
    getCurrentUser: getCurrentUser,
    getMyFolderPath: getMyFolderPath,
    search: search,
    getRecentChangesInMyFolder: getRecentChangesInMyFolder,
    getContent: getContent,
    listFolderContents: listFolderContents,
    // Widget wiring
    getToolDefinitions: getToolDefinitions,
  };

  // String-reference handlers, so tools can also be wired up with
  // `handler: "PloneSoliplex.tools.getCurrentUser"` in the widget config.
  api.tools = {
    getCurrentUser: function () {
      return getCurrentUser();
    },
    recentChangesInMyFolder: function (args) {
      return getRecentChangesInMyFolder({ limit: args && args.limit });
    },
    search: function (args) {
      return search(args || {});
    },
    getContent: function (args) {
      return getContent(args && args.path);
    },
    listFolderContents: function (args) {
      return listFolderContents(args && args.path, {
        limit: args && args.limit,
      });
    },
  };

  if (typeof window !== "undefined") {
    window.PloneSoliplex = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
