import { Router, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

type GenerateMessageRequest = {
  target?: string;
  segment?: string;
  situation?: string;
  hypothesis?: string;
  offer?: string;
  tone?: string;
  channel?: string;
  language?: string;
  previousMessage?: string;
  followUpType?: string;
};

type GenerateMessageResponse = {
  message: string;
  messages?: string[];
  direct?: string;
  soft?: string;
  curiosity?: string;
};

type ErrorResponse = {
  error: string;
};

const router = Router();

type BuildSalesPromptInput = {
  target: string;
  situation?: string;
  hypothesis?: string;
  offer: string;
  tone: string;
  channel: string;
  language: "english" | "russian";
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
  situation,
  hypothesis,
  offer,
  tone,
  channel,
  language,
  previousMessage,
  followUpType,
}: BuildSalesPromptInput): string {
  if (language === "russian") {
    if (previousMessage?.trim() || followUpType?.trim()) {
      return `Напиши одно готовое follow-up сообщение для холодного outreach.

Входные данные:
Кому пишем: ${target}
Что продает отправитель: ${offer}
Тон: ${tone}
Канал: ${channel}
Тип follow-up: ${followUpType || "polite reminder"}
Предыдущее сообщение:
${previousMessage || ""}

Задача:
- Напиши follow-up, а не первое сообщение.
- Естественно оттолкнись от прошлого сообщения.
- Добавь один новый полезный угол, напрямую связанный с оффером.
- Все сообщение должно быть на русском.
- Должно звучать как короткое сообщение в Telegram или DM.
- Пиши как реальный человек, который лично посмотрел бизнес или страницу адресата.
- Сообщение должно звучать как 1 человек пишет другому, не как компания продает компании.

Правила:
- Максимум 4-5 коротких предложений.
- Каждое предложение максимум 10-12 слов.
- Пиши очень просто, как человек быстро печатает в DM.
- Должно ощущаться как быстрая мысль в чате.
- Не делай структуру похожей на питч.
- Не объясняй долго.
- Не раскладывай мысль слишком логично.
- Текст должен быть чуть несовершенным, как будто его написал человек.
- Можно использовать простые слова и легкие повторы.
- Можно звучать casual.
- Не делай текст гладким, рекламным или слишком аккуратным.
- Не используй сложные обороты и длинные связки.
- Не используй абстрактные слова: "ценность", "взаимодействие", "восприятие", "позиционирование", "коммуникация".
- Пиши конкретно: "не сразу понятно, что вы предлагаете".
- Начало ОБЯЗАТЕЛЬНО только одно из: "Привет", "Смотрел", "Заметил", "Есть ощущение".
- Никогда не начинай с: "Здравствуйте", "Добрый день", "Нередко компании", "Многие компании", "Мы предлагаем", "Наша компания".
- Должна быть легкая неуверенность: используй "есть ощущение", "скорее всего" или "может быть".
- Не используй "просто напоминаю" и похожие фразы.
- Не дави на чувство вины.
- Не звучать навязчиво.
- Используй простой живой русский.
- Используй разговорные фразы и немного неуверенности: "скорее всего", "возможно".
- Начинай естественно, например: "Смотрел...", "Заметил...", "Есть ощущение...".
- Не звучать как корпоративный скрипт.
- Не звучать как sales script, маркетинговое агентство или формальное письмо.
- Не начинай с "Добрый день" или "Здравствуйте".
- Не используй формальные фразы: "наша компания", "предлагаем сотрудничество".
- Не используй роботские фразы: "повысить эффективность", "эффективные решения", "оптимизировать процессы", "инновационные решения", "давайте обсудим сотрудничество", "мы предлагаем".
- Не используй англицизмы без необходимости.
- Если тон friendly или direct, можно использовать "ты".
- Если тон professional, используй "вы".
- Не используй эмодзи.
- Не используй списки.
- Не используй плейсхолдеры или квадратные скобки.
- Не объясняй.
- Верни только финальное сообщение.`;
    }

    return `Сгенерируй 3 разных холодных outreach сообщения на русском.

Входные данные:
Segment / кто лид: ${target}
Offer / что предлагаем: ${offer}
Situation / что у них сейчас: ${situation || "Не указано. Аккуратно выведи из segment."}
Hypothesis / что может быть не так: ${hypothesis || "Не указано. Аккуратно выведи из situation и segment."}
Тон: ${tone}
Канал: ${channel}

Типы сообщений:
1. direct — прямое наблюдение + легкий мост к офферу.
2. soft — нейтрально, как начало обсуждения.
3. curiosity — крючок через интересный вопрос.

Жесткие правила:
- Все сообщения только на русском.
- Начинай с наблюдения, НЕ с приветствия.
- Никогда не начинай с "Привет", "Здравствуйте", "Добрый день".
- Никогда не используй: "компании сталкиваются", "многие бизнесы", "мы помогаем", "наша компания".
- Не используй формальные фразы и корпоративный русский.
- Не используй sales script.
- Не используй эмодзи.
- Не используй списки внутри сообщений.
- Не объясняй.
- Каждое сообщение максимум 2-4 короткие строки.
- Каждая строка короткая, без длинных объяснений.
- Сообщение должно звучать как живой DM.
- Стиль casual, но уважительный.
- Как будто ты реально посмотрел продукт, сайт или бизнес.
- Можно использовать легкую неуверенность: "есть ощущение", "похоже", "может быть".
- Обязательно напрямую оттолкнись от Situation или Hypothesis.
- Не пиши очевидные общие мысли.
- Не пиши "мы строим сайты", "мы делаем сайты", "помогаем расти".
- Свяжи Offer с конкретной проблемой из Situation/Hypothesis.

Формат:
- Верни только JSON.
- Никакого markdown.
- Никакого текста до или после JSON.
- JSON должен быть ровно такой формы:
{
  "direct": "...",
  "soft": "...",
  "curiosity": "..."
}

Пример стиля, не копируй:
{
  "direct": "Заметил, что на странице сначала идут функции, а не проблема.\\nИз-за этого не сразу понятно, зачем продукт нужен.\\nЯ как раз работаю с такими лендингами.\\nМогу скинуть пару конкретных правок?",
  "soft": "Похоже, на сайте много полезного, но главный смысл прячется ниже.\\nЕсть ощущение, часть людей может не дочитывать.\\nМожно было бы чуть проще подвести к офферу.\\nИнтересно глянуть на это вместе?",
  "curiosity": "Смотрел страницу и зацепился за один момент.\\nКажется, ценность продукта раскрывается чуть поздно.\\nОбычно это сильно влияет на первые клики.\\nХочешь, покажу где именно?"
}`;
  }

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

  return `Generate 3 finished cold outreach messages based on real context, not templates.

Inputs:
Segment, meaning who the lead is: ${target}
Situation, meaning what they currently have: ${situation || "Not specified. Infer a realistic current situation from the segment."}
Hypothesis, meaning what might be wrong: ${hypothesis || "Not specified. Infer one realistic issue from the situation and segment."}
Offer, meaning exactly what the sender does: ${offer}
Tone: ${tone}
Channel: ${channel}

Core task:
- Generate exactly 3 variants: direct, soft, curiosity-based.
- Each variant must be 2 to 4 lines maximum.
- Each variant must feel based on the actual segment, situation, hypothesis, and offer.
- Treat the offer as the sender's actual product or service.
- Do not sell anything except the offer.
- If inputs are vague, make the best realistic interpretation, but never drift away from the offer.

Required structure:
- Line 1: personal observation.
- Line 2: implication, why it matters.
- Line 3: soft bridge to the offer.
- Line 4: low-pressure CTA.

Opening hook rules:
- Every variant must start with exactly one of these:
  - "Noticed..."
  - "Looks like..."
  - "Saw that..."
- Do not start with "Hi there".
- Line 1 must reference the situation or hypothesis directly.
- Line 1 must feel like a real observation, not a generic industry statement.

Tone guidance:
- Human, slightly informal, not corporate, not pushy.
- direct = shortest and clearest.
- soft = warm but still specific.
- curiosity-based = creates a concrete question without sounding clickbait.
- Overall tone = like a founder texting another founder.

CTA examples:
- Want me to show you?
- Open to a quick look?
- Should I send a couple examples?
- Worth checking?
- Want a quick teardown?

Strict rules:
- Must reference the situation or hypothesis directly.
- Avoid obvious sales language.
- Avoid generic phrases.
- No "we help businesses grow".
- No "we build websites".
- No "enhance", "optimize", "drive growth", "online presence", "user engagement", "solutions".
- No "let's discuss how we can help".
- Use concrete wording and real context.
- Mention observable behavior or a specific business problem.
- Do not invent unrelated products.
- Do not invent unrelated industries.
- Do not assume the sender sells something different from the offer.
- Use simple English.
- Sound like a real person wrote it.
- Use everyday words.
- Do not use placeholders or square brackets.
- Do not include [Name], [Company], [Target Audience], [Offer], or [Benefit].
- Do not use emojis.
- Do not use bullet points.
- Do not explain your reasoning.
- Return only valid JSON.
- JSON shape must be exactly:
{
  "messages": [
    "direct variant",
    "soft variant",
    "curiosity-based variant"
  ]
}

Example good:
Segment: early-stage SaaS founders
Situation: landing page explains features before the core pain
Hypothesis: visitors do not understand the product fast enough
Offer: conversion-focused landing page redesign
Good direct variant:
Noticed your page gets into features before the problem is clear.
That can lose people before the product clicks.
I tighten SaaS landing pages so the value lands faster.
Open to a quick look?

Do not copy the example. Return only valid JSON.`;
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

function parseGeneratedMessages(text: string): string[] {
  const trimmedText = text.trim();

  try {
    const parsed = JSON.parse(trimmedText) as {
      messages?: unknown;
      direct?: unknown;
      soft?: unknown;
      curiosity?: unknown;
    };

    const keyedMessages = [parsed.direct, parsed.soft, parsed.curiosity]
      .filter((message): message is string => typeof message === "string")
      .map((message) => message.trim())
      .filter(Boolean);

    if (keyedMessages.length === 3) return keyedMessages;

    if (Array.isArray(parsed.messages)) {
      const messages = parsed.messages
        .filter((message): message is string => typeof message === "string")
        .map((message) => message.trim())
        .filter(Boolean);

      if (messages.length >= 3) return messages.slice(0, 3);
    }
  } catch {
    // Fall back to text parsing below when a provider returns prose.
  }

  const stripped = trimmedText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(stripped) as {
      messages?: unknown;
      direct?: unknown;
      soft?: unknown;
      curiosity?: unknown;
    };

    const keyedMessages = [parsed.direct, parsed.soft, parsed.curiosity]
      .filter((message): message is string => typeof message === "string")
      .map((message) => message.trim())
      .filter(Boolean);

    if (keyedMessages.length === 3) return keyedMessages;

    if (Array.isArray(parsed.messages)) {
      const messages = parsed.messages
        .filter((message): message is string => typeof message === "string")
        .map((message) => message.trim())
        .filter(Boolean);

      if (messages.length >= 3) return messages.slice(0, 3);
    }
  } catch {
    // Continue with loose parsing.
  }

  const messages = stripped
    .split(/\n\s*(?:---+|\d+[.)]|direct:|soft:|curiosity(?:-based)?:)\s*/i)
    .map((message) => message.trim())
    .filter(Boolean);

  if (messages.length >= 3) return messages.slice(0, 3);

  return [stripped].filter(Boolean);
}

