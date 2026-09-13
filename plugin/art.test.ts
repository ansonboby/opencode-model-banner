// Behavior tests for the art registry: run with `bun test plugin/`.
// Asserts what a consumer of matchArt() observes: art resolution per model,
// name prettification, and the unknown-model fallback.
import { describe, expect, test } from "bun:test"
import { matchArt } from "./art"

describe("matchArt", () => {
  test("known models resolve to their brand art with gradient data", () => {
    const cases: Array<[string, string, string, string]> = [
      ["tokenrouter", "deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", "#8aa6ff"],
      ["tokenrouter", "z-ai/glm-5.3-free", "GLM 5.3 Free", "#7de8fa"],
      ["tokenrouter", "moonshotai/kimi-k3", "Kimi K3", "#ffe1a0"],
      ["tokenrouter", "x-ai/grok-4.6", "Grok 4.6", "#f2f4f7"],
      ["tokenrouter", "qwen/qwen3.7-max", "Qwen3.7 Max", "#9d8df7"],
      ["tokenrouter", "minimax/minimax-m2.5", "MiniMax M2.5", "#fc8cac"],
      ["openai", "gpt-6", "GPT 6", "#5be3c4"],
      ["anthropic", "claude-opus-4-1", "Claude Opus 4 1", "#f2a488"],
      ["google", "gemini-3.8-flash", "Gemini 3.8 Flash", "#8fb4ff"],
      ["mistralai", "mistral-large-2", "Mistral Large 2", "#ff9455"],
      ["nvidia", "nemotron-3.5-lightning", "Nemotron 3.5 Lightning", "#a9e24d"],
    ]
    for (const [providerID, modelID, wantName, wantColor] of cases) {
      const { entry, name } = matchArt(providerID, modelID, modelID)
      expect(name).toBe(wantName)
      expect(entry.color).toBe(wantColor)
      // generated art must carry runs + palette
      expect(entry.runs!.length).toBeGreaterThan(4)
      expect(entry.colors!.length).toBe(12)
      for (const run of entry.runs!) {
        for (const [idx] of run) expect(idx).toBeLessThan(entry.colors!.length)
      }
    }
  })

  test("modelID glob catches provider-embedded families", () => {
    // tokenrouter nests the vendor in the modelID itself
    const { entry, name } = matchArt("tokenrouter", "z-ai/glm-5.3-flash", "z-ai/glm-5.3-flash")
    expect(name).toBe("GLM 5.3 Flash")
    expect(entry.color).toBe("#7de8fa")
  })

  test("unknown model falls back to block-letter name art", () => {
    const { entry, name } = matchArt("somehost", "brand-new-unknown-model", "brand-new-unknown-model")
    expect(name).toBe("Brand New Unknown Model")
    expect(entry.runs).toBeUndefined()
    expect(entry.lines.length).toBe(5)
    // FIGlet rows only contain block glyphs and spaces
    expect(entry.lines[0]!).toMatch(/^[█▀▄═╗║╔╚╝ ]+$/)
  })

  test("generated art lines match the runs rendering", () => {
    // `lines` is the plain-glyph projection of `runs` — used by compact banner
    const { entry } = matchArt("tokenrouter", "deepseek/deepseek-v4-flash", "d")
    const fromRuns = entry.runs!.map((run) => run.map(([, t]) => t).join(""))
    expect(entry.lines).toEqual(fromRuns)
  })

  test("session glyph is one line of unicode", () => {
    // compact fallback derives from lines; sanity: art never empty
    const { entry } = matchArt("tokenrouter", "qwen/qwen3.7-max", "q")
    expect(entry.lines.length).toBeGreaterThan(0)
    expect(entry.lines.join("").trim().length).toBeGreaterThan(0)
  })
})
