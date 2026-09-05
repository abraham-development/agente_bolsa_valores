import { defineTool } from "eve/tools";
import { z } from "zod";

const TWELVE_DATA_PRICE_URL = "https://api.twelvedata.com/price";

export default defineTool({
  description:
    "Obtiene el precio más reciente de una empresa en la bolsa mediante Twelve Data.",
  inputSchema: z.object({
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .describe("Símbolo bursátil de la empresa, por ejemplo AAPL o MSFT."),
  }),
  async execute({ symbol }, ctx) {
    const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        "Falta la variable de entorno TWELVE_DATA_API_KEY para consultar Twelve Data.",
      );
    }

    const normalizedSymbol = symbol.toUpperCase();
    const url = new URL(TWELVE_DATA_PRICE_URL);
    url.searchParams.set("symbol", normalizedSymbol);

    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Authorization: `apikey ${apiKey}`,
        },
        signal: ctx.abortSignal,
      });
    } catch (error) {
      if (ctx.abortSignal.aborted) {
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

    if (!isRecord(payload) || typeof payload.price !== "string") {
      throw new Error("Twelve Data no devolvió un precio válido para el símbolo.");
    }

    return {
      symbol: normalizedSymbol,
      price: payload.price,
      provider: "Twelve Data",
    };
  },
});

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
