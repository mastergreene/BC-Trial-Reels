# Clip selection rules

Every approved clip is rendered three times (Punchy, Raw, News) from the **exact same source sections**, so the only thing that differs between variants is the edit. Pick clips that can stand on their own in all three.

## What to look for

Rank candidate moments by how hard they hit in the first 3 seconds and whether they make sense with zero context:

- **Hooks:** an opening line that creates tension or curiosity ("Here's what nobody tells you about…", "The number that shocked me was…").
- **Strong claims:** a clear, confident statement, ideally with a concrete number, date, dollar figure or outcome.
- **Standalone moments:** a complete thought, story beat or answer that needs no setup.
- **Emotion or conviction:** visible passion, humour, a personal story, a sharp contrast ("not X, but Y").
- **Quotable lines:** a sentence someone would screenshot or repeat.

Every clip in `clips.json` gets a one-line `why` naming which of these it is. If you can't say why it works, don't use it.

## Shape

- **Count:** 3–5 clips per source. Cut only as many as are actually good. Three strong clips beat five weak ones.
- **Length:** 20–40 seconds of source each (about 30s is the sweet spot). Punchy will come out a few seconds shorter after silence trimming.
- **Continuous:** one continuous section, or at most **two** sections joined. Never stitch lots of short bits together, and never change the meaning of what was said.
- **Clean edges:** start at the beginning of a sentence and end on a complete thought. No cut-off words.
- **Open strong:** the first sentence should be the hook. If the good line comes 8 seconds in, start there.

## Avoid

- Interviewer or audience questions (they never appear in a clip).
- Answers that only make sense with the question.
- Stumbles, filler-heavy stretches, and off-topic tangents.
- Anything that could be misleading out of context, or that misrepresents the speaker.
- Moments with poor audio or the speaker off-camera.

## Card text (used by Punchy and News; Raw has no on-screen text)

- **Label:** a short tag, upper-cased on screen. Defaults: `WATCH` when the punch is a line said on camera, `NEW` or `BREAKING` when the clip announces something. Keep it to one word, 10 characters max.
- **Headline:** 3 lines split with `\n`, about 16–20 characters per line. Use `&` instead of "and". The size shrinks automatically if a line is long, but shorter lines stay closer to full size. A verbatim quote goes in curly quotes, e.g. `“We doubled it\nin under\na year”`.
- **Highlight:** the number or key phrase. It must be an exact substring of the headline. It gets the yellow bar on the card and turns yellow on the News strap.
- In News the headline also runs as a one- or two-line strap for the rest of the reel, so it must read well as a single sentence.
