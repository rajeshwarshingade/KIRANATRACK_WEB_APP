/**
 * Optional hosted-LLM layer.
 *
 * This is deliberately the *smallest* part of the intelligence in the app. The
 * advisor in `advisor.ts` does the actual analysis and works with no network
 * and no key. This module only turns those findings into prose, because
 * "explain this to the shop owner" is a language task rather than an analysis
 * task — and doing it with a model is worth it exactly when it is available.
 *
 * Three properties are enforced here, in this order of importance:
 *
 *  1. **It is genuinely optional.** No provider configured means `askAi` returns
 *     a typed error and every other feature of the app is unaffected. A shop on
 *     a 2G connection with no key loses nothing.
 *
 *  2. **The model never sees raw customer data.** What is sent is the advisor's
 *     own findings — product names and rupee amounts, no names, no phone
 *     numbers, no addresses. A udhaar ledger is the most sensitive thing in a
 *     neighbourhood shop, and it is never part of this request.
 *
 *  3. **The key stays on the device.** It is read from local settings at call
 *     time, used for one request, and never persisted anywhere but the owner's
 *     own device. It is also stripped from every backup file.
 */

import type { AdvisorInsight } from "./types";
import { formatMoney } from "./money";

export type AiResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

interface ProviderSpec {
  /** Full endpoint for a chat completion. */
  url: string;
  /** Default model when the owner has not chosen one. */
  defaultModel: string;
  /** Build the request body for this provider's message format. */
  body: (prompt: string, model: string) => Record<string, unknown>;
  /** Pull the assistant text out of a response body. */
  read: (payload: unknown) => string | null;
  /** Header carrying the credential. */
  authHeader: (key: string) => Record<string, string>;
}

const PROVIDERS: Record<string, ProviderSpec> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    body: (prompt, model) => ({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a shop advisor for a small Indian kirana store. You are " +
            "given analysis computed from the shop's own records. Explain it in " +
            "plain, practical English to the owner. Be brief — under 200 words. " +
            "Give concrete numbers from the analysis. Do not invent facts that " +
            "are not in the analysis. Do not use jargon or bullet-point headers.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    }),
    read: (payload) => {
      const choices = (payload as { choices?: { message?: { content?: string } }[] })
        ?.choices;
      return choices?.[0]?.message?.content ?? null;
    },
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },

  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    defaultModel: "gemini-1.5-flash",
    body: (prompt, model) => ({
      // Gemini takes the model in the URL, not the body.
      system_instruction: {
        parts: [
          {
            text:
              "You are a shop advisor for a small Indian kirana store. Explain " +
              "the analysis you are given in plain, practical English. Under 200 " +
              "words. Use only the numbers provided.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      __model: model,
    }),
    read: (payload) => {
      const candidates = (payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates;
      return candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    },
    authHeader: (key) => ({ "x-goog-api-key": key }),
  },

  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    body: (prompt, model) => ({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a shop advisor for a small Indian kirana store. Explain the " +
            "analysis in plain, practical English to the owner. Under 200 words. " +
            "Use only the numbers provided.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    }),
    read: (payload) => {
      const choices = (payload as { choices?: { message?: { content?: string } }[] })
        ?.choices;
      return choices?.[0]?.message?.content ?? null;
    },
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },

  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-3-5-haiku-latest",
    body: (prompt, model) => ({
      model,
      max_tokens: 400,
      system:
        "You are a shop advisor for a small Indian kirana store. Explain the " +
        "analysis you are given in plain, practical English. Under 200 words.",
      messages: [{ role: "user", content: prompt }],
    }),
    read: (payload) => {
      const content = (payload as { content?: { text?: string }[] })?.content;
      return content?.[0]?.text ?? null;
    },
    authHeader: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
};

export interface AiRequest {
  provider: string | null;
  apiKey: string;
  model: string;
  /** The advisor's own findings — already computed, already private. */
  insights: AdvisorInsight[];
  /** A few headline numbers for context. */
  summary: { label: string; value: string }[];
}

/**
 * Ask the configured model to explain the advisor's findings.
 *
 * Never throws — every failure mode (no key, bad key, offline, rate limited,
 * malformed response) returns a message the UI can show directly.
 */
export async function askAi(request: AiRequest): Promise<AiResult> {
  const { provider, apiKey, model, insights, summary } = request;

  if (!provider) {
    return {
      ok: false,
      error:
        "No AI provider is set up. Add a key in Settings to get a written briefing — everything else here works without one.",
    };
  }

  if (!apiKey.trim()) {
    return { ok: false, error: "The API key is empty. Add one in Settings." };
  }

  const spec = PROVIDERS[provider];
  if (!spec) {
    return { ok: false, error: `"${provider}" is not a supported provider.` };
  }

  const prompt = buildPrompt(insights, summary);
  const chosenModel = model.trim() || spec.defaultModel;

  let url = spec.url;
  let body = spec.body(prompt, chosenModel);

  // Gemini carries the model in the path, so it is lifted out of the body.
  if (provider === "gemini") {
    const withModel = body as { __model?: string };
    url = `${spec.url}/${chosenModel}:generateContent`;
    delete withModel.__model;
    body = withModel;
  }

  const controller = new AbortController();
  // A shop counter on a slow connection must not leave the button spinning
  // forever, so the request is abandoned rather than left pending.
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...spec.authHeader(apiKey.trim()),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Include the provider's own message where there is one — "insufficient
      // quota" is far more actionable than a generic failure.
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `The provider returned an error (${response.status}). ${
          detail ? detail.slice(0, 180) : "Check the key and try again."
        }`,
      };
    }

    const payload: unknown = await response.json();
    const text = spec.read(payload);

    if (!text) {
      return { ok: false, error: "The provider replied but sent nothing readable." };
    }

    return { ok: true, text: text.trim() };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "That took too long — the connection may be slow or offline." };
    }
    // A shop with no data connection lands here, and it must read as ordinary
    // rather than as an error in the app.
    return {
      ok: false,
      error: "Could not reach the AI provider. Your own analysis below works offline.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build the prompt.
 *
 * The advisor's findings are included verbatim in structured form rather than
 * re-described, so the model summarises real findings instead of inventing its
 * own. Notably absent: customer names, phone numbers and addresses.
 */
function buildPrompt(
  insights: AdvisorInsight[],
  summary: { label: string; value: string }[],
): string {
  const context = summary
    .map((item) => `- ${item.label}: ${item.value}`)
    .join("\n");

  const findings = insights.length
    ? insights
        .map((insight, index) => {
          const money = insight.impact === null ? "" : ` (${formatMoney(insight.impact)} at stake)`;
          return `${index + 1}. [${insight.severity}] ${insight.title}${money}\n   ${insight.detail}`;
        })
        .join("\n")
    : "No issues were found in the current data.";

  return `Here is an analysis of an Indian kirana store, computed from its own records.

Shop summary:
${context}

Findings:
${findings}

Write a short briefing for the shop owner: what matters most today, what to do first, and why. Reference the rupee figures above. Do not add anything that is not in the findings.`;
}

/** Providers offered in Settings, with their default models. */
export const AI_PROVIDERS = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { id: "gemini", label: "Google Gemini", defaultModel: "gemini-1.5-flash" },
  { id: "groq", label: "Groq", defaultModel: "llama-3.3-70b-versatile" },
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-3-5-haiku-latest" },
] as const;

/** Default model for a provider id, or an empty string when unrecognised. */
export function defaultModelFor(provider: string): string {
  return PROVIDERS[provider]?.defaultModel ?? "";
}
