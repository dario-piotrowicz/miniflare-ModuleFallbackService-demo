import { Miniflare } from "miniflare";

const modules = {
  "/foo/hello.js": {
    esModule: `
    import {foo} from "./foo.js";

    export const hello = "Hello" + foo;`,
  },
  "/foo/foo.js": {
    esModule: `
    import {bar} from "bar";

    export const foo = " foo" + bar`,
  },
  // TODO: shouldn't this be "/_bare_/bar", or even "bar/", or ideally just "bar"?
  "/_bare_/bar/index": {
    esModule: `
    import {baz} from "./baz.js";

    export const bar = " bar" + baz`,
  },
  "/_bare_/bar/baz.js": {
    esModule: `
    export const baz = " baz"`,
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
    const referrer = url.searchParams.get("referrer")
    const rawSpecifier = url.searchParams.get("raw");

    if (!rawSpecifier) {
      throw new Error("no specifier provided");
    }

    // hacky way to resolve url paths - this is good enough for this demo, but likely not good enough for production use
    const resolvedSpecifier = rawSpecifier.startsWith('.') ?
      new URL(rawSpecifier, `https://hostname${referrer}`).pathname :
      rawSpecifier.startsWith('/') ?
        // TODO(discuss): what does it mean to import '/foo.js' vs 'foo.js' vs './foo.js' in workerd?!?
        rawSpecifier :
        // TODO(discuss): workerd crashes if we 301 redirect with bare specifier,
        //    so prefix with /_bare_/ - this is likely a bad idea!
        rawSpecifier.endsWith('.js') ?
          `/_bare_/${rawSpecifier}`:
          // TODO(discuss): workerd crashes if we 301 redirect to location that ends with /,
          //    so we have to use /index suffix instead
          `/_bare_/${rawSpecifier}/index`;

    console.log(`--- Fallback service debug info ---
      resolve method:     ${resolveMethod}
      url:                ${url}
      specifier:          ${specifier}
      raw specifier:      ${rawSpecifier}
      referrer:           ${referrer}
      resolved specifier: ${resolvedSpecifier}`
    );

    if (specifier !== resolvedSpecifier) {
      console.log(`redirecting module ${specifier} to ${resolvedSpecifier}`);
      return new Response(null, {headers: {location: resolvedSpecifier}, status: 301});
    }


    const resolvedModule = modules[resolvedSpecifier];

    if (!resolvedModule) {
      return new Response(null, { status: 404 });
    }

    return new Response(
      JSON.stringify({
        ...resolvedModule,
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
                const { hello } = await import("./foo/hello.js");
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
