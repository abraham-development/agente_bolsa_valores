import { defineTool } from "eve/tools";
import { z } from "zod";
import { findUsStockSymbol, getLatestStockPrice } from "../lib/twelve-data";

export default defineTool({
  description:
    "Obtiene el precio más reciente de una empresa de Estados Unidos mediante Twelve Data. Recibe el nombre de la empresa.",
  inputSchema: z.object({
    company: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe("Nombre de la empresa, por ejemplo Apple o Microsoft."),
  }),
  async execute({ company }, ctx) {
    const symbol = await findUsStockSymbol(company, ctx.abortSignal);
    return getLatestStockPrice(symbol, ctx.abortSignal);
  },
});
