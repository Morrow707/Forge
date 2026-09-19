# Forge -- research consent: review request

Prepared 2026-09-19 for attorney review. This is the one live consent document no
lawyer has read. It is short (356 words) and written for a sixteen-year-old and their
parent. Rocket Lawyer has no template for it. The text below is asserted against the
live constant (`shared/research-consent.ts`) by `shared/research-consent-disclosure.test.ts`,
so this copy cannot drift from what is in use.

## What it is for

Forge is sometimes asked to share what it has learned across many athletes with
researchers studying training and injury. This consent is the athlete's (or, for a
minor, the guardian's) opt-in to having their de-identified training numbers included in
such an extract. It is separate from the Video and Biometric Consent, which covers
collecting video and measurements for the athlete's own coaching. Consent for one purpose
is not treated as consent for the other, and this one is opt-in, default off.

## How the consent is collected, exactly

- **An adult athlete** ticks a separate, un-bundled, not-pre-ticked box at signup, or
  later in Account settings. It is deliberately not part of the terms checkbox, so
  research use is never a condition of having an account.
- **A minor cannot consent for themselves.** At signup a minor sees an explanation and
  no checkbox; the server ignores the field for anyone under 18. The guardian decides,
  one of three ways: (a) in their own linked guardian account, from the guardian
  dashboard; (b) by approving a request the minor sends from the app ("send them a
  request and they can approve it"); or (c) relayed by the coach, who must name who they
  are relaying from, and that name is written into the stored consent text
  ("Relayed by a coach on behalf of: ...").
- **What is stored**: the exact text as it stood at that moment, who gave it, the date
  and time, IP address and device string, as an insert-only consent record. A
  withdrawal writes its own dated record quoting the text it withdraws from.
- **When the text changes**, nobody is moved onto the new terms. Adults are asked again;
  a guardian is asked again through the guardian dashboard. Until they answer, the old
  consent stands only for what it said.

## What the software actually does with a "yes"

- The athlete is copied into a separate research store (`research_subjects`) that holds
  age, gender, sport, position, height, weight, season phase, and the training and
  testing numbers (forty, jumps, agility, bench, squat, deadlift), plus a flag that they
  are a minor and the WEEK (not the day) the account was created. Name, email, date of
  birth, address, school, team, coach, videos, free text, and exact dates are never copied.
- Extracts are built only from that store, never from live rows. Every row in an extract
  carries a code generated fresh per extract under a random salt, mapped nowhere, so two
  extracts cannot be joined on an athlete.
- Any cell smaller than 10 people is suppressed from anything that leaves Forge.
- Withdrawal removes the athlete from the store immediately and from every extract
  prepared afterwards. A report already sent cannot be recalled; the text says so.
- **Deleting the account keeps the de-identified numbers**, but only for someone who
  consented under text that says so (the "IF YOU DELETE YOUR ACCOUNT" section, added
  2026-09-17). Anyone who consented under the earlier text has their numbers removed on
  deletion. Withdrawing first and then deleting leaves nothing.
- Forge is not itself a research institution and has no IRB. Extracts are prepared on
  request for outside researchers by an admin, under a query budget and an access log.

## Questions for counsel

1. **Is this an adequate opt-in for sharing de-identified data derived partly from
   video?** The numbers (bar speed, jump height) are computed from video of the athlete.
   Does a de-identified derivative of biometric-type data fall outside BIPA-style
   statutes and state privacy laws once it is aggregated as described, and is the
   statement "nothing shared can be traced back to you" defensible as written, or should
   it be softened to "designed so that it cannot"?
2. **Minors: is a coach-relayed guardian consent acceptable?** Path (c) above records the
   guardian's name as relayed by the coach, but the guardian never clicks anything. Paths
   (a) and (b) exist and put the click in the guardian's own hands. Should (c) be removed,
   or is it acceptable with the name recorded?
3. **Retention after account deletion.** COPPA and several state laws give a deletion
   right. De-identified data is generally outside those rights, but the record was
   created from a child's data under a consent given as an account holder. Is the
   disclosure ("withdraw first, then delete") sufficient, and is retaining the numbers
   after deletion compatible with those rights as the document describes it?
4. **Re-consent on text change.** Nobody is moved to new terms retroactively; each
   person is asked again. Confirm this is the right approach, or whether a change that
   only adds a disclosure can apply to existing consents.
5. **Anything missing.** The document does not name who the researchers are, does not
   limit purpose beyond "training and injury", and does not mention that Forge may be
   paid for an extract (it is not today). Should any of those be stated?

## Document text as it currently stands

Allowing your training data to be used for research

Forge is sometimes asked to share what it has learned across many athletes
with researchers studying training and injury.

If you agree, here is exactly what happens.

WHAT GETS SHARED
Only group numbers. A researcher might see "the average vertical jump of
240 seventeen-year-old football athletes was 28.4 inches". They never see
one athlete's results on their own.

Any group smaller than ten people is left out entirely, so nobody can work
backwards from a small group to a single person.

WHAT NEVER GETS SHARED
Your name, email, birthday, address, school, team, or coach. Your videos.
Anything you or your coach typed in your own words, including how you
described an injury. Any date that could pin an event to a particular day.

Nothing shared with a researcher can be traced back to you. There is no
list anywhere that connects the numbers to your name, because Forge does
not keep one.

SAYING NO CHANGES NOTHING ELSE
Your training, your program, your coach, and everything else about Forge
works exactly the same whether you agree or not. This is not part of your
membership and it does not affect what you pay.

CHANGING YOUR MIND
You can withdraw at any time, and your data is left out of everything
prepared afterwards. A report that was already sent cannot be recalled,
which is the honest limit of withdrawing rather than a loophole.

IF YOU DELETE YOUR ACCOUNT
Deleting your account removes your account, your videos, and everything
that identifies you. The group numbers you agreed to share stay -- age,
sport, position, and the training numbers themselves, with nothing in them
that points back to you. That is what makes it possible to study how
athletes train over years rather than only while they are still members.

If you would rather nothing of yours remained, withdraw from research
FIRST and then delete your account. Withdrawing removes your numbers from
the research store; deleting afterwards leaves nothing behind.

IF YOU ARE UNDER 18
A parent or guardian makes this decision. It is theirs to give and theirs
to withdraw.
