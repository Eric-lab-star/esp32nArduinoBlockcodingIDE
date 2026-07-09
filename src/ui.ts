/** 토스트 알림과 확인 모달 — 브라우저 기본 alert/confirm 대체 */

export type ToastType = 'info' | 'success' | 'error';

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

    const done = (value: boolean) => {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 180);
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
    };
    document.addEventListener('keydown', onKey);
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
