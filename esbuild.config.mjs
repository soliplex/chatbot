import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";

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

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    console.log("Widget built successfully!");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
