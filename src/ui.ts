/** 토스트 알림과 확인 모달 — 브라우저 기본 alert/confirm 대체 */

export type ToastType = 'info' | 'success' | 'error';

/**
 * 열려 있는 모달들의 Escape 처리기 스택. 하나의 전역 리스너가 Escape 시
 * 맨 위(마지막에 열린) 모달만 닫는다 — 겹친 모달이 한 번에 전부 닫히는 것을 방지.
 */
const escapeStack: Array<() => void> = [];
let escapeListenerAttached = false;

function ensureEscapeListener(): void {
  if (escapeListenerAttached) return;
  escapeListenerAttached = true;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && escapeStack.length) {
      e.stopPropagation();
      escapeStack[escapeStack.length - 1]();
    }
  });
}

/** 모달을 Escape 스택에 등록한다. 반환된 함수를 닫을 때 호출해 등록을 해제한다. */
export function pushEscapeHandler(onEscape: () => void): () => void {
  ensureEscapeListener();
  escapeStack.push(onEscape);
  return () => {
    const i = escapeStack.lastIndexOf(onEscape);
    if (i >= 0) escapeStack.splice(i, 1);
  };
}

/** 현재 화면에 표시 중인 모달이 있는지 (모달 위에서의 단축키 실행 차단용) */
export function isModalOpen(): boolean {
  return document.querySelector('.modal-backdrop.show') !== null;
}

let toastContainer: HTMLElement | null = null;

export function toast(message: string, type: ToastType = 'info'): void {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 3200);
}

export interface PromptOptions {
  title: string;
  /** 입력란 위에 표시할 안내 문구 */
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * 텍스트 입력 모달 — 브라우저 기본 prompt() 대체.
 * 확인 시 (앞뒤 공백 제거한) 입력값, 취소·빈 입력 시 null을 resolve 한다.
 */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = opts.title;

    const body = document.createElement('div');
    body.className = 'modal-body';
    if (opts.label) {
      const label = document.createElement('label');
      label.className = 'modal-label';
      label.textContent = opts.label;
      body.appendChild(label);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = opts.defaultValue ?? '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    body.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn modal-cancel';
    cancelBtn.textContent = opts.cancelText ?? '취소';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary modal-confirm';
    confirmBtn.textContent = opts.confirmText ?? '확인';
    actions.append(cancelBtn, confirmBtn);

    modal.append(title, body, actions);
    backdrop.appendChild(modal);

    const popEscape = pushEscapeHandler(() => done(null));
    const done = (value: string | null) => {
      popEscape();
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 180);
      resolve(value);
    };
    const submit = () => {
      const value = input.value.trim();
      done(value ? value : null);
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(null);
    });
    cancelBtn.addEventListener('click', () => done(null));
    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      input.focus();
      input.select();
    });
  });
}

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmText?: string;
  cancelText?: string;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = opts.title;

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.textContent = opts.body;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn modal-cancel';
    cancelBtn.textContent = opts.cancelText ?? '취소';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary modal-confirm';
    confirmBtn.textContent = opts.confirmText ?? '확인';
    actions.append(cancelBtn, confirmBtn);

    modal.append(title, body, actions);
    backdrop.appendChild(modal);

    const popEscape = pushEscapeHandler(() => done(false));
    const done = (value: boolean) => {
      popEscape();
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 180);
      resolve(value);
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(false);
    });
    cancelBtn.addEventListener('click', () => done(false));
    confirmBtn.addEventListener('click', () => done(true));

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));
    confirmBtn.focus();
  });
}
