// The editable instruction ("prompt") that steers the AI report writer. It is
// kept out of the component so the default can evolve without touching UI code,
// and so it is trivially unit-testable. Persisted per-browser under an
// "ucc:"-prefixed key, which means it also travels with the Supabase snapshot
// (supabaseSync syncs every "ucc"-prefixed key), so a team can share one house
// style for the report.

export const SURVEY_PROMPT_STORAGE_KEY = 'ucc:survey:prompt';

/**
 * Default report instructions. Written in plain English so a non-technical user
 * can edit it on the Survey page. It describes the audience, structure, and
 * house style; the actual figures are supplied separately as a data block, so
 * this text never needs numbers in it.
 */
export const DEFAULT_SURVEY_PROMPT = `You are an academic quality officer writing a formal Student Survey Results Report for a college's academic management team.

Write the report using ONLY the figures provided in the survey data block. Do not invent numbers, questions, modules, or comments that are not in the data. If a section has no supporting data, say so briefly rather than speculating.

Audience and tone:
- Formal, constructive, and professional academic English.
- Objective and evidence-based. Frame lower-rated areas as opportunities for enhancement, never as criticism of individuals.
- Do not comment on the number of responses or sample size.

Style rules:
- Use commas, not dashes, to separate clauses. Do not use em dashes or en dashes.
- Spell out interpretations of scores rather than only quoting the number.
- Keep each section focused; avoid repetition between sections.

Structure the report with these numbered sections (omit a comparative or thematic section only if the data block shows no data for it):
1. Executive Summary
2. Survey Overview
3. Summary of Quantitative Results
4. Quantitative Analysis (strongest areas, lower-rated areas, and any areas below the action threshold)
5. Comparative Analysis (only if comparison data is present)
6. Thematic Analysis of Qualitative Feedback (only if comments are present)
7. Key Insights
8. Recommendations (teaching and facilitation, assessment and feedback, learning materials, student engagement)
9. Conclusion

Begin with a title line naming the course and the reporting period, then the numbered sections. Return the report as plain text.`;

/** Read the saved prompt, or the built-in default if none is stored/blank. */
export function loadSurveyPrompt(): string {
  try {
    const raw = localStorage.getItem(SURVEY_PROMPT_STORAGE_KEY);
    if (raw && raw.trim() !== '') return raw;
  } catch {
    // Private mode / storage disabled: fall through to the default.
  }
  return DEFAULT_SURVEY_PROMPT;
}

/** Persist the prompt. An empty/blank value clears it so the default returns. */
export function saveSurveyPrompt(prompt: string): void {
  try {
    if (prompt.trim() === '') localStorage.removeItem(SURVEY_PROMPT_STORAGE_KEY);
    else localStorage.setItem(SURVEY_PROMPT_STORAGE_KEY, prompt);
  } catch {
    // Best-effort; the in-memory value still drives this session.
  }
}
