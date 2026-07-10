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
