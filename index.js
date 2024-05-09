import { Miniflare } from "miniflare";

const modules = {
  "/b.cjs": {
    commonJsModule: 'module.exports = "B" + "-" + require("./c.cjs").default;',
  },
  "/a.mjs": {
    esModule: 'export default "A";',
  },
  "/c.cjs": {
    commonJsModule: 'module.exports = "C";',
  },
};

const mf = new Miniflare({
  unsafeModuleFallbackService(request) {
    const resolveMethod = request.headers.get("X-Resolve-Method");
    if (resolveMethod !== "import" && resolveMethod !== "require") {
      throw new Error("unrecognized resolvedMethod");
    }

    const url = new URL(request.url);
    const specifier = url.searchParams.get("specifier");
    if (!specifier) {
      throw new Error("no specifier provided");
    }

    const name = specifier.replace(/^\//, "");

    if (!modules[specifier]) {
      return new Response(null, { status: 404 });
    }

    return new Response(
      JSON.stringify({
        name,
        ...modules[specifier],
      })
    );
  },
  workers: [
    {
      name: "entrypoint",
      modulesRoot: "/",
      compatibilityFlags: ["nodejs_compat"],
      modules: [
        {
          type: "ESModule",
          path: "/index.mjs",
          contents: `
            export default {
              async fetch() {
                const { default: a } = await import("./a.mjs");
                const { default: myRequire } = await import("./my-require.cjs");
                return new Response(a + "_" + myRequire("./b.cjs"));
              }
            }
          `,
        },
        {
          type: "NodeJsCompatModule",
          path: "/my-require.cjs",
          contents: `
            module.exports = (...args) => require(...args);
          `,
        },
      ],
      unsafeUseModuleFallbackService: true,
    },
  ],
});

const resp = await mf.dispatchFetch("http://localhost/a");

const text = await resp.text();

console.log(`Response from Miniflare: "${text}"\n`);

await mf.dispose();
