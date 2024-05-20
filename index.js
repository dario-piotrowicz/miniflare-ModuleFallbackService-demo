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
  "/_vite_bare_/bar": {
    redirect: "/_vite_externals_/Users/Dario/project/my-project/node_modules/bar/index.js",
  },
  "/_vite_externals_/Users/Dario/project/my-project/node_modules/bar/index.js": {
    esModule: `
    import {baz} from "./baz.js";

    export const bar = " bar" + baz`,
  },
  "/_vite_externals_/Users/Dario/project/my-project/node_modules/bar/baz.js": {
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

    // hacky way to resolve url paths - this is good enough for this demo,
    // but not good for production use. In Vite, we'll delegate to Vite's dev server instead
    const resolvedSpecifier = rawSpecifier.startsWith('.') ?

      // relative imports must be resolved against the referrer, e.g. `./foo.js` or `../
      new URL(rawSpecifier, `https://hostname${referrer}`).pathname :

      rawSpecifier.startsWith('/') ?

        // this must be an absolute, fully resolved import, e.g. `/foo.js` or `/_vite_external_/...`
        rawSpecifier :

        // let's check if this is the original bare import or an internal redirect to satisfy it
        specifier === modules[`/_vite_bare_/${rawSpecifier}`].redirect ?
          // this is an internal redirect from /_vite_bare_/bar to
          // /_vite_externals_/Users/Dario/project/my-project/node_modules/bar/index.js
          specifier :
          // this is a package import, resolve it by prefixing the specifier with '/_vite_bare_/`
          `/_vite_bare_/${rawSpecifier}`;

    console.log(`\n--- Fallback service debug info ---
      resolve method:     ${resolveMethod}
      url:                ${url}
      specifier:          ${specifier}
      raw specifier:      ${rawSpecifier}
      referrer:           ${referrer}
      resolved specifier: ${resolvedSpecifier}
      `
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
