import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { StudioVersion } from '../types'

// FORGE STUDIO: the picture beside the chat, so a round of art is a look and a button, not a
// paragraph describing a flaw and a guess at which knob it names. The body map took nine rounds
// that way (2026-10-18/19). The pipeline it drives is tools/body-map (every number there is a
// knob); the pane shows what came out; Approve / Redo / Compare come straight back as prompts.

const PLUGIN = 'forge-studio'

/** The repository the pipeline lives in. Taken from the session's own working directory at
 *  session.start -- NOT derived from `$.plugin.root`, which is wherever the plugin was loaded
 *  from (a symlink in a session's mods folder on the first run, where stripping
 *  `.claude/skills/forge-studio` off it finds nothing and every tool looked for the pipeline
 *  in the wrong place). The derivation stays as the fallback for a hook that runs before
 *  session.start has. */
let repoRoot: string | null = null
const repoRootFor = ($: { plugin: { root: string } }) =>
  repoRoot ?? $.plugin.root.replace(/\/\.claude\/skills\/forge-studio$/, '')

/** A tool answer the model reads as text. `result` is what the engine stores; `text` what it shows. */
const ok = (text: string) => ({ result: text, text })
const fail = (text: string) => ({ isError: true as const, result: text, text })
const PANE = 'forge-studio'
const ARTIFACT = 'https://claude.ai/artifact/547k9BLoUmuYF12LvyA3dM'
const PY = 'python3.13'

const versions = atom({ plugin: 'forge-studio', key: 'versions' }, [] as StudioVersion[], { shape: 'versions-1' })
const currentId = atom({ plugin: 'forge-studio', key: 'currentId' }, null as string | null)
const compareId = atom({ plugin: 'forge-studio', key: 'compareId' }, null as string | null)
const busy = atom({ plugin: 'forge-studio', key: 'busy' }, null as string | null)


const KNOB_HELP = [
  'denoise 8 (grain removal; 0 off)', 'blur 1.8', 'sharpen 0.38', 'sharpen_sigma 3.0', 'gamma 0.92',
  'color 1.05', 'striations 0.17 (fibre-line darkness; 0 off)', 'stripe_period 13', 'stripe_min_area 1400',
  'edge_shade 0.07', 'feather 1.6', 'face_scale 0.96', 'face_fade 14', 'preview_height 520',
  '-- the smoothing pass (2026-10-24) --',
  'outline_smooth 2.5 (silhouette blur before threshold)', 'label_smooth 4 (hover-shape blur; 0 = staircase)',
  'label_min_island 2500 (a group speck under this many px joins its neighbour)', 'label_close 3 (close + fill each group first)',
  'hand_zone 0.08 (hand = this fraction of figure height above each arm\'s end: skin, no group)', 'foot_zone 0.075 (same, from the bottom)',
  'flatten 0.6 (pull each blob toward its median colour)', 'flatten_blur 3 (soften the seams)',
  'skin_smooth 0.85 (ungrouped body pixels toward smooth skin)', 'skin_sigma 7', 'match_color 1 (match each tile to the male front)',
].join('\n  ')

function parseResult(stdout: string, tag: string): Record<string, unknown> | null {
  const line = stdout.split('\n').reverse().find(l => l.startsWith(tag + ' '))
  if (!line) return null
  try { return JSON.parse(line.slice(tag.length + 1)) } catch { return null }
}

async function readPreviewInfo($: any, dir: string) {
  try {
    const text = await $.fs.read(`${dir}/preview.json`)
    return JSON.parse(text) as { preview: { w: number; h: number }; previewSmall: { w: number; h: number } }
  } catch { return null }
}

async function addVersion($: any, v: StudioVersion) {
  await update($, versions, list => [...list, v].slice(-30))
  await update($, currentId, () => v.id)
  await update($, compareId, () => null)
  await $.ui.open({ id: PANE, title: 'Forge Studio' })
}

function newId() { return Date.now().toString(36) }

