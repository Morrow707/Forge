/**
 * The exact words shown to whoever grants research consent, kept here so
 * the same text reaches the person, the consent record, and any later
 * review of what was actually agreed to.
 *
 * A consent record that stores a version number and not the words is close
 * to worthless: nobody can reconstruct, a year later, what the person was
 * looking at when they said yes. Storing the full text is why
 * consent_records has a documentText column at all.
 *
 * Written to be read by a sixteen-year-old and their parent, not by a
 * lawyer. Four things it has to say plainly, because each one is a
 * question a reasonable person would ask and none of them are obvious:
 * what leaves, what does not, that saying no changes nothing about their
 * training, and that withdrawing cannot reach into a report already sent.
 */
export const RESEARCH_CONSENT_VERSION = "2026-09-07";

export const RESEARCH_CONSENT_TEXT = `Allowing your training data to be used for research

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

IF YOU ARE UNDER 18
A parent or guardian makes this decision. It is theirs to give and theirs
to withdraw.`;
