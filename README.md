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

## English scene text

`public/data/tl/<scene>.json` holds English lines for 641 scenes (262 unit
H-scenes, 379 story parts) from the RPGX English Patch (official English
release plus fan translations, credited per scene). The player keeps the
current Japanese script's stage commands and swaps only the text, one line
per beat; `translations.py` pairs the patch's beats with the Japanese ones
(alignment on voice / CG / background where the counts differ). Beats with no
English keep the Japanese; a file whose beat count no longer matches the
script is ignored. Viewers turn English off with the "English text" box,
which is remembered.

## Refresh the data after a game update

From `D:\Download\Taimanin`:

    py -3 tools/web_export/catalog_snapshot.py   # public/data/bundles.json
    py -3 tools/web_export/tables.py             # units, runes, icons, UI art
    py -3 tools/web_export/scenes.py             # public/data/scenes, adv_se.json (after tables.py)
    py -3 tools/web_export/gacha.py              # public/data/gacha.json for #/gacha (after tables.py)
    py -3 tools/web_export/buffs.py              # public/data/buffs.json for #/buffs (after tables.py)
    py -3 tools/web_export/stories.py            # public/data/stories for #/story (after scenes.py)
    py -3 tools/web_export/translations.py       # public/data/tl: English scene text (after stories.py)

Even without a refresh, the site checks the live catalog `.hash` files and
rescans a changed catalog itself, so renamed bundles keep loading.

## Deploy (Cloudflare Pages)

Cloudflare Pages builds this repo on push: build command `npm run build`,
output directory `dist`, environment variable `NODE_VERSION=22`.
Response headers (caching) are in `public/_headers`.

Pages have real paths (`/units/00001`); old `/#/...` links are redirected on
load. `npm run build` also runs `prerender.ts`: a static HTML file per unit,
card, item, event, quest, story-battles and person page (title, description,
canonical, Open Graph and a text summary that React replaces), plus
`sitemap.xml` and `robots.txt`. Scenes, story parts and transcripts have no
file (Pages allows 20,000 files per deployment; the build prints the count and
warns near the limit): the SPA fallback serves them and they set their meta at
runtime. Page text lives in `src/meta.ts`, shared by both; the site URL used
for canonicals and the sitemap is `SITE_URL` there.
