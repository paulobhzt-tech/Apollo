import { useEffect, useState } from "react";

export default function PwaUpdateNotice() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    let stopped = false;
    let lastCheck = Date.now();
    const worker = navigator.serviceWorker;

    function refreshNotice() {
      setWaiting(Boolean(registration?.waiting && worker.controller));
    }

    function observeInstallation() {
      installing?.removeEventListener("statechange", refreshNotice);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", refreshNotice);
      refreshNotice();
    }

    function checkOnReturn() {
      if (document.visibilityState !== "visible" || !registration || Date.now() - lastCheck < 300_000) return;
      lastCheck = Date.now();
      void registration.update().catch(() => undefined);
    }

    void worker.register("/sw.js", { updateViaCache: "none" }).then((result) => {
      if (stopped) return;
      registration = result;
      registration.addEventListener("updatefound", observeInstallation);
      observeInstallation();
    }).catch((error) => console.warn("Apollo: registro do service worker indisponível", error));
    document.addEventListener("visibilitychange", checkOnReturn);
    worker.addEventListener("controllerchange", refreshNotice);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", checkOnReturn);
      worker.removeEventListener("controllerchange", refreshNotice);
      registration?.removeEventListener("updatefound", observeInstallation);
      installing?.removeEventListener("statechange", refreshNotice);
    };
  }, []);
  if (!waiting) return null;
  return (
    <p role="status" className="border-b border-border bg-panel px-4 py-2 text-sm text-foreground">
      Atualização do Apollo disponível. Termine as operações em andamento, feche todas as janelas do Apollo e abra-o novamente.
    </p>
  );
}
