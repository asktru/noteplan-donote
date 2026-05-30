# What's changed in 📌 Donote plugin?

## [1.4.0] 2026-05-09
### New
- **Focus mode**: an eye icon after each heading dims everything outside the focused section; multiple headings can be focused simultaneously. State is persisted via a 👀 emoji on the heading.
- **Independent type filters**: the filter bar now has three separate toggles — Text / Tasks / Checklists — so any subset can be hidden independently. Persisted as a comma-list in the `dn-filter-type` frontmatter key.

## [1.3.0] 2026-05-08
### New
- **Item collapse**: nested content under tasks, checklists, and bullets can be collapsed via inline chevron toggles (mirrors the existing heading collapse pattern). State persisted using NotePlan's native trailing "…" marker.
- **Open in Donote** command: pins the current note (if needed) and opens it in the sidebar viewer.
- **Preview in Donote window** command: renders the current note in a separate, single-note window without pinning it.
- Task completion pie chart shown before headings.
- Separator-style headings (e.g. `### ---`) rendered as horizontal rules.

### Changes
- H1–H4 headings are differentiated with distinct accent colours for clearer visual hierarchy.

## [1.2.0] 2026-04-12
### New
- **Priority badges**: cycle task priority inline with a single click; badge stripped and rebuilt cleanly.
- **Pin or unpin note** command: toggle the current note in the sidebar; calendar notes supported. Opening the note in Donote happens automatically after pinning.
- **Task actions**: complete, reschedule, or hand off tasks to the Routine plugin directly from the viewer.
- **Mini calendar picker**: schedule tasks via a compact date picker; existing date badges are clickable.
- **Collapsible headings** with hierarchical section-body indentation.
- Clickable tags and mentions.
- Split-view with Open/Synced toggle; TOC syncs scroll position with the editor.
- Mobile-optimised nav buttons and ultra-narrow TOC-only synced mode.

### Fixes
- Task checkbox and priority badge vertical alignment.
- `@done(date+time)` appended correctly when completing tasks from the viewer.
- Nested list rendering and bullet dot alignment.
- Filter bar rebuilds correctly on note switch and after status/priority/date changes; hidden when the note has no tasks or checklists.
- Open/Pin buttons no longer disappear on note switch.
- Mobile layout: nav buttons no longer overlap the filter bar.
- Checklist item rendering and width-limit threshold.

## [1.0.0] 2026-04-04
- Initial release: three-panel note viewer with a pinned-notes sidebar, full markdown rendering (headings, tasks, checklists, tables, code blocks, blockquotes, images, wiki links, tags, mentions), and a right-hand table of contents with scroll spy. Supports light/dark themes and mobile-responsive layout.
