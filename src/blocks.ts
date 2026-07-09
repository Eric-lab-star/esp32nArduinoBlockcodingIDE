/**
 * 라즈베리파이 피코용 Blockly 커스텀 블록과 MicroPython 코드 생성기.
 *
 * Blockly 기본 Python 생성기는 CPython 기준이므로, 하드웨어 블록(GPIO, PWM,
 * ADC, 내장 LED/온도센서, sleep)은 machine/time 모듈을 쓰는 MicroPython
 * 코드를 직접 생성한다.
 */
import * as Blockly from 'blockly';
import { pythonGenerator, Order, PythonGenerator } from 'blockly/python';

const PICO_HUE = 190;

/** 생성기 내부 definitions_ 에 안전하게 접근하기 위한 헬퍼 */
function addDefinition(generator: PythonGenerator, key: string, line: string): void {
  (generator as unknown as { definitions_: Record<string, string> }).definitions_[key] = line;
}

function importMachine(generator: PythonGenerator): void {
  addDefinition(generator, 'import_machine', 'from machine import Pin, PWM, ADC');
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
      colour: PICO_HUE,
      tooltip: '피코 보드의 내장 LED를 켜거나 끕니다.',
    },
    {
      type: 'pico_onboard_led_toggle',
      message0: '내장 LED 반전하기',
      previousStatement: null,
      nextStatement: null,
      colour: PICO_HUE,
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
      colour: PICO_HUE,
      tooltip: '지정한 GPIO 핀을 HIGH 또는 LOW로 출력합니다.',
    },
    {
      type: 'pico_digital_read',
      message0: 'GP %1 핀 디지털 입력값',
      args0: [{ type: 'field_number', name: 'PIN', value: 0, min: 0, max: 28, precision: 1 }],
      output: 'Number',
      colour: PICO_HUE,
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
      colour: PICO_HUE,
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
      colour: PICO_HUE,
      tooltip: '아날로그 핀의 값을 읽습니다 (0~65535).',
    },
    {
      type: 'pico_temp',
      message0: '내장 온도센서 값 (℃)',
      output: 'Number',
      colour: PICO_HUE,
      tooltip: 'RP2040/RP2350 칩 내장 온도센서의 값을 섭씨로 읽습니다.',
    },
    {
      type: 'pico_sleep',
      message0: '%1 초 기다리기',
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      previousStatement: null,
      nextStatement: null,
      colour: PICO_HUE,
      tooltip: '지정한 시간(초)만큼 기다립니다. 소수점도 가능합니다 (예: 0.5).',
    },
    {
      type: 'pico_forever',
      message0: '계속 반복하기 %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      colour: '#b45f9d',
      tooltip: '안의 블록을 영원히 반복합니다 (while True). 정지 버튼으로 멈출 수 있습니다.',
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

  forBlock['pico_digital_write'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    addDefinition(generator, `def_pin_out_${pin}`, `pin_out_${pin} = Pin(${pin}, Pin.OUT)`);
    return `pin_out_${pin}.value(${block.getFieldValue('VALUE')})\n`;
  };

  forBlock['pico_digital_read'] = (block, generator) => {
    importMachine(generator);
    const pin = block.getFieldValue('PIN');
    addDefinition(
      generator,
      `def_pin_in_${pin}`,
      `pin_in_${pin} = Pin(${pin}, Pin.IN, Pin.PULL_DOWN)`,
    );
    return [`pin_in_${pin}.value()`, Order.FUNCTION_CALL];
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
}

/** 숫자 shadow 블록 헬퍼 */
const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '피코',
      colour: `${PICO_HUE}`,
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
      name: '논리',
      colour: '%{BKY_LOGIC_HUE}',
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
      colour: '%{BKY_LOOPS_HUE}',
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
      colour: '%{BKY_MATH_HUE}',
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
      colour: '%{BKY_TEXTS_HUE}',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_print' },
      ],
    },
    { kind: 'category', name: '변수', colour: '%{BKY_VARIABLES_HUE}', custom: 'VARIABLE' },
    { kind: 'category', name: '함수', colour: '%{BKY_PROCEDURES_HUE}', custom: 'PROCEDURE' },
  ],
};
