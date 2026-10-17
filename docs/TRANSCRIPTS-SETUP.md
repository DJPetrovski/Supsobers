# One-time setup: let the site read your YouTube captions

This gives the website permission to download the captions of YOUR OWN videos (and nobody else's), so the search
stays current by itself. You do it once, about 10 minutes.

1. Go to https://console.cloud.google.com/ signed in as the channel's Google account. Create a project ("Supsobers").
2. APIs & Services > Library > search "YouTube Data API v3" > Enable.
3. APIs & Services > OAuth consent screen: User type External. App name "Supsobers site". Add your email. Save.
   - Scopes: add `.../auth/youtube.force-ssl`.
   - Then press "Publish app" (move it from Testing to In production). If you leave it in Testing, the permission expires every 7 days.
4. APIs & Services > Credentials > Create credentials > OAuth client ID > Web application.
   - Authorized redirect URI: `https://developers.google.com/oauthplayground`
   - Copy the Client ID and Client secret.
5. Go to https://developers.google.com/oauthplayground
   - Gear icon (top right): tick "Use your own OAuth credentials", paste the Client ID and secret.
   - In the left box type `https://www.googleapis.com/auth/youtube.force-ssl`, press Authorize APIs, sign in, allow
     (you may see "Google hasn't verified this app": Advanced > Go to Supsobers site).
   - Press "Exchange authorization code for tokens". Copy the **Refresh token**.
6. In GitHub: repo Supsobers > Settings > Secrets and variables > Actions > New repository secret. Add three:
   - `YT_CLIENT_ID`
   - `YT_CLIENT_SECRET`
   - `YT_REFRESH_TOKEN`
7. Actions tab > "Update transcripts" > Run workflow. After that it runs by itself every 6 hours.

Notes
- Google's free quota allows about 35-40 videos a day, so the first backfill of the whole channel takes about a week; new uploads are picked up within a day (YouTube needs a few hours to make automatic captions).
- Members / (PARENTAL ADVISORY) videos are downloaded too, to fill the words missing from their censored public twins. Their script is stored only as scrambled word codes (searchable, not readable), so the uncensored text itself is never published.
- Never paste these three values into a chat; only into GitHub Secrets.
