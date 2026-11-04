# Taimanin RPGX Database

https://github.com/anyabot/Taimanin-RPGX-Database

Static site: unit stats, skills, runes, stories and transcripts for Taimanin
RPGX. The deployed site serves only its own files: game data, unit and item
icons, banners and scene scripts. The game's CDN only answers requests from the
game's own sites and from `localhost`, so full art, scene playback and audio
work in local builds only (`npm run dev` and `npm run preview`), which fetch
bundles from the CDN and decode them in the browser (`src/unity/`).

Everything under `public/data` is written by a separate
Python exporter toolkit that reads the game's tables and bundles; it is not
part of this repo. The site itself needs only Node 22.

## Develop

    npm install
    npm run dev          # http://localhost:5173, LIVE game files (/cdn proxy caches bundles in .cdn-cache)
    npm run preview      # http://localhost:4173, the next update (see below)
    npm run build        # what the deployed site is: no game CDN, no upcoming units
    npm test             # decoder golden tests (test/golden, from the toolkit's golden.py);
                         # set TAIMANIN_BUNDLES=<toolkit>/taimanin_assets/bundles for the range-read test
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

From the exporter toolkit's folder:

    py -3 tools/web_export/catalog_snapshot.py   # public/data/bundles.json
    py -3 tools/web_export/tables.py             # units, runes, icons, UI art
    py -3 tools/web_export/scenes.py             # public/data/scenes, adv_se.json (after tables.py)
    py -3 tools/web_export/gacha.py              # public/data/gacha.json for #/gacha (after tables.py)
    py -3 tools/web_export/buffs.py              # public/data/buffs.json for #/buffs (after tables.py)
    py -3 tools/web_export/stories.py            # public/data/stories for #/story (after scenes.py)
    py -3 tools/web_export/translations.py       # public/data/tl: English scene text (after stories.py)
    py -3 tools/web_export/atlases.py            # public/atlas: item, rune, enemy, boss icon sheets
    py -3 tools/web_export/banner_art.py         # public/art: gacha and story banners (after stories.py)

In local builds the site also checks the catalog `.hash` files and rescans a
changed catalog itself, so renamed bundles keep loading between refreshes.

## Preview the next update locally

`npm run preview` builds in `review` mode and serves it on port 4173: bundles
come from the game's REVIEW tree (the next update while it is in store review),
upcoming units are shown, and `.review/public` (git-ignored, written by the
toolkit's `fetch_new_units.bat review` and `tools/web_export/review_overlay.py`)
is laid over `dist` with the icons and scene files of units only REVIEW has.
Without that folder the preview still runs, from the CDN: units that only
REVIEW has show without icons or scenes.

`npm run build`, which Cloudflare runs, ignores `.review`.

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

## License

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE)
(AGPL-3.0-or-later). The license covers the code only: Taimanin RPGX art, audio,
text and data shown by the site belong to their rights holders and are not covered.
