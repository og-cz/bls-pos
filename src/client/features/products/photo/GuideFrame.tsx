/** The guide box, as a share of the frame. */
const GUIDE = { width: 0.56, height: 0.66 };

/** Centering guide drawn over the camera or the editor. Purely visual. */
export function GuideFrame() {
  const left = `${((1 - GUIDE.width) / 2) * 100}%`;
  const top = `${((1 - GUIDE.height) / 2) * 100}%`;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* A light dim outside the box: the surroundings stay visible on purpose. */}
      <div
        className="absolute rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
        style={{ left, top, width: `${GUIDE.width * 100}%`, height: `${GUIDE.height * 100}%` }}
      >
        <div className="absolute inset-0 rounded-xl border-2 border-dashed border-white/80" />
        {/* Corner marks and a centre cross help line the product up. */}
        {(
          [
            'left-0 top-0 border-l-4 border-t-4',
            'right-0 top-0 border-r-4 border-t-4',
            'left-0 bottom-0 border-l-4 border-b-4',
            'right-0 bottom-0 border-r-4 border-b-4',
          ] as const
        ).map((pos) => (
          <span key={pos} className={`absolute size-6 rounded-sm border-white ${pos}`} />
        ))}
        <span className="absolute top-1/2 left-1/2 h-px w-5 -translate-x-1/2 bg-white/80" />
        <span className="absolute top-1/2 left-1/2 h-5 w-px -translate-y-1/2 bg-white/80" />
      </div>
      {/* Rule of thirds, faint. */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="border-white/15 [&:not(:nth-child(3n))]:border-r [&:nth-child(-n+6)]:border-b"
          />
        ))}
      </div>
    </div>
  );
}
