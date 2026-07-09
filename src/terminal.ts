/** xterm.js 기반 REPL 터미널 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function createTerminal(parent: HTMLElement): { term: Terminal; fit: FitAddon } {
  const term = new Terminal({
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'D2Coding', Consolas, monospace",
    cursorBlink: true,
    convertEol: true,
    theme: {
      background: '#16181d',
      foreground: '#d8dee9',
      cursor: '#88c0d0',
      selectionBackground: '#3b4252',
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(parent);
  fit.fit();
  window.addEventListener('resize', () => fit.fit());
  term.writeln('\x1b[90m보드를 연결하면 MicroPython REPL이 여기에 표시됩니다.\x1b[0m');
  return { term, fit };
}
