/** Lightweight visual used while the 3D scene loads and when WebGL is unavailable. */
export default function HeroFallback() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-[30px] bg-[#f4f2eb]">
      <img
        src="/facilities/court.webp"
        alt=""
        width={2896}
        height={2172}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover opacity-[.18] grayscale"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/85 via-[#f8f5eb]/60 to-white/75" />
      <div className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.14em] text-zawana-600 shadow-sm backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-zawana-gold" />
        Built for the game
      </div>
    </div>
  );
}
