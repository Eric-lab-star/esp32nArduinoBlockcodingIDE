/**
 * 라즈베리파이 피코용 Blockly 커스텀 블록과 MicroPython 코드 생성기.
 *
 * Blockly 기본 Python 생성기는 CPython 기준이므로, 하드웨어 블록(GPIO, PWM,
 * ADC, 내장 LED/온도센서, sleep)은 machine/time 모듈을 쓰는 MicroPython
 * 코드를 직접 생성한다.
 */
import * as Blockly from 'blockly';
import { pythonGenerator, Order, PythonGenerator } from 'blockly/python';

/** 생성기 내부 definitions_ 에 안전하게 접근하기 위한 헬퍼 */
function addDefinition(generator: PythonGenerator, key: string, line: string): void {
  (generator as unknown as { definitions_: Record<string, string> }).definitions_[key] = line;
}

function importMachine(generator: PythonGenerator): void {
  addDefinition(generator, 'import_machine', 'from machine import Pin, PWM, ADC');
}

/**
 * PCF8574 백팩을 통한 HD44780 캐릭터 LCD용 컴팩트 드라이버.
 * MicroPython에는 LCD 드라이버가 없으므로 LCD 블록을 쓰면 이 클래스를 프로그램
 * 서두에 함께 넣어 보드에 별도 라이브러리를 설치하지 않아도 동작하게 한다.
 */
const I2C_LCD_DRIVER = [
  'class I2cLcd:',
  '    def __init__(self, i2c, addr=0x27, cols=16, rows=2):',
  '        self.i2c = i2c',
  '        self.addr = addr',
  '        self.cols = cols',
  '        self.rows = rows',
  '        self.bl = 0x08',
  '        for cmd in (0x33, 0x32, 0x28, 0x0C, 0x06, 0x01):',
  '            self._cmd(cmd)',
  '        time.sleep_ms(2)',
  '    def _strobe(self, data):',
  '        self.i2c.writeto(self.addr, bytes([data | 0x04]))',
  '        time.sleep_us(500)',
  '        self.i2c.writeto(self.addr, bytes([data & ~0x04]))',
  '        time.sleep_us(100)',
  '    def _send(self, value, mode):',
  '        self._strobe(mode | (value & 0xF0) | self.bl)',
  '        self._strobe(mode | ((value << 4) & 0xF0) | self.bl)',
  '    def _cmd(self, value):',
  '        self._send(value, 0)',
  '    def clear(self):',
  '        self._cmd(0x01)',
  '        time.sleep_ms(2)',
  '    def move_to(self, col, row):',
  '        offsets = (0x00, 0x40, 0x14, 0x54)',
  '        if row > 3:',
  '            row = 3',
  '        self._cmd(0x80 | (offsets[row] + col))',
  '    def putstr(self, text):',
  '        for ch in str(text):',
  '            self._send(ord(ch), 0x01)',
  '    def set_backlight(self, on):',
  '        self.bl = 0x08 if on else 0x00',
  '        self.i2c.writeto(self.addr, bytes([self.bl]))',
].join('\n');

/** LCD 블록이 필요로 하는 import와 드라이버 클래스를 프로그램 서두에 추가 */
function lcdSetup(generator: PythonGenerator): void {
  addDefinition(generator, 'import_softi2c', 'from machine import Pin, SoftI2C');
  addDefinition(generator, 'import_time', 'import time');
  addDefinition(generator, 'class_i2c_lcd', I2C_LCD_DRIVER);
}

function importTime(generator: PythonGenerator): void {
  addDefinition(generator, 'import_time', 'import time');
}

/** 콜백 함수 이름에 쓰기 위해 블록 id에서 파이썬 식별자에 안전한 문자만 남긴다. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '');
}

/** 음이름 → 주파수(Hz). 부저 연주 블록에서 사용한다(4~5옥타브 기준). */
const NOTE_FREQ: Record<string, string> = {
  C4: '262',
  D4: '294',
  E4: '330',
  F4: '349',
  G4: '392',
  A4: '440',
  B4: '494',
  C5: '523',
};

