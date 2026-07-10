import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import * as Ko from 'blockly/msg/ko';
import { definePicoBlocks, toolbox } from './blocks';
import { picoTheme, registerEntryRenderer } from './theme';
import { createEditor } from './editor';
import { createTerminal } from './terminal';
import { PicoSerial, AbortError } from './serial';
import { samples, openSampleInNewTab } from './samples';
import { highlightPython, TOKEN_CSS } from './highlight';
import { toast, confirmDialog, promptDialog, pushEscapeHandler, isModalOpen } from './ui';
import './style.css';

// 코드 미리보기/샘플 뷰어가 공유하는 토큰 색상을 문서에 한 번 주입한다.
const tokenStyle = document.createElement('style');
tokenStyle.textContent = TOKEN_CSS;
document.head.appendChild(tokenStyle);

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

/** localStorage 쓰기 — 용량 초과/비활성(프라이빗 모드 등)에서도 예외를 삼킨다. */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장 공간 부족·정책 차단 등은 무시 */
  }
}

// ---------- Blockly ----------
Blockly.setLocale(Ko as unknown as { [key: string]: string });
definePicoBlocks();
// 무한 루프 감지 트랩 비활성화 (MicroPython에는 해당 런타임이 없음)
pythonGenerator.INFINITE_LOOP_TRAP = null;

// Blockly 기본 브라우저 prompt/alert/confirm(변수 만들기·이름 바꾸기 등)을
// 앱 디자인에 맞춘 커스텀 모달/토스트로 대체한다.
Blockly.dialog.setPrompt((message, defaultValue, callback) => {
  // '새 변수 이름:'(placeholder 없는 메시지)이면 만들기, 아니면 이름 바꾸기로 본다.
  const creating = message === Blockly.Msg['NEW_VARIABLE_TITLE'];
  void promptDialog({
    title: creating ? '변수 만들기' : '변수 이름 바꾸기',
    label: message,
    defaultValue,
    placeholder: creating ? '예: count, speed, sensor_value' : undefined,
    confirmText: creating ? '만들기' : '바꾸기',
  }).then(callback);
});
Blockly.dialog.setAlert((message, callback) => {
  toast(message, 'error');
  callback?.();
});
Blockly.dialog.setConfirm((message, callback) => {
  void confirmDialog({ title: '확인', body: message }).then(callback);
});

const workspace = Blockly.inject('blockly-div', {
  toolbox,
  renderer: registerEntryRenderer(),
  // 외부 CDN 대신 로컬 미디어 사용 (오프라인 환경 지원)
  media: 'blockly-media/',
  grid: { spacing: 24, length: 3, colour: '#2a2a2a', snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.9 },
  trashcan: true,
  theme: picoTheme,
});

function generateBlockCode(): string {
  return pythonGenerator.workspaceToCode(workspace);
}

