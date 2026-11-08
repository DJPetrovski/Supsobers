# Clancy archive: "Ask the archive" answers (one time, about 10 minutes)

The archive search already finds the right passages by meaning. This adds a short written answer on top, with citations to the passages it came from, like an AI assistant.

1. **Anthropic API key.** console.anthropic.com > API Keys > Create key. Put a small spending limit on it (Settings > Limits), for example $10 a month. Each question costs a fraction of a cent.
2. **Edge Function.** Supabase dashboard > Edge Functions > Deploy a new function > "Via Editor". Name it exactly `clancy-answer`. Paste all of `supabase/functions/clancy-answer/index.ts` and Deploy. Turn **off** "Verify JWT" only if the dashboard offers it and calls fail; the site sends the public anon key, so the default works.
3. **Secret.** Dashboard > Edge Functions > Secrets. Add `ANTHROPIC_API_KEY` = the key from step 1. Never paste this key into chat or the site.
4. **Tell Claude it is done.** Claude switches it on by setting `"enabled": true` in `data/clancy-answer.json`. Until then the search works exactly as before, with no answer box.

Visitors can ask 12 questions per 10 minutes each. The function only answers from the passages the search finds and says so when they do not cover the question.
