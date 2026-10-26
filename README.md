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
    SITE=http://localhost:4173 node test/e2e/scene.mjs   # scene player against the built site + live CDN

## Scenes

`#/scenes/<id>` plays a unit H-scene. `public/data/scenes/<id>.json` (2.5 MB in
all) holds only what the bundles can't give cheaply: CG layer stacks, actor
piece offsets, sprite -> bundle stems, and the script's path id. The script
itself is range-read out of the 24 MB scenario bundle (`src/unity/remote.ts`,
~170 KB cold, then ~50 KB per scene); sound effects likewise out of
`adv_assets_all`. CGs, backgrounds, actors and BGM are whole small bundles;
voices are direct `.ogg` downloads. Animated CGs play through the vendored
Spine 3.6 runtime in `public/vendor/spine-3.6` (the local viewer's patched copy;
see `src/spine.ts`).

## Refresh the data after a game update

From `D:\Download\Taimanin`:

    py -3 tools/web_export/catalog_snapshot.py   # public/data/bundles.json
    py -3 tools/web_export/tables.py             # units, runes, icons, UI art
    py -3 tools/web_export/scenes.py             # public/data/scenes, adv_se.json (after tables.py)
    py -3 tools/web_export/buffs.py              # public/data/buffs.json for #/buffs (after tables.py)
    py -3 tools/web_export/stories.py            # public/data/stories for #/story (after scenes.py)

Even without a refresh, the site checks the live catalog `.hash` files and
rescans a changed catalog itself, so renamed bundles keep loading.

## Deploy (Cloudflare Pages)

Cloudflare Pages builds this repo on push: build command `npm run build`,
output directory `dist`, environment variable `NODE_VERSION=22`.
Response headers (caching) are in `public/_headers`.
