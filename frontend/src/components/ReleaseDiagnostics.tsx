import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { lastSync, useOffline } from "@/lib/offline";
import { fmtDateTime } from "@/lib/format";

async function readPublishedBuild() {
  const response = await fetch("/build-integrity.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Manifesto indisponível.");
  const manifest = await response.json();
  if (typeof manifest.commit !== "string" || !/^[a-f0-9]{40}$/.test(manifest.commit) ||
      typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("Manifesto inválido.");
  }
  const release = typeof manifest.release === "string" && /^P\d+\.\d+$/.test(manifest.release)
    ? ` (${manifest.release})`
    : "";
  return { version: `${manifest.version}${release}`, commit: manifest.commit as string };
}

export default function ReleaseDiagnostics() {
  const connection = useOffline();
  const manifest = useQuery({ queryKey: ["diagnostic-manifest"], queryFn: readPublishedBuild, retry: false });
  const api = useQuery({ queryKey: ["diagnostic-api"], queryFn: () => apiGet<{ message: string }>("/"), retry: false });
  const backup = useQuery({
    queryKey: ["diagnostic-backup"],
    queryFn: () => apiGet<{ latest: { at: string } | null }>("/backups/server/health"),
    retry: false,
  });
  const agents = useQuery({
    queryKey: ["diagnostic-print-agents"],
    queryFn: () => apiGet<{ active: boolean; last_seen: string | null }[]>("/print-agents"),
    retry: false,
  });
  const sync = lastSync();
  const values = {
    "Ambiente": window.location.hostname === "homologacao.apollo-pdv.com" ? "Homologação" : "Servidor configurado",
    "Versão publicada": manifest.data?.version ?? "Indisponível",
    "SHA publicado": manifest.data?.commit ?? "Indisponível",
    "API": api.isPending ? "Verificando" : api.data?.message === "Apollo PDV API" ? "Disponível" : "Indisponível",
    "Conexão do terminal": connection.offline ? "Offline" : "Online",
    "Vendas locais pendentes": connection.queue.length,
    "Vendas locais com revisão": connection.rejected.length,
    "Última sincronização de vendas": sync?.at ? fmtDateTime(sync.at) : "Sem registro local",
    "Agentes vinculados e ativos": agents.data?.filter((agent) => agent.active).length ?? "Indisponível",
    "Agentes ativos com contato recente": agents.data?.filter((agent) =>
      agent.active && agent.last_seen && Date.now() - Date.parse(agent.last_seen) < 60_000).length ?? "Indisponível",
    "Último backup": backup.data?.latest ? fmtDateTime(backup.data.latest.at) : "Sem confirmação",
  };

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(values, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "apollo-diagnostico.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="mb-4 rounded-xl border border-border bg-panel p-4" aria-labelledby="apollo-release-diagnostics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="apollo-release-diagnostics" className="font-semibold">Diagnóstico técnico</h2>
        <Button size="sm" variant="outline" onClick={download}>Exportar relatório</Button>
      </div>
      <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3 text-sm">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="wrap-anywhere font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">O manifesto identifica o build servido. A verificação dos hashes de todos os arquivos é feita no ensaio de publicação.</p>
    </section>
  );
}