/** 현재 모드에서 실행/저장 대상이 되는 소스 코드 */
function getActiveCode(): string {
  return mode === 'block' ? generateBlockCode() : editor.getCode();
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
  (code) => safeSetItem(STORAGE.code, code),
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
const statusbar = $('statusbar');
const statusEl = $('status');
const statusConnectLabel = $('status-connect-label');

/** 연결/실행 상태를 상태바 한 곳에서 표현 (state와 텍스트의 유일한 원천) */
function renderStatus(running: boolean): void {
  const connected = serial.connected;
  statusbar.dataset.state = running ? 'run' : connected ? 'on' : 'off';
  statusEl.textContent = running ? '실행 중' : connected ? '연결됨' : '연결 안 됨';
}

function setRunning(running: boolean): void {
  const connected = serial.connected;
  // 실행 중에는 실행/저장/재시작을 잠그고 정지만 열어 둔다.
  btnRun.disabled = running || !connected;
  btnSave.disabled = running || !connected;
  btnSoftReset.disabled = running || !connected;
  btnStop.disabled = !connected;
  // SVG 요소는 hidden 속성이 동작하지 않으므로 display로 제어
  btnRun.querySelector<HTMLElement>('.ic')!.style.display = running ? 'none' : '';
  btnRun.querySelector<HTMLElement>('.spinner')!.hidden = !running;
  renderStatus(running);
}

serial.onStateChange = (connected) => {
  btnConnect.title = connected ? '보드 연결 해제' : '보드 연결';
  btnConnect.classList.toggle('connected', connected);
  statusConnectLabel.textContent = connected ? '연결 해제' : '보드 연결';
  // 버튼 활성/상태 표시는 setRunning이 단일하게 관리한다(연결 직후는 실행 중 아님).
  setRunning(false);
  if (!connected) term.writeln('\r\n\x1b[90m보드 연결이 해제되었습니다.\x1b[0m');
};

if (!PicoSerial.supported) {
  $('unsupported-banner').hidden = false;
  btnConnect.disabled = true;
}

// 터미널 키 입력 → 보드
// - friendly REPL(비실행) 패스스루, 그리고 프로그램 실행 중(executing)에는 stdin으로 전달해
//   input() 이 동작하게 한다. raw REPL 진입/코드 전송 중에는 스트림 오염을 막기 위해 차단.
term.onData((data) => {
  if (serial.connected && (!serial.busy || serial.acceptsStdin)) {
    serial.write(data).catch(() => {});
  }
});

async function toggleConnect(): Promise<void> {
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
}

btnConnect.addEventListener('click', toggleConnect);
$('status-connect').addEventListener('click', toggleConnect);

async function runCode(): Promise<void> {
  if (!serial.connected || serial.busy || isModalOpen()) return;
  const code = getActiveCode();
  if (!code.trim()) {
    toast('실행할 코드가 없습니다.', 'error');
    return;
  }
  term.writeln('\r\n\x1b[36m─── 실행 시작 ───\x1b[0m');
  setRunning(true);
  try {
    const { error, interrupted } = await serial.run(
      code,
      (s) => term.write(s),
      (s) => term.write(`\x1b[31m${s}\x1b[0m`),
    );
    if (interrupted) {
      term.writeln('\x1b[33m─── 정지됨 ───\x1b[0m');
    } else if (error.trim()) {
      term.writeln('\x1b[31m─── 오류로 종료됨 ───\x1b[0m');
      toast('실행 중 오류가 발생했습니다. 터미널을 확인하세요.', 'error');
    } else {
      term.writeln('\x1b[36m─── 실행 완료 ───\x1b[0m');
    }
  } catch (e) {
    if (e instanceof AbortError) {
      term.writeln('\x1b[33m─── 정지됨 ───\x1b[0m');
    } else {
      const msg = (e as Error).message;
      term.writeln(`\x1b[31m실행 실패: ${msg}\x1b[0m`);
      toast(`실행 실패: ${msg}`, 'error');
    }
  } finally {
    setRunning(false);
  }
}

btnRun.addEventListener('click', runCode);

// Ctrl+Enter(⌘+Enter)로 실행 (모달이 열려 있으면 무시)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!isModalOpen()) void runCode();
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
    // 실행 중인 main.py가 있으면 먼저 Ctrl-C로 멈춘 뒤 Ctrl-D로 소프트 리셋한다.
    await serial.write('\r\x03');
    await new Promise((r) => setTimeout(r, 120));
    await serial.write('\x04');
    toast('보드를 소프트 리셋했습니다.');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
});

$('btn-term-clear').addEventListener('click', () => term.clear());

btnSave.addEventListener('click', async () => {
  const code = getActiveCode();
  if (!code.trim()) {
    toast('저장할 코드가 없습니다.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'main.py로 저장',
    body: '현재 코드를 보드의 main.py로 저장할까요?\n저장하면 보드 전원을 켤 때마다 자동으로 실행됩니다.',
    confirmText: '저장',
  });
  if (!ok || !serial.connected) return;
  btnSave.disabled = true;
  try {
    await serial.saveFile('main.py', code);
    toast('main.py 저장 완료! 보드를 다시 켜면 자동 실행됩니다.', 'success');
    term.writeln('\r\n\x1b[32mmain.py 저장 완료.\x1b[0m');
  } catch (e) {
    if (e instanceof AbortError) {
      toast('저장이 중단되었습니다.');
    } else {
      toast((e as Error).message, 'error');
      term.writeln(`\r\n\x1b[31m${(e as Error).message}\x1b[0m`);
    }
  } finally {
    btnSave.disabled = serial.busy || !serial.connected;
  }
});

// ---------- 시작 가이드 모달 ----------
const helpModal = $('help-modal');
let helpHideTimer: ReturnType<typeof setTimeout> | undefined;
let popHelpEscape: (() => void) | undefined;

function openHelp(): void {
  clearTimeout(helpHideTimer);
  helpModal.hidden = false;
  requestAnimationFrame(() => helpModal.classList.add('show'));
  popHelpEscape = pushEscapeHandler(closeHelp);
}
function closeHelp(): void {
  popHelpEscape?.();
  popHelpEscape = undefined;
  helpModal.classList.remove('show');
  helpHideTimer = setTimeout(() => (helpModal.hidden = true), 180);
}
$('btn-help').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeHelp();
});

