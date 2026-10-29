# Bunka Japanese Studio — redesign notes

## Interface
- Reworked the visual system to a clean white editorial layout with black rounded buttons, subtle borders and responsive spacing, based on the supplied reference.
- Existing `index.html`, course catalog, data files, vocabulary, kanji, Anki files, and progress logic are retained.

## Teaching improvements
- Added a detailed guide to every lesson at runtime: explanation of purpose, sentence pattern, example translation, phrase breakdown table, common pitfalls, staged practice, and a task to complete without hints.
- Added tailored explanations for foundational topics including SOV order, は, の, も, これ/この, を, に, で, へ, and polite verb forms.

## Sentence game
- Added sentence assembly with a Russian prompt, Japanese word/particle tiles, decoys, click-to-fill slots, click-to-return, 18-second timer, and three lives.
- Added particle-magnet feedback to prevent skipping a required particle in key noun-to-verb transitions.
- Added a verb transformer for polite present, negative, past, and negative past forms.

## GitHub Pages
- No backend or build step is required. All new assets are local static files.
- Keep `index.html`, `style.css`, `script.js`, `lesson-guide.js`, `course-data.js`, `genki-course.js`, and existing subfolders in the repository.
