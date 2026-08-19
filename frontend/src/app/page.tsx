export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-mono text-xs tracking-[0.2em] uppercase text-amber-500">
        SIH · Space Technology
      </p>
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
        TerraSight
      </h1>
      <p className="max-w-xl text-neutral-500">
        Onboard Edge-AI perception for autonomous planetary rovers. Live 3D
        terrain map, zone classification, and construction Safety Score — the
        dashboard lands here.
      </p>
      <div className="flex gap-2 flex-wrap justify-center font-mono text-xs text-neutral-400">
        <span className="border rounded-full px-3 py-1">Zone 0 · safe</span>
        <span className="border rounded-full px-3 py-1">Zone 1 · nav</span>
        <span className="border rounded-full px-3 py-1">Zone 2 · geological</span>
        <span className="border rounded-full px-3 py-1">Zone 3 · hazard</span>
      </div>
    </main>
  );
}
