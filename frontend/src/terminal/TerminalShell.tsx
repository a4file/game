import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { dosPalette } from "./theme";
import { useRpgStore } from "../rpg/store";
import { AdminEditorShell } from "../editor/AdminEditorShell";

export const TerminalShell = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [input, setInput] = useState("");
  const [editorEnabled, setEditorEnabled] = useState(false);

  const logs = useRpgStore((s) => s.logs);
  const runCommand = useRpgStore((s) => s.runCommand);
  const loadBundle = useRpgStore((s) => s.loadBundle);
  const bundle = useRpgStore((s) => s.bundle);
  const setBundle = useRpgStore((s) => s.setBundle);
  const tutorialActive = useRpgStore((s) => s.tutorialActive);
  const tutorialStep = useRpgStore((s) => s.tutorialStep);

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  useEffect(() => {
    if (!editorEnabled) return;
    void loadBundle();
  }, [editorEnabled, loadBundle]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") === "1") {
      setEditorEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (!mountRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "monospace",
      fontSize: 14,
      theme: { background: dosPalette.bg, foreground: dosPalette.line }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(mountRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.writeln("[DOS] KLAUDE PET // TERMINAL RPG");
    term.writeln("type help");
    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.clear();
    term.writeln("[DOS] KLAUDE PET // TERMINAL RPG");
    logs.forEach((line) => term.writeln(line));
    term.write(`\r\n> ${input}`);
  }, [logs, input]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    const normalized = cmd.startsWith("/") ? cmd.slice(1) : cmd;
    if (normalized === "editor on") setEditorEnabled(true);
    if (normalized === "editor off") setEditorEnabled(false);
    await runCommand(cmd);
    setInput("");
  };

  const quickCommands = ["/start", "profile", "gacha 1 pickup", "battle", "adventure", "inventory", "save"];

  const runQuickCommand = async (cmd: string) => {
    const normalized = cmd.startsWith("/") ? cmd.slice(1) : cmd;
    if (normalized === "editor on") setEditorEnabled(true);
    if (normalized === "editor off") setEditorEnabled(false);
    await runCommand(cmd);
    setInput("");
  };

  return (
    <div className="terminal-layout">
      <section className="terminal-panel">
        <div className="terminal-mount" ref={mountRef} />
        <form onSubmit={onSubmit} className="command-input">
          <span>&gt;</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="command..." />
        </form>
        <div className="quick-actions">
          {quickCommands.map((cmd) => (
            <button key={cmd} type="button" onClick={() => void runQuickCommand(cmd)}>
              {cmd}
            </button>
          ))}
          <button type="button" onClick={() => setEditorEnabled((prev) => !prev)}>
            {editorEnabled ? "editor off" : "editor on"}
          </button>
        </div>
        {tutorialActive && (
          <div className="tutorial-banner">
            TUTORIAL STEP {tutorialStep}: 명령을 입력하거나 버튼으로 진행하세요.
          </div>
        )}
      </section>
      {editorEnabled && bundle && <AdminEditorShell bundle={bundle} onUpdateBundle={setBundle} />}
    </div>
  );
};

