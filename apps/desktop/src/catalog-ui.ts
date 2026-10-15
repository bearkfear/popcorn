import { Code, ConnectError } from "@popcorn/sdk";

/** Only backend-provided TMDB artwork can leave the native image boundary. */
export function artworkUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.origin === "https://image.tmdb.org" && url.pathname.startsWith("/t/p/") && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

export function catalogErrorText(error: unknown, online: boolean): string {
  if (!online) return "Não foi possível consultar o catálogo local. Tente novamente.";
  if (error instanceof ConnectError) {
    switch (error.rawMessage) {
      case "TMDB_NOT_CONFIGURED": return "Configure seu API Read Access Token para consultar o TMDB. O catálogo local continua disponível.";
      case "TMDB_INVALID_CREDENTIAL": return "O TMDB recusou a credencial. Confira seu API Read Access Token, não a API key, e configure novamente.";
      case "TMDB_RATE_LIMITED": return "O limite de consultas do TMDB foi atingido. Aguarde antes de tentar novamente.";
      case "TMDB_UNAVAILABLE": return "Não foi possível acessar o TMDB. Verifique sua conexão e tente novamente, ou abra o catálogo local.";
      case "TMDB_NOT_FOUND": return "Este conteúdo não foi encontrado no TMDB. Escolha outro título.";
      case "TMDB_INVALID_RESPONSE": return "O TMDB retornou dados que não puderam ser lidos. Tente novamente mais tarde.";
      case "TMDB_CONFIGURATION": return "Não foi possível salvar ou remover a configuração neste dispositivo. Tente novamente.";
    }
    if (error.code === Code.Unavailable || error.code === Code.DeadlineExceeded) return "A consulta não chegou ao serviço. Verifique sua conexão e tente novamente.";
    if (error.code === Code.ResourceExhausted) return "O limite de consultas foi atingido. Aguarde antes de tentar novamente.";
  }
  return "Não foi possível concluir a consulta. Tente novamente.";
}

export function needsConfiguration(error: unknown): boolean {
  return error instanceof ConnectError && (error.rawMessage === "TMDB_NOT_CONFIGURED" || error.rawMessage === "TMDB_INVALID_CREDENTIAL");
}
