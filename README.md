# Taimanin RPGX Database

https://github.com/anyabot/Taimanin-RPGX-Database

Static site: unit stats, skills, runes and art for Taimanin RPGX. It ships only
metadata, small icons and UI art (~27 MB). Full art and audio are fetched from
the game's own CDN and decoded in the browser (`src/unity/`).

## Develop

    npm install
    npm run dev          # http://localhost:5173  (/cdn proxy caches bundles in .cdn-cache)
    npm test             # decoder golden tests (needs test/golden from golden.py)
    node test/e2e/pages.mjs   # headless Chrome pass over the pages (dev server running)

## Refresh the data after a game update

From `D:\Download\Taimanin`:

    py -3 tools/web_export/catalog_snapshot.py   # public/data/bundles.json
    py -3 tools/web_export/tables.py             # units, runes, icons, UI art

Even without a refresh, the site checks the live catalog `.hash` files and
rescans a changed catalog itself, so renamed bundles keep loading.

## Deploy (Cloudflare Pages)

Cloudflare Pages builds this repo on push: build command `npm run build`,
output directory `dist`, environment variable `NODE_VERSION=22`.
Response headers (caching) are in `public/_headers`.
