import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { dosPalette } from "./theme";
import { useRpgStore } from "../rpg/store";
import { AdminEditorShell } from "../editor/AdminEditorShell";
import { maxManaFromCharacter } from "../rpg/battle/formulas";

const MOBILE_TAB_BREAKPOINT = "(max-width: 900px)";

export const TerminalShell = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const commandWrapRef = useRef<HTMLFormElement | null>(null);
  const quickActionsRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputRef = useRef("");
  const execGuardRef = useRef<{ command: string; at: number }>({ command: "", at: 0 });
  const executingRef = useRef(false);
  const [input, setInput] = useState("");
  const [editorEnabled, setEditorEnabled] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(
    typeof window !== "undefined" ? window.matchMedia(MOBILE_TAB_BREAKPOINT).matches : false
  );
  const [hintOpen, setHintOpen] = useState(false);

  const logs = useRpgStore((s) => s.logs);
  const roster = useRpgStore((s) => s.roster);
  const inventory = useRpgStore((s) => s.inventory);
  const trpgDraft = useRpgStore((s) => s.trpgDraft);
  const trpgSession = useRpgStore((s) => s.trpgSession);
  const canRegress = useRpgStore((s) => s.canRegress);
  const runCommand = useRpgStore((s) => s.runCommand);
  const loadBundle = useRpgStore((s) => s.loadBundle);
  const bundle = useRpgStore((s) => s.bundle);
  const setBundle = useRpgStore((s) => s.setBundle);
  const tutorialActive = useRpgStore((s) => s.tutorialActive);
  const tutorialStep = useRpgStore((s) => s.tutorialStep);
  const hero = roster[0];
  const battle = useRpgStore((s) => s.battle);
  const statusClass = trpgSession?.className ?? trpgDraft?.selected.className ?? hero?.className ?? "미정";
  const statusNation = trpgSession?.nation ?? trpgDraft?.selected.nation ?? hero?.nation ?? "미정";
  const statusElement = trpgSession?.element ?? trpgDraft?.selected.element ?? hero?.element ?? "미정";
  const rarityClass = useMemo(
    () => (hero ? `rarity-badge rarity-${hero.rarity}` : "rarity-badge"),
    [hero]
  );
  const manaMax = hero ? maxManaFromCharacter(hero) : 0;
  const hpMax = hero?.hp ?? 0;
  const hpCurrent = hero ? (battle ? battle.playerHp : hero.hp) : 0;
  const mpCurrent = battle ? battle.playerMp : manaMax;
  const mpMax = battle?.playerMaxMp ?? manaMax;
  const atkDisplay = hero?.atk ?? 0;
  const choiceMode = useMemo(() => {
    if (trpgDraft) {
      if (!trpgDraft.selected.characterId) return "character";
      if (!trpgDraft.selected.element) return "element";
      if (!trpgDraft.selected.origin) return "origin";
      if (!trpgDraft.selected.motive) return "motive";
      if (!trpgDraft.selected.stance) return "stance";
    }
    if (trpgSession) {
      const pageCap = roster[0]?.maxPages ?? 999;
      const promptFlag = `story_prompt_${trpgSession.chapter}`;
      if (trpgSession.chapter < pageCap && trpgSession.flags.includes(promptFlag)) return "story";
    }
    return "free";
  }, [trpgDraft, trpgSession, roster]);
  const hintLines = useMemo(() => {
    if (trpgDraft) {
      if (!trpgDraft.selected.characterId) {
        return [
          "캐릭터 선택: 1/2/3 또는 choose character N",
          `1) ${trpgDraft.characterOptions[0]?.name ?? "-"}`,
          `2) ${trpgDraft.characterOptions[1]?.name ?? "-"}`,
          `3) ${trpgDraft.characterOptions[2]?.name ?? "-"}`
        ];
      }
      if (!trpgDraft.selected.element) {
        return ["원소 선택: 1/2/3/4 또는 choose element N", "1) Fire  2) Water  3) Nature  4) Machine"];
      }
      if (!trpgDraft.selected.origin) {
        return [
          "출신 선택: 1/2/3 또는 choose origin N",
          `1) ${trpgDraft.originOptions[0]}  2) ${trpgDraft.originOptions[1]}  3) ${trpgDraft.originOptions[2]}`
        ];
      }
      if (!trpgDraft.selected.motive) {
        return [
          "동기 선택: 1/2/3 또는 choose motive N",
          `1) ${trpgDraft.motiveOptions[0]}  2) ${trpgDraft.motiveOptions[1]}  3) ${trpgDraft.motiveOptions[2]}`
        ];
      }
      if (!trpgDraft.selected.stance) {
        return [
          "성향 선택: 1/2/3 또는 choose stance N",
          `1) ${trpgDraft.stanceOptions[0]}  2) ${trpgDraft.stanceOptions[1]}  3) ${trpgDraft.stanceOptions[2]}`
        ];
      }
    }
    if (trpgSession && bundle) {
      const pageCap = roster[0]?.maxPages ?? 999;
      const promptFlag = `story_prompt_${trpgSession.chapter}`;
      if (trpgSession.chapter < pageCap && trpgSession.flags.includes(promptFlag)) {
        const branch = bundle.storyBranches.find((item) => item.chapter === trpgSession.chapter);
        const lines = [
          "스토리 선택: 1/2/3 또는 story choose A|B|C",
          `1) ${branch?.optionA ?? "정면 돌파"}`,
          `2) ${branch?.optionB ?? "우회 탐색"}`,
          `3) ${branch?.optionC ?? "침묵 유지"}`
        ];
        const recentFails = trpgSession.flags.filter((flag) => flag.startsWith("event_result_") && flag.endsWith("_fail")).length;
        const hasComboBonus = trpgSession.flags.some((flag) => flag.startsWith("combo_reward_"));
        if (recentFails >= 2) lines.push("보정: 최근 실패 누적, 2번 선택이 비교적 안전");
        if (hasComboBonus) lines.push("연계: 콤보 보상 누적 중, 1번 선택의 고보상 루트 열림");
        return lines;
      }
    }
    return ["진행 힌트 없음", "/start 또는 story로 다음 장면을 시작하세요."];
  }, [trpgDraft, trpgSession, bundle, roster]);

  const colorizeLogLine = (line: string): string => {
    const paint = (code: string, text: string) => `\x1b[${code}m${text}\x1b[0m`;
    const rarityLineColor = (() => {
      if (line.includes("노말(흰색)") || line.includes(" NORMAL ") || line.includes(" normal ")) return "38;5;255";
      if (line.includes("레어(파란색)")) return "38;5;39";
      if (line.includes("유니크(노란색)")) return "38;5;226";
      if (line.includes("에픽(보라색)")) return "38;5;141";
      if (line.includes("레전더리(초록색)")) return "38;5;82";
      return null;
    })();
    if (rarityLineColor) return paint(rarityLineColor, line);
    const withPrefix = (() => {
      if (line.startsWith("[SYS]")) return paint("38;5;45", line);
      if (line.startsWith("[ERR]")) return paint("38;5;203", line);
      if (line.startsWith("[BOOT]")) return paint("38;5;75", line);
      if (line.startsWith("[TRPG]")) return paint("38;5;87", line);
      if (line.startsWith("[NET]")) return paint("38;5;81", line);
      if (line.startsWith("[STORY]")) return paint("38;5;183", line);
      if (line.startsWith("[BOOK]")) return paint("38;5;220", line);
      if (line.startsWith("[REGRESS]")) return paint("38;5;48", line);
      if (line.startsWith("[ROGUELIKE]")) return paint("38;5;112", line);
      if (line.startsWith("[MONSTER]")) return paint("38;5;204", line);
      if (line.startsWith("[EVENT:BATTLE]")) return paint("38;5;210", line);
      if (line.startsWith("[EVENT:ADVENTURE]")) return paint("38;5;117", line);
      if (line.startsWith("[EVENT:COMPANION]")) return paint("38;5;182", line);
      if (line.startsWith("[EVENT:MERCHANT]")) return paint("38;5;221", line);
      if (line.startsWith("[EVENT:TOWN]")) return paint("38;5;151", line);
      if (line.startsWith("[EVENT:TREASURE]")) return paint("38;5;226", line);
      if (line.startsWith("[EVENT:FISHING]")) return paint("38;5;69", line);
      if (line.startsWith("[EVENT:MAZE]")) return paint("38;5;96", line);
      if (line.startsWith("[EVENT:TRAP]")) return paint("38;5;203", line);
      if (line.startsWith("[EVENT:CHAIN]")) return paint("38;5;171", line);
      if (line.startsWith("[EVENT:SAFETY]")) return paint("38;5;159", line);
      return line;
    })();
    return withPrefix
      .replaceAll("노말(흰색)", paint("38;5;255", "노말"))
      .replaceAll("레어(파란색)", paint("38;5;39", "레어"))
      .replaceAll("유니크(노란색)", paint("38;5;226", "유니크"))
      .replaceAll("에픽(보라색)", paint("38;5;141", "에픽"))
      .replaceAll("레전더리(초록색)", paint("38;5;82", "레전더리"));
  };

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  useEffect(() => {
    if (!editorEnabled) return;
    void loadBundle();
  }, [editorEnabled, loadBundle]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_TAB_BREAKPOINT);
    const sync = () => setNarrowViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") === "1") {
      setEditorEnabled(true);
    }
  }, []);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

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
    term.writeln("[DOS] TERMINAL RPG v0.1");
    term.writeln("type `help` to view commands");
    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.clear();
    term.writeln("\x1b[38;5;111m[DOS] TERMINAL RPG v0.1\x1b[0m");
    logs.forEach((line) => term.writeln(colorizeLogLine(line)));
    term.write(`\r\n> ${input}`);
  }, [logs, input, trpgSession, trpgDraft]);

  const executeCommand = async (rawCmd: string) => {
    const cmd = rawCmd.trim();
    if (!cmd) return;
    if (executingRef.current) return;
    const now = Date.now();
    if (execGuardRef.current.command === cmd && now - execGuardRef.current.at < 1200) {
      return;
    }
    execGuardRef.current = { command: cmd, at: now };
    executingRef.current = true;
    try {
      const normalized = cmd.startsWith("/") ? cmd.slice(1) : cmd;
      const low = normalized.toLowerCase();
      if (low === "editor on") {
        setEditorEnabled(true);
      }
      if (low === "editor off") setEditorEnabled(false);
      await runCommand(cmd);
      setInput("");
    } finally {
      executingRef.current = false;
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeCommand(input);
  };

  const runQuickCommand = async (cmd: string) => {
    await executeCommand(cmd);
  };

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".hint-tab")) return;
      setHintOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const disposable = term.onData((data) => {
      if (document.activeElement === commandInputRef.current) {
        return;
      }
      if (data === "\r") {
        void executeCommand(inputRef.current);
        return;
      }
      if (data === "\u007f") {
        const next = inputRef.current.slice(0, -1);
        inputRef.current = next;
        setInput(next);
        return;
      }
      if (data >= " " && data <= "~") {
        const next = inputRef.current + data;
        inputRef.current = next;
        setInput(next);
      }
    });
    return () => disposable.dispose();
  }, []);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontSize = narrowViewport ? 12 : 14;
    fit.fit();
  }, [narrowViewport]);

  const showEditorOverlay = narrowViewport && editorEnabled;
  const showTerminalPanel = !showEditorOverlay;
  const showEditorPanel = editorEnabled && Boolean(bundle);
  const showEditorPlaceholder = editorEnabled && !bundle;

  useEffect(() => {
    const fit = fitRef.current;
    if (!fit || !showTerminalPanel || !mountRef.current) return;
    const id = window.requestAnimationFrame(() => {
      fit.fit();
    });
    return () => window.cancelAnimationFrame(id);
  }, [showTerminalPanel, narrowViewport, editorEnabled]);

  useEffect(() => {
    if (!narrowViewport || !rootRef.current) return;
    const root = rootRef.current;
    const updateViewportChrome = () => {
      const headerHeight = statusBarRef.current?.offsetHeight ?? 50;
      const inputHeight = commandWrapRef.current?.offsetHeight ?? 44;
      const quickHeight = quickActionsRef.current?.offsetHeight ?? 62;
      root.style.setProperty("--mobile-header-h", `${Math.ceil(headerHeight)}px`);
      root.style.setProperty("--mobile-input-h", `${Math.ceil(inputHeight)}px`);
      root.style.setProperty("--mobile-actions-h", `${Math.ceil(quickHeight)}px`);
    };

    updateViewportChrome();
    window.addEventListener("resize", updateViewportChrome);
    return () => {
      window.removeEventListener("resize", updateViewportChrome);
      root.style.removeProperty("--mobile-header-h");
      root.style.removeProperty("--mobile-input-h");
      root.style.removeProperty("--mobile-actions-h");
    };
  }, [narrowViewport, editorEnabled, showEditorOverlay, hintOpen]);

  return (
    <div
      ref={rootRef}
      className={`terminal-root ${showEditorOverlay ? "terminal-root--editor-overlay" : ""}`}
    >
      <div
        className={`terminal-layout ${showEditorOverlay ? "terminal-layout--editor-overlay" : ""}`}
      >
      <section
        className={`terminal-panel ${!showTerminalPanel ? "terminal-panel--tab-hidden" : ""}`}
      >
        <div ref={statusBarRef} className="status-bar">
          <span className="status-item status-id status-priority-core">NAME: {hero?.name ?? "-"}</span>
          <span className="status-item status-priority-core">LV: {hero?.level ?? 0}</span>
          <span className="status-item status-hp status-meter" title="체력">
            <span className="status-meter-label">{hero ? `HP ${hpCurrent}/${Math.max(hpMax, 1)}` : "HP -"}</span>
            <span className="status-meter-track" aria-hidden="true">
              <span
                className="status-meter-fill"
                style={{
                  width: hero ? `${Math.max(0, Math.min(100, (hpCurrent / Math.max(hpMax, 1)) * 100))}%` : "0%"
                }}
              />
            </span>
          </span>
          <span className="status-item status-mp status-meter" title="마력 · 전투에서 스킬 사용 시 소모">
            <span className="status-meter-label">{hero ? `MP ${mpCurrent}/${Math.max(mpMax, 1)}` : "MP -"}</span>
            <span className="status-meter-track" aria-hidden="true">
              <span
                className="status-meter-fill"
                style={{
                  width: hero ? `${Math.max(0, Math.min(100, (mpCurrent / Math.max(mpMax, 1)) * 100))}%` : "0%"
                }}
              />
            </span>
          </span>
          <span className="status-item status-atk status-priority-medium" title="공격력">
            ATK: {hero ? atkDisplay : "-"}
          </span>
          <span className="status-item status-priority-low">CLASS: {statusClass}</span>
          <span className="status-item status-priority-low">NATION: {statusNation}</span>
          <span className="status-item status-priority-low">ELEMENT: {String(statusElement).toUpperCase()}</span>
          <span className="status-item status-priority-low">GEM: {inventory.gem ?? 0}</span>
          <span className={`${rarityClass} status-priority-low`}>{hero ? hero.rarity.toUpperCase() : "N/A"}</span>
        </div>
        <div className="terminal-mount" ref={mountRef} />
        <form ref={commandWrapRef} onSubmit={onSubmit} className="command-input">
          <span>&gt;</span>
          <input
            ref={commandInputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="command..."
          />
          <button
            type="button"
            className={`hint-tab ${hintOpen ? "open" : ""}`}
            role="note"
            aria-label="hint"
            onClick={() => setHintOpen((prev) => !prev)}
          >
            HINT
            <div className="hint-popover">
              {hintLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </button>
        </form>
        <div ref={quickActionsRef} className="quick-actions">
          <div className="action-group">
            <span className="action-group-title">CHOICE</span>
            {["1", "2", "3", "4"].map((cmd) => (
              <button
                key={cmd}
                type="button"
                disabled={choiceMode === "free" || (cmd === "4" && choiceMode !== "element")}
                onClick={() => void runQuickCommand(cmd)}
              >
                {cmd}
              </button>
            ))}
          </div>
          <div className="action-group">
            <span className="action-group-title">ACTION</span>
            {["story", "battle", "adventure"].map((cmd) => (
              <button
                key={cmd}
                type="button"
                disabled={choiceMode !== "free" || !trpgSession}
                onClick={() => void runQuickCommand(cmd)}
              >
                {cmd}
              </button>
            ))}
          </div>
          <div className="action-group">
            <span className="action-group-title">ITEM/META</span>
            <button type="button" disabled={choiceMode !== "free"} onClick={() => void runQuickCommand("book shop")}>
              book shop
            </button>
            <button type="button" disabled={choiceMode !== "free"} onClick={() => void runQuickCommand("book buy random")}>
              book buy
            </button>
            <button type="button" disabled={!canRegress} onClick={() => void runQuickCommand("regress")}>
              regress
            </button>
          </div>
          <div className="action-group">
            <span className="action-group-title">MENU</span>
            <button type="button" onClick={() => void runQuickCommand("/start")}>
              /start
            </button>
            <button type="button" onClick={() => void runQuickCommand("profile")}>
              profile
            </button>
            <button type="button" onClick={() => void runQuickCommand("inventory")}>
              inventory
            </button>
            <button type="button" onClick={() => void runQuickCommand("save")}>
              save
            </button>
            <button type="button" onClick={() => void runQuickCommand("load")}>
              load
            </button>
            <button
              type="button"
              onClick={() => {
                setEditorEnabled((prev) => {
                  return !prev;
                });
              }}
            >
              {editorEnabled ? "editor off" : "editor on"}
            </button>
          </div>
        </div>
        {tutorialActive && (
          <div className="tutorial-banner">
            TUTORIAL STEP {tutorialStep}: 명령을 입력하거나 버튼으로 진행하세요.
          </div>
        )}
      </section>
      {showEditorPanel && <AdminEditorShell bundle={bundle} onUpdateBundle={setBundle} />}
      {showEditorPlaceholder && (
        <section className="admin-shell editor-bundle-placeholder" aria-live="polite">
          <h3 className="admin-shell-title">시트 에디터</h3>
          <p>
            번들이 아직 없습니다. 터미널에서 <code>reload-bundle</code> 또는 <code>diag</code>로 로드 상태를 확인한 뒤
            다시 열어 주세요.
          </p>
          <p className="editor-bundle-placeholder-hint">하단의 editor off 버튼으로 닫을 수 있습니다.</p>
        </section>
      )}
    </div>
    </div>
  );
};

