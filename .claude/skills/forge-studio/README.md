# Forge Studio

A mod (a Claude Code plugin of function hooks) that gives a session a studio pane for Forge's
art. It lives in the repo so every session working on Forge loads the same one.

- **The pane.** `/studio` opens it. It shows the current render with a strip of earlier versions,
  **Approve**, **Redo** (with a note that reaches Claude as the next prompt) and **Compare**
  (the previous version beside the current one).
- **/tune** turns the body-map knobs: `/tune striations 0.12 denoise 6`, `/tune list`,
  `/tune reset`. It reruns the finish stage of `tools/body-map/pipeline.py`, shows the result in
  the pane and asks Claude to republish the review artifact.
- **Tools Claude can call:** `render` (the body-map pipeline, any stage, with knobs), `show`
  (any image file into the pane) and `cloudinary_enhance` (run an image through Cloudinary's
  improve / upscale / enhance / background removal, which needs `CLOUDINARY_URL` as a secret in
  the environment and the Cloudinary hosts allowed on its network policy).

Renders land in `.studio/` at the repo root, which is ignored by git.

## Loading it

A project plugin in `.claude/skills/` loads with the session. To install it explicitly instead,
at a terminal session's prompt:

    /plugin install forge-studio --marketplace Morrow707/Forge

Or set `CLAUDE_CODE_PLUGIN_DIRS` to this folder's absolute path in the cloud environment.
