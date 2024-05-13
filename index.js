import { Miniflare } from "miniflare";

const modules = {
  "/hello/index.js": {
    esModule: `
    import { world } from "./world.js";
    export const hello = "Hello " + world;
    `,
  },
  "/hello/world.js": {
    esModule: `
    export const world = "World";
    `,
  },
};

const mf = new Miniflare({
  unsafeModuleFallbackService(request) {
    const resolveMethod = request.headers.get("X-Resolve-Method");
    if (resolveMethod !== "import" && resolveMethod !== "require") {
      throw new Error("unrecognized resolvedMethod");
    }

    const url = new URL(request.url);
    let specifier = url.searchParams.get("specifier");
    if (!specifier) {
      throw new Error("no specifier provided");
    }

    if (specifier === "/hello-world/index.js") {
      specifier = "/hello/index.js";
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
                const { hello } = await import("./hello-world/index.js");
                return new Response(hello);
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
