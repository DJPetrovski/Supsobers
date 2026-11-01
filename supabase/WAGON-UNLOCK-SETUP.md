# Wagon unlock setup (one time, about 15 minutes)

1. **Supabase table.** Supabase dashboard > SQL Editor > New query. Paste everything from `supabase/wagon-unlocks.sql` and click Run.
2. **Edge Function.** Dashboard > Edge Functions > Deploy a new function > "Via Editor". Name it exactly `wagon-unlock`. Paste all of `supabase/functions/wagon-unlock/index.ts` and Deploy.
3. **Secret.** Dashboard > Edge Functions > Secrets (or Project Settings > Edge Functions). Add `STRIPE_SECRET_KEY` = your Stripe **secret** key (use the `sk_test_...` key first). Never paste this key into chat or the website files.
4. **Stripe Payment Link (test mode first).** Stripe dashboard, switch on Test mode > Payment Links > New. Add a product (name "Wagon garage tip"), choose "Customer chooses what to pay", minimum $2. On the "After payment" tab choose "Don't show confirmation page" and enter this redirect URL:
   `https://supsobers.com/?wagon_session={CHECKOUT_SESSION_ID}#craving`
   (type `{CHECKOUT_SESSION_ID}` exactly as written, Stripe fills it in).
5. **Tell Claude the payment link URL** (it is public, like a Venmo link; it is safe to share). It goes into `data/wagons.json` under `unlock.link`.
6. **Try it** with the test card `4242 4242 4242 4242`, any future date, any CVC. The wagons should unlock the moment you return to the game, and the restore code appears in the garage.
7. **Go live.** Repeat step 4 in live mode, replace the secret with the `sk_live_...` key, and swap the link.
