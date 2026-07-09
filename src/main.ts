import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import * as Ko from 'blockly/msg/ko';
import { definePicoBlocks, toolbox } from './blocks';
import { createEditor } from './editor';
import { createTerminal } from './terminal';
import { PicoSerial } from './serial';
import { toast, confirmDialog } from './ui';
import './style.css';

type Mode = 'block' | 'text';

const STORAGE = {
  mode: 'pico-ide.mode',
  blocks: 'pico-ide.blocks',
  code: 'pico-ide.code',
};

const DEFAULT_CODE = `# 라즈베리파이 피코 예제: 내장 LED 깜빡이기
from machine import Pin
import time

led = Pin("LED", Pin.OUT)

for i in range(10):
    led.toggle()
    print("깜빡!", i + 1)
    time.sleep(0.5)

led.off()
print("끝!")
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------- Blockly ----------
Blockly.setLocale(Ko as unknown as { [key: string]: string });
definePicoBlocks();
// 무한 루프 감지 트랩 비활성화 (MicroPython에는 해당 런타임이 없음)
pythonGenerator.INFINITE_LOOP_TRAP = null;

const workspace = Blockly.inject('blockly-div', {
  toolbox,
  renderer: 'zelos',
  // 외부 CDN 대신 로컬 미디어 사용 (오프라인 환경 지원)
  media: 'blockly-media/',
  grid: { spacing: 24, length: 3, colour: '#232935', snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.9 },
  trashcan: true,
  theme: Blockly.Theme.defineTheme('picoDark', {
    name: 'picoDark',
    base: Blockly.Themes.Zelos,
    componentStyles: {
      workspaceBackgroundColour: '#161a21',
      toolboxBackgroundColour: '#101318',
      toolboxForegroundColour: '#a9b3c4',
      flyoutBackgroundColour: '#1d222c',
      flyoutForegroundColour: '#a9b3c4',
      flyoutOpacity: 0.97,
      scrollbarColour: '#3a4252',
      insertionMarkerColour: '#62a0e8',
    },
  }),
});

function generateBlockCode(): string {
  return pythonGenerator.workspaceToCode(workspace);
}

// 저장된 블록 복원
try {
  const saved = localStorage.getItem(STORAGE.blocks);
  if (saved) Blockly.serialization.workspaces.load(JSON.parse(saved), workspace);
} catch {
  /* 손상된 저장 데이터는 무시 */
}

// ---------- 에디터 / 터미널 ----------
const editor = createEditor(
  $('editor-div'),
  localStorage.getItem(STORAGE.code) ?? DEFAULT_CODE,
  (code) => localStorage.setItem(STORAGE.code, code),
);
const { term, fit } = createTerminal($('terminal-div'));

// ---------- 시리얼 ----------
const serial = new PicoSerial();
serial.onData = (text) => term.write(text);

const btnConnect = $<HTMLButtonElement>('btn-connect');
const btnRun = $<HTMLButtonElement>('btn-run');
const btnStop = $<HTMLButtonElement>('btn-stop');
const btnSave = $<HTMLButtonElement>('btn-save');
const btnSoftReset = $<HTMLButtonElement>('btn-soft-reset');
const statusEl = $('status');

function setRunning(running: boolean): void {
  btnRun.classList.toggle('running', running);
  btnRun.disabled = running || !serial.connected;
  btnRun.querySelector<HTMLElement>('.ic')!.hidden = running;
  btnRun.querySelector<HTMLElement>('.spinner')!.hidden = !running;
  btnRun.querySelector<HTMLElement>('.btn-label')!.textContent = running ? '실행 중' : '실행';
}

serial.onStateChange = (connected) => {
  btnConnect.querySelector<HTMLElement>('.btn-label')!.textContent = connected
    ? '연결 해제'
    : '보드 연결';
  btnConnect.classList.toggle('btn-primary', !connected);
  btnRun.disabled = !connected;
  btnStop.disabled = !connected;
  btnSave.disabled = !connected;
  btnSoftReset.disabled = !connected;
  statusEl.textContent = connected ? '연결됨' : '연결 안 됨';
  statusEl.dataset.state = connected ? 'on' : 'off';
  if (!connected) {
    setRunning(false);
    term.writeln('\r\n\x1b[90m보드 연결이 해제되었습니다.\x1b[0m');
  }
};

if (!PicoSerial.supported) {
  $('unsupported-banner').hidden = false;
  btnConnect.disabled = true;
}

// 터미널 키 입력 → 보드 (실행 중이 아닐 때만: friendly REPL 패스스루)
term.onData((data) => {
  if (serial.connected && !serial.busy) serial.write(data).catch(() => {});
});

btnConnect.addEventListener('click', async () => {
  try {
    if (serial.connected) {
      await serial.disconnect();
      toast('보드 연결이 해제되었습니다.');
    } else {
      await serial.connect();
      toast('보드에 연결되었습니다.', 'success');
      term.writeln('\x1b[36m보드에 연결되었습니다. Enter를 누르면 >>> 프롬프트가 나타납니다.\x1b[0m');
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes('No port selected')) {
      toast(`연결 실패: ${msg}`, 'error');
      term.writeln(`\x1b[31m연결 실패: ${msg}\x1b[0m`);
    }
  }
});

async function runCode(): Promise<void> {
  if (!serial.connected || serial.busy) return;
  const code = mode === 'block' ? generateBlockCode() : editor.getCode();
  if (!code.trim()) {
    toast('실행할 코드가 없습니다.', 'error');
    return;
  }
  term.writeln('\r\n\x1b[36m─── 실행 시작 ───\x1b[0m');
  setRunning(true);
  try {
    const { error } = await serial.run(
      code,
      (s) => term.write(s),
      (s) => term.write(`\x1b[31m${s}\x1b[0m`),
    );
    if (error.trim()) {
      term.writeln('\x1b[31m─── 오류로 종료됨 ───\x1b[0m');
      toast('실행 중 오류가 발생했습니다. 터미널을 확인하세요.', 'error');
    } else {
      term.writeln('\x1b[36m─── 실행 완료 ───\x1b[0m');
    }
  } catch (e) {
    const msg = (e as Error).message;
    term.writeln(`\x1b[31m실행 실패: ${msg}\x1b[0m`);
    toast(`실행 실패: ${msg}`, 'error');
  } finally {
    setRunning(false);
  }
}

btnRun.addEventListener('click', runCode);

// Ctrl+Enter(⌘+Enter)로 실행
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    void runCode();
  }
});

btnStop.addEventListener('click', () => {
  serial.interrupt().catch(() => {});
});

btnSoftReset.addEventListener('click', async () => {
  if (serial.busy) {
    toast('실행 중에는 재시작할 수 없습니다. 먼저 정지하세요.', 'error');
    return;
  }
  try {
    await serial.write('\r\x04'); // friendly REPL에서 Ctrl-D = 소프트 리셋
    toast('보드를 소프트 리셋했습니다.');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
});

$('btn-term-clear').addEventListener('click', () => term.clear());

btnSave.addEventListener('click', async () => {
  const code = mode === 'block' ? generateBlockCode() : editor.getCode();
  if (!code.trim()) {
    toast('저장할 코드가 없습니다.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'main.py로 저장',
    body: '현재 코드를 보드의 main.py로 저장할까요?\n저장하면 보드 전원을 켤 때마다 자동으로 실행됩니다.',
    confirmText: '저장',
  });
  if (!ok) return;
  btnSave.disabled = true;
  try {
    await serial.saveFile('main.py', code);
    toast('main.py 저장 완료! 보드를 다시 켜면 자동 실행됩니다.', 'success');
    term.writeln('\r\n\x1b[32mmain.py 저장 완료.\x1b[0m');
  } catch (e) {
    toast((e as Error).message, 'error');
    term.writeln(`\r\n\x1b[31m${(e as Error).message}\x1b[0m`);
  } finally {
    btnSave.disabled = !serial.connected;
  }
});

// ---------- 시작 가이드 모달 ----------
const helpModal = $('help-modal');
$('btn-help').addEventListener('click', () => {
  helpModal.hidden = false;
  requestAnimationFrame(() => helpModal.classList.add('show'));
});
const closeHelp = () => {
  helpModal.classList.remove('show');
  setTimeout(() => (helpModal.hidden = true), 180);
};
$('help-close').addEventListener('click', closeHelp);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeHelp();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpModal.hidden) closeHelp();
});

// ---------- 모드 전환 ----------
let mode: Mode = (localStorage.getItem(STORAGE.mode) as Mode) || 'block';

const blockPane = $('block-pane');
const textPane = $('text-pane');
const modeBlockBtn = $<HTMLButtonElement>('mode-block');
const modeTextBtn = $<HTMLButtonElement>('mode-text');
const previewEl = $('preview-code');
const blockHint = $('block-hint');

function applyMode(next: Mode): void {
  mode = next;
  localStorage.setItem(STORAGE.mode, next);
  blockPane.hidden = next !== 'block';
  textPane.hidden = next !== 'text';
  modeBlockBtn.classList.toggle('active', next === 'block');
  modeTextBtn.classList.toggle('active', next === 'text');
  if (next === 'block') {
    Blockly.svgResize(workspace);
    updatePreview();
  }
  fit.fit();
}

modeBlockBtn.addEventListener('click', () => {
  if (mode !== 'block') applyMode('block');
});

modeTextBtn.addEventListener('click', async () => {
  if (mode === 'text') return;
  const generated = generateBlockCode();
  // 블록에서 만든 코드를 텍스트 편집기로 가져갈지 선택 (블록→텍스트는 단방향)
  if (generated.trim() && generated !== editor.getCode()) {
    const copy = await confirmDialog({
      title: '텍스트 코딩으로 전환',
      body: '블록에서 생성된 파이썬 코드를 텍스트 편집기로 가져올까요?\n가져오면 텍스트 편집기의 기존 코드가 대체됩니다.',
      confirmText: '코드 가져오기',
      cancelText: '기존 코드 유지',
    });
    if (copy) editor.setCode(generated);
  }
  applyMode('text');
});

// ---------- 코드 미리보기 / 자동 저장 ----------
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function updatePreview(): void {
  const code = generateBlockCode();
  previewEl.textContent = code || '# 블록을 조립하면\n# 파이썬 코드가 여기에 표시됩니다';
  blockHint.hidden = workspace.getAllBlocks(false).length > 0;
}

$('btn-copy-preview').addEventListener('click', async () => {
  const code = generateBlockCode();
  if (!code.trim()) {
    toast('복사할 코드가 없습니다.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    toast('코드를 클립보드에 복사했습니다.', 'success');
  } catch {
    toast('클립보드 복사에 실패했습니다.', 'error');
  }
});

workspace.addChangeListener((event) => {
  if (event.isUiEvent) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    updatePreview();
    try {
      localStorage.setItem(
        STORAGE.blocks,
        JSON.stringify(Blockly.serialization.workspaces.save(workspace)),
      );
    } catch {
      /* 저장 공간 부족 등은 무시 */
    }
  }, 250);
});

// ---------- 터미널 크기 조절 스플리터 ----------
const splitter = $('splitter');
const terminalPane = $('terminal-pane');

splitter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add('dragging');

  const onMove = (ev: PointerEvent) => {
    const h = Math.min(
      Math.max(window.innerHeight - ev.clientY, 110),
      Math.round(window.innerHeight * 0.7),
    );
    terminalPane.style.height = `${h}px`;
    fit.fit();
    if (mode === 'block') Blockly.svgResize(workspace);
  };
  const onUp = () => {
    splitter.classList.remove('dragging');
    splitter.removeEventListener('pointermove', onMove);
    splitter.removeEventListener('pointerup', onUp);
  };
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
});

applyMode(mode);
updatePreview();

// E2E 테스트/콘솔 디버깅용 훅
(window as unknown as Record<string, unknown>).__pico = { workspace, generateBlockCode };
