import { defineConfig } from 'vite';

// Relative asset paths, so the built game works from any folder: a GitHub Pages project
// site (https://<user>.github.io/<repo>/), a plain file server, or the site root.
export default defineConfig({
  base: './',
});
