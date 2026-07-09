import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import * as Ko from 'blockly/msg/ko';
import { definePicoBlocks, toolbox } from './blocks';
import { createEditor } from './editor';
import { createTerminal } from './terminal';
import { PicoSerial } from './serial';
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
  grid: { spacing: 24, length: 3, colour: '#2c313a', snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.9 },
  trashcan: true,
  theme: Blockly.Theme.defineTheme('picoDark', {
    name: 'picoDark',
    base: Blockly.Themes.Zelos,
    componentStyles: {
      workspaceBackgroundColour: '#1e222a',
      toolboxBackgroundColour: '#16181d',
      toolboxForegroundColour: '#d8dee9',
      flyoutBackgroundColour: '#22262e',
      flyoutForegroundColour: '#d8dee9',
      flyoutOpacity: 0.95,
      scrollbarColour: '#4c566a',
      insertionMarkerColour: '#88c0d0',
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
const statusEl = $('status');

serial.onStateChange = (connected) => {
  btnConnect.textContent = connected ? '🔌 연결 해제' : '🔌 보드 연결';
  btnRun.disabled = !connected;
  btnStop.disabled = !connected;
  btnSave.disabled = !connected;
  statusEl.textContent = connected ? '● 연결됨' : '● 연결 안 됨';
  statusEl.className = connected ? 'status-connected' : 'status-disconnected';
  if (!connected) term.writeln('\r\n\x1b[90m보드 연결이 해제되었습니다.\x1b[0m');
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
    } else {
      await serial.connect();
      term.writeln('\x1b[36m보드에 연결되었습니다. Enter를 누르면 >>> 프롬프트가 나타납니다.\x1b[0m');
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes('No port selected')) {
      term.writeln(`\x1b[31m연결 실패: ${msg}\x1b[0m`);
    }
  }
});

btnRun.addEventListener('click', async () => {
  const code = mode === 'block' ? generateBlockCode() : editor.getCode();
  if (!code.trim()) {
    term.writeln('\x1b[33m실행할 코드가 없습니다.\x1b[0m');
    return;
  }
  term.writeln('\r\n\x1b[36m─── 실행 시작 ───\x1b[0m');
  btnRun.disabled = true;
  try {
    const { error } = await serial.run(
      code,
      (s) => term.write(s),
      (s) => term.write(`\x1b[31m${s}\x1b[0m`),
    );
    term.writeln(
      error.trim()
        ? '\x1b[31m─── 오류로 종료됨 ───\x1b[0m'
        : '\x1b[36m─── 실행 완료 ───\x1b[0m',
    );
  } catch (e) {
    term.writeln(`\x1b[31m실행 실패: ${(e as Error).message}\x1b[0m`);
  } finally {
    btnRun.disabled = !serial.connected;
  }
});

btnStop.addEventListener('click', () => {
  serial.interrupt().catch(() => {});
});

btnSave.addEventListener('click', async () => {
  const code = mode === 'block' ? generateBlockCode() : editor.getCode();
  if (!code.trim()) {
    term.writeln('\x1b[33m저장할 코드가 없습니다.\x1b[0m');
    return;
  }
  if (
    !confirm(
      '현재 코드를 보드의 main.py로 저장할까요?\n저장하면 보드 전원을 켤 때마다 자동으로 실행됩니다.',
    )
  ) {
    return;
  }
  btnSave.disabled = true;
  try {
    await serial.saveFile('main.py', code);
    term.writeln('\r\n\x1b[32mmain.py 저장 완료! 보드를 다시 켜면 자동 실행됩니다.\x1b[0m');
  } catch (e) {
    term.writeln(`\r\n\x1b[31m${(e as Error).message}\x1b[0m`);
  } finally {
    btnSave.disabled = !serial.connected;
  }
});

// ---------- 모드 전환 ----------
let mode: Mode = (localStorage.getItem(STORAGE.mode) as Mode) || 'block';

const blockPane = $('block-pane');
const textPane = $('text-pane');
const modeBlockBtn = $<HTMLButtonElement>('mode-block');
const modeTextBtn = $<HTMLButtonElement>('mode-text');
const previewEl = $('preview-code');

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

modeTextBtn.addEventListener('click', () => {
  if (mode === 'text') return;
  const generated = generateBlockCode();
  // 블록에서 만든 코드를 텍스트 편집기로 가져갈지 선택 (블록→텍스트는 단방향)
  if (generated.trim() && generated !== editor.getCode()) {
    if (
      confirm(
        '블록에서 생성된 코드를 텍스트 편집기로 복사할까요?\n' +
          '[확인] 텍스트 편집기의 기존 코드를 블록 코드로 대체\n' +
          '[취소] 기존 텍스트 코드를 그대로 유지',
      )
    ) {
      editor.setCode(generated);
    }
  }
  applyMode('text');
});

// ---------- 코드 미리보기 / 자동 저장 ----------
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function updatePreview(): void {
  previewEl.textContent = generateBlockCode() || '# 블록을 조립하면 파이썬 코드가 여기에 표시됩니다';
}

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

applyMode(mode);
updatePreview();

// E2E 테스트/콘솔 디버깅용 훅
(window as unknown as Record<string, unknown>).__pico = { workspace, generateBlockCode };
