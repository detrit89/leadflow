import { Router, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

type GenerateMessageRequest = {
  target?: string;
  offer?: string;
  tone?: string;
  channel?: string;
  previousMessage?: string;
  followUpType?: string;
};

type GenerateMessageResponse = {
  message: string;
};

type ErrorResponse = {
  error: string;
};

const router = Router();

type BuildSalesPromptInput = {
  target: string;
  offer: string;
  tone: string;
  channel: string;
  previousMessage?: string;
  followUpType?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;

    if (typeof status === "number") {
      return status;
    }
  }

  const statusMatch = getErrorMessage(error).match(/"code":\s*(\d{3})|status code (\d{3})/i);
  const status = statusMatch?.[1] ?? statusMatch?.[2];

  return status ? Number(status) : undefined;
}

function isInvalidApiKeyError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("api key not valid") ||
    message.includes("api_key_invalid") ||
    message.includes("invalid api key") ||
    message.includes("permission denied") ||
    message.includes("unauthenticated")
  );
}

function isGeminiBusyError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  return (
    status === 429 ||
    status === 503 ||
    message.includes('"code":429') ||
    message.includes('"code":503') ||
    message.includes("status code 429") ||
    message.includes("status code 503") ||
    message.includes("too many requests") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("high demand")
  );
}

function buildSalesPrompt({
  target,
  offer,
  tone,
  channel,
  previousMessage,
  followUpType,
}: BuildSalesPromptInput): string {
  if (previousMessage?.trim() || followUpType?.trim()) {
    return `Generate a short follow-up message.

Inputs:
Target: ${target}
Offer: ${offer}
Tone: ${tone}
Channel: ${channel}
Follow-up type: ${followUpType || "polite reminder"}
Previous message:
${previousMessage || ""}

Rules:
- Reference the previous message naturally, without repeating it.
- No guilt-tripping.
- No pushy language.
- Avoid the phrase "just following up" if possible.
- Keep it under 70 words.
- Use simple English.
- Sound like a real person wrote it.
- Do not use emojis.
- Do not use bullet points.
- Do not use placeholders or square brackets.
- Return only the final message.`;
  }

  return `Write one finished cold outreach message for the selected channel.

Inputs:
Target audience: ${target}
Offer: ${offer}
Tone: ${tone}
Channel: ${channel}

If the target or offer is vague, infer a realistic business context and write for that context. Do not repeat vague wording back if it makes the message generic.

Message flow:
- Start with "Hi there," unless a real person's name is clearly provided.
- Open with a natural observation about this exact target audience.
- Mention one specific pain that realistically comes from the target audience and context.
- Connect the offer to one specific, practical benefit.
- End with a soft CTA that sounds natural, not salesy.

Tone guidance:
- friendly = casual, warm, human, confident, and direct.
- professional = clear and polished, but not stiff.
- direct = short, sharp, and straight to the point.

Channel guidance:
- LinkedIn DM = short and conversational.
- Email = slightly more complete, but still concise.
- Cold DM = very short, casual, and direct.

Rules:
- Keep it under 80 words.
- Use simple English.
- Sound like a real person wrote it.
- Avoid corporate tone and all buzzwords.
- Avoid vague phrases like "user engagement", "online presence", "enhance", "optimize", "drive growth", and "let's discuss how we can help".
- Do not write generic claims like "many SaaS companies struggle with user engagement".
- Use specific pain based on the target.
- Use specific benefit based on the offer.
- Do not sound like mass outreach.
- Do not use emojis.
- Do not use bullet points.
- Do not use placeholders or square brackets.
- Do not include [Name], [Company], [Target Audience], [Offer], or [Benefit].
- Return only the final message.

Style examples, do not copy:
Example 1:
Hi there,

I noticed early-stage SaaS teams often get decent landing page traffic, but the page does not make the product value clear fast enough. I help tighten the message and layout so more visitors understand the offer and sign up. Open to a quick look?

Example 2:
Hi there,

A lot of agencies lose time rewriting the same outreach for different niches. I help build simple message systems so each campaign feels more specific without starting from scratch. Worth testing on one campaign?

Do not copy the examples. Do not use placeholders. Do not explain. Return only the final message.`;
}

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  console.log("GEMINI_API_KEY exists:", Boolean(apiKey));

  if (!apiKey) {
    throw new Error("Invalid or missing GEMINI_API_KEY");
  }

  console.log("Using Gemini");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const message = response.text?.trim();

  if (!message) {
    throw new Error("Gemini returned an empty response.");
  }

  return message;
}

