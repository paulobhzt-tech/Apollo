import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const levels = Array.from({ length: 26 }, (_, index) => 50 + index * 5);
const densities = { compact: "Compacto", normal: "Normal", spacious: "Ampliado" } as const;
type Density = keyof typeof densities;
type Preferences = { zoom: number | "auto"; density: Density; lowEffects: boolean };
const storageKey = "apollo-display-preferences";

function readPreferences(): Preferences {
  const defaults: Preferences = { zoom: 100, density: "normal", lowEffects: false };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<Preferences> | null;
    const zoom = saved?.zoom ?? Number(localStorage.getItem("apollo-display-zoom"));
    if (zoom === "auto" || levels.includes(zoom)) defaults.zoom = zoom;
    if (saved?.density === "compact" || saved?.density === "spacious") defaults.density = saved.density;
    defaults.lowEffects = saved?.lowEffects === true;
  } catch {
    return defaults;
  }
  return defaults;
}

function fittedZoom() {
  return Math.max(50, Math.min(100, Math.floor(Math.min(window.innerWidth / 1024, window.innerHeight / 720) * 20) * 5));
}

const DisplayContext = createContext<{ preferences: Preferences; actual: number; update: (value: Partial<Preferences>) => void } | null>(null);

export function DisplayPreferences({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [fitted, setFitted] = useState(fittedZoom);
  const auto = preferences.zoom === "auto";
  const actual = preferences.zoom === "auto" ? fitted : preferences.zoom;

  useEffect(() => {
    if (!auto) return;
    const resize = () => setFitted(fittedZoom());
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [auto]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--apollo-display-zoom", `${actual}%`);
    root.dataset.apolloDensity = preferences.density;
    root.dataset.apolloLowEffects = String(preferences.lowEffects);
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // The active settings still work when the browser blocks storage.
    }
  }, [actual, preferences]);

  return <DisplayContext.Provider value={{ preferences, actual, update: (value) => setPreferences((current) => ({ ...current, ...value })) }}>
    {children}
  </DisplayContext.Provider>;
}

export function DisplayControls() {
  const display = useContext(DisplayContext);
  if (!display) return null;
  const { preferences, actual, update } = display;
  return (
    <div role="group" aria-label="Visualização" className="flex flex-wrap items-center gap-1">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Diminuir zoom" disabled={actual === 50} onClick={() => update({ zoom: actual - 5 })}><Minus /></Button>
      <select aria-label="Zoom da interface" value={preferences.zoom}
        className="min-h-9 rounded-md border border-border bg-elevated px-1.5 text-xs text-foreground"
        onChange={(event) => update({ zoom: event.target.value === "auto" ? "auto" : Number(event.target.value) })}>
        <option value="auto">Ajuste automático{preferences.zoom === "auto" ? ` (${actual}%)` : ""}</option>
        {levels.map((level) => <option key={level} value={level}>{level}%</option>)}
      </select>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Aumentar zoom" disabled={actual === 175} onClick={() => update({ zoom: actual + 5 })}><Plus /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Restaurar zoom para 100%" onClick={() => update({ zoom: 100 })}><RotateCcw /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Ajustar zoom à tela" aria-pressed={preferences.zoom === "auto"} onClick={() => update({ zoom: "auto" })}><Maximize /></Button>
      <select aria-label="Densidade da interface" value={preferences.density}
        className="min-h-9 rounded-md border border-border bg-elevated px-1.5 text-xs text-foreground"
        onChange={(event) => update({ density: event.target.value as Density })}>
        {Object.entries(densities).map(([density, label]) => <option key={density} value={density}>{label}</option>)}
      </select>
      <Button type="button" variant={preferences.lowEffects ? "secondary" : "ghost"} size="sm" aria-pressed={preferences.lowEffects}
        onClick={() => update({ lowEffects: !preferences.lowEffects })}>Reduzir efeitos</Button>
    </div>
  );
}
