import { Router } from "express";
import { getSheets } from "../editor/store";

export const contentRouter = Router();

contentRouter.get("/bundle", async (_req, res) => {
  res.json(await getSheets());
});

