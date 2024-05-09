import { Miniflare } from "miniflare";

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
    return new Response(
      JSON.stringify({
        name,
        esModule: `
        export default "A";
        `,
      })
    );
  },
  workers: [
    {
      name: "entrypoint",
      modulesRoot: "/",
      modules: [
        {
          type: "ESModule",
          path: "/virtual/index.mjs",
          contents: `
            export default {
              async fetch() {
                const aMod = await import("a");
                const a = aMod.default;
                return new Response(a);
              }
            }
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
