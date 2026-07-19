import type { NightWatchAiBrief, NightWatchIntel, ProtectionMode, SodexMarket } from "./types"
import { DEFAULT_OPENAI_MODEL, OPENAI_RESPONSES_URL, requestSignal } from "./config"

type BriefInput = {
  intel: NightWatchIntel
  market: SodexMarket
  mode: ProtectionMode
  portfolioValue: number
  sleepMode: boolean
}

type OpenAIResponse = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      text?: string
      type?: string
    }>
  }>
}

function clampText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text
}

function extractOutputText(response: OpenAIResponse) {
  if (response.output_text) return response.output_text

  return (
    response.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text || "")
      .join("")
      .trim() || ""
  )
}

function parseJsonObject(value: string) {
  const trimmed = value.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OpenAI brief did not return JSON")
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
}

function buildFallbackBrief(input: BriefInput, reason?: string): NightWatchAiBrief {
  const topMover = [...input.intel.assets].sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h))[0]
  const primaryAction = input.intel.actions.find((action) => action.status === "armed") || input.intel.actions[0]
  const sleepCopy = input.sleepMode ? "Sleep Mode is active" : "Sleep Mode is paused"

  return {
    sourceStatus: "fallback",
    model: reason || "deterministic-risk-brief",
    generatedAt: new Date().toISOString(),
    headline: `${input.intel.level} overnight risk with ${input.mode} protection`,
    briefing: `${sleepCopy}. NightWatch sees a ${input.intel.score}/100 danger score, with ${topMover?.symbol || "major crypto"} driving the largest 24h move. The deterministic brief is using the latest available SoSoValue, SSI, and SoDEX signals.`,
    tradeRationale: primaryAction
      ? `${primaryAction.title}: ${primaryAction.description}. The action is ${primaryAction.status} and still requires wallet approval before SoDEX execution.`
      : "No protection action is armed yet. Keep monitoring SoSoValue signals and SoDEX liquidity.",
    nextActions: input.intel.actions.slice(0, 3).map((action) => `${action.title}: ${action.status}`),
    sourceSnippets: input.intel.sourceSnippets.slice(0, 4),
    confidence: input.intel.sourceStatus === "live" && input.market.sourceStatus === "live" ? "medium" : "low",
  }
}

export async function getNightWatchAiBrief(input: BriefInput): Promise<NightWatchAiBrief> {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL

  if (!apiKey) {
    return buildFallbackBrief(input, "missing-openai-api-key")
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: requestSignal(20_000),
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        instructions:
          "You are NightWatch AI, an overnight crypto risk manager. Return compact JSON only. Never claim an order executed unless the payload says it executed. Keep every recommendation wallet-approved and testnet-aware. Cite only the provided sourceSnippets by title/source.",
        input: JSON.stringify({
          task: "Create a concise dashboard risk brief for a crypto trader going offline.",
          portfolioValue: input.portfolioValue,
          protectionMode: input.mode,
          sleepMode: input.sleepMode,
          dangerScore: input.intel.score,
          riskLevel: input.intel.level,
          sourceStatus: {
            sosovalue: input.intel.sourceStatus,
            sodex: input.market.sourceStatus,
          },
          signals: input.intel.signals.slice(0, 8),
          components: input.intel.components.slice(0, 8),
          validationScenarios: input.intel.scenarios.slice(0, 5),
          sourceSnippets: input.intel.sourceSnippets.slice(0, 8),
          actions: input.intel.actions.slice(0, 5),
          assets: input.intel.assets.slice(0, 8),
          indexes: input.intel.indexes.slice(0, 4),
          macroEvents: (input.intel.macroEvents || []).slice(0, 6),
          sodexTickers: input.market.tickers.slice(0, 6),
          requiredJsonShape: {
            headline: "short risk headline",
            briefing: "two sentence trader-friendly brief",
            tradeRationale: "why this protection action makes sense",
            nextActions: ["three short dashboard actions"],
            citedSourceTitles: ["source titles used"],
            confidence: "high | medium | low",
          },
        }),
        max_output_tokens: 500,
      }),
      next: { revalidate: 0 },
    })

    const json = (await response.json()) as OpenAIResponse & { error?: { message?: string } }
    if (!response.ok) {
      throw new Error(json.error?.message || "OpenAI brief request failed")
    }

    const parsed = parseJsonObject(extractOutputText(json))
    const confidence = parsed.confidence === "high" || parsed.confidence === "low" ? parsed.confidence : "medium"

    return {
      sourceStatus: "openai",
      model,
      generatedAt: new Date().toISOString(),
      headline: clampText(parsed.headline, `${input.intel.level} overnight risk`, 100),
      briefing: clampText(parsed.briefing, input.intel.summary, 320),
      tradeRationale: clampText(parsed.tradeRationale, input.intel.actions[0]?.description || input.intel.summary, 260),
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions.slice(0, 3).map((action) => clampText(action, "Review protection plan", 80))
        : buildFallbackBrief(input).nextActions,
      sourceSnippets: input.intel.sourceSnippets.slice(0, 4),
      confidence,
    }
  } catch (error) {
    return buildFallbackBrief(input, error instanceof Error ? error.message : "openai-brief-failed")
  }
}
