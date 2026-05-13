import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingSupabaseEnvVars = [];
if (typeof supabaseUrl !== "string" || supabaseUrl.trim().length === 0) {
  missingSupabaseEnvVars.push("VITE_SUPABASE_URL");
}
if (typeof supabaseAnonKey !== "string" || supabaseAnonKey.trim().length === 0) {
  missingSupabaseEnvVars.push("VITE_SUPABASE_ANON_KEY");
}

const supabase =
  missingSupabaseEnvVars.length === 0
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const SUPABASE_CONFIG_MESSAGE =
  "Supabase is not configured. Add your project URL/key and restart the app.";

const DEFAULT_GOOGLE_MODEL_ID = "gemini-2.5-flash-lite";

const MODEL_DEMAND_MESSAGE =
  "The model may be experiencing high demand. Please try again in a moment or switch to another model.";
const NETWORK_MESSAGE =
  "Connection unstable. Check your internet or try a different AI model.";

function getHttpStatus(error) {
  if (!error || typeof error !== "object") return undefined;
  if (typeof error.status === "number") return error.status;
  const ctx = error.context;
  if (ctx && typeof ctx.status === "number") return ctx.status;
  if (ctx?.response && typeof ctx.response.status === "number") {
    return ctx.response.status;
  }
  return undefined;
}

function messageSuggests429(error) {
  const m = pickSupabaseErrorMessage(error).toLowerCase();
  return m.includes("429") || m.includes("rate limit") || m.includes("too many requests");
}

function textSuggestsModelDemand(text) {
  const t = String(text ?? "").toLowerCase();
  if (!t) return false;
  const hints = [
    "high demand",
    "overloaded",
    "over capacity",
    "service unavailable",
    "temporarily unavailable",
    "try again later",
    "503",
    "502",
    "504",
    "429",
    "rate limit",
    "too many requests",
    "resource exhausted",
    "unavailable",
  ];
  return hints.some((h) => t.includes(h));
}

function statusSuggestsModelDemand(status) {
  if (typeof status !== "number") return false;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isLikelyNetworkOrTimeout(error) {
  if (!error) return false;
  const code = error.code;
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND") {
    return true;
  }
  const name = String(error.name ?? "");
  if (name === "AbortError") return true;
  const msg = `${error.message ?? ""} ${error.cause?.message ?? ""}`.toLowerCase();
  const hints = [
    "failed to fetch",
    "networkerror",
    "network request failed",
    "load failed",
    "timeout",
    "timed out",
    "econnreset",
    "enotfound",
    "etimedout",
    "socket",
    "aborted",
    "fetch failed",
    "connection refused",
  ];
  return hints.some((h) => msg.includes(h));
}

