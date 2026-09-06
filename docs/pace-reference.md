# Pace references — iRating → lap time

## What this is for

A league race and an official race need different yardsticks.

In a league everyone runs the same car at roughly the same level, so the
fastest lap in class is a fair reference and the whole team recognises it.

In an **official** race the grid is whatever iRating happened to register. The
class best then measures pedigree, not performance: a 1500 iR driver is always
slower than the fastest man there, and a 6000 iR driver is always close to him,
whether either of them drove well or badly.

iRacing publishes, per season / race week / car class / session type, a fitted
curve of **fastest lap against driver iRating**. Read a driver's own rating off
that curve and you get the lap he was expected to set. The gap to *that* is his
performance. The curve's value at 10 000 iR doubles as a fixed yardstick that
does not move with the day's entry list, so the same number stays comparable
from race to race.

## Where the numbers come from — and why CLS does not fetch them

The source is the members site: a series page → **Series Insights** → **Pace
Analysis**, with dropdowns for race week, car class and session type.

The chart is fed by a JSON file in a private S3 bucket, reachable only through
a **pre-signed URL that expires after an hour** and that the logged-in members
site mints. An unsigned request answers `403 AccessDenied` (verified
2026-09-06). CLS therefore does **not** fetch this: doing so would mean
automating an authenticated iRacing session against an undocumented endpoint —
fragile, and not what iRacing's terms allow for automated access to member
services.

So it is a manual export from your own logged-in browser, once per track and
car class. The bookmarklet below makes that one click.

The file looks like this:

```json
{ "season_id": 6301, "race_week_num": 11, "car_class_id": 2708, "event_type": 5,
  "line":    [ { "irating": 200, "lap_time": 125.066 }, … 102 points to iR 10500 ],
  "scatter": [ { "irating": 229, "lap_time": 126.42 }, … one per driver ] }
```

`line` is iRacing's own fit in 100-iRating steps — that is what CLS stores.
`event_type` 5 = race, 3 = qualifying, 2 = practice, 4 = time trial; the
importer reads it, along with the season, race week and car class id, so a
stale curve is recognisable months later.

## The export bookmarklet

Make a new bookmark in your browser and paste this as its **address** (a page
is not allowed to hand you a script bookmark, so this one step is manual). The
same text is on the admin page, ready to copy.

```
javascript:(async()=>{const e=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('pace_analysis')).pop();if(!e){alert('Open the Pace Analysis chart first (scroll to it), then click again.');return}const j=await fetch(e).then(r=>r.json());await navigator.clipboard.writeText(JSON.stringify(j));alert('Copied: '+(j.line||[]).length+' points, event_type '+j.event_type+', week '+j.race_week_num);})()
```

Then:

1. Open the series' **Series Insights** page and scroll down to **Pace
   Analysis** — the file is only fetched when the chart comes into view.
2. Set race week, car class and **Race**.
3. Click the bookmark. It reads the file the chart just loaded and puts it on
   the clipboard.
4. In CLS: **Admin → Pace references**, fill in car class and track, paste,
   save.

It reads whatever the chart currently shows, so switching the dropdowns and
clicking again gives you the next curve. Note that the signed URL lives an
hour — after that, reload the page before exporting again.

## Using it in a plan

In the stint planner's **Event** card, switch the plan to **Official race**.
Two fields appear:

- **Reference lap (10k)** — the fixed yardstick. Leave it empty and it is read
  off the chosen curve at 10 000 iR.
- **Pace curve** — pick the library entry for this track and car class.

The debrief then measures every driver against his own target instead of the
class best. Each driver's iRating comes from the uploaded `eventresult.json`
(`oldi_rating` — the rating he *started* the race with, so a good or bad result
does not move his own yardstick after the fact).

A driver whose rating is not in the results file falls back to the fixed 10k
reference, and beyond that to the class best. The chart names the yardstick for
every bar in its tooltip — a gap without its reference is a number nobody can
check.

## Limits worth knowing

- The curve is **per track and car class**, and iRacing refits it as the week's
  data comes in. A curve exported in week 1 is not the week 12 curve.
- Outside the curve's range the value is **clamped**, not extrapolated: the
  source's own fit flattens at the top (its last points are identical), and a
  straight line off the end would invent lap times nobody measured.
- Race and practice curves differ, and not by a constant — at low iRating the
  race curve is *faster* than the practice one. Use the race curve for a race
  debrief.
