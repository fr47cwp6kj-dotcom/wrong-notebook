# User Guide

## Create a notebook

When creating a notebook, choose its school stage (primary, junior high or senior high) and subject. In this fork, math uses a Zhejiang-edition Grade 8 first-semester list with prerequisite skills; other subjects use the selected stage. The notebook stage and subject cannot be changed later, so keep separate notebooks per stage and subject.

## Add questions

| Entry | When to use |
| --- | --- |
| Image upload, drag and drop, camera | Paper tests, workbooks and existing question images |
| Clipboard paste | Copied screenshots or images, with `Ctrl/⌘+V` |
| Screenshot | The browser supports screen sharing and the page runs in a secure context |
| AI solve | You already have the question text; Markdown and LaTeX are supported |
| Direct entry | Manually record a known question, answer and analysis |

Images can be cropped first. When one image contains several questions, select them all for a batch import. Keep the full question, any required figure and the student's work, and avoid blurry images or cut-off conditions.

Web uploads, drag and drop, and original-image replacement accept JPG, PNG, WebP, GIF, HEIC/HEIF, BMP and AVIF. You can also paste image files from the clipboard. The browser converts iPhone HEIC/HEIF photos to JPEG before cropping and imports only the primary image from multi-image files. If decoding fails, the page prompts you to try another image or export it as JPG/PNG.

The default image recognition prompt redraws figures as compact SVG diagrams that preserve the structure and labels needed to solve the problem. For a more detailed redraw, use AI Redraw Figure on the question detail page.

Single-question recognition and text solving always open the review editor before saving. Explanations focus on 3–5 key steps; mistake analysis includes concrete next actions without guessing when student work is missing. The AI may misread numbers, symbols and figure relationships, so check against the original before saving.

The review page first groups question numbers, then shows Question / Answer / Explanation / Mistakes tabs without duplicating the content in a second preview column. Long answers, explanations and mistake analyses are collapsed; select Show full content to expand them. Images, figures and knowledge points are also available on demand. Text opens in preview mode. Select Source or double-click a preview to edit, then return to Preview to check formulas.

Automatic grouping requires explicit question headings or question numbers corroborated by the answer. Numbered subparts and steps alone do not trigger grouping. Unmatched content remains accessible through Full text, and shared context is retained in a separate disclosure. Editing one question updates only its body; switching questions or categories preserves edits. This grouping affects review only: saving includes the entire recognition result. To create separate notebook entries, select multiple question regions during upload.

Expand Knowledge points to edit AI-provided tags per question (up to five each). The combined list updates automatically, and the mapping is saved and backed up. Without a per-question result, the original combined tags remain editable without guessing their assignment. Re-tag existing records to apply the new scope; whole-record re-tagging clears old per-question mappings. See [scope and limitations](../../MATH_CURRICULUM.md).

## Duplicate detection

On import, the question text is compared with the current user's existing questions across all notebooks. The default threshold is 90% and can be changed in your general settings.

- When the similarity is **strictly greater** than the threshold, the existing question is returned and a wrong attempt is recorded on it.
- A similarity equal to the threshold does not count as exceeding it.
- Similarity is the character edit similarity of the normalized question text; it does not mean the math is the same.
- Records from repeated imports feed into later mastery evaluation; check the original question's answer history when needed.

Notebooks also offer a two-question similarity comparison to help decide whether the threshold suits your questions. If only a few characters of numbers or conditions differ, the similarity may still be high, so judge by the meaning of the question.

## Question details

Each question shows its text, answer, analysis, knowledge points, difficulty, semester and paper level, plus the original photo.

| Information or action | Notes |
| --- | --- |
| 6-character question ID | Copy it and locate the question by ID in a notebook; shown as the source ID in printouts |
| 1–5 star difficulty | Rated by the AI with reference to competition-math difficulty; can be changed manually |
| Paper A/B | When not set, 1–3 stars default to paper A and 4–5 stars to paper B; a manual choice takes priority |
| Knowledge points | Math uses the Zhejiang Grade 8 first-semester list; other subjects retain their stage scope. Re-tag one question or a whole notebook |
| Regenerate full solution | Generates a new answer and analysis; asks for confirmation before overwriting |
| Fix LaTeX | Appears when formula syntax issues are detected, letting the AI correct the formulas |
| Original image | View, replace or add it to check the recognition |

Unrated questions are not assigned a paper level by the default rule alone. Regenerating the full solution keeps the knowledge points and mistake information.

![Question text, knowledge points, difficulty and question info](https://raw.githubusercontent.com/margrop/wrong-notebook/a5f816515e3dc31dcdb90c9fa456baed12eef94d/doc/screenshots/en/question-detail.png)

## Figures and animated explanations

- **SVG figures**: static SVG generated by the AI from the question, used on the detail page, in practice and in printouts; the original image can still be viewed separately.
- **SVG animated explanations**: opening a question automatically generates an animation in the current interface language if missing. First generation takes time; later visits play the saved version without another AI call. Pause, seek, replay and full screen are available. Retry manually if generation fails; deleting an animation does not regenerate it during the same visit. Enabled by default and adjustable in General settings.

Generated SVG animations can be deleted after confirmation. Check generated figures and solutions manually, especially geometric positions, counting steps and conclusions.

## Filters and batch actions

Filter by mastery status, knowledge point, time, grade and semester, or paper level, then act on the results in bulk or print them. Before deleting, confirm the filters and selection; [back up your data](Backup-and-Restore-en) when it must be kept long term.

## Markdown and formulas

Questions, answers and analysis support Markdown, and formulas are rendered with KaTeX:

```text
Inline: $a^2+b^2=c^2$ or \(a^2+b^2=c^2\)
Display: $$\frac{a}{b}$$ or \[\frac{a}{b}\]
```

While editing you can switch between source and preview. For complex tables and formulas, see the [Markdown guide](https://github.com/margrop/wrong-notebook/blob/main/doc/MARKDOWN_GUIDE.md) and the [table recognition notes](https://github.com/margrop/wrong-notebook/blob/main/doc/TABLE_RECOGNITION.md).

Next: [Practice and Exams](Practice-and-Exams-en).
