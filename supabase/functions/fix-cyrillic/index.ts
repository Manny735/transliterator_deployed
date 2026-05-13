import Groq from "npm:groq-sdk";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_INSTRUCTION =
  "You are a Mongolian language expert. You will receive a sentence in Cyrillic that contains some Latin words inside square brackets [like_this]. Your task is to:\n" +
  "1. Convert the words inside the brackets into the correct Mongolian Cyrillic.\n" +
  "2. Use the surrounding Cyrillic context to choose the grammatically correct version (especially for particles like 'uu' vs 'үү').\n" +
  "3. Return the FULL sentence in clean Cyrillic. Remove all brackets. Output ONLY the fixed text.";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_GOOGLE_MODEL = "gemini-3-flash-preview";
const GOOGLE_FALLBACK_MODEL = "gemini-2.5-flash-lite";

type Provider = "groq" | "google";

function normalizeProvider(raw: unknown): Provider {
  if (raw === "groq") return "groq";
  if (raw === "google" || raw === "gemini") return "google";
  return "groq";
}

async function runGroq(text: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("Server misconfigured: missing GROQ_API_KEY");
  }
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: text },
    ],
  });
  return (completion.choices[0]?.message?.content ?? "").trim();
}

function shouldRetryGoogleError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { status?: unknown; message?: unknown; statusText?: unknown };
  const status = typeof maybe.status === "number" ? maybe.status : undefined;
  if (status === 503 || status === 429) return true;
  const message = `${String(maybe.message ?? "")} ${String(maybe.statusText ?? "")}`.toLowerCase();
  return (
    message.includes("high demand") ||
    message.includes("service unavailable") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithGoogleModel(
  genAI: GoogleGenerativeAI,
  text: string,
  modelId: string,
): Promise<string> {
  const model = genAI.getGenerativeModel(
    {
      model: modelId,
      systemInstruction: SYSTEM_INSTRUCTION,
    },
    { apiVersion: "v1beta" },
  );
  const result = await model.generateContent(text);
  const response = await result.response;
  return response.text().trim();
}

async function runGoogle(text: string, requestedModel?: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("Server misconfigured: missing GEMINI_API_KEY");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const preferredModel =
    typeof requestedModel === "string" && requestedModel.trim().length > 0
      ? requestedModel.trim()
      : DEFAULT_GOOGLE_MODEL;

  const modelsToTry = [preferredModel];
  if (
    preferredModel === DEFAULT_GOOGLE_MODEL &&
    DEFAULT_GOOGLE_MODEL !== GOOGLE_FALLBACK_MODEL
  ) {
    modelsToTry.push(GOOGLE_FALLBACK_MODEL);
  }

  let lastError: unknown;
  for (const modelId of modelsToTry) {
    try {
      return await generateWithGoogleModel(genAI, text, modelId);
    } catch (err) {
      lastError = err;
      if (!shouldRetryGoogleError(err)) throw err;
      await delay(600);
      try {
        return await generateWithGoogleModel(genAI, text, modelId);
      } catch (retryErr) {
        lastError = retryErr;
        if (!shouldRetryGoogleError(retryErr)) throw retryErr;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Google model request failed after retries and fallback.");
}

async function runProvider(
  provider: Provider,
  text: string,
  googleModelId?: string,
): Promise<string> {
  switch (provider) {
    case "groq":
      return await runGroq(text);
    case "google":
      return await runGoogle(text, googleModelId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text =
      body && typeof body === "object" && "text" in body
        ? (body as { text: unknown }).text
        : undefined;

    if (typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "text is required and must be a string" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rawProvider =
      body && typeof body === "object" && "provider" in body
        ? (body as { provider: unknown }).provider
        : undefined;

    const provider = normalizeProvider(rawProvider);

    const rawModel =
      body && typeof body === "object" && "model" in body
        ? (body as { model: unknown }).model
        : undefined;
    const googleModelId =
      typeof rawModel === "string" && rawModel.trim().length > 0
        ? rawModel.trim()
        : undefined;

    const fixedText = await runProvider(provider, text, googleModelId);

    return new Response(JSON.stringify({ fixedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
