import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://derpcatmusic.github.io/linkbeam",
  output: "server",
  adapter: cloudflare({
    configPath: "wrangler.jsonc",
    imageService: "passthrough",
    prerenderEnvironment: "node"
  })
});
