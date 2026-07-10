# 🐍 피코 파이썬 IDE

라즈베리파이 피코(RP2040/RP2350)를 **블록 코딩**과 **텍스트 코딩**으로 프로그래밍할 수 있는 웹 IDE입니다.
설치 없이 브라우저에서 바로 동작하며, Web Serial API로 보드와 직접 통신합니다.

## 주요 기능

- 🧩 **블록 코딩 모드** — Blockly 기반. 피코 하드웨어 블록(내장 LED, GPIO, PWM, 서보모터, ADC, 온도센서, 대기, 무한 반복), I2C LCD 블록, 논리/반복/수학/변수/함수 블록 제공. 조립하는 즉시 생성된 MicroPython 코드를 미리보기로 확인
- 🎛️ **폭넓은 MicroPython 블록** — 입력(버튼·핀 인터럽트), 시간(밀리초 대기·ticks_ms·주기 타이머), 소리(피에조 부저 주파수/음계 연주), 센서(HC-SR04 초음파, DHT11/22 온습도, DS18B20 온도), 네오픽셀(WS2812 RGB), 통신(UART 시리얼·I2C 스캔), 시스템(리셋·CPU 주파수·고유 ID), 값 변환(map·constrain)까지 카테고리별로 제공. 필요한 드라이버 import와 헬퍼 함수는 코드 생성 시 자동 포함
- 🔩 **서보모터 제어** — 각도(0~180도) 블록으로 표준 서보(SG90 등)를 제어합니다. 50Hz PWM·펄스폭 매핑과 각도 범위 클램프를 자동 처리
- 🔡 **I2C 캐릭터 LCD 지원** — LCD 블록(연결/출력/커서 이동/지우기/백라이트)을 쓰면 PCF8574 백팩용 드라이버가 생성 코드에 자동 포함됩니다. 보드에 별도 라이브러리를 설치하지 않아도 되고, 저장한 main.py가 그대로 자동 실행됩니다
- ⌨️ **텍스트 코딩 모드** — CodeMirror 기반 파이썬 에디터 (문법 강조, 자동 들여쓰기)
- 🔀 **모드 전환** — 상단 탭으로 전환. 블록 → 텍스트 전환 시 생성된 코드를 에디터로 가져올 수 있음 (블록→코드 단방향)
- ▶ **실행/정지** — MicroPython raw REPL 프로토콜로 코드를 보드에 전송해 즉시 실행, 출력은 터미널에 실시간 표시. 정지 버튼(KeyboardInterrupt)으로 무한 루프도 중단 가능
- 💾 **main.py 저장** — 보드 파일시스템에 저장하면 전원을 켤 때 자동 실행
- 🖥️ **REPL 터미널** — xterm.js 기반. 실행 중이 아닐 때는 터미널에 직접 입력해 대화형 REPL(`>>>`) 사용 가능
- 📴 **완전 오프라인 동작** — 외부 CDN 의존 없음. 작업 내용은 localStorage에 자동 저장

## 사용 방법

1. **펌웨어 설치 (보드당 1회)** — 피코의 BOOTSEL 버튼을 누른 채 USB를 연결하면 `RPI-RP2` 드라이브가 나타납니다. [MicroPython UF2 파일](https://micropython.org/download/RPI_PICO/)을 드라이브에 복사하면 자동으로 재부팅됩니다. (피코 W/2/2 W는 각 보드용 UF2 사용)
2. **Chrome 또는 Edge**(데스크톱)에서 IDE를 엽니다. Safari/Firefox는 Web Serial 미지원.
3. `🔌 보드 연결` → 포트 선택 → 블록 조립 또는 코드 작성 → `▶ 실행`

### I2C LCD 연결

일반적인 16x2 / 20x4 캐릭터 LCD + PCF8574 I2C 백팩 기준 배선:

| LCD 백팩 | 피코 |
|---|---|
| GND | GND |
| VCC | VBUS(5V) 또는 3V3 |
| SDA | GP0 (기본값) |
| SCL | GP1 (기본값) |

블록 순서: **LCD 연결**(맨 처음 한 번) → LCD 지우기 / 커서 이동 / 출력 / 백라이트.
글자가 안 보이면 백팩 뒤 파란 가변저항으로 명암을 조절하고, 주소가 다르면 블록에서 `0x3F`로 바꾸세요.

## 개발

```bash
npm install
npm run dev      # 개발 서버 (localhost — Web Serial 사용 가능)
npm run build    # 타입 체크 + 프로덕션 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
```

배포는 정적 호스팅(GitHub Pages, Cloudflare Pages 등)이면 충분합니다. **Web Serial은 HTTPS(또는 localhost)에서만 동작**합니다.

## 아키텍처

```
src/
├── main.ts      # 앱 부트스트랩, 모드 전환, 버튼/상태 배선
├── serial.ts    # Web Serial 연결 + MicroPython raw REPL 프로토콜 (실행·파일 저장)
├── blocks.ts    # 피코 커스텀 블록 정의 + MicroPython 코드 생성기 + 툴박스
├── editor.ts    # CodeMirror 6 파이썬 에디터
├── terminal.ts  # xterm.js REPL 터미널
└── style.css
```

| 계층 | 기술 |
|---|---|
| 보드 통신 | Web Serial API + raw REPL(Ctrl-A/Ctrl-D) 자체 구현, 파일 저장은 base64 청크 전송 |
| 블록 코딩 | Blockly (zelos 렌더러, 한국어 로케일, 로컬 미디어) |
| 텍스트 에디터 | CodeMirror 6 (`@codemirror/lang-python`, one-dark 테마) |
| 터미널 | xterm.js + fit addon |
| 빌드 | Vite + TypeScript |

## 알려진 제한

- Web Serial 특성상 **Chromium 계열 데스크톱 브라우저 전용** (Chrome/Edge/Opera)
- 블록 → 코드 변환은 단방향입니다. 텍스트로 수정한 내용은 블록에 반영되지 않습니다
- 다른 프로그램(Thonny, Arduino IDE 등)이 시리얼 포트를 사용 중이면 연결에 실패합니다
- 자세한 배경과 기술 검토는 [docs/feasibility-report-ko.md](docs/feasibility-report-ko.md) 참고
