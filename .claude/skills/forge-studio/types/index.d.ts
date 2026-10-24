/** One thing the studio has shown: a body-map render or any one image. */
export type StudioVersion = {
  id: string
  /** What the strip calls it. */
  label: string
  /** Epoch ms. */
  at: number
  kind: 'bodymap' | 'image'
  /** Absolute paths of the previews preview.py wrote. */
  preview: string
  previewSmall: string
  previewPng: string
  /** Pixel sizes of the previews, for the Svg box. */
  w: number
  h: number
  smallW: number
  smallH: number
  /** The knobs this render was made with (body map only). */
  knobs?: Record<string, number>
  /** The rendered site folder to publish from (body map only). */
  site?: string
  decision?: 'approved' | 'redo' | null
}

declare module 'claude-code' {
  interface PluginState {
    'forge-studio': {
      versions: Shaped<StudioVersion[]>
      currentId: string | null
      compareId: string | null
      busy: string | null
    }
  }
}
