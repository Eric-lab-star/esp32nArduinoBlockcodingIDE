/**
 * 상단 샘플 툴바에서 여는 예제 코드 모음.
 *
 * 코드는 이 IDE의 블록이 생성하는 MicroPython 관용구(machine 모듈, 내장 LED,
 * PWM 서보, SoftI2C LCD 등)에 맞춰 작성되어, 사용자가 그대로 붙여넣어 실행하며
 * 블록/텍스트 모드에 익숙해질 수 있게 한다.
 */

import { highlightPython, TOKEN_CSS } from './highlight';

export interface Sample {
  id: string;
  /** 툴바 버튼과 새 탭 제목에 쓰이는 이름 */
  title: string;
  /** 버튼 앞에 붙는 이모지 아이콘 */
  icon: string;
  /** 새 탭 상단에 표시되는 한 줄 설명 */
  description: string;
  code: string;
}

// 블록이 생성하는 LCD 드라이버와 동일한 클래스(별도 라이브러리 설치 없이 동작).
const LCD_DRIVER = `class I2cLcd:
    def __init__(self, i2c, addr=0x27, cols=16, rows=2):
        self.i2c = i2c
        self.addr = addr
        self.cols = cols
        self.rows = rows
        self.bl = 0x08
        for cmd in (0x33, 0x32, 0x28, 0x0C, 0x06, 0x01):
            self._cmd(cmd)
        time.sleep_ms(2)
    def _strobe(self, data):
        self.i2c.writeto(self.addr, bytes([data | 0x04]))
        time.sleep_us(500)
        self.i2c.writeto(self.addr, bytes([data & ~0x04]))
        time.sleep_us(100)
    def _send(self, value, mode):
        self._strobe(mode | (value & 0xF0) | self.bl)
        self._strobe(mode | ((value << 4) & 0xF0) | self.bl)
    def _cmd(self, value):
        self._send(value, 0)
    def clear(self):
        self._cmd(0x01)
        time.sleep_ms(2)
    def move_to(self, col, row):
        offsets = (0x00, 0x40, 0x14, 0x54)
        if row > 3:
            row = 3
        self._cmd(0x80 | (offsets[row] + col))
    def putstr(self, text):
        for ch in str(text):
            self._send(ord(ch), 0x01)
    def set_backlight(self, on):
        self.bl = 0x08 if on else 0x00
        self.i2c.writeto(self.addr, bytes([self.bl]))`;

export const samples: Sample[] = [
  {
    id: 'led-blink',
    title: 'LED 깜빡이기',
    icon: '💡',
    description: '피코 보드의 내장 LED를 0.5초 간격으로 계속 깜빡입니다. 가장 기본적인 예제입니다.',
    code: `# 내장 LED 깜빡이기
from machine import Pin
import time

led_onboard = Pin("LED", Pin.OUT)

while True:
    led_onboard.toggle()
    time.sleep(0.5)
`,
  },
  {
    id: 'button-led',
    title: '버튼으로 LED 켜기',
    icon: '🔘',
    description: 'GP14에 연결한 버튼을 누르면 GP15에 연결한 LED가 켜집니다. 디지털 입력과 조건 블록을 익힐 수 있습니다.',
    code: `# 버튼으로 LED 켜기 (버튼: GP14, LED: GP15)
from machine import Pin
import time

while True:
    if Pin(14, Pin.IN, Pin.PULL_DOWN).value() == 1:
        Pin(15, Pin.OUT).value(1)
    else:
        Pin(15, Pin.OUT).value(0)
    time.sleep(0.05)
`,
  },
  {
    id: 'servo-sweep',
    title: '서보모터 각도 제어',
    icon: '⚙️',
    description: 'GP16에 연결한 서보모터(SG90 등)를 0도에서 180도까지 왕복 회전시킵니다.',
    code: `# 서보모터 각도 제어 (서보: GP16)
from machine import Pin, PWM
import time

servo_16 = PWM(Pin(16), freq=50)

def set_angle(deg):
    # 표준 서보: 각도 0~180도 → 펄스 0.5~2.5ms
    servo_16.duty_ns(int(500000 + max(0, min(180, deg)) * 2000000 / 180))

while True:
    for angle in range(0, 181, 10):
        set_angle(angle)
        time.sleep(0.1)
    for angle in range(180, -1, -10):
        set_angle(angle)
        time.sleep(0.1)
`,
  },
  {
    id: 'lcd-hello',
    title: 'LCD에 글자 표시',
    icon: '📟',
    description: 'I2C 캐릭터 LCD(SDA=GP0, SCL=GP1, 주소 0x27)에 두 줄의 글자를 출력합니다.',
    code: `# I2C LCD에 글자 표시 (SDA: GP0, SCL: GP1)
from machine import Pin, SoftI2C
import time

${LCD_DRIVER}

lcd = I2cLcd(SoftI2C(sda=Pin(0), scl=Pin(1), freq=100000), 0x27, 16, 2)
lcd.clear()
lcd.putstr("Hello, Pico!")
lcd.move_to(0, 1)
lcd.putstr("Blockly IDE")
`,
  },
  {
    id: 'analog-read',
    title: '아날로그 값 읽기',
    icon: '🎚️',
    description: 'GP26(ADC0)에 연결한 가변저항 등의 아날로그 값을 0.5초마다 읽어 터미널에 출력합니다.',
    code: `# 아날로그 값 읽기 (센서: GP26 / ADC0)
from machine import Pin, ADC
import time

adc_26 = ADC(26)

while True:
    value = adc_26.read_u16()
    print("아날로그 값:", value)
    time.sleep(0.5)
`,
  },
];

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