function formatGeneratedMessages(messages: string[]): string {
  return messages
    .map((message, index) => {
      const labels = ["Direct", "Soft", "Curiosity-based"];
      return `${labels[index] ?? `Variant ${index + 1}`}:\n${message}`;
    })
    .join("\n\n");
}

function createVariantResponse(messages: string[]): GenerateMessageResponse {
  return {
    message: formatGeneratedMessages(messages),
    messages,
    direct: messages[0] ?? "",
    soft: messages[1] ?? "",
    curiosity: messages[2] ?? "",
  };
}

function createMockMessage(
  target: string,
  offer: string,
  tone: string,
  language: "english" | "russian",
  previousMessage?: string,
  followUpType?: string,
  situation?: string,
  hypothesis?: string,
): string {
  if (language === "russian") {
    if (previousMessage || followUpType) {
      return tone === "professional"
        ? `Заметил еще одну вещь по ${target}. Есть ощущение, что ${offer} можно проверить маленьким тестом. Так быстрее понятно, есть ли смысл. Открыты к короткому взгляду?`
        : `Заметил еще одну вещь по ${target}. Может быть, ${offer} можно проверить маленьким тестом. Так быстрее понятно, есть ли смысл. Показать, как это может выглядеть?`;
    }

    return tone === "professional"
      ? `Смотрел ${target}. Есть ощущение, что не сразу понятно, что вы предлагаете. Люди, скорее всего, уходят раньше. Я сейчас работаю с ${offer}. Открыты к короткому взгляду?`
      : `Привет. Смотрел ${target}. Есть ощущение, что не сразу понятно, что вы предлагаете. Люди, скорее всего, уходят раньше. Я сейчас работаю с ${offer}. Показать пару идей?`;
  }

  if (previousMessage || followUpType) {
    return `Hi there,

I wanted to add one practical thought to my earlier note. For ${target}, ${offer} can be easiest to test on one small workflow before changing anything bigger.

Would it be worth taking a quick look?`;
  }

  const context = situation || hypothesis || `${target} may be losing interest before the offer is clear`;

  return `Noticed ${context}.
That can make people leave before they act.
I use ${offer} to make that next step clearer.
Open to a quick look?`;
}