/** Run the body-map pipeline and register what it produced as a version. */
async function renderBodyMap($: any, cwd: string, args: { stage?: string; knobs?: Record<string, number>; label?: string; reset?: boolean }) {
  const work = `${cwd}/.studio/bodymap`
  const argv = [PY, `${cwd}/tools/body-map/pipeline.py`, '--work', work, '--stage', args.stage ?? 'hd']
  if (args.reset) argv.push('--reset')
  for (const [k, v] of Object.entries(args.knobs ?? {})) argv.push('--set', `${k}=${v}`)
  // A first run needs every stage; `hd` alone wants the tiles from an earlier run.
  if ((args.stage ?? 'hd') === 'hd' && !(await $.fs.exists(`${work}/manifest.json`))) argv[argv.indexOf('--stage') + 1] = 'all'
  await update($, busy, () => `rendering body map (${argv[argv.indexOf('--stage') + 1]})`)
  try {
    const ran = await $.process.run(argv, { cwd, timeoutMs: 600_000 })
    if (ran.exitCode !== 0) {
      return { ok: false as const, text: `pipeline failed (${ran.exitCode}):\n${ran.stderr.slice(-1500) || ran.stdout.slice(-1500)}` }
    }
    const res = parseResult(ran.stdout, 'RESULT')
    const info = await readPreviewInfo($, work)
    if (!res || !info) return { ok: false as const, text: `pipeline ran but wrote no result line:\n${ran.stdout.slice(-800)}` }
    const knobs = res.knobs as Record<string, number>
    const v: StudioVersion = {
      id: newId(), label: args.label ?? `body map ${new Date().toISOString().slice(11, 16)}`, at: Date.now(), kind: 'bodymap',
      preview: `${work}/preview.webp`, previewSmall: `${work}/preview-sm.webp`, previewPng: `${work}/preview.png`,
      w: info.preview.w, h: info.preview.h, smallW: info.previewSmall.w, smallH: info.previewSmall.h,
      knobs, site: String(res.site), decision: null,
    }
    // Each version keeps its own preview files, or the strip would show the latest for all.
    const keep = `${cwd}/.studio/versions/${v.id}`
    await $.process.run(['mkdir', '-p', keep])
    await $.process.run(['cp', `${work}/preview.webp`, `${work}/preview-sm.webp`, `${work}/preview.png`, `${work}/preview.json`, keep])
    v.preview = `${keep}/preview.webp`; v.previewSmall = `${keep}/preview-sm.webp`; v.previewPng = `${keep}/preview.png`
    await addVersion($, v)
    return { ok: true as const, version: v, seconds: Number(res.seconds), text: `Rendered ${v.label} in ${res.seconds}s. Knobs: ${JSON.stringify(knobs)}. Site: ${res.site}` }
  } finally {
    await update($, busy, () => null)
  }
}

