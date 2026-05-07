import cors from "cors";
import express from "express";
import { aiRouter } from "./routes/aiRoutes";
import { contentRouter } from "./routes/contentRoutes";
import { editorRouter } from "./routes/editorRoutes";

export const createApp = () => {
  const app = express();
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : true
    })
  );
  app.use(express.json({ limit: "3mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/content", contentRouter);
  app.use("/ai", aiRouter);
  app.use("/editor", editorRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { code: "UNEXPECTED", message: err.message } });
  });

  return app;
};

