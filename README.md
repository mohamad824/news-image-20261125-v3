[![make.fun · news-image-20261125](https://make.fun/badge/news-image-20261125.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![rank](https://make.fun/badge/news-image-20261125/mohamad824/news-image-20261125-v3/rank.svg)](https://make.fun/bounty/news-image-20261125/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![reward](https://make.fun/badge/news-image-20261125/mohamad824/news-image-20261125-v3/reward.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)

# news-image-20261125 v3 — The World in One Day (full-day edition)

One 1024×1024 image summing up Wednesday 25 November 2026 in world news:
the USTR Section 301 tariff proposals for 14 economies and the Asia markets
rout (Kospi −6.16%), a roaring US economy with hot inflation (Q3 GDP 4.3%,
core PCE 3.3%), and Shenzhou-24 docking with Tiangong carrying the first
foreign astronaut, Pakistani pilot Muhammad Zeeshan Ali — plus 33 more
stories, a UTC timeline, a dotted world map, and a DATE CHECK box stating
exactly what is in and what is left out. Cut-off ~21:30 UTC, Wednesday
25 November 2026.

## Theme

MODERN COLORFUL: a white page, bold sans-serif headlines in vivid varied
colours (teal, coral-red, amber, violet, deep navy), kickers as coloured
chips, colour-blocked lead panels, rounded cards, a six-number stats strip
in big vivid colours, a colourful UTC timeline strip, and a dotted world
map with coloured numbered pins. Dark text on light surfaces throughout;
every headline stays legible at ~400 px.

## Run it

```sh
node main.ts
```

Writes one deterministic 1024×1024 PNG to `/output/entry.png`. Node 22+
standard library only — no network, no dependencies. The glyph atlas
(`atlas.png` + `metrics.json`) is rendered from the real Liberation Sans
TrueType fonts at each text size used, so no glyph is ever downscaled
(see `OFL.txt` for the font licence).

## Sources

Reuters, WSJ, AP, Bloomberg, The Hindu, BBC, UN News, AFP, BEA, Xinhua.
