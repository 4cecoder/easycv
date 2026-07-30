---
type: Tool
status: stable
stale_after: 2027-01-01
---

# Job Description Keyword Scorer

The **Job Description Matcher** serves as the interactive core feature to evaluate how well a user's resume aligns with a specific job posting.

## Workflow

1. **User Input**: The candidate pastes a target Job Description (JD) text block on the CV preview screen.
2. **REST Request**: The client dispatches a POST request to `/api/job-match` including the `uploadId` and `jobDescription` body.
3. **Execution**:
   - The route retrieves the structured candidate profile from Convex.
   - It runs the Python CLI alignment command `match-job`:
     ```bash
     python pipeline.py match-job --profile <path> --job-desc <path> --llm <provider>
     ```
   - The LLM processes the profile and JD to output matching score, keyword analysis, and customized bullet adjustments.
4. **Display**: The widget renders a dynamic matching compatibility badge alongside lists of missing/matched keywords.

## Components

- **Backend CLI Integration**: CLI handlers and LLM prompts mapped in `pipeline.py`.
- **API Endpoint**: Route handler located at `web/app/api/job-match/route.ts`.
- **Frontend Widget**: User interface built in `web/app/preview/[uploadId]/JobMatchWidget.tsx` (under the `web` workspace).
