const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type ResponseTextFormat = {
  type: "json_schema";
  name: string;
  strict: boolean;
  schema: object;
  description?: string;
};

type CreateStructuredResponseInput = {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: object;
  timeoutMs?: number;
};

type OpenAITextContent = {
  type?: string;
  text?: string;
};

type OpenAIOutputItem = {
  content?: OpenAITextContent[];
};

type OpenAIResponse = {
  output_text?: string;
  output?: OpenAIOutputItem[];
};

export async function createStructuredOpenAIResponse({
  systemPrompt,
  userPrompt,
  schemaName,
  schema,
  timeoutMs = 2500,
}: CreateStructuredResponseInput): Promise<unknown | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey || apiKey.includes("example")) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_STATE_MODEL?.trim() || "gpt-4o-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
            description: "Tuti user state interpretation result",
          } satisfies ResponseTextFormat,
        },
        temperature: 0.2,
        max_output_tokens: 220,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OpenAIResponse;
    const text = data.output_text ?? readOutputText(data);

    if (!text) {
      return null;
    }

    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readOutputText(data: OpenAIResponse) {
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return undefined;
}
