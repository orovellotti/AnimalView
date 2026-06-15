---
name: AnimalView bilingual i18n
description: How language switching is wired in the animal-view artifact
---
- i18n lives in `artifacts/animal-view/src/lib/i18n.tsx`: `LanguageProvider` / `useLang()` / `t(key, vars)` with `{var}` interpolation and fallback chain (current lang → fr → key).
- Default language is French; persisted to localStorage key `animalview-lang`. Provider wraps the router in `App.tsx`.
- FR|EN toggle is in the home map top-right controls cluster and the landing header.
- **Why/how:** dynamic data (counts, distances, dates) stays as values; only surrounding words/units are translated. Dates use `lang === "fr" ? "fr-FR" : "en-US"`.
- Barrier label maps are `Record<Lang, Record<string,string>>` selected via `[lang]`. When renaming such top-level consts, grep ALL occurrences — a leftover `*_FR` reference caused a transient runtime crash.
