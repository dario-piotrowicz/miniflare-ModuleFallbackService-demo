import { Miniflare } from "miniflare";

const modules = {
  "/hello.js": {
    esModule: 'export const hello = "Hello";',
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

    if (!modules[specifier]) {
      return new Response(null, { status: 404 });
    }

    return new Response(
      JSON.stringify({
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
                const { hello } = await import("./hello.js");
                return new Response(hello + " World");
              }
            }
          `,
        },
      ],
      unsafeUseModuleFallbackService: true,
    },
  ],
});

const resp = await mf.dispatchFetch("http://localhost/");

const text = await resp.text();

console.log(`Response from Miniflare: "${text}"\n`);

await mf.dispose();