/** Show any one image in the pane. */
async function showImage($: any, cwd: string, path: string, label?: string, kind: StudioVersion['kind'] = 'image') {
  const id = newId()
  const out = `${cwd}/.studio/versions/${id}`
  await update($, busy, () => `preparing ${label ?? path}`)
  try {
    const ran = await $.process.run([PY, `${cwd}/tools/body-map/preview.py`, '--image', path, '--out', out], { cwd, timeoutMs: 120_000 })
    if (ran.exitCode !== 0) return { ok: false as const, text: `could not preview ${path}: ${ran.stderr.slice(-600)}` }
    const info = await readPreviewInfo($, out)
    if (!info) return { ok: false as const, text: `no preview written for ${path}` }
    const v: StudioVersion = {
      id, label: label ?? path.split('/').pop() ?? path, at: Date.now(), kind,
      preview: `${out}/preview.webp`, previewSmall: `${out}/preview-sm.webp`, previewPng: `${out}/preview.png`,
      w: info.preview.w, h: info.preview.h, smallW: info.previewSmall.w, smallH: info.previewSmall.h, decision: null,
    }
    await addVersion($, v)
    return { ok: true as const, version: v, text: `Showing ${v.label} in the studio pane.` }
  } finally {
    await update($, busy, () => null)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    repoRoot = e.cwd
    await $.command.register({ name: 'studio', description: 'Open the Forge Studio pane (renders, Approve / Redo / Compare).' })
    await $.command.register({ name: 'tune', description: 'Turn a body-map knob and re-render: /tune striations 0.12 denoise 6 | list | reset', argumentHint: 'knob value ... | list | reset' })
    await $.tool.register({
      name: 'render', isDeferred: false,
      description: 'Run the Forge body-map pipeline (tools/body-map) and show the result in the studio pane. stage "hd" reruns the finish with the knobs given (fast); "all" rebuilds from the source renders. Knobs: denoise, blur, sharpen, sharpen_sigma, gamma, color, striations, stripe_period, stripe_min_area, edge_shade, feather, outline_smooth, label_smooth, label_min_island, label_close, hand_zone, foot_zone, flatten, flatten_blur, skin_smooth, skin_sigma, match_color, face_scale, face_fade, preview_height. Returns the knobs in force and the site folder to publish the artifact from.',
      inputSchema: { type: 'object', properties: {
        stage: { type: 'string', enum: ['hd', 'all'] },
        knobs: { type: 'object', additionalProperties: { type: 'number' } },
        label: { type: 'string' }, reset: { type: 'boolean' },
      } },
    })
    await $.tool.register({
      name: 'show', isDeferred: false,
      description: 'Show an image file (png, jpg, webp) in the Forge Studio pane beside the chat as a new version, for Scott to approve, redo or compare. Use after rendering any artwork.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, label: { type: 'string' } }, required: ['path'] },
    })
    await $.tool.register({
      name: 'cloudinary_enhance',
      description: 'Run an image through Cloudinary (improve, upscale, enhance, background_removal, sharpen, auto_contrast) and show the result in the studio pane. Needs CLOUDINARY_URL in the environment; says so when it is missing.',
      inputSchema: { type: 'object', properties: {
        path: { type: 'string' }, out: { type: 'string', description: 'where to write the result (png); default beside the input' },
        effects: { type: 'array', items: { type: 'string' } }, label: { type: 'string' },
      }, required: ['path'] },
    })
    return next(e)
  })

  on('command.run', { command: 'studio' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Forge Studio', focus: true })
    const list = await read($, versions)
    return { text: list.length ? `Forge Studio open: ${list.length} version(s).` : 'Forge Studio open. Nothing rendered yet: call the render tool, or /tune.' }
  })

  on('command.run', { command: 'tune' }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    const cwd = repoRootFor($)
    if (!words.length || words[0] === 'list') {
      const cur = (await read($, versions)).slice().reverse().find(v => v.kind === 'bodymap')
      return { text: `Body-map knobs (default in brackets):\n  ${KNOB_HELP}\n\nIn force: ${cur?.knobs ? JSON.stringify(cur.knobs) : 'defaults (nothing rendered yet)'}\n\n/tune striations 0.12 denoise 6` }
    }
    if (words[0] === 'reset') {
      const r = await renderBodyMap($, cwd, { stage: 'hd', reset: true, label: 'defaults' })
      if (r.ok) void $.prompt.submit({ text: `Forge Studio: /tune reset re-rendered the body map at the default knobs (version "${r.version.label}", site ${r.version.site}). Republish the body map artifact ${ARTIFACT} from that site folder (index.html plus img/, lab/, manifest.json, exercises.json) and tell Scott in one line.` })
      return { text: r.text }
    }
    if (words.length % 2 !== 0) return { text: 'Pairs, please: /tune knob value [knob value ...]. /tune list shows the knobs.' }
    const knobs: Record<string, number> = {}
    for (let i = 0; i < words.length; i += 2) {
      const knob = words[i]
      const raw = words[i + 1]
      if (!knob || raw === undefined) break
      const n = Number(raw)
      if (!Number.isFinite(n)) return { text: `"${raw}" is not a number for ${knob}.` }
      knobs[knob] = n
    }
    const label = Object.entries(knobs).map(([k, v]) => `${k} ${v}`).join(', ')
    const r = await renderBodyMap($, cwd, { stage: 'hd', knobs, label })
    if (r.ok) {
      void $.prompt.submit({ text: `Forge Studio: /tune re-rendered the body map with ${label} (version "${r.version.label}", site ${r.version.site}). Republish the body map artifact ${ARTIFACT} from that site folder (index.html plus img/, lab/, manifest.json, exercises.json) and tell Scott in one line what moved.` })
    }
    return { text: r.text }
  })

  on('tool.call', { tool: 'mcp__forge-studio__render' }, async ($, e) => {
    const cwd = repoRootFor($)
    const input = e as unknown as { stage?: string; knobs?: Record<string, number>; label?: string; reset?: boolean }
    const r = await renderBodyMap($, cwd, input)
    return r.ok ? ok(r.text) : fail(r.text)
  })

  on('tool.call', { tool: 'mcp__forge-studio__show' }, async ($, e) => {
    const cwd = repoRootFor($)
    const input = e as unknown as { path: string; label?: string }
    const r = await showImage($, cwd, input.path, input.label)
    return r.ok ? ok(r.text) : fail(r.text)
  })

  on('tool.call', { tool: 'mcp__forge-studio__cloudinary_enhance' }, async ($, e) => {
    const cwd = repoRootFor($)
    const input = e as unknown as { path: string; out?: string; effects?: string[]; label?: string }
    const out = input.out ?? input.path.replace(/\.[a-z0-9]+$/i, '') + `.cloudinary.png`
    await update($, busy, () => 'asking Cloudinary')
    let ran
    try {
      ran = await $.process.run([PY, `${cwd}/tools/body-map/cloudinary_enhance.py`, '--in', input.path, '--out', out, '--effects', (input.effects ?? ['improve']).join(',')], { cwd, timeoutMs: 300_000 })
    } finally {
      await update($, busy, () => null)
    }
    if (ran.exitCode !== 0) return fail(ran.stderr.trim() || `cloudinary_enhance failed (${ran.exitCode})`)
    const r = await showImage($, cwd, out, input.label ?? `cloudinary ${(input.effects ?? ['improve']).join('+')}`)
    const text = `${ran.stdout.trim()}\n${r.text}`
    return r.ok ? ok(text) : fail(text)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, versions)
    const cur = await read($, currentId)
    const cmp = await read($, compareId)
    const running = await read($, busy)
    const current = list.find(v => v.id === cur) ?? list[list.length - 1]
    const other = cmp ? list.find(v => v.id === cmp) : undefined
    const width = Math.max(20, (e.props.bodyColumns ?? e.viewport?.columns ?? 60) - 2)

    const picture = async (v: StudioVersion, small: boolean) => {
      const path = small ? v.previewSmall : v.preview
      const w = small ? v.smallW : v.w
      const h = small ? v.smallH : v.h
      if (e.surface === 'terminal') {
        const { Image } = $.ui.resolve(e)
        const { base64 } = await $.fs.read(v.previewPng, { as: 'bytes' })
        const cols = small ? Math.floor(width / 2) - 1 : width
        return <Image key={`img-${v.id}-${small ? 's' : 'l'}`} source={{ png: base64 }} columns={cols} rows={Math.max(6, Math.round((cols * h) / (w * 2)))} alt={v.label} />
      }
      const { Svg } = $.ui.resolve(e)
      const { base64 } = await $.fs.read(path, { as: 'bytes' })
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="data:image/webp;base64,${base64}" width="${w}" height="${h}"/></svg>`
      return <Svg source={svg} alt={v.label} />
    }

    const act = (label: string, hotkey: string, fn: () => void, variant?: 'primary') => (
      <Button key={label.toLowerCase()} label={label} hotkey={hotkey} variant={variant} onPress={fn} />
    )

    const approve = () => {
      if (!current) return
      void update($, versions, l => l.map(v => (v.id === current.id ? { ...v, decision: 'approved' as const } : v)))
      $.ui.toast(`Approved ${current.label}`)
      void $.prompt.submit({ text: `Forge Studio: Scott approved "${current.label}"${current.kind === 'bodymap' ? ` (knobs ${JSON.stringify(current.knobs)}, site ${current.site})` : ''}. Treat it as the version to keep.` })
    }
    const redo = () => {
      if (!current) return
      void update($, versions, l => l.map(v => (v.id === current.id ? { ...v, decision: 'redo' as const } : v)))
      void $.prompt.fill({ text: `Forge Studio: another pass on "${current.label}": `, mode: 'replace' })
    }
    const compare = () => {
      if (!current) return
      const i = list.findIndex(v => v.id === current.id)
      const prev = i > 0 ? list[i - 1] : undefined
      void update($, compareId, c => (c ? null : (prev?.id ?? null)))
    }

    if (!current) {
      return (
        <Box flexDirection="column">
          <Text bold>Forge Studio</Text>
          <Text dimColor>Nothing rendered yet. Ask Claude to render the body map, or type /tune list.</Text>
          {running && <Text>{running}…</Text>}
        </Box>
      )
    }

    const pictures = other
      ? [<Box flexDirection="row">{await picture(other, true)}{await picture(current, true)}</Box>]
      : [await picture(current, false)]

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text bold>{current.label}</Text>
          <Text dimColor> {new Date(current.at).toLocaleTimeString()}{current.decision ? ` · ${current.decision}` : ''}</Text>
        </Box>
        {other && <Text dimColor>left: {other.label} · right: {current.label}</Text>}
        {pictures}
        {running && <Text dimColor>{running}…</Text>}
        <Box flexDirection="row">
          {act('Approve', 'a', approve, 'primary')}
          {act('Redo', 'r', redo)}
          {act(other ? 'Uncompare' : 'Compare', 'c', compare)}
        </Box>
        {current.kind === 'bodymap' && current.knobs && (
          <Text dimColor>knobs: {Object.entries(current.knobs).filter(([k]) => k !== 'preview_height').map(([k, v]) => `${k} ${v}`).join(' · ')}</Text>
        )}
        <Box flexDirection="row" flexWrap="wrap">
          {list.slice(-8).map(v => (
            <Button key={`v-${v.id}`} plain label={`${v.id === current.id ? '▸ ' : ''}${v.label}${v.decision === 'approved' ? ' ✓' : ''}`} onPress={() => { void update($, currentId, () => v.id); void update($, compareId, () => null) }} />
          ))}
        </Box>
      </Box>
    )
  })
}
