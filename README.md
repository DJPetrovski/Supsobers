# Sup Sobers (supsobers.com)

Static site for the Sobering Stories channel. Hosted free on GitHub Pages. No build step.

## What's in here

- `index.html`: the whole site (Home, Videos, Archives, Books, About are tabs)
- `css/styles.css`: look and feel
- `js/rain.js`: the red matrix rain background
- `js/app.js`: tabs, video list, video player
- `data/videos.json`: the video list (filled automatically, see below)
- `data/archives.json`: archive cards. Add a `"url"` to a card and it becomes a button.
- `data/books.json`: book cards. Empty for now.
- `img/dj.png`: the cutout on Home. `media/trailer.mp4`: the video in the phone on the About tab.
- `js/hole.js` + `js/tv.js`: Home's slow background rabbit hole, the Videos-tab TV, and the full rabbit hole
- `CNAME`: tells GitHub Pages the domain is supsobers.com. Don't delete it.
- `.github/workflows/update-videos.yml` + `scripts/fetch_videos.py`: refresh `data/videos.json` once a day

## Add an archive link

In `data/archives.json`, set `"url": "https://..."` on the card. Done.

## Add a book

In `data/books.json`:

```json
{ "books": [
  { "title": "Book title", "meta": "Author name", "description": "One or two lines.", "url": "https://...", "cta": "Read it" }
] }
```

## Full video catalog (optional)

Without a key the daily update picks up your latest ~15 videos and keeps everything it has already seen. For the full back catalog:

1. Create a free YouTube Data API v3 key in Google Cloud Console.
2. In the repo: Settings, Secrets and variables, Actions, New repository secret.
3. Name it `YOUTUBE_API_KEY`, paste the key, save.
4. Actions tab, Update videos, Run workflow.

## How Home and Videos work

- Home: a slow, non-interactive rabbit hole drifts behind the title. Nothing to click, nothing to get stuck in.
- Videos: a TV shows static, then zooms into the screen and drops you into the hole. "Skip to the list" and "List view" go straight to the plain grid. Escape or "Climb out" returns to the TV.
- A shared link straight to `#videos` shows the TV without auto-diving.
- Visitors with reduced-motion settings get no zoom; they see the TV and the list.

## Only full episodes, and storylines

- The daily update only keeps videos 30 minutes or longer (clips stay off the site). Change `MIN_SECONDS` in `scripts/fetch_videos.py` to adjust.
- Without a YouTube API key the update sees the channel's most recent ~30 uploads. Add the `YOUTUBE_API_KEY` secret (see above) to bring in every long video you have ever posted.
- `data/threads.json` groups videos into storylines. Add a video's id to a thread and it appears in that story's "Keep falling" strip. Videos with similar titles are also suggested automatically.