/** 새 탭에 표시할 읽기 전용 예제 뷰어 HTML 문서를 만든다. */
function buildViewerHtml(sample: Sample): string {
  const title = escapeHtml(sample.title);
  const desc = escapeHtml(sample.description);
  // highlightPython은 이스케이프된 토큰 <span> HTML을 반환한다.
  const code = highlightPython(sample.code);
  // 코드는 data-* 대신 JSON으로 안전하게 전달해 복사 버튼에서 재사용한다.
  const codeJson = escapeHtml(JSON.stringify(sample.code));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>샘플 · ${title} — 피코 파이썬 IDE</title>
<style>
  :root {
    --bg: #1e1e1e; --panel: #252526; --border: #333; --text: #d4d4d4;
    --dim: #9d9d9d; --green: #6a9955; --blue: #3794ff; --accent: #0e639c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: var(--bg); color: var(--text);
    font-family: -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif;
    line-height: 1.6;
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
  h1 .icon { font-size: 24px; }
  .desc { color: var(--dim); font-size: 14px; margin: 0 0 18px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden;
  }
  .card-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-bottom: 1px solid var(--border);
    font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--dim);
  }
  button {
    border: none; background: var(--accent); color: #fff; font-size: 13px;
    padding: 6px 14px; border-radius: 5px; cursor: pointer;
  }
  button:hover { background: #1177bb; }
  pre {
    margin: 0; padding: 16px; overflow-x: auto; color: var(--text);
    font-family: 'Cascadia Code', 'D2Coding', Consolas, monospace;
    font-size: 13px; line-height: 1.55; white-space: pre;
  }
  ${TOKEN_CSS}
  .hint {
    margin: 18px 0 0; padding: 12px 14px; background: rgba(55, 148, 255, 0.08);
    border-left: 3px solid var(--blue); border-radius: 0 6px 6px 0;
    font-size: 13px; color: var(--dim);
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1><span class="icon">${escapeHtml(sample.icon)}</span>${title}</h1>
    <p class="desc">${desc}</p>
    <div class="card">
      <div class="card-head">
        <span>MicroPython 예제 코드</span>
        <button id="copy">코드 복사</button>
      </div>
      <pre id="code">${code}</pre>
    </div>
    <p class="hint">
      💡 <b>텍스트 코딩</b> 모드로 전환한 뒤 이 코드를 붙여넣고 <b>▶ 실행</b>(Ctrl+Enter)해 보세요.
      또는 왼쪽 블록 카테고리에서 같은 동작을 블록으로 조립해 볼 수 있습니다.
    </p>
  </div>
  <script>
    (function () {
      var code = JSON.parse("${codeJson}");
      var btn = document.getElementById('copy');
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(code).then(function () {
          btn.textContent = '복사됨!';
          setTimeout(function () { btn.textContent = '코드 복사'; }, 1500);
        }).catch(function () {
          btn.textContent = '복사 실패';
        });
      });
    })();
  </script>
</body>
</html>`;
}

/** 예제를 브라우저 새 탭에서 읽기 전용으로 연다. */
export function openSampleInNewTab(sample: Sample): boolean {
  const html = buildViewerHtml(sample);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // 팝업이 차단되면 URL을 해제하고 실패를 알린다.
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  // Blob URL은 탭이 로드된 뒤 정리한다(즉시 해제하면 로드 실패 위험).
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
