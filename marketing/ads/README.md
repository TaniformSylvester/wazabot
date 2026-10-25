# WazaBolt video ads (Instagram and Facebook)

There are four ads, each in English and French and in two formats. Each video is 20 seconds long.

| Ad | Folder | For |
|---|---|---|
| Whole product | `product/` | Every business: till, stock and credit, invoices, WhatsApp assistant |
| Shops | `shops/` | Shops and boutiques: till, stock by size and colour, customer credit, estimated profit |
| Schools | `schools/` | Marks entered by teachers, averages, report cards in PDF, fees with receipts |
| Restaurants | `restaurants/` | Bills per table, kitchen screen, payments, WhatsApp orders |

The file names say which version is which:

- `wazabolt-<ad>-<en|fr>-9x16.mp4`: Reels and Stories (1080 × 1920).
- `wazabolt-<ad>-<en|fr>-4x5.mp4`: Instagram and Facebook feed (1080 × 1350).
- `cover-<ad>-<lang>-<format>.jpg`: a cover image to choose when posting a Reel.

The text to post with each video is in [captions.md](captions.md).

## Posting

- **Sound.** The videos have a silent audio track. Add music in Instagram or Facebook when you post: use the app's music library, which is licensed for use there. The text is on screen, so the ads also work with the sound off.
- **Reels and Stories.** Important text stays out of the top and bottom areas, where Instagram puts its own buttons and captions.
- **Paid ads (Meta Ads Manager).**
  - Upload both formats in the same ad. Meta uses the 9:16 version for Reels and Stories and the 4:5 version for the feed.
  - Target Cameroon by city.
  - Run the French version for French-speaking areas and the English version for the North-West and South-West.
  - Set the button to "Learn more" or "Sign up", with `https://www.wazabolt.com/fr` or `/en`. For the school and restaurant ads, use the matching page instead: `/fr/solutions/schools`, `/en/solutions/restaurants`, and so on.
- **Names and amounts.** The names, products and amounts on the phone screens are examples. The features shown all exist in WazaBolt.

## Changing or re-making the videos

1. Edit the text in `src/ads.mjs`. The layout and animation are in `src/template.html`.
2. Run, from the repository root:

```
node marketing/ads/src/render.mjs                    # all 16 videos
node marketing/ads/src/render.mjs schools fr 9x16    # just one
```

The script needs Playwright's Chromium and ffmpeg. Each video takes about a minute to render.
