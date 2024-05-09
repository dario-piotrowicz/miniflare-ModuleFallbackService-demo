import { Miniflare } from "miniflare";

const mf = new Miniflare({
  workers: [
    {
      modules: true,
      name: "entrypoint",
      script: `
        export default {
          fetch(req) {
            return new Response("Hello from Miniflare");
          }
        }
      `,
    },
  ],
});

const resp = await mf.dispatchFetch("http://localhost");

const text = await resp.text();

console.log(`Response from Miniflare: "${text}"\n`);

await mf.dispose();
