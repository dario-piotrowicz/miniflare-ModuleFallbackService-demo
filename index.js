// @ts-check
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
  "/_bare_/bar": {
    redirect: "/_bare_/bar/index.js",
  },
  "/_bare_/bar/index.js": {
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
  // @ts-ignore
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

      // relative imports must be resolved against the referrer, e.g. `./foo.js` or `../
      new URL(rawSpecifier, `https://hostname${referrer}`).pathname :

      rawSpecifier.startsWith('/') ?

        // this must be an absolute import to a user-land module, e.g. `/foo/hello.js`
        // TODO: or also package imports in case node_modules: prefix is not supported by workerd.
        rawSpecifier :

        // let's check if this is the original bare import or an internal redirect to satisfy it
        specifier === modules[`/_bare_/${rawSpecifier}`].redirect ?
          // this is an internal redirect from /_bare_/bar to /_bare_/bar/index.js
          specifier :
          // this is a package import, resolve it by prefixing the specifier with '/_bare_/`
          `/_bare_/${rawSpecifier}`;

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
      // @ts-ignore
      return new Response(null, {headers: {location: resolvedSpecifier}, status: 301});
    }

    const resolvedModule = modules[resolvedSpecifier];

    if (!resolvedModule) {
      return new Response(null, { status: 404 });
    }

    if (resolvedModule.redirect) {
      console.log(`redirecting module ${specifier} to ${resolvedModule.redirect}`);
      return new Response(null, {headers: {location: resolvedModule.redirect}, status: 301});
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
