# Third-party code and adaptation notes

The conversation surface adapts layout contracts and styling from [zai-org/ZCode](https://github.com/zai-org/ZCode), licensed under Apache-2.0, reference commit `aac4755666d09fdcd70272fcf063c077a639015f`. Original license and notice are included in `third-party/zcode/`. Adapted portions are marked in `public/style.css` and `public/app.js`.

Sources: `packages/ui/src/WebRemoteControlMobileShell.tsx` (44px navigation row, independent mobile home/chat selection and back navigation), `packages/ui/src/v4/ConversationUserInputBubble.tsx` (user bubble geometry), `packages/ui/src/v4/ConversationComposer.tsx` (bottom input shell and distinct error surface), and `packages/ui/src/styles.css` (`theme-zai-dark` colors).

Changes: translated React/Tailwind layout into native DOM/CSS for this prototype; replaced ZCode runtime/relay bindings with Codex Desktop IPC; use actual Codex model/status; use sanitized Markdown; replace provider and approval controls with Codex model and permission-mode controls; omit unsupported attachment transmission. This is an adaptation, not an unmodified build of the entire ZCode chat stack.

`public/vendor/marked.esm.js`: Marked, MIT (license alongside the bundle).
`public/vendor/purify.es.mjs`: DOMPurify, Apache-2.0 or MPL-2.0 (license alongside the bundle).

`public/icons.mjs`: selected Lucide SVG icons, ISC (license in `public/vendor/lucide-LICENSE`); generated from `icons-source.mjs` using esbuild.
