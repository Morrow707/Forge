/** Forge's brand glyph -- a flame rising off an anvil, resting on a gym
 * weight stack, so the forge and the gym read as one emblem stacked
 * top-to-bottom rather than two motifs bolted together. Drop-in
 * replacement for the old plain Lucide `Flame` wherever it was used as the
 * actual logo mark (the colored badge next to the "Forge" wordmark) --
 * NOT for places Flame is used as a generic icon (streaks, nav items). */
export function ForgeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="161 55 190 400" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g fill="currentColor">
        {/* weight stack */}
        <g transform="translate(102.4,269) scale(0.6)">
          <rect x="196" y="110" width="120" height="26" rx="6" />
          <rect x="188" y="142" width="136" height="28" rx="6" />
          <rect x="180" y="176" width="152" height="30" rx="6" />
          <rect x="170" y="212" width="172" height="32" rx="7" />
          <rect x="158" y="250" width="196" height="34" rx="7" />
        </g>
        {/* anvil */}
        <g transform="translate(83,83.2) scale(0.73)">
          <path
            d="M180,208
               C180,200 184,194 192,194
               L332,194
               C340,194 346,200 346,208
               L346,244
               C346,252 340,258 332,258
               L232,258
               C204,258 178,244 140,238
               C130,236 128,228 134,222
               C160,214 172,210 180,208
               Z"
          />
          <path
            d="M212,258
               C212,258 220,300 236,320
               C244,330 244,340 236,346
               L226,352
               C270,352 286,352 296,346
               L286,340
               C278,330 278,320 286,310
               C298,296 300,270 300,258
               Z"
          />
        </g>
        {/* flame */}
        <g transform="translate(3,30)">
          <path
            d="M256,40
               C280,70 298,90 302,110
               C305,135 296,158 286,175
               C276,192 266,204 256,208
               C246,204 218,196 208,175
               C200,158 208,140 232,132
               C224,110 222,88 238,66
               C244,56 250,46 256,40
               Z"
          />
        </g>
      </g>
    </svg>
  );
}
