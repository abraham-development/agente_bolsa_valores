const TWELVE_DATA_PRICE_URL = "https://api.twelvedata.com/price";
const TWELVE_DATA_SYMBOL_SEARCH_URL = "https://api.twelvedata.com/symbol_search";
const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "NYSE ARCA", "AMEX", "BATS"]);

export interface LatestStockPrice {
  symbol: string;
  price: string;
  provider: "Twelve Data";
}

interface StockListing {
  symbol: string;
  instrumentName: string;
}

export async function findUsStockSymbol(
  company: string,
  signal?: AbortSignal,
): Promise<string> {
  const query = company.trim();
  const payload = await twelveDataGet(
    TWELVE_DATA_SYMBOL_SEARCH_URL,
    { symbol: query, outputsize: "30" },
    signal,
  );

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error(
      "Twelve Data no devolvió resultados de búsqueda para la empresa.",
    );
  }

  const ranked = payload.data
    .flatMap((item) => {
      const listing = toUsCommonStock(item);
      return listing ? [{ listing, score: scoreListing(query, listing) }] : [];
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) {
    throw new Error(`No encontré una acción de Estados Unidos para "${query}".`);
  }

  const tied = ranked.filter((item) => item.score === best.score);
  if (tied.length > 1 && best.score < 90) {
    const options = tied
      .slice(0, 5)
      .map((item) => `${item.listing.instrumentName} (${item.listing.symbol})`)
      .join(", ");
    throw new Error(`Hay varias empresas parecidas a "${query}": ${options}.`);
  }

  return best.listing.symbol;
}

export async function getLatestStockPrice(
  symbol: string,
  signal?: AbortSignal,
): Promise<LatestStockPrice> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const payload = await twelveDataGet(
    TWELVE_DATA_PRICE_URL,
    { symbol: normalizedSymbol },
    signal,
  );

  if (!isRecord(payload) || typeof payload.price !== "string") {
    throw new Error("Twelve Data no devolvió un precio válido para el símbolo.");
  }

  return {
    symbol: normalizedSymbol,
    price: payload.price,
    provider: "Twelve Data",
  };
}

async function twelveDataGet(
  endpoint: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Falta la variable de entorno TWELVE_DATA_API_KEY para consultar Twelve Data.",
    );
  }

  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: `apikey ${apiKey}`,
      },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("La consulta a Twelve Data fue cancelada.");
    }

    const detail = error instanceof Error ? error.message : "error desconocido";
    throw new Error(`No se pudo conectar con Twelve Data: ${detail}`);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `Twelve Data devolvió una respuesta no válida (HTTP ${response.status}).`,
    );
  }

  if (isTwelveDataError(payload)) {
    throw new Error(`Twelve Data rechazó la consulta: ${payload.message}`);
  }

  if (!response.ok) {
    throw new Error(`La consulta a Twelve Data falló (HTTP ${response.status}).`);
  }

  return payload;
}

function toUsCommonStock(value: unknown): StockListing | undefined {
  if (
    !isRecord(value) ||
    value.instrument_type !== "Common Stock" ||
    value.country !== "United States" ||
    typeof value.exchange !== "string" ||
    !US_EXCHANGES.has(value.exchange) ||
    typeof value.symbol !== "string" ||
    typeof value.instrument_name !== "string"
  ) {
    return undefined;
  }

  return {
    symbol: value.symbol,
    instrumentName: value.instrument_name,
  };
}

function scoreListing(query: string, listing: StockListing): number {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const symbol = listing.symbol.trim().toLowerCase();
  const name = listing.instrumentName.trim().toLowerCase().replace(/\s+/g, " ");

  if (symbol === normalizedQuery) {
    return 100;
  }

  if (name === normalizedQuery) {
    return 90;
  }

  if (name.startsWith(normalizedQuery)) {
    return 80;
  }

  if (name.includes(normalizedQuery)) {
    return 60;
  }

  return 0;
}

function isTwelveDataError(
  value: unknown,
): value is { code: number; message: string; status: "error" } {
  return (
    isRecord(value) &&
    value.status === "error" &&
    typeof value.code === "number" &&
    typeof value.message === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
