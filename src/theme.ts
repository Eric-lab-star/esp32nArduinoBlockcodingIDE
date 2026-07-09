/**
 * 엔트리(Entry) 스타일 블록 테마와 렌더러.
 *
 * - 엔트리의 카테고리별 선명한 플랫 컬러 팔레트를 Blockly blockStyles로 정의
 *   (하드웨어=청록, 흐름=주황, 판단=파랑, 계산=연두, 생김새=핑크, 자료=코랄, 함수=보라)
 * - zelos 렌더러를 상속해 모서리를 살짝 각지게, 연결 홈(notch)을 작게 조정해
 *   엔트리 블록의 둥근 사각형 느낌을 낸다.
 */
import * as Blockly from 'blockly';

/** [블록 본체, 그림자 블록, 테두리] */
const PALETTE = {
  pico: ['#00B6B1', '#019A96', '#0A8481'],
  flow: ['#F5A623', '#DE9214', '#C17E0E'],
  logic: ['#5C9DF2', '#4589E3', '#3B76C4'],
  math: ['#8FBE29', '#7DA922', '#6C931D'],
  text: ['#EC4466', '#D93A5B', '#BC3150'],
  vars: ['#EE6E54', '#DE5B41', '#C24E37'],
  func: ['#A05CE0', '#8E49D0', '#7A3DB4'],
} as const;

type Triple = readonly [string, string, string];

const blockStyle = ([p, s, t]: Triple) => ({
  colourPrimary: p,
  colourSecondary: s,
  colourTertiary: t,
  hat: '',
});

export const picoTheme = Blockly.Theme.defineTheme('picoEntry', {
  name: 'picoEntry',
  base: Blockly.Themes.Zelos,
  blockStyles: {
    pico_blocks: blockStyle(PALETTE.pico),
    flow_blocks: blockStyle(PALETTE.flow),
    logic_blocks: blockStyle(PALETTE.logic),
    loop_blocks: blockStyle(PALETTE.flow),
    math_blocks: blockStyle(PALETTE.math),
    text_blocks: blockStyle(PALETTE.text),
    variable_blocks: blockStyle(PALETTE.vars),
    variable_dynamic_blocks: blockStyle(PALETTE.vars),
    procedure_blocks: blockStyle(PALETTE.func),
  },
  categoryStyles: {
    pico_category: { colour: PALETTE.pico[0] },
    logic_category: { colour: PALETTE.logic[0] },
    loop_category: { colour: PALETTE.flow[0] },
    math_category: { colour: PALETTE.math[0] },
    text_category: { colour: PALETTE.text[0] },
    variable_category: { colour: PALETTE.vars[0] },
    procedure_category: { colour: PALETTE.func[0] },
  },
  componentStyles: {
    workspaceBackgroundColour: '#1e1e1e',
    toolboxBackgroundColour: '#252526',
    toolboxForegroundColour: '#cccccc',
    flyoutBackgroundColour: '#2d2d30',
    flyoutForegroundColour: '#cccccc',
    flyoutOpacity: 0.97,
    scrollbarColour: '#4f4f4f',
    insertionMarkerColour: '#3794ff',
  },
  fontStyle: {
    family: "'Pretendard', 'Noto Sans KR', -apple-system, 'Segoe UI', sans-serif",
    weight: 'bold',
    size: 11,
  },
});

/**
 * 엔트리 느낌의 렌더러를 등록하고 이름을 돌려준다.
 * (렌더러 내부 API 변경 등으로 실패하면 기본 zelos로 폴백)
 */
export function registerEntryRenderer(): string {
  try {
    const zelos = (Blockly as unknown as { zelos: { Renderer: new (name: string) => unknown } })
      .zelos;

    class EntryRenderer extends (zelos.Renderer as new (name: string) => {
      makeConstants_(): Record<string, number>;
    }) {
      makeConstants_() {
        const c = super.makeConstants_();
        // 엔트리 블록처럼: 모서리는 덜 둥글게, 연결 홈은 작게.
        // Blockly 내부 상수명이 향후 바뀌어 값이 없으면 NaN이 되지 않도록 원본을 유지한다.
        c.CORNER_RADIUS = 3;
        if (typeof c.NOTCH_WIDTH === 'number') c.NOTCH_WIDTH = Math.round(c.NOTCH_WIDTH * 0.78);
        if (typeof c.NOTCH_HEIGHT === 'number') c.NOTCH_HEIGHT = Math.round(c.NOTCH_HEIGHT * 0.85);
        return c;
      }
    }

    Blockly.blockRendering.register(
      'pico_entry',
      EntryRenderer as unknown as Parameters<typeof Blockly.blockRendering.register>[1],
    );
    return 'pico_entry';
  } catch (e) {
    // 등록 실패 시 기본 zelos로 폴백하되, 조용한 시각 회귀가 되지 않도록 경고를 남긴다.
    console.warn('엔트리 렌더러 등록 실패, 기본 렌더러로 대체합니다:', e);
    return 'zelos';
  }
}
