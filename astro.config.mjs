import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://derpcatmusic.github.io/beamlink",
  output: "server",
  adapter: cloudflare({
    configPath: "wrangler.jsonc",
    imageService: "passthrough",
    prerenderEnvironment: "node"
  })
});
