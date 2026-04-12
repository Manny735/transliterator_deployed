import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const fixWithAI = async (textToFix, setStatus) => {
  try {
    setStatus("Analyzing Cyrillic...");
    const { data, error } = await supabase.functions.invoke("fix-cyrillic", {
      body: { textToFix },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    setStatus("Applied!");
    return (data?.fixedText ?? "").trim();
  } catch (error) {
    console.error("Gemini AI Error:", error);
    setStatus("AI Error occurred");
    throw error;
  }
};
