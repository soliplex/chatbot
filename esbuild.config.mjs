import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";

const isWatch = process.argv.includes("--watch");

// Create alias plugin
const aliasPlugin = {
  name: "alias",
  setup(build) {
    // Handle @/* imports
    build.onResolve({ filter: /^@\// }, (args) => {
      const relativePath = args.path.replace(/^@\//, "./");

      // Try different extensions
      const extensions = [".tsx", ".ts", ".js", ".jsx", ""];
      for (const ext of extensions) {
        const fullPath = path.resolve(relativePath + ext);
        if (fs.existsSync(fullPath)) {
          return { path: fullPath };
        }
        // Also try index files
        const indexPath = path.resolve(relativePath, `index${ext}`);
        if (fs.existsSync(indexPath)) {
          return { path: indexPath };
        }
      }

      // Fallback - let esbuild try to resolve
      return { path: path.resolve(relativePath) };
    });
  },
};

const buildOptions = {
  entryPoints: ["widget/index.tsx"],
  bundle: true,
  minify: !isWatch,
  sourcemap: true,
  target: ["es2020"],
  format: "iife",
  globalName: "SoliplexChatBundle",
  outfile: "public/soliplex-chat.js",
  loader: {
    ".tsx": "tsx",
    ".ts": "ts",
  },
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
  plugins: [aliasPlugin],
  jsx: "automatic",
  jsxImportSource: "react",
};

// Collect mtimes for all source files under the given directories
function getSourceMtimes(dirs) {
  const mtimes = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && /\.(tsx?|jsx?|css)$/.test(entry.name)) {
        const filePath = path.join(entry.parentPath || entry.path, entry.name);
        mtimes.set(filePath, fs.statSync(filePath).mtimeMs);
      }
    }
  }
  return mtimes;
}

function mtimesChanged(a, b) {
  if (a.size !== b.size) return true;
  for (const [key, val] of a) {
    if (b.get(key) !== val) return true;
  }
  return false;
}

async function build() {
  if (isWatch) {
    if (process.env.ESBUILD_POLL) {
      // Polling mode for Docker bind mounts where inotify doesn't work.
      // Runs a fresh build whenever source file mtimes change.
      const RELOAD_PORT = parseInt(process.env.RELOAD_PORT || "35729", 10);
      const watchDirs = ["widget", "components", "hooks", "lib"];
      let lastMtimes = new Map();

      // SSE live-reload server — browsers connect and get a "reload" event after each rebuild
      const sseClients = new Set();
      http.createServer((req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
      }).listen(RELOAD_PORT, "0.0.0.0", () =>
        console.log(`Live-reload SSE server on port ${RELOAD_PORT}`)
      );

      function notifyReload() {
        for (const res of sseClients) res.write("data: reload\n\n");
      }

      // Inject a tiny live-reload client into the bundle
      const liveReloadBanner = [
        `(function(){`,
        `  var es = new EventSource("http://" + location.hostname + ":${RELOAD_PORT}");`,
        `  es.onmessage = function(){ location.reload(); };`,
        `})();`,
      ].join("");

      const pollBuildOptions = { ...buildOptions, banner: { js: liveReloadBanner } };

      console.log("Initial build...");
      await esbuild.build(pollBuildOptions);
      lastMtimes = getSourceMtimes(watchDirs);
      console.log("Watching for changes (polling)...");

      setInterval(async () => {
        try {
          const currentMtimes = getSourceMtimes(watchDirs);
          if (mtimesChanged(lastMtimes, currentMtimes)) {
            console.log("Change detected, rebuilding...");
            await esbuild.build(pollBuildOptions);
            lastMtimes = currentMtimes;
            console.log("Rebuild complete.");
            notifyReload();
          }
        } catch (err) {
          console.error("Build error:", err.message);
        }
      }, 1000);
    } else {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("Watching for changes...");
    }
  } else {
    await esbuild.build(buildOptions);
    console.log("Widget built successfully!");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
