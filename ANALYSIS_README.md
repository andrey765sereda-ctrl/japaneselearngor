# Bunka Japanese Studio

Local-first Japanese learning web app built with Next.js, TypeScript, React and SQLite for Windows 11. It uses the full *lesson map* of Genki I + Genki II as a curricular backbone, adds original explanations/examples/quizzes, vocabulary for fashion studies, a 104-week route, kanji review, writing and admission practice.

## Current implementation

- Four primary areas: Course, Words & Kanji, Practice, Progress.
- 23 lesson routes represented in the content data (12 GENKI I and 11 GENKI II), each with Russian explanation, original examples, learning goals, review targets and original mini-quiz items.
- Official lesson ordering for 317 Genki kanji, 246 merged vocabulary records at this build (includes legacy entries whose source accuracy is explicitly marked for review), searchable vocabulary and kanji.
- Local spaced-repetition scheduler and rating buttons; local browser save and SQLite progress API when run on the Next.js server.
- 104-week roadmap, reading exercises, browser text-to-speech clearly marked as synthesized, writing practice aiming at 400 Japanese characters, admission/interview prompts.
- JSON backup restore and TSV export designed for Anki import.
- Light/dark mode, responsive layout.

## Honest content-coverage note

The supplied Genki I and Genki II PDFs are image-only scans. Normal text extraction yields no usable body text. The site uses the publisher's official syllabus and official 317-kanji list to map the 23 lessons and grammar/kanji order, plus original teaching examples and quiz items. A complete page-by-page transcription/OCR of both books' entire vocabulary, reading passages, listening scripts and workbook materials was **not** completed in this build. The app intentionally does not reproduce copyrighted dialogues, passages, answer keys or exercise pages. Some imported legacy vocabulary/kanji reading metadata is flagged in code as requiring verification. Do not describe this as a verified full digital replacement of either book.

## Run on Windows 11

1. Install Node.js 22 LTS or newer.
2. Extract the project folder.
3. Open PowerShell in that folder and run:

   ```powershell
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`.

The content-only validation `npm run validate:content` does not need to boot the server. For production verification:

```powershell
npm run typecheck
npm test
npm run validate:content
npm test
npm run coverage:course
npm run typecheck
npm run build
npm start
# optional UI test after installing Chromium: npx playwright install chromium && npm run test:e2e
```

`better-sqlite3` is a native package. If prebuilt binaries are unavailable for the local Node version, use a supported Node LTS release and install Windows C++ Build Tools as instructed by the package.

## Data and privacy

- Browser progress is stored under localStorage key `bunka-japanese-state-v1`.
- The local server mirrors progress to `data/bunka.sqlite`.
- `data/` is ignored by Git to avoid committing personal study data.
- Use the Progress view to export/import JSON backup and export a TSV deck for Anki. A prior starter `.apkg` and `.tsv` are also preserved in `public/anki/`; use the in-app export for the full current merged word + kanji set.

## Content structure

- `src/data/curriculum.ts`: original lesson explanations, examples, quizzes, weekly plan, official kanji lesson assignment, fashion vocabulary and admissions source notes.
- `src/data/legacy-data.json`: previous site's study data, preserved as a source dataset with verification status applied during merge.
- `src/data/kanji-extra.ts`: supplemental core readings for characters missing from the legacy dataset; these are primary-study profiles, not exhaustive dictionary entries.
- `src/lib/learning.ts`: answer normalization, mastery state and transparent SRS interval calculation.
- `COVERAGE_REPORT.md`: current verified coverage and gaps.

## Important limitations

- Browser speech is Web Speech API synthesis, not Genki audio or native speaker recordings.
- The handwriting area is practice canvas, not character recognition.
- This is a local-first app, not yet a multi-user hosted service.
- The built-in answer checking for grammar tests is explicit-choice based. It does not automatically grade arbitrary free-form Japanese composition.
- Study material supports preparation but cannot guarantee admission.