function createMockMessages(
  target: string,
  offer: string,
  situation?: string,
  hypothesis?: string,
  language: "english" | "russian" = "english",
): string[] {
  const context = situation || hypothesis || `${target} may not be clear enough at first glance`;

  if (language === "russian") {
    return [
      `Заметил, что ${context}.
Из-за этого часть людей может быстро отваливаться.
${offer} тут можно подать чуть точнее.
Показать, где именно?`,
      `Похоже, у ${target} сейчас ${context}.
Есть ощущение, это мешает быстро понять суть.
Можно аккуратно связать это с ${offer}.
Хочешь, накину пару мыслей?`,
      `Смотрел и зацепился за один момент.
Кажется, ${hypothesis || context}.
Если поправить это через ${offer}, отклик может быть теплее.
Интересно глянуть?`,
    ];
  }

  return [
    `Noticed ${context}.
That can cost attention pretty fast.
I can use ${offer} to tighten the path.
Open to a quick look?`,
    `Looks like ${context}.
Some good leads might not get the point quickly.
I work on ${offer} for exactly that gap.
Want me to send a couple ideas?`,
    `Saw that ${context}.
Might be worth checking before sending more traffic there.
${offer} could make the next step easier.
Worth a quick teardown?`,
  ];
}

router.post(
  "/generate-message",
  async (
    req: Request<object, GenerateMessageResponse | ErrorResponse, GenerateMessageRequest>,
    res: Response<GenerateMessageResponse | ErrorResponse>,
  ) => {
    const {
      target,
      segment,
      situation,
      hypothesis,
      offer,
      tone,
      channel,
      language,
      previousMessage,
      followUpType,
    } = req.body;
    const targetInput = typeof segment === "string" && segment.trim() ? segment : target;

    if (!targetInput || !offer || !tone) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    if (
      typeof targetInput !== "string" ||
      typeof offer !== "string" ||
      typeof tone !== "string" ||
      !targetInput.trim() ||
      !offer.trim() ||
      !tone.trim()
    ) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const trimmedTarget = targetInput.trim();
    const trimmedSituation = typeof situation === "string" ? situation.trim() : undefined;
    const trimmedHypothesis = typeof hypothesis === "string" ? hypothesis.trim() : undefined;
    const trimmedOffer = offer.trim();
    const trimmedTone = tone.trim();
    const trimmedChannel =
      typeof channel === "string" && channel.trim() ? channel.trim() : "LinkedIn DM";
    const normalizedLanguage =
      typeof language === "string" && language.trim().toLowerCase() === "russian"
        ? "russian"
        : "english";
    const trimmedPreviousMessage =
      typeof previousMessage === "string" ? previousMessage.trim() : undefined;
    const trimmedFollowUpType =
      typeof followUpType === "string" ? followUpType.trim() : undefined;
    const useMockAi = process.env.USE_MOCK_AI === "true";
    const shouldGenerateVariants = !trimmedPreviousMessage && !trimmedFollowUpType;

    if (useMockAi) {
      if (shouldGenerateVariants) {
        const messages = createMockMessages(
          trimmedTarget,
          trimmedOffer,
          trimmedSituation,
          trimmedHypothesis,
          normalizedLanguage,
        );

        return res.json(createVariantResponse(messages));
      }

      return res.json({
        message: createMockMessage(
          trimmedTarget,
          trimmedOffer,
          trimmedTone,
          normalizedLanguage,
          trimmedPreviousMessage,
          trimmedFollowUpType,
          trimmedSituation,
          trimmedHypothesis,
        ),
      });
    }

    const prompt = buildSalesPrompt({
      target: trimmedTarget,
      situation: trimmedSituation,
      hypothesis: trimmedHypothesis,
      offer: trimmedOffer,
      tone: trimmedTone,
      channel: trimmedChannel,
      language: normalizedLanguage,
      previousMessage: trimmedPreviousMessage,
      followUpType: trimmedFollowUpType,
    });

    try {
      const message = await generateWithGemini(prompt);
      if (shouldGenerateVariants) {
        const messages = parseGeneratedMessages(message);
        return res.json(createVariantResponse(messages));
      }

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
          if (shouldGenerateVariants) {
            const messages = parseGeneratedMessages(message);
            return res.json(createVariantResponse(messages));
          }

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