// ---------- 모드 전환 (액티비티 바) ----------
// 저장된 값은 신뢰하지 않는다 — 'block'/'text' 외의 값은 기본 'block'으로.
let mode: Mode = localStorage.getItem(STORAGE.mode) === 'text' ? 'text' : 'block';

const blockPane = $('block-pane');
const textPane = $('text-pane');
const modeBlockBtn = $<HTMLButtonElement>('mode-block');
const modeTextBtn = $<HTMLButtonElement>('mode-text');
const previewEl = $('preview-code');
const blockHint = $('block-hint');
const tabLabel = $('tab-label');
const tabIconBlock = $('tab-icon-block');
const tabIconText = $('tab-icon-text');
const statusMode = $('status-mode');

function applyMode(next: Mode): void {
  mode = next;
  safeSetItem(STORAGE.mode, next);
  blockPane.hidden = next !== 'block';
  textPane.hidden = next !== 'text';
  modeBlockBtn.classList.toggle('active', next === 'block');
  modeTextBtn.classList.toggle('active', next === 'text');
  tabLabel.textContent = next === 'block' ? '블록 코딩' : 'main.py';
  // SVG 요소는 hidden 속성이 동작하지 않으므로 display로 제어
  tabIconBlock.style.display = next === 'block' ? '' : 'none';
  tabIconText.style.display = next === 'text' ? '' : 'none';
  statusMode.textContent = next === 'block' ? '블록 코딩' : '텍스트 코딩';
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
  // innerHTML이지만 highlightPython이 모든 텍스트를 이스케이프하므로 안전하다.
  // 복사 버튼은 previewEl.textContent(원본 코드)를 그대로 읽어 영향이 없다.
  previewEl.innerHTML = highlightPython(
    code || '# 블록을 조립하면\n# 파이썬 코드가 여기에 표시됩니다',
  );
  blockHint.hidden = workspace.getAllBlocks(false).length > 0;
}

$('btn-copy-preview').addEventListener('click', async () => {
  // 미리보기에 이미 표시된 코드를 재사용(빈 미리보기 문구는 제외)
  const code = workspace.getAllBlocks(false).length ? previewEl.textContent ?? '' : '';
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
    safeSetItem(
      STORAGE.blocks,
      JSON.stringify(Blockly.serialization.workspaces.save(workspace)),
    );
  }, 250);
});

// ---------- 터미널 크기 조절 스플리터 ----------
const splitter = $('splitter');
const terminalPane = $('terminal-pane');

splitter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add('dragging');

  let latestH = terminalPane.offsetHeight;
  let raf = 0;
  const apply = () => {
    raf = 0;
    terminalPane.style.height = `${latestH}px`;
    fit.fit();
    if (mode === 'block') Blockly.svgResize(workspace);
  };
  const onMove = (ev: PointerEvent) => {
    latestH = Math.min(
      Math.max(window.innerHeight - ev.clientY, 110),
      Math.round(window.innerHeight * 0.7),
    );
    // pointermove는 초당 수십~수백 번 발생하므로 프레임당 한 번만 레이아웃 갱신
    if (!raf) raf = requestAnimationFrame(apply);
  };
  // pointerup 뿐 아니라 pointercancel/lostpointercapture 도 처리해야
  // 브라우저가 제스처를 가로챈(터치 스크롤 등) 경우에도 리스너가 남지 않는다.
  const onUp = () => {
    if (raf) cancelAnimationFrame(raf);
    splitter.classList.remove('dragging');
    splitter.removeEventListener('pointermove', onMove);
    splitter.removeEventListener('pointerup', onUp);
    splitter.removeEventListener('pointercancel', onUp);
    splitter.removeEventListener('lostpointercapture', onUp);
  };
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
  splitter.addEventListener('pointercancel', onUp);
  splitter.addEventListener('lostpointercapture', onUp);
});

// ---------- 샘플 툴바 ----------
// 각 예제를 버튼으로 만들고, 클릭하면 읽기 전용 코드를 브라우저 새 탭에서 연다.
const sampleButtons = $('sample-buttons');
for (const sample of samples) {
  const btn = document.createElement('button');
  btn.className = 'sample-btn';
  btn.title = sample.description;
  btn.innerHTML = `<span class="sample-btn-icon">${sample.icon}</span>${sample.title}`;
  btn.addEventListener('click', () => {
    if (!openSampleInNewTab(sample)) {
      toast('팝업이 차단되어 예제를 열 수 없습니다. 팝업을 허용해 주세요.', 'error');
    }
  });
  sampleButtons.appendChild(btn);
}

applyMode(mode);

// E2E 테스트/콘솔 디버깅용 훅
(window as unknown as Record<string, unknown>).__pico = { workspace, generateBlockCode };
