import { defineAgent } from "eve";
export default defineAgent({
    description: "Investigas noticias de las ultimas 24 horas de una empresa en la bolsa de valores",
    model: "openai/gpt-6-luna",
});