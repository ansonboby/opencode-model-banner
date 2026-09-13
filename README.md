# opencode-model-banner

[![CI](https://github.com/ansonboby/opencode-model-banner/actions/workflows/ci.yml/badge.svg)](https://github.com/ansonboby/opencode-model-banner/actions/workflows/ci.yml) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Per-model ASCII art banners for [opencode](https://opencode.ai) — the TUI coding agent.

Replaces the default opencode wordmark with your **current model's mascot**, rendered as
smooth gradient half-block art:

```
▄▄▄▄▄▄▄▄▄▄▄▄██
█████████████████████████
████████████████████████▄▄▄▀███
██████████████████████████████▄▄▄▀
███████████████████████████████████▄▄▄▄
▀▀█████████████████████████▄▄▄▀▀▀▀█████████
   ...
DeepSeek V4 Flash (tokenrouter)
```

- **Home screen** — large brand mascot with a vertical color gradient + model name
- **Session view** — compact one-line banner above the prompt (`◈ GLM 5.3 Free`)
- **Live switching** — banner swaps within ~0.5s of a ctrl+x m model switch
- Works in the terminal **and** the opencode desktop app (both run the same TUI)

Art for 15 brands, generated from official logos ([lobe-icons](https://github.com/lobehub/lobe-icons), MIT):
DeepSeek · Z.ai (GLM) · Kimi (Moonshot) · Grok (xAI) · Qwen · MiniMax · OpenAI ·
Gemini · Claude · Mistral · NVIDIA · StepFun · Tencent · ByteDance · opencode.
Unknown models fall back to block-letter art of the model name.

## Example

DeepSeek whale on the home screen (truecolor terminal):

```
        ▄▄▄▄▄▄▄▄▄▄▄▄██
   █████████████████████████
  ████████████████████████▄▄▄▀███
  ███████████████████████████████▄▄▄▀
 ████████████████████████████████████▄▄▄▄
 ▀▀████████████████████████▄▄▄▀▀▀▀█████████
    ▀▀▀██████████████▄▄███▀▀█████
    ▀▀████████████████▄▄▄▄▄▄█████
      ▀▀███████████████████████
     ▄▄▄▄▄▄▄▀▀███████████████████
     ▄██████████▄▄▄▄▀▀▀█████████████
████████████████████████████▄█▀▀▀▀▀▀▀▀▀▀▀▀
     ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

        DeepSeek V4 Flash (tokenrouter)
```

In sessions, a compact one-line banner above the prompt: `☾ Kimi K2.5`, `◈ GLM 5.3 Free`, `✦ Grok 4.1 Fast`.

## Install

Requires opencode ≥ 1.18 (TUI plugin support).

1. Copy the single-file plugin into your opencode config:

```sh
mkdir -p ~/.config/opencode/plugins
cp plugin/model-banner.tsx ~/.config/opencode/plugins/
```

2. Register it in `~/.config/opencode/tui.jsonc` (create if missing):

```jsonc
{ "plugin": ["./plugins/model-banner.tsx"] }
```

If you already have plugins, append the path to the existing `plugin` array.

3. Restart opencode. Done — no build step, the `.tsx` is loaded directly.

> Requires a truecolor terminal (`TERM=xterm-256color` or similar) for the gradients.

## How it works

The plugin overrides two official TUI plugin slots:

- `home_logo` (replace) — renders the mascot + label above the input box
- `session_prompt` — wraps the stock prompt with a compact banner

Model resolution mirrors opencode's own chain: config `model` →
`~/.local/state/opencode/model.json` `recent[0]` → first provider default.
A `fs.watchFile` on `model.json` feeds a Solid.js signal so banners swap live.
Art matching: exact model → family glob (`glm*`, `kimi*`, …) → provider →
FIGlet-style name art.

## Regenerating art

Art is not hand-drawn. `plugin/art.ts` is machine-generated from official SVGs:

```sh
cd gen && bun install        # resvg for SVG rasterization
bun run svg2art.mjs          # gen/icons/*.svg → art.json (runs + gradient palettes)
python3 emit.py              # art.json → ../plugin/art.ts
cd .. && python3 bundle.py   # inline art.ts into model-banner.tsx
cp plugin/model-banner.tsx ~/.config/opencode/plugins/
```

To add a brand: drop its SVG in `gen/icons/`, add a gradient pair + stretch
factor + row budget in `gen/svg2art.mjs`, and a mapping entry in `gen/emit.py`,
then run the pipeline above.

### How the art is made

Each SVG is rendered at 8× supersampling with resvg, normalized to a solid
silhouette in the brand's top gradient color. Coverage of each half-block
sub-cell becomes `█ ▀ ▄` glyphs (2× vertical resolution); a 12-step vertical
gradient palette colors each run, and edge cells darken one step for
anti-aliasing. Output is run-length-encoded `[paletteIdx, text]` segments so
the plugin ships one `.tsx` with zero binary assets.

## Repo layout

```
plugin/model-banner.tsx   single-file plugin (install this)
plugin/art.ts             art registry (source of truth, bundled into the above)
plugin/package.json       type-check deps only — not needed at runtime
bundle.py                 inline art.ts into model-banner.tsx (use --check in CI)
plugin/art.test.ts        matchArt behavior tests (bun test)
.github/workflows/ci.yml  bundle sync + build + tests
gen/svg2art.mjs           SVG → gradient half-block converter
gen/emit.py               converter output → art.ts
gen/icons/                official brand SVGs (from lobehub/lobe-icons, MIT)
```

## License

MIT. Brand logos are trademarks of their respective owners; the SVG sources
in `gen/icons/` come from [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT)
and are used here as functional identification of the models they ship.
