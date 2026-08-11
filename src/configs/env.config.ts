import z from "zod";
import "dotenv/config";

const envSchema = z.object({
  OLLAMA_API_KEY: z.string().min(10),
  OLLAMA_HOST: z.string().min(10),
  OLLAMA_MODEL: z.string().min(5),
});
export const env = envSchema.parse(process.env);
