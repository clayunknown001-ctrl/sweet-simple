/**
 * OpenAI-compatible chat completions with a single forced function tool.
 * Works with Groq and OpenRouter (and any OpenAI-compatible endpoint).
 */
export async function callOpenAIStyleToolCall(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string | unknown[];
  toolName: string;
  toolDescription: string;
  parameters: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}): Promise<{ args: unknown }> {
  const {
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    userContent,
    toolName,
    toolDescription,
    parameters,
    extraHeaders = {},
  } = options;

  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: toolDescription,
            parameters,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    const err: Error & { status?: number } = new Error(`${res.status}: ${t.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (tc?.function?.arguments) {
    return { args: JSON.parse(tc.function.arguments) };
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return { args: JSON.parse(content) };
  }
  throw new Error("OpenAI-compatible: no tool call in response");
}

export function parseOrder(envVal: string | undefined, fallback: string[]): string[] {
  if (!envVal?.trim()) return [...fallback];
  return envVal.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function openRouterHeaders(): Record<string, string> {
  const site = Deno.env.get("OPENROUTER_SITE_URL") || "https://localhost";
  const title = Deno.env.get("OPENROUTER_APP_NAME") || "Content Insight AI";
  return {
    "HTTP-Referer": site,
    "X-Title": title,
  };
}
