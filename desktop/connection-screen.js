async function showConnectionSettings() {
  if (!new URLSearchParams(location.search).has("diagnose")) return;

  const desktop = window.pdvDesktop;
  const form = document.querySelector("#connection");
  const status = document.querySelector("#status");
  const input = document.querySelector("#server");
  const connect = document.querySelector("#connect");
  const restore = document.querySelector("#restore-address");
  const startup = document.querySelector("#startup");

  try {
    const config = await desktop.config();
    input.value = config.serverUrl;
    status.textContent = config.connectionError;
    startup.textContent = "Conexão de homologação";
    form.hidden = false;
    restore.addEventListener("click", () => {
      input.value = config.defaultServerUrl;
      input.focus();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const url = input.value.trim();
      connect.disabled = restore.disabled = input.disabled = true;
      status.textContent = "Verificando a API e o serviço de login…";
      try {
        const result = await desktop.connectServer(url);
        status.textContent = result.ok ? "Servidor confirmado." : result.error;
      } catch {
        status.textContent = "Não foi possível atualizar a conexão. Confira o endereço e tente novamente.";
      } finally {
        connect.disabled = restore.disabled = input.disabled = false;
      }
    });
  } catch {
    startup.textContent = "Não foi possível abrir o diagnóstico do Apollo. Feche e abra o aplicativo para tentar novamente.";
  }
}

void showConnectionSettings();
