import { Router } from "express";
import { generateWithOpenRouter } from "../ai/openRouterClient";
import { battlePrompt, branchPrompt, companionPrompt } from "../ai/prompts";
import {
  fallbackBattleDecision,
  getBattleStateSummary,
  getBranchFlags,
  getCompanionMood
} from "../ai/tools";
import { BattleDecisionRequest } from "../types";

export const aiRouter = Router();

aiRouter.post("/battle-decision", async (req, res) => {
  const body = req.body as BattleDecisionRequest;
  if (!body?.battleState) {
    return res.status(400).json({ error: { code: "INVALID_BATTLE_STATE", message: "battleState is required" } });
  }

  const summary = getBattleStateSummary(body.battleState);
  const generated = await generateWithOpenRouter(battlePrompt(summary));
  const fallback = fallbackBattleDecision(body.battleState);
  const decision = generated?.toUpperCase().match(/ATTACK|SKILL|DEFEND/)?.[0] ?? fallback;
  return res.json({ decision, source: generated ? "ai" : "fallback" });
});

aiRouter.post("/branch-text", async (req, res) => {
  const flags = req.body?.flags ?? {};
  const context = typeof req.body?.context === "string" ? req.body.context : "unknown";
  const prompt = branchPrompt(getBranchFlags(flags), context);
  const generated = await generateWithOpenRouter(prompt);
  return res.json({ text: generated ?? "[SYS] 낡은 통로에서 불길한 소음이 울린다.", source: generated ? "ai" : "fallback" });
});

aiRouter.post("/companion-line", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "동료";
  const scene = typeof req.body?.scene === "string" ? req.body.scene : "battle";
  const bond = Number(req.body?.bond ?? 50);
  const fatigue = Number(req.body?.fatigue ?? 40);
  const mood = getCompanionMood(bond, fatigue);

  const generated = await generateWithOpenRouter(companionPrompt(name, mood, scene));
  return res.json({ line: generated ?? `${name}: 지금은 침착하게 가자.`, source: generated ? "ai" : "fallback" });
});

