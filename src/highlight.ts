/**
 * 아주 가벼운 MicroPython 문법 하이라이터.
 *
 * CodeMirror 인스턴스를 붙이기엔 과한, 읽기 전용 코드 표시(블록 편집기 옆
 * 미리보기·샘플 뷰어)를 위해 파이썬 코드를 토큰별 <span>으로 감싼 HTML을
 * 만든다. 반환 HTML은 이미 이스케이프되어 있어 innerHTML에 바로 넣어도 안전하다.
 */

/** 토큰 색상 정의 — 미리보기(주입)와 샘플 뷰어(인라인)가 공유하는 단일 원천. */
export const TOKEN_CSS = `
.tok-comment { color: #6a9955; }
.tok-string  { color: #ce9178; }
.tok-number  { color: #b5cea8; }
.tok-keyword { color: #569cd6; }
.tok-const   { color: #4fc1ff; }
.tok-builtin { color: #dcdcaa; }
`;

const KEYWORDS = new Set([
  'import', 'from', 'as', 'def', 'class', 'return', 'if', 'elif', 'else',
  'for', 'while', 'in', 'is', 'not', 'and', 'or', 'pass', 'break', 'continue',
  'with', 'try', 'except', 'finally', 'raise', 'lambda', 'global', 'nonlocal',
  'yield', 'del', 'assert', 'async', 'await',
]);

const CONSTS = new Set(['True', 'False', 'None']);

const BUILTINS = new Set([
  'print', 'range', 'len', 'int', 'float', 'str', 'bytes', 'bytearray',
  'min', 'max', 'abs', 'ord', 'chr', 'bool', 'list', 'dict', 'tuple', 'set',
  'sum', 'round', 'input', 'enumerate', 'open', 'hex', 'bin', 'type',
  'isinstance', 'sorted', 'reversed', 'map', 'filter', 'zip', 'pow', 'divmod',
]);

const esc = (s: string): string =>
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

// 순서가 중요하다: 주석 → 문자열(삼중따옴표 먼저) → 숫자 → 식별자.
const TOKEN_RE =
  /(#[^\n]*)|('''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b|\b0[xXbBoO][0-9a-fA-F_]+\b)|([A-Za-z_]\w*)/g;

/** 파이썬 코드를 토큰 <span>으로 감싼 (이스케이프된) HTML로 변환한다. */
export function highlightPython(code: string): string {
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    // 토큰 사이의 연산자·공백 등은 그대로(이스케이프만) 출력한다.
    out += esc(code.slice(last, m.index));
    if (m[1] !== undefined) {
      out += `<span class="tok-comment">${esc(m[1])}</span>`;
    } else if (m[2] !== undefined) {
      out += `<span class="tok-string">${esc(m[2])}</span>`;
    } else if (m[3] !== undefined) {
      out += `<span class="tok-number">${esc(m[3])}</span>`;
    } else {
      const word = m[4];
      let cls = '';
      if (KEYWORDS.has(word)) {
        cls = 'tok-keyword';
      } else if (CONSTS.has(word)) {
        cls = 'tok-const';
      } else if (BUILTINS.has(word) || code[TOKEN_RE.lastIndex] === '(') {
        // 내장 함수이거나 바로 뒤에 '('가 오면 함수/메서드 호출로 본다.
        cls = 'tok-builtin';
      }
      out += cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word);
    }
    last = TOKEN_RE.lastIndex;
  }
  out += esc(code.slice(last));
  return out;
}