async function generateWithGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Invalid or missing GROQ_API_KEY");
  }

  const groq = new Groq({ apiKey });
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const message = response.choices[0]?.message?.content?.trim();

  if (!message) {
    throw new Error("Groq returned an empty response.");
  }

  return message;
}

function createMockMessage(
  target: string,
  offer: string,
  tone: string,
  previousMessage?: string,
  followUpType?: string,
): string {
  if (previousMessage || followUpType) {
    return `Hi there,

I wanted to add one practical thought to my earlier note. For ${target}, ${offer} can be easiest to test on one small workflow before changing anything bigger.

Would it be worth taking a quick look?`;
  }

  const directEnding =
    tone === "direct"
      ? "Open to a quick look this week?"
      : "Would you be open to a quick look this week?";

  return `Hi there,

I noticed ${target} often need to explain their value clearly before prospects take the next step. That can be hard when the offer is strong but the message feels too broad.

I help with ${offer} so the pitch feels sharper and easier to act on.

${directEnding}`;
}

router.post(
  "/generate-message",
  async (
    req: Request<object, GenerateMessageResponse | ErrorResponse, GenerateMessageRequest>,
    res: Response<GenerateMessageResponse | ErrorResponse>,
  ) => {
    const { target, offer, tone, channel, previousMessage, followUpType } = req.body;

    if (!target || !offer || !tone) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    if (
      typeof target !== "string" ||
      typeof offer !== "string" ||
      typeof tone !== "string" ||
      !target.trim() ||
      !offer.trim() ||
      !tone.trim()
    ) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const trimmedTarget = target.trim();
    const trimmedOffer = offer.trim();
    const trimmedTone = tone.trim();
    const trimmedChannel =
      typeof channel === "string" && channel.trim() ? channel.trim() : "LinkedIn DM";
    const trimmedPreviousMessage =
      typeof previousMessage === "string" ? previousMessage.trim() : undefined;
    const trimmedFollowUpType =
      typeof followUpType === "string" ? followUpType.trim() : undefined;
    const useMockAi = process.env.USE_MOCK_AI === "true";

    if (useMockAi) {
      return res.json({
        message: createMockMessage(
          trimmedTarget,
          trimmedOffer,
          trimmedTone,
          trimmedPreviousMessage,
          trimmedFollowUpType,
        ),
      });
    }

    const prompt = buildSalesPrompt({
      target: trimmedTarget,
      offer: trimmedOffer,
      tone: trimmedTone,
      channel: trimmedChannel,
      previousMessage: trimmedPreviousMessage,
      followUpType: trimmedFollowUpType,
    });

    try {
      const message = await generateWithGemini(prompt);
      return res.json({ message });
    } catch (error) {
      console.error("Gemini failed:", getErrorMessage(error));

      if (isInvalidApiKeyError(error)) {
        return res.status(500).json({ error: "Invalid or missing GEMINI_API_KEY" });
      }

      if (isGeminiBusyError(error)) {
        console.log("Falling back to Groq");

        try {
          const message = await generateWithGroq(prompt);
          return res.json({ message });
        } catch (groqError) {
          console.error("Groq failed:", getErrorMessage(groqError));
          return res.status(500).json({ error: "All AI providers failed" });
        }
      }

      return res.status(500).json({ error: "Failed to generate message." });
    }
  },
);

export default router;
