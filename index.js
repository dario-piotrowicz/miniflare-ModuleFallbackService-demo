import { Miniflare } from "miniflare";

const modules = {
  "/hello.js": {
    esModule: 'export const hello = "Hello";',
  },
  "/a.cjs": {
    path: "/a.cjs",
    commonJsModule: `
      exports.one = 'ONE';

      module.exports = function(){
        return 'hello from a.cjs';
      };
    `,
    namedExports: ['one']
  }
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
                const { default: helloFn, one } = await import("./a.cjs");
                return new Response(
                "\\n\\n" + [
                  "default from a.cjs: " + (helloFn()),
                  "and one from a.cjs: " + one,
                ].map(str => \` - \${str}\\n\`).join('\\n')
                + "\\n\\n"
                );
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
