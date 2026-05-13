# Mongolian Reverse Transliterator

## Description

This web app converts **Latin-script Mongolian** into **Mongolian Cyrillic** using a large word-to-Cyrillic mapping, with visual cues when a word is ambiguous or only approximated. An optional **AI Fix** step sends a hybrid Cyrillic + bracketed-Latin prompt to a **Supabase Edge Function**, which calls **Google Gemini** or **Groq** to polish bracketed segments using sentence context—useful for particles, homographs, and messy transliterations.

## Live App URL


https://transliteratordeployed.vercel.app/


## Screenshots
<img width="1920" height="1080" alt="Screenshot 2026-05-14 011425" src="https://github.com/user-attachments/assets/d5354074-2db5-43f6-8573-2a8ad281baf2" />

<img width="1920" height="1080" alt="Screenshot 2026-05-14 011234" src="https://github.com/user-attachments/assets/f1b26c72-70b9-4b0d-a758-508fedc1fbb8" />

<img width="1920" height="1080" alt="Screenshot 2026-05-14 011455" src="https://github.com/user-attachments/assets/44b84ffa-8363-4d8f-83c0-de53dbf7948f" />


## Features

- **Dictionary-backed transliteration** — High-coverage lookup from a bundled mapping file; common stems and suffixes resolve to Cyrillic quickly.
- **Ambiguity handling** — Words with multiple Cyrillic options are highlighted; click to pick an alternative (session memory for your choices).
- **Letter-by-letter fallback** — Unknown tokens use a phonetic Latin → Cyrillic map and are visually distinguished from dictionary hits.
- **AI Fix (optional)** — Sends context-aware text to the server; supports multiple models (Gemini 3 Flash, Gemini 3.1 Flash Lite, Gemini 2.5 Flash Lite, Groq Llama 3.3).
- **Copy to clipboard** — Copy the interactive Cyrillic output or the AI-refined result.
- **Stop / cancel** — Abort a long-running AI request from the UI.

## Technology Stack

- **Framework:** [Vite](https://vitejs.dev/) + [React](https://react.dev/)
- **Libraries:** [@supabase/supabase-js](https://supabase.com/docs/reference/javascript) (client + Edge Function `invoke`)
- **Backend:** [Supabase Edge Functions](https://supabase.com/docs/guides/functions) (Deno) — `fix-cyrillic` calls Groq / Google Generative AI with server-side API keys
- **Deployment platform:** [Vercel](https://vercel.com/) (static frontend; set `VITE_*` env vars at build time)

## Data Sources

- **Latin → Cyrillic word mappings** — Bundled as `src/data/mappings.json` in this repository.
- **AI providers** — [Google AI / Gemini documentation: https://ai.google.dev/docs ] · [Groq API documentation: https://console.groq.com/docs ]

## Setup / Running Locally

1. **Clone** this repository and open a terminal in the project root.
2. **Install dependencies:**  
   `npm install`
3. **Environment variables** — Create a `.env` file in the project root (do not commit it; it is listed in `.gitignore`):

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_public_key
   ```

   The **anon** key is safe for browser use. Groq and Gemini keys belong only in **Supabase Edge Function secrets** (`GROQ_API_KEY`, `GEMINI_API_KEY`), not in `.env` for the Vite app.

4. **Supabase** — Deploy or use the existing `fix-cyrillic` function under `supabase/functions/fix-cyrillic/` and set the secrets above in the Supabase dashboard (or CLI).

5. **Run the dev server:**  
   `npm run dev`  
   Then open the URL shown in the terminal (typically `http://localhost:5173`).

6. **Production build (optional check):**  
   `npm run build`  
   Output is written to `dist/`. Preview locally with `npm run preview`.


## Known Issues

- **AI availability** — Preview model IDs and provider quotas can change; users may see rate-limit or high-demand errors until they retry or switch models.
- **Edge function required for AI** — Without a configured Supabase project and deployed `fix-cyrillic` function, **AI Fix** will not work (dictionary transliteration still works), sometimes the AI fix may not work because of the supabase project being on a pause due to inactivity.

## Future Improvements

- **Code-splitting / lazy loading** — Load `mappings.json` on demand or split chunks to reduce initial bundle size.
- **Local open source model hosting** — hosting an open source model like gemma on a server or a local device for faster Ai fixing.
- **mappings expansion** — adding more mappings to make the Ai fix more accurate.
- **Mobile app integration** — Potentially turn this into a mobile keyboard app.

## Author

M.Mandakhbayar

---

### Sample Latin Mongolian text (try in the app)

> Uv soyol, ulamjlal, yos zanshlaa erhemlen deedelj, uyes, uyed uvluulen tugeej, hugjin devshij bui kazah tumnii Narnii bayar buyu Nauryziin bayar Suhbaatariin talbaid unuudur bolj baina. Yerunhii said G.Zandanshatar Nauryziin bayariin neelted oroltsoj, bayar hurgej ug helev. Terbeer "Ekh orniihoo ungursun bolon unuudur, ireeduin hugjil, devshliin tuluu hudulmurch kazakiin ard tumnii oruulsan huvi nemriig unelj barshgui. Uls ornii hugjliin buteen baiguulalt urnusun gazar buhend busdiig ulgerlen urialan duudaj chaddag, aldar gavyaa amjiltiin ezed bilee.
