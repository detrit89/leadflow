import dotenv from "dotenv";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import generateRouter from "./routes/generate";

const envResult = dotenv.config();
const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

if (envResult.error) {
  console.warn(".env file was not loaded:", envResult.error.message);
}

console.log("GEMINI_API_KEY exists:", hasGeminiApiKey);

const app = express();
const PORT = 3000;

app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use("/api", generateRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
