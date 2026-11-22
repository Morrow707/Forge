# First real run: the pieces nobody has tried for real yet

Written 2026-11-22. Each item below is built and tested against fakes, but has never met the real
thing (a real model, a real calendar, a real inbox, a real device account). Try each one once, tell
Claude when you did, and Claude reads the Render log for that minute. Tick it off here when it
worked.

| # | What | How to try it | What "worked" looks like | Done |
|---|---|---|---|---|
| 1 | Reading a filled sheet photo | Coach: Weight Room, print a sheet for a team, fill a few sets by hand, photograph it, upload it | The review screen shows each athlete's sets with the numbers you wrote; unsure boxes outlined; Log writes them | |
| 2 | Reading a sheet that is not Forge's | Same, with a whiteboard or notebook photo | Names matched to the roster, lifts matched to the day, anything unknown listed, never guessed | |
| 3 | Program import | Program builder, Import, upload a spreadsheet and then a photo of a written program | A draft with every row, unmatched exercises flagged; nothing saved until Save | |
| 4 | Calendar import | Calendar, Connect a calendar, paste your Google or Apple address | Your events appear within a few minutes and refresh every 3 hours | |
| 5 | Calendar feed out | Calendar, Subscribe, add the Forge address to your phone's calendar | Forge workouts and events show in your phone calendar | |
| 6 | Weekly parent email | Link a guardian to a minor athlete who trains; wait for a Monday to Wednesday at 14:00 UTC | The guardian gets one email for that child; the log reads "Parent weekly summaries: sent N." | |
| 7 | Hawkin or GymAware sync | Devices page, paste a school's API key | Readings appear under the athlete's Testing tab within 10 minutes | |
| 8 | Device CSV upload | Devices page, upload an OVR or Vitruve export, map the columns | Each row lands on the matched athlete; unmatched names listed | |
| 9 | Exempt list on a paying card account | Admin, Billing, add a test account that pays by card | The plan is cancelled, the last payment refunded, both visible in the Stripe dashboard | |
| 10 | Hardy answers | As an adult Free Agent, ask Hardy a question | An answer in a sentence, under the daily limit | |
| 11 | Translated coach notes | Set an athlete's language to Spanish, leave a coach note on their workout | The athlete sees the note in Spanish with "Translated" and "Show original" | |
| 12 | Weight-room station offline | Open the station, turn Wi-Fi off, log a set, turn Wi-Fi on | The set waits on the tablet, then appears on the athlete's day | |

Notes
- Items 1 to 3, 10 and 11 call the AI. Each call is recorded on the admin AI spend screen under its
  feature name (`weight-room-sheet-read`, `program-import`, and so on).
- Nothing on this list can lose data: every one of them shows you what it read before anything is
  saved, except 6, 7 and 9, which only add or report.