export function definePicoBlocks(): void {
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'pico_onboard_led',
      message0: '내장 LED %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'STATE',
          options: [
            ['켜기', '1'],
            ['끄기', '0'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'pico_blocks',
      tooltip: '피코 보드의 내장 LED를 켜거나 끕니다.',
    },
    {
      type: 'pico_onboard_led_toggle',
      message0: '내장 LED 반전하기',
      previousStatement: null,
      nextStatement: null,
      style: 'pico_blocks',
      tooltip: '내장 LED 상태를 반대로 바꿉니다 (켜짐↔꺼짐).',
    },
    {
      type: 'pico_digital_write',
      message0: 'GP %1 핀 디지털 출력 %2',
      args0: [
        { type: 'field_number', name: 'PIN', value: 0, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'VALUE',
          options: [
            ['HIGH (켜기)', '1'],
            ['LOW (끄기)', '0'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'pico_blocks',
      tooltip: '지정한 GPIO 핀을 HIGH 또는 LOW로 출력합니다.',
    },
    {
      type: 'pico_digital_read',
      message0: 'GP %1 핀 디지털 입력값',
      args0: [{ type: 'field_number', name: 'PIN', value: 0, min: 0, max: 28, precision: 1 }],
      output: 'Number',
      style: 'pico_blocks',
      tooltip: '지정한 GPIO 핀의 값을 읽습니다 (0 또는 1, 내부 풀다운).',
    },
    {
      type: 'pico_pwm',
      message0: 'GP %1 핀 PWM 출력 %2 %%',
      args0: [
        { type: 'field_number', name: 'PIN', value: 0, min: 0, max: 28, precision: 1 },
        { type: 'input_value', name: 'DUTY', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'pico_blocks',
      tooltip: '지정한 핀에 PWM 신호를 출력합니다 (0~100%). LED 밝기, 모터 속도 등에 사용합니다.',
    },
    {
      type: 'pico_servo',
      message0: '서보모터 GP %1 핀 각도 %2 도',
      args0: [
        { type: 'field_number', name: 'PIN', value: 0, min: 0, max: 28, precision: 1 },
        { type: 'input_value', name: 'ANGLE', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'pico_blocks',
      tooltip: '서보모터를 지정한 각도(0~180도)로 회전시킵니다. SG90 등 표준 서보 기준입니다.',
    },
    {
      type: 'pico_adc_read',
      message0: '%1 핀 아날로그 입력값 (0~65535)',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PIN',
          options: [
            ['GP26 (ADC0)', '26'],
            ['GP27 (ADC1)', '27'],
            ['GP28 (ADC2)', '28'],
          ],
        },
      ],
      output: 'Number',
      style: 'pico_blocks',
      tooltip: '아날로그 핀의 값을 읽습니다 (0~65535).',
    },
    {
      type: 'pico_temp',
      message0: '내장 온도센서 값 (℃)',
      output: 'Number',
      style: 'pico_blocks',
      tooltip: 'RP2040/RP2350 칩 내장 온도센서의 값을 섭씨로 읽습니다.',
    },
    {
      type: 'pico_sleep',
      message0: '%1 초 기다리기',
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      previousStatement: null,
      nextStatement: null,
      style: 'pico_blocks',
      tooltip: '지정한 시간(초)만큼 기다립니다. 소수점도 가능합니다 (예: 0.5).',
    },
    {
      type: 'pico_forever',
      message0: '계속 반복하기 %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      style: 'flow_blocks',
      tooltip: '안의 블록을 영원히 반복합니다 (while True). 정지 버튼으로 멈출 수 있습니다.',
    },
    // ---------- I2C LCD ----------
    {
      type: 'pico_lcd_init',
      message0: 'LCD 연결 SDA GP %1 SCL GP %2 주소 %3',
      message1: '화면 크기 %1 열 %2 행',
      args0: [
        { type: 'field_number', name: 'SDA', value: 0, min: 0, max: 28, precision: 1 },
        { type: 'field_number', name: 'SCL', value: 1, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'ADDR',
          options: [
            ['0x27', '0x27'],
            ['0x3F', '0x3F'],
          ],
        },
      ],
      args1: [
        { type: 'field_number', name: 'COLS', value: 16, min: 8, max: 20, precision: 1 },
        { type: 'field_number', name: 'ROWS', value: 2, min: 1, max: 4, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'lcd_blocks',
      tooltip:
        'I2C LCD를 연결하고 초기화합니다. 다른 LCD 블록보다 먼저 한 번 실행하세요. 보통 SDA=GP0, SCL=GP1, 주소=0x27입니다.',
    },
    {
      type: 'pico_lcd_print',
      message0: 'LCD에 %1 출력',
      args0: [{ type: 'input_value', name: 'TEXT' }],
      previousStatement: null,
      nextStatement: null,
      style: 'lcd_blocks',
      tooltip: '현재 커서 위치에 글자를 출력합니다.',
    },
    {
      type: 'pico_lcd_move',
      message0: 'LCD 커서 이동 %1 열 %2 행',
      args0: [
        { type: 'field_number', name: 'COL', value: 0, min: 0, max: 19, precision: 1 },
        { type: 'field_number', name: 'ROW', value: 0, min: 0, max: 3, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'lcd_blocks',
      tooltip: '글자를 출력할 커서 위치를 옮깁니다 (열·행은 0부터 시작).',
    },
    {
      type: 'pico_lcd_clear',
      message0: 'LCD 지우기',
      previousStatement: null,
      nextStatement: null,
      style: 'lcd_blocks',
      tooltip: 'LCD 화면의 모든 글자를 지우고 커서를 처음으로 옮깁니다.',
    },
    {
      type: 'pico_lcd_backlight',
      message0: 'LCD 백라이트 %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'ON',
          options: [
            ['켜기', '1'],
            ['끄기', '0'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'lcd_blocks',
      tooltip: 'LCD 백라이트(뒷조명)를 켜거나 끕니다.',
    },
    // ---------- 입력 ----------
    {
      type: 'pico_button',
      message0: 'GP %1 핀 버튼 (%2) 눌림?',
      args0: [
        { type: 'field_number', name: 'PIN', value: 15, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'MODE',
          options: [
            ['풀업·눌리면 GND', 'UP'],
            ['풀다운·눌리면 3V3', 'DOWN'],
          ],
        },
      ],
      output: 'Boolean',
      style: 'input_blocks',
      tooltip:
        '버튼이 눌렸는지 확인합니다. 풀업은 버튼 반대쪽을 GND에, 풀다운은 3V3에 연결합니다.',
    },
    {
      type: 'pico_pin_irq',
      message0: 'GP %1 핀이 %2 때 실행',
      message1: '%1',
      args0: [
        { type: 'field_number', name: 'PIN', value: 15, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'TRIGGER',
          options: [
            ['HIGH 로 바뀔', 'Pin.IRQ_RISING'],
            ['LOW 로 바뀔', 'Pin.IRQ_FALLING'],
            ['바뀔 (양쪽)', 'Pin.IRQ_RISING | Pin.IRQ_FALLING'],
          ],
        },
      ],
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      style: 'input_blocks',
      tooltip:
        '핀 신호가 바뀌는 순간(인터럽트) 안의 블록을 실행합니다. 프로그램 시작 부분에서 한 번만 등록하세요.',
    },
    {
      type: 'pico_map',
      message0: '%1 을(를) %2 ~ %3 에서 %4 ~ %5 로 변환',
      args0: [
        { type: 'input_value', name: 'VALUE', check: 'Number' },
        { type: 'input_value', name: 'IN_MIN', check: 'Number' },
        { type: 'input_value', name: 'IN_MAX', check: 'Number' },
        { type: 'input_value', name: 'OUT_MIN', check: 'Number' },
        { type: 'input_value', name: 'OUT_MAX', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Number',
      style: 'math_blocks',
      tooltip: '값의 범위를 다른 범위로 비례 변환합니다 (아두이노 map과 동일).',
    },
    {
      type: 'pico_constrain',
      message0: '%1 을(를) 최소 %2 최대 %3 로 제한',
      args0: [
        { type: 'input_value', name: 'VALUE', check: 'Number' },
        { type: 'input_value', name: 'LOW', check: 'Number' },
        { type: 'input_value', name: 'HIGH', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Number',
      style: 'math_blocks',
      tooltip: '값을 최소~최대 범위 안으로 가둡니다.',
    },
    // ---------- 시간 ----------
    {
      type: 'pico_sleep_ms',
      message0: '%1 밀리초 기다리기',
      args0: [{ type: 'input_value', name: 'MS', check: 'Number' }],
      previousStatement: null,
      nextStatement: null,
      style: 'time_blocks',
      tooltip: '지정한 시간(밀리초, 1000ms = 1초)만큼 기다립니다.',
    },
    {
      type: 'pico_ticks_ms',
      message0: '켜진 뒤 지난 시간 (밀리초)',
      output: 'Number',
      style: 'time_blocks',
      tooltip: '보드가 켜진 뒤 흐른 시간을 밀리초로 돌려줍니다 (time.ticks_ms).',
    },
    {
      type: 'pico_timer',
      message0: '%1 밀리초마다 반복 실행',
      message1: '%1',
      args0: [{ type: 'input_value', name: 'MS', check: 'Number' }],
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      style: 'time_blocks',
      tooltip:
        '하드웨어 타이머로 일정 시간마다 안의 블록을 자동 실행합니다. 시작 부분에서 한 번만 등록하세요.',
    },
    // ---------- 소리(부저) ----------
    {
      type: 'pico_buzzer_tone',
      message0: '부저 GP %1 핀 %2 Hz 소리내기',
      args0: [
        { type: 'field_number', name: 'PIN', value: 16, min: 0, max: 28, precision: 1 },
        { type: 'input_value', name: 'FREQ', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'sound_blocks',
      tooltip: '피에조(수동) 부저로 지정한 주파수의 소리를 냅니다. 멈추려면 부저 멈추기를 쓰세요.',
    },
    {
      type: 'pico_buzzer_note',
      message0: '부저 GP %1 핀 %2 음 %3 초 연주',
      args0: [
        { type: 'field_number', name: 'PIN', value: 16, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'NOTE',
          options: [
            ['도 (C4)', 'C4'],
            ['레 (D4)', 'D4'],
            ['미 (E4)', 'E4'],
            ['파 (F4)', 'F4'],
            ['솔 (G4)', 'G4'],
            ['라 (A4)', 'A4'],
            ['시 (B4)', 'B4'],
            ['높은도 (C5)', 'C5'],
          ],
        },
        { type: 'input_value', name: 'BEAT', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'sound_blocks',
      tooltip: '지정한 음(도레미)을 정해진 시간(초) 동안 연주하고 멈춥니다.',
    },
    {
      type: 'pico_buzzer_stop',
      message0: '부저 GP %1 핀 멈추기',
      args0: [{ type: 'field_number', name: 'PIN', value: 16, min: 0, max: 28, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      style: 'sound_blocks',
      tooltip: '부저 소리를 멈춥니다.',
    },
    // ---------- 센서 ----------
    {
      type: 'pico_ultrasonic',
      message0: '초음파 거리(cm) Trig GP %1 Echo GP %2',
      args0: [
        { type: 'field_number', name: 'TRIG', value: 3, min: 0, max: 28, precision: 1 },
        { type: 'field_number', name: 'ECHO', value: 2, min: 0, max: 28, precision: 1 },
      ],
      output: 'Number',
      style: 'sensor_blocks',
      tooltip:
        'HC-SR04 초음파 센서로 앞쪽 물체까지의 거리를 cm로 잽니다. 측정 실패 시 -1을 돌려줍니다.',
    },
    {
      type: 'pico_dht_read',
      message0: 'DHT 센서 GP %1 핀 (%2) 값 읽기',
      args0: [
        { type: 'field_number', name: 'PIN', value: 5, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'KIND',
          options: [
            ['DHT11', 'DHT11'],
            ['DHT22', 'DHT22'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'sensor_blocks',
      tooltip: '온습도 센서를 측정합니다. 온도·습도 값 블록보다 먼저 실행하세요.',
    },
    {
      type: 'pico_dht_value',
      message0: 'DHT GP %1 핀 %2',
      args0: [
        { type: 'field_number', name: 'PIN', value: 5, min: 0, max: 28, precision: 1 },
        {
          type: 'field_dropdown',
          name: 'WHICH',
          options: [
            ['온도(℃)', 'temperature'],
            ['습도(%)', 'humidity'],
          ],
        },
      ],
      output: 'Number',
      style: 'sensor_blocks',
      tooltip: '가장 최근에 읽은 온도 또는 습도 값을 돌려줍니다. 먼저 DHT 값 읽기를 실행하세요.',
    },
    {
      type: 'pico_ds18b20',
      message0: 'DS18B20 온도(℃) GP %1 핀',
      args0: [{ type: 'field_number', name: 'PIN', value: 6, min: 0, max: 28, precision: 1 }],
      output: 'Number',
      style: 'sensor_blocks',
      tooltip: 'DS18B20 방수 온도센서(OneWire)의 온도를 섭씨로 읽습니다.',
    },
    // ---------- 네오픽셀 ----------
    {
      type: 'pico_neopixel_init',
      message0: '네오픽셀 연결 GP %1 핀 개수 %2',
      args0: [
        { type: 'field_number', name: 'PIN', value: 0, min: 0, max: 28, precision: 1 },
        { type: 'field_number', name: 'NUM', value: 8, min: 1, max: 300, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'neopixel_blocks',
      tooltip: 'WS2812/네오픽셀 LED를 연결합니다. 다른 네오픽셀 블록보다 먼저 한 번 실행하세요.',
    },
    {
      type: 'pico_neopixel_set',
      message0: '네오픽셀 %1 번 색 빨강 %2 초록 %3 파랑 %4',
      args0: [
        { type: 'input_value', name: 'INDEX', check: 'Number' },
        { type: 'input_value', name: 'R', check: 'Number' },
        { type: 'input_value', name: 'G', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'neopixel_blocks',
      tooltip: '한 개 픽셀의 색을 정합니다 (0~255). 표시하려면 "네오픽셀 표시" 블록을 실행하세요.',
    },
    {
      type: 'pico_neopixel_fill',
      message0: '네오픽셀 전체 색 빨강 %1 초록 %2 파랑 %3',
      args0: [
        { type: 'input_value', name: 'R', check: 'Number' },
        { type: 'input_value', name: 'G', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'neopixel_blocks',
      tooltip: '모든 픽셀을 같은 색으로 칠합니다 (0~255).',
    },
    {
      type: 'pico_neopixel_show',
      message0: '네오픽셀 표시하기',
      previousStatement: null,
      nextStatement: null,
      style: 'neopixel_blocks',
      tooltip: '정한 색을 실제 LED에 반영합니다.',
    },
    {
      type: 'pico_neopixel_clear',
      message0: '네오픽셀 모두 끄기',
      previousStatement: null,
      nextStatement: null,
      style: 'neopixel_blocks',
      tooltip: '모든 픽셀을 끄고 바로 반영합니다.',
    },
    // ---------- 통신 ----------
    {
      type: 'pico_uart_init',
      message0: '시리얼 통신 시작 UART %1 속도 %2',
      message1: 'TX GP %1 RX GP %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'ID',
          options: [
            ['0', '0'],
            ['1', '1'],
          ],
        },
        {
          type: 'field_dropdown',
          name: 'BAUD',
          options: [
            ['9600', '9600'],
            ['19200', '19200'],
            ['38400', '38400'],
            ['57600', '57600'],
            ['115200', '115200'],
          ],
        },
      ],
      args1: [
        { type: 'field_number', name: 'TX', value: 0, min: 0, max: 28, precision: 1 },
        { type: 'field_number', name: 'RX', value: 1, min: 0, max: 28, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'comm_blocks',
      tooltip: 'UART 시리얼 통신을 시작합니다. 다른 시리얼 블록보다 먼저 실행하세요.',
    },
    {
      type: 'pico_uart_write',
      message0: '시리얼로 %1 보내기',
      args0: [{ type: 'input_value', name: 'TEXT' }],
      previousStatement: null,
      nextStatement: null,
      style: 'comm_blocks',
      tooltip: '시리얼로 문자열을 보냅니다 (줄바꿈 포함).',
    },
    {
      type: 'pico_uart_any',
      message0: '시리얼로 받은 데이터 있음?',
      output: 'Boolean',
      style: 'comm_blocks',
      tooltip: '시리얼로 읽을 데이터가 있으면 참을 돌려줍니다.',
    },
    {
      type: 'pico_uart_read',
      message0: '시리얼로 받은 한 줄',
      output: 'String',
      style: 'comm_blocks',
      tooltip: '시리얼로 들어온 한 줄을 읽어 문자열로 돌려줍니다.',
    },
    {
      type: 'pico_i2c_scan',
      message0: 'I2C 기기 주소 목록 SDA GP %1 SCL GP %2',
      args0: [
        { type: 'field_number', name: 'SDA', value: 0, min: 0, max: 28, precision: 1 },
        { type: 'field_number', name: 'SCL', value: 1, min: 0, max: 28, precision: 1 },
      ],
      output: 'Array',
      style: 'comm_blocks',
      tooltip: 'I2C 버스에 연결된 기기들의 주소를 16진수 목록으로 돌려줍니다 (LCD 주소 찾기 등).',
    },
    // ---------- 시스템 ----------
    {
      type: 'pico_reset',
      message0: '보드 다시 시작',
      previousStatement: null,
      nextStatement: null,
      style: 'system_blocks',
      tooltip: '보드를 하드 리셋(재부팅)합니다 (machine.reset).',
    },
    {
      type: 'pico_freq',
      message0: 'CPU 속도 %1 MHz 로 설정',
      args0: [
        {
          type: 'field_dropdown',
          name: 'MHZ',
          options: [
            ['48', '48'],
            ['125 (기본)', '125'],
            ['133', '133'],
            ['250', '250'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      style: 'system_blocks',
      tooltip: 'CPU 클록 주파수를 바꿉니다. 높이면 빨라지지만 전력·발열이 늘어납니다.',
    },
    {
      type: 'pico_unique_id',
      message0: '보드 고유 ID',
      output: 'String',
      style: 'system_blocks',
      tooltip: '보드마다 다른 고유 식별자를 16진수 문자열로 돌려줍니다.',
    },
  ]);

  const forBlock = pythonGenerator.forBlock;

  forBlock['pico_onboard_led'] = (block, generator) => {
    importMachine(generator);
    addDefinition(generator, 'def_onboard_led', 'led_onboard = Pin("LED", Pin.OUT)');
    return `led_onboard.value(${block.getFieldValue('STATE')})\n`;
  };

  forBlock['pico_onboard_led_toggle'] = (block, generator) => {
    void block;
    importMachine(generator);
    addDefinition(generator, 'def_onboard_led', 'led_onboard = Pin("LED", Pin.OUT)');
    return 'led_onboard.toggle()\n';
  };

  // 핀 정의를 서두로 호이스팅하면 같은 GP핀을 출력·입력 블록에 함께 쓸 때
  // 마지막 생성자가 핀 모드를 덮어써 다른 블록이 조용히 무효화된다.
  // 그래서 사용 지점마다 올바른 모드로 Pin을 생성한다(MicroPython 표준 관용구).
  forBlock['pico_digital_write'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    return `Pin(${pin}, Pin.OUT).value(${block.getFieldValue('VALUE')})\n`;
  };

  forBlock['pico_digital_read'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    return [`Pin(${pin}, Pin.IN, Pin.PULL_DOWN).value()`, Order.FUNCTION_CALL];
  };

  forBlock['pico_pwm'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    const duty = generator.valueToCode(block, 'DUTY', Order.MULTIPLICATIVE) || '0';
    addDefinition(generator, `def_pwm_${pin}`, `pwm_${pin} = PWM(Pin(${pin}), freq=1000)`);
    return `pwm_${pin}.duty_u16(min(65535, max(0, int(${duty} * 65535 / 100))))\n`;
  };

  forBlock['pico_servo'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
    // 표준 서보: 50Hz, 각도 0~180도 → 펄스 0.5~2.5ms(500000~2500000ns)
    addDefinition(generator, `def_servo_${pin}`, `servo_${pin} = PWM(Pin(${pin}), freq=50)`);
    return `servo_${pin}.duty_ns(int(500000 + max(0, min(180, ${angle})) * 2000000 / 180))\n`;
  };

  forBlock['pico_adc_read'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    addDefinition(generator, `def_adc_${pin}`, `adc_${pin} = ADC(${pin})`);
    return [`adc_${pin}.read_u16()`, Order.FUNCTION_CALL];
  };

  forBlock['pico_temp'] = (block, generator) => {
    void block;
    importMachine(generator);
    const fn = generator.provideFunction_(
      'read_onboard_temp',
      [
        `def ${generator.FUNCTION_NAME_PLACEHOLDER_}():`,
        '    reading = ADC(4).read_u16() * 3.3 / 65535',
        '    return 27 - (reading - 0.706) / 0.001721',
      ].join('\n'),
    );
    return [`${fn}()`, Order.FUNCTION_CALL];
  };

  forBlock['pico_sleep'] = (block, generator) => {
    addDefinition(generator, 'import_time', 'import time');
    const sec = generator.valueToCode(block, 'SECONDS', Order.NONE) || '1';
    return `time.sleep(${sec})\n`;
  };

  forBlock['pico_forever'] = (block, generator) => {
    const branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
    return 'while True:\n' + branch;
  };

  forBlock['pico_lcd_init'] = (block, generator) => {
    lcdSetup(generator);
    const sda = block.getFieldValue('SDA');
    const scl = block.getFieldValue('SCL');
    const addr = block.getFieldValue('ADDR');
    const cols = block.getFieldValue('COLS');
    const rows = block.getFieldValue('ROWS');
    return (
      `lcd = I2cLcd(SoftI2C(sda=Pin(${sda}), scl=Pin(${scl}), freq=100000), ` +
      `${addr}, ${cols}, ${rows})\n`
    );
  };

  forBlock['pico_lcd_print'] = (block, generator) => {
    const text = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `lcd.putstr(${text})\n`;
  };

  forBlock['pico_lcd_move'] = (block) => {
    return `lcd.move_to(${block.getFieldValue('COL')}, ${block.getFieldValue('ROW')})\n`;
  };

  forBlock['pico_lcd_clear'] = () => 'lcd.clear()\n';

  forBlock['pico_lcd_backlight'] = (block) => {
    return `lcd.set_backlight(${block.getFieldValue('ON')})\n`;
  };

  // ---------- 입력 ----------
  forBlock['pico_button'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    if (block.getFieldValue('MODE') === 'UP') {
      return [`Pin(${pin}, Pin.IN, Pin.PULL_UP).value() == 0`, Order.RELATIONAL];
    }
    return [`Pin(${pin}, Pin.IN, Pin.PULL_DOWN).value() == 1`, Order.RELATIONAL];
  };

  forBlock['pico_pin_irq'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    const trigger = block.getFieldValue('TRIGGER');
    const branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
    const name = `_on_gp${pin}_${safeId(block.id)}`;
    addDefinition(generator, name, `def ${name}(pin):\n${branch}`);
    return `Pin(${pin}, Pin.IN, Pin.PULL_DOWN).irq(trigger=${trigger}, handler=${name})\n`;
  };

  forBlock['pico_map'] = (block, generator) => {
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const inMin = generator.valueToCode(block, 'IN_MIN', Order.NONE) || '0';
    const inMax = generator.valueToCode(block, 'IN_MAX', Order.NONE) || '0';
    const outMin = generator.valueToCode(block, 'OUT_MIN', Order.NONE) || '0';
    const outMax = generator.valueToCode(block, 'OUT_MAX', Order.NONE) || '0';
    const fn = generator.provideFunction_(
      'map_range',
      [
        `def ${generator.FUNCTION_NAME_PLACEHOLDER_}(x, in_min, in_max, out_min, out_max):`,
        '    if in_max == in_min:',
        '        return out_min',
        '    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min',
      ].join('\n'),
    );
    return [`${fn}(${value}, ${inMin}, ${inMax}, ${outMin}, ${outMax})`, Order.FUNCTION_CALL];
  };

  forBlock['pico_constrain'] = (block, generator) => {
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const low = generator.valueToCode(block, 'LOW', Order.NONE) || '0';
    const high = generator.valueToCode(block, 'HIGH', Order.NONE) || '0';
    return [`min(max(${value}, ${low}), ${high})`, Order.FUNCTION_CALL];
  };

  // ---------- 시간 ----------
  forBlock['pico_sleep_ms'] = (block, generator) => {
    importTime(generator);
    const ms = generator.valueToCode(block, 'MS', Order.NONE) || '0';
    return `time.sleep_ms(int(${ms}))\n`;
  };

  forBlock['pico_ticks_ms'] = (block, generator) => {
    void block;
    importTime(generator);
    return ['time.ticks_ms()', Order.FUNCTION_CALL];
  };

  forBlock['pico_timer'] = (block, generator) => {
    addDefinition(generator, 'import_timer', 'from machine import Timer');
    const ms = generator.valueToCode(block, 'MS', Order.NONE) || '1000';
    const branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
    const name = `_timer_${safeId(block.id)}`;
    addDefinition(generator, name, `def ${name}(t):\n${branch}`);
    return `Timer(period=int(${ms}), mode=Timer.PERIODIC, callback=${name})\n`;
  };

  // ---------- 소리(부저) ----------
  forBlock['pico_buzzer_tone'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    const freq = generator.valueToCode(block, 'FREQ', Order.NONE) || '440';
    addDefinition(generator, `def_buzzer_${pin}`, `buzzer_${pin} = PWM(Pin(${pin}))`);
    return `buzzer_${pin}.freq(int(${freq}))\nbuzzer_${pin}.duty_u16(32768)\n`;
  };

  forBlock['pico_buzzer_note'] = (block, generator) => {
    importMachine(generator);
    importTime(generator);
    const pin = block.getFieldValue('PIN');
    const freq = NOTE_FREQ[block.getFieldValue('NOTE')] || '440';
    const beat = generator.valueToCode(block, 'BEAT', Order.NONE) || '0.5';
    addDefinition(generator, `def_buzzer_${pin}`, `buzzer_${pin} = PWM(Pin(${pin}))`);
    return (
      `buzzer_${pin}.freq(${freq})\nbuzzer_${pin}.duty_u16(32768)\n` +
      `time.sleep(${beat})\nbuzzer_${pin}.duty_u16(0)\n`
    );
  };

  forBlock['pico_buzzer_stop'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    addDefinition(generator, `def_buzzer_${pin}`, `buzzer_${pin} = PWM(Pin(${pin}))`);
    return `buzzer_${pin}.duty_u16(0)\n`;
  };

  // ---------- 센서 ----------
  forBlock['pico_ultrasonic'] = (block, generator) => {
    importMachine(generator);
    importTime(generator);
    addDefinition(generator, 'import_time_pulse', 'from machine import time_pulse_us');
    const trig = block.getFieldValue('TRIG');
    const echo = block.getFieldValue('ECHO');
    const fn = generator.provideFunction_(
      'read_distance_cm',
      [
        `def ${generator.FUNCTION_NAME_PLACEHOLDER_}(trig_pin, echo_pin):`,
        '    trig = Pin(trig_pin, Pin.OUT)',
        '    echo = Pin(echo_pin, Pin.IN)',
        '    trig.low()',
        '    time.sleep_us(2)',
        '    trig.high()',
        '    time.sleep_us(10)',
        '    trig.low()',
        '    dur = time_pulse_us(echo, 1, 30000)',
        '    if dur < 0:',
        '        return -1',
        '    return dur * 0.01715',
      ].join('\n'),
    );
    return [`${fn}(${trig}, ${echo})`, Order.FUNCTION_CALL];
  };

  forBlock['pico_dht_read'] = (block, generator) => {
    importMachine(generator);
    addDefinition(generator, 'import_dht', 'import dht');
    const pin = block.getFieldValue('PIN');
    const kind = block.getFieldValue('KIND');
    addDefinition(generator, `def_dht_${pin}`, `dht_${pin} = dht.${kind}(Pin(${pin}))`);
    return `dht_${pin}.measure()\n`;
  };

  forBlock['pico_dht_value'] = (block, generator) => {
    void generator;
    const pin = block.getFieldValue('PIN');
    const which = block.getFieldValue('WHICH');
    return [`dht_${pin}.${which}()`, Order.FUNCTION_CALL];
  };

  forBlock['pico_ds18b20'] = (block, generator) => {
    importMachine(generator);
    importTime(generator);
    addDefinition(generator, 'import_ds18x20', 'import onewire, ds18x20');
    const pin = block.getFieldValue('PIN');
    const fn = generator.provideFunction_(
      'read_ds18b20',
      [
        `def ${generator.FUNCTION_NAME_PLACEHOLDER_}(pin):`,
        '    sensor = ds18x20.DS18X20(onewire.OneWire(Pin(pin)))',
        '    roms = sensor.scan()',
        '    if not roms:',
        '        return -127',
        '    sensor.convert_temp()',
        '    time.sleep_ms(750)',
        '    return sensor.read_temp(roms[0])',
      ].join('\n'),
    );
    return [`${fn}(${pin})`, Order.FUNCTION_CALL];
  };

  // ---------- 네오픽셀 ----------
  forBlock['pico_neopixel_init'] = (block, generator) => {
    addDefinition(generator, 'import_neopixel', 'from machine import Pin\nfrom neopixel import NeoPixel');
    const pin = block.getFieldValue('PIN');
    const num = block.getFieldValue('NUM');
    return `np = NeoPixel(Pin(${pin}), ${num})\n`;
  };

  const clamp255 = (code: string) => `min(255, max(0, int(${code})))`;

  forBlock['pico_neopixel_set'] = (block, generator) => {
    const index = generator.valueToCode(block, 'INDEX', Order.NONE) || '0';
    const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
    const g = generator.valueToCode(block, 'G', Order.NONE) || '0';
    const b = generator.valueToCode(block, 'B', Order.NONE) || '0';
    return `np[${index}] = (${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})\n`;
  };

  forBlock['pico_neopixel_fill'] = (block, generator) => {
    const r = generator.valueToCode(block, 'R', Order.NONE) || '0';
    const g = generator.valueToCode(block, 'G', Order.NONE) || '0';
    const b = generator.valueToCode(block, 'B', Order.NONE) || '0';
    return `np.fill((${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}))\n`;
  };

  forBlock['pico_neopixel_show'] = () => 'np.write()\n';

  forBlock['pico_neopixel_clear'] = () => 'np.fill((0, 0, 0))\nnp.write()\n';

  // ---------- 통신 ----------
  forBlock['pico_uart_init'] = (block, generator) => {
    addDefinition(generator, 'import_uart', 'from machine import Pin, UART');
    const id = block.getFieldValue('ID');
    const baud = block.getFieldValue('BAUD');
    const tx = block.getFieldValue('TX');
    const rx = block.getFieldValue('RX');
    return `uart = UART(${id}, baudrate=${baud}, tx=Pin(${tx}), rx=Pin(${rx}))\n`;
  };

  forBlock['pico_uart_write'] = (block, generator) => {
    const text = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `uart.write(str(${text}) + "\\n")\n`;
  };

  forBlock['pico_uart_any'] = (block, generator) => {
    void block;
    void generator;
    return ['uart.any() > 0', Order.RELATIONAL];
  };

  forBlock['pico_uart_read'] = (block, generator) => {
    void block;
    void generator;
    return ['(uart.readline() or b"").decode().strip()', Order.FUNCTION_CALL];
  };

  forBlock['pico_i2c_scan'] = (block, generator) => {
    addDefinition(generator, 'import_softi2c', 'from machine import Pin, SoftI2C');
    const sda = block.getFieldValue('SDA');
    const scl = block.getFieldValue('SCL');
    return [
      `[hex(a) for a in SoftI2C(sda=Pin(${sda}), scl=Pin(${scl}), freq=100000).scan()]`,
      Order.ATOMIC,
    ];
  };

  // ---------- 시스템 ----------
  forBlock['pico_reset'] = (block, generator) => {
    void block;
    addDefinition(generator, 'import_machine_mod', 'import machine');
    return 'machine.reset()\n';
  };

  forBlock['pico_freq'] = (block, generator) => {
    addDefinition(generator, 'import_machine_mod', 'import machine');
    const mhz = block.getFieldValue('MHZ');
    return `machine.freq(${mhz}000000)\n`;
  };

  forBlock['pico_unique_id'] = (block, generator) => {
    void block;
    addDefinition(generator, 'import_machine_mod', 'import machine');
    addDefinition(generator, 'import_ubinascii', 'import ubinascii');
    return ['ubinascii.hexlify(machine.unique_id()).decode()', Order.FUNCTION_CALL];
  };
}

/** 숫자 shadow 블록 헬퍼 */
const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '피코',
      categorystyle: 'pico_category',
      contents: [
        { kind: 'block', type: 'pico_onboard_led' },
        { kind: 'block', type: 'pico_onboard_led_toggle' },
        { kind: 'block', type: 'pico_sleep', inputs: { SECONDS: num(1) } },
        { kind: 'block', type: 'pico_forever' },
        { kind: 'block', type: 'pico_digital_write' },
        { kind: 'block', type: 'pico_digital_read' },
        { kind: 'block', type: 'pico_pwm', inputs: { DUTY: num(50) } },
        { kind: 'block', type: 'pico_servo', inputs: { ANGLE: num(90) } },
        { kind: 'block', type: 'pico_adc_read' },
        { kind: 'block', type: 'pico_temp' },
      ],
    },
    {
      kind: 'category',
      name: 'LCD',
      categorystyle: 'lcd_category',
      contents: [
        { kind: 'block', type: 'pico_lcd_init' },
        {
          kind: 'block',
          type: 'pico_lcd_print',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello, Pico!' } } } },
        },
        { kind: 'block', type: 'pico_lcd_move' },
        { kind: 'block', type: 'pico_lcd_clear' },
        { kind: 'block', type: 'pico_lcd_backlight' },
      ],
    },
    {
      kind: 'category',
      name: '입력',
      categorystyle: 'input_category',
      contents: [
        { kind: 'block', type: 'pico_button' },
        { kind: 'block', type: 'pico_pin_irq' },
      ],
    },
    {
      kind: 'category',
      name: '시간',
      categorystyle: 'time_category',
      contents: [
        { kind: 'block', type: 'pico_sleep', inputs: { SECONDS: num(1) } },
        { kind: 'block', type: 'pico_sleep_ms', inputs: { MS: num(500) } },
        { kind: 'block', type: 'pico_ticks_ms' },
        { kind: 'block', type: 'pico_timer', inputs: { MS: num(1000) } },
      ],
    },
    {
      kind: 'category',
      name: '소리',
      categorystyle: 'sound_category',
      contents: [
        { kind: 'block', type: 'pico_buzzer_tone', inputs: { FREQ: num(440) } },
        { kind: 'block', type: 'pico_buzzer_note', inputs: { BEAT: num(0.5) } },
        { kind: 'block', type: 'pico_buzzer_stop' },
      ],
    },
    {
      kind: 'category',
      name: '센서',
      categorystyle: 'sensor_category',
      contents: [
        { kind: 'block', type: 'pico_ultrasonic' },
        { kind: 'block', type: 'pico_dht_read' },
        { kind: 'block', type: 'pico_dht_value' },
        { kind: 'block', type: 'pico_ds18b20' },
      ],
    },
    {
      kind: 'category',
      name: '네오픽셀',
      categorystyle: 'neopixel_category',
      contents: [
        { kind: 'block', type: 'pico_neopixel_init' },
        {
          kind: 'block',
          type: 'pico_neopixel_set',
          inputs: { INDEX: num(0), R: num(255), G: num(0), B: num(0) },
        },
        {
          kind: 'block',
          type: 'pico_neopixel_fill',
          inputs: { R: num(0), G: num(0), B: num(255) },
        },
        { kind: 'block', type: 'pico_neopixel_show' },
        { kind: 'block', type: 'pico_neopixel_clear' },
      ],
    },
    {
      kind: 'category',
      name: '통신',
      categorystyle: 'comm_category',
      contents: [
        { kind: 'block', type: 'pico_uart_init' },
        {
          kind: 'block',
          type: 'pico_uart_write',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } } },
        },
        { kind: 'block', type: 'pico_uart_any' },
        { kind: 'block', type: 'pico_uart_read' },
        { kind: 'block', type: 'pico_i2c_scan' },
      ],
    },
    {
      kind: 'category',
      name: '시스템',
      categorystyle: 'system_category',
      contents: [
        { kind: 'block', type: 'pico_reset' },
        { kind: 'block', type: 'pico_freq' },
        { kind: 'block', type: 'pico_unique_id' },
      ],
    },
    {
      kind: 'category',
      name: '논리',
      categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category',
      name: '반복',
      categorystyle: 'loop_category',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } },
        { kind: 'block', type: 'controls_whileUntil' },
        {
          kind: 'block',
          type: 'controls_for',
          inputs: { FROM: num(1), TO: num(10), BY: num(1) },
        },
        { kind: 'block', type: 'controls_flow_statements' },
      ],
    },
    {
      kind: 'category',
      name: '수학',
      categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic', inputs: { A: num(1), B: num(1) } },
        { kind: 'block', type: 'math_round', inputs: { NUM: num(3.1) } },
        { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: num(64), DIVISOR: num(10) } },
        { kind: 'block', type: 'math_random_int', inputs: { FROM: num(1), TO: num(100) } },
        {
          kind: 'block',
          type: 'pico_map',
          inputs: {
            VALUE: num(0),
            IN_MIN: num(0),
            IN_MAX: num(65535),
            OUT_MIN: num(0),
            OUT_MAX: num(100),
          },
        },
        {
          kind: 'block',
          type: 'pico_constrain',
          inputs: { VALUE: num(50), LOW: num(0), HIGH: num(100) },
        },
      ],
    },
    {
      kind: 'category',
      name: '텍스트',
      categorystyle: 'text_category',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_print' },
      ],
    },
    { kind: 'category', name: '변수', categorystyle: 'variable_category', custom: 'VARIABLE' },
    { kind: 'category', name: '함수', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
  ],
};
