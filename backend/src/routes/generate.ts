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
    return `Write one finished cold outreach follow-up message.

Inputs:
Target audience, meaning who we are writing to: ${target}
Offer, meaning exactly what the sender sells: ${offer}
Tone: ${tone}
Channel: ${channel}
Follow-up type: ${followUpType || "polite reminder"}
Previous message:
${previousMessage || ""}

Core task:
- Generate a follow-up, not a new first message.
- Reference the previous message naturally.
- Add one new useful angle connected directly to the offer.
- The message must connect the target audience and offer directly.

Rules:
- Hard limit: maximum 60 words.
- Maximum 3 to 4 sentences.
- If your draft is over 80 words, rewrite it internally before answering.
- Do not invent unrelated products.
- Do not invent unrelated industries.
- Do not assume the sender sells something different from the offer.
- If the input is vague, make the best realistic interpretation, but never drift away from the offer.
- Avoid "just following up".
- No guilt-tripping.
- No pushy language.
- Use simple English.
- Sound like a real person wrote it.
- Write like a founder texting another founder.
- Use short sentences, ideally 5 to 12 words each.
- Let the phrasing be a little plain or imperfect.
- Keep it human and slightly informal, even when tone is professional.
- No corporate language and no marketing agency voice.
- Avoid polished AI phrases: "you pour immense effort", "visually communicate value", "showcase", "guides visitors".
- Avoid vague phrases: "help protect", "improve experience", "enhance", "optimize", "drive growth", "online presence", "user engagement", "solutions", "let's discuss how we can help".
- Replace vague offer wording with one concrete situation, behavior, or problem.
- Prefer real-world outcomes over abstract benefits.
- Do not use emojis.
- Do not use bullet points.
- Do not use placeholders or square brackets.
- Do not explain your reasoning.
- Return only the final message.`;
  }

  return `Write one finished cold outreach message for LeadFlow.

Inputs:
Target audience, meaning who we are writing to: ${target}
Offer, meaning exactly what the sender sells: ${offer}
Tone: ${tone}
Channel: ${channel}

Core task:
- Hard limit: maximum 60 words. Never exceed this.
- Maximum 3 to 4 sentences.
- Each sentence should be 5 to 12 words when possible.
- The message must connect the target audience and offer directly.
- Treat the offer as the sender's actual product or service.
- Do not sell anything except the offer.
- If the target or offer is vague, make the best realistic interpretation, but never drift away from the offer.

Required structure:
- Sentence 1: greeting plus specific observation that explicitly mentions the target.
- Sentence 2: concrete problem the target has that is directly related to the offer.
- Sentence 3: explain the offer in simple terms and how it helps.
- Sentence 4: simple, low-friction CTA.

Tone guidance:
- friendly = casual, warm, confident, and sharp.
- professional = clear, but still slightly informal.
- direct = short, specific, no fluff.
- Overall tone = like a founder texting another founder, not a marketing agency.

CTA examples:
- Want me to show you?
- Open to a quick look?
- Should I send a couple examples?

Strict rules:
- If your draft is over 80 words, rewrite it internally before answering.
- Mention the target explicitly.
- Connect directly to the offer.
- Use concrete wording; no abstract benefits.
- Mention a real behavior or situation the target would recognize.
- Name the practical problem in physical or observable terms when possible.
- Replace vague phrases with specific outcomes:
  - Bad: "helps protect devices"
  - Good: "improves grip so the phone doesn't slip from your hands"
  - Bad: "improve experience"
  - Good: "cuts the steps between landing on the page and booking a demo"
- Do not invent unrelated products.
- Do not invent unrelated industries.
- Do not assume the sender sells something different from the offer.
- Remove long intros, storytelling, generic phrases, and filler words.
- Use simple English.
- Sound like a real person wrote it.
- Use everyday words.
- Let the phrasing be slightly imperfect and human.
- Avoid overly polished structure.
- Avoid corporate tone, AI tone, and all buzzwords.
- Do not use these phrases: "you pour immense effort", "visually communicate value", "showcase", "guides visitors", "help protect", "helps protect", "improve experience", "enhance", "optimize", "drive growth", "online presence", "user engagement", "solutions", "let's discuss how we can help".
- Do not use generic claims like "many companies struggle with user engagement".
- Do not use placeholders or square brackets.
- Do not include [Name], [Company], [Target Audience], [Offer], or [Benefit].
- Do not use emojis.
- Do not use bullet points.
- Do not explain your reasoning.
- Return only the final message.

Few-shot examples:
Example bad:
Target: teenagers who use iPhones
Offer: soft
Bad output: Hi there, I noticed teens using iPhones are always looking for better drinks. Our soft drink helps them stay refreshed throughout the day. Want to try it?
Why bad: it invented an unrelated product and guessed an unrelated industry instead of staying grounded in the offer.

Example bad:
Target: iPhone users
Offer: phone cases
Bad output: Hi there, iPhone users need products that help protect devices and improve the experience. My cases are great solutions for daily use. Want to see them?
Why bad: it uses vague phrases instead of real behavior and concrete problems.

Example bad:
Target: SaaS founders
Offer: landing page design
Bad output: Hi there, you pour immense effort into your product, but your site may not visually communicate value or guide visitors clearly.
Why bad: it sounds like AI marketing copy, not a person.

Example good:
Target: iPhone users
Offer: grippy phone cases
Good output:
Hi there, iPhone users pull their phone out everywhere. Slick cases make drops way too easy. I sell grippy cases that feel easier to hold. Want me to send a couple examples?

Example good:
Target: early-stage SaaS founders
Offer: conversion-focused web design
Good output:
Hi there, early-stage SaaS founders often have solid products. The landing page just makes people work too hard. I design pages that make the offer clear faster. Open to a quick look?

Do not copy the example. Do not use placeholders. Do not explain. Return only the final message.`;
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
