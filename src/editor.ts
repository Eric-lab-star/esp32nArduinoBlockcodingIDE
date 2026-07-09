/** CodeMirror 6 기반 파이썬 텍스트 에디터 */
import { EditorView, basicSetup } from 'codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

export interface CodeEditor {
  view: EditorView;
  getCode(): string;
  setCode(code: string): void;
}

export function createEditor(
  parent: HTMLElement,
  initialCode: string,
  onChange: (code: string) => void,
): CodeEditor {
  const view = new EditorView({
    parent,
    doc: initialCode,
    extensions: [
      basicSetup,
      python(),
      oneDark,
      EditorView.theme({
        '&': { height: '100%', fontSize: '14px', backgroundColor: '#161a21' },
        '.cm-gutters': { backgroundColor: '#161a21' },
        '.cm-scroller': { fontFamily: "'JetBrains Mono', 'D2Coding', Consolas, monospace" },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
    ],
  });

  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode: (code: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    },
  };
}