function pickSupabaseErrorMessage(error) {
  if (error == null) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

function resolveUserMessage(error, data) {
  const status = getHttpStatus(error);
  const combined = `${pickSupabaseErrorMessage(error)} ${data?.error ?? ""}`;
  if (
    statusSuggestsModelDemand(status) ||
    messageSuggests429(error) ||
    textSuggestsModelDemand(combined)
  ) {
    return MODEL_DEMAND_MESSAGE;
  }
  if (
    status === 408 ||
    combined.toLowerCase().includes("timeout")
  ) {
    return NETWORK_MESSAGE;
  }
  if (isLikelyNetworkOrTimeout(error)) return NETWORK_MESSAGE;
  return pickSupabaseErrorMessage(error);
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function userMessageFromResponseDataError(data) {
  const raw =
    data && typeof data === "object" && "error" in data
      ? typeof data.error === "string"
        ? data.error
        : String(data.error)
      : "";
  if (textSuggestsModelDemand(raw)) return MODEL_DEMAND_MESSAGE;
  return raw.length > 0 ? raw : MODEL_DEMAND_MESSAGE;
}

function serializeForDebug(error, data) {
  const errPart =
    error && typeof error === "object"
      ? {
          name: error.name,
          message: error.message,
          status: error.status,
          stack: error.stack,
          context: error.context,
          cause:
            error.cause && typeof error.cause === "object"
              ? {
                  name: error.cause.name,
                  message: error.cause.message,
                }
              : error.cause,
        }
      : error;

  return { invokeError: errPart, responseData: data };
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    try {
      return JSON.stringify(
        { fallback: String(value), note: "Original value was not fully serializable." },
        null,
        2,
      );
    } catch {
      return String(value);
    }
  }
}

/**
 * Hybrid context for AI: single-mapping tokens stay Cyrillic; ambiguous (multi)
 * or letter-by-letter fallback tokens become [latin] with trailing punctuation outside brackets.
 * @param {Array<{ type: string, value: string, latin?: string }>} translatedWords
 */
export function prepareHybridAiInput(translatedWords) {
  if (!translatedWords?.length) return "";

  return translatedWords
    .map((w) => {
      if (w.type === "space") return w.value;
      if (w.type === "exact") return w.value;

      if (w.type === "multi" || w.type === "fallback") {
        const latin = w.latin ?? "";
        const puncMatch = w.value.match(/[.,!?;:]+$/);
        const punctuation = puncMatch ? puncMatch[0] : "";
        if (!latin) return w.value;
        return `[${latin}]${punctuation}`;
      }

      return w.value;
    })
    .join("");
}

/**
 * @returns {Promise<{ ok: true, text: string } | { ok: false, userMessage: string, technicalDetails: string }>}
 */
export const fixWithAI = async (text, setStatus, provider, modelId, abortController = null) => {
  let data = null;

  try {
    if (!supabase) {
      const technicalDetails = safeStringify({
        reason: "Missing required Vite env vars for Supabase client initialization.",
        missingEnvVars: missingSupabaseEnvVars,
      });
      setStatus(SUPABASE_CONFIG_MESSAGE);
      return {
        ok: false,
        userMessage: SUPABASE_CONFIG_MESSAGE,
        technicalDetails,
      };
    }

    setStatus("Analyzing Cyrillic...");

    const resolvedProvider = provider ?? "groq";
    const body = { text, provider: resolvedProvider };
    if (resolvedProvider === "google") {
      body.model =
        typeof modelId === "string" && modelId.trim().length > 0
          ? modelId.trim()
          : DEFAULT_GOOGLE_MODEL_ID;
    }

    // Check if already aborted before starting
    if (abortController?.signal?.aborted) {
      return {
        ok: false,
        userMessage: "Cancelled",
        technicalDetails: "Request was cancelled before starting",
      };
    }

    const { data: responseData, error: invokeError } =
      await supabase.functions.invoke("fix-cyrillic", {
        body,
        signal: abortController?.signal,
      });

    // Check if aborted after the call
    if (abortController?.signal?.aborted) {
      return {
        ok: false,
        userMessage: "Cancelled",
        technicalDetails: "Request was cancelled",
      };
    }

    data = responseData;

    if (invokeError) {
      const debugPayload = serializeForDebug(invokeError, data);
      console.error("[AI_FIX_DEBUG]:", debugPayload);

      const userMessage = resolveUserMessage(invokeError, data);
      setStatus(userMessage);
      return {
        ok: false,
        userMessage,
        technicalDetails: safeStringify(debugPayload),
      };
    }

    if (data?.error) {
      const debugPayload = serializeForDebug(null, data);
      console.error("[AI_FIX_DEBUG]:", debugPayload);

      const userMessage = userMessageFromResponseDataError(data);
      setStatus(userMessage);
      return {
        ok: false,
        userMessage,
        technicalDetails: safeStringify(debugPayload),
      };
    }

    setStatus("Applied!");
    return { ok: true, text: (data?.fixedText ?? "").trim() };
  } catch (error) {
    const debugPayload = serializeForDebug(error, data);
    console.error("[AI_FIX_DEBUG]:", debugPayload);

    const userMessage = resolveUserMessage(error, data);
    setStatus(userMessage);
    return {
      ok: false,
      userMessage,
      technicalDetails: safeStringify(debugPayload),
    };
  }
};
