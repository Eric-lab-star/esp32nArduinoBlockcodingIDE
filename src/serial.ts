/**
 * 라즈베리파이 피코(MicroPython)와 Web Serial로 통신하는 계층.
 *
 * - 평상시(friendly REPL): 수신 데이터를 그대로 터미널로 전달하고,
 *   터미널 키 입력을 보드로 전달하는 패스스루로 동작한다.
 * - 코드 실행/파일 저장: MicroPython raw REPL 프로토콜(Ctrl-A … Ctrl-D)을 사용한다.
 *   프로토콜 참고: https://docs.micropython.org/en/latest/reference/repl.html
 */

const encoder = new TextEncoder();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunResult {
  output: string;
  error: string;
}

export class PicoSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();

  /** raw REPL 처리 중 수신 데이터를 모아두는 버퍼 (rawMode일 때만 사용) */
  private buffer = '';
  private rawMode = false;
  private waiters: Array<() => void> = [];

  busy = false;

  /** friendly REPL 수신 데이터(터미널 표시용) */
  onData: (text: string) => void = () => {};
  onStateChange: (connected: boolean) => void = () => {};

  get connected(): boolean {
    return this.port !== null;
  }

  static get supported(): boolean {
    return 'serial' in navigator;
  }

  async connect(): Promise<void> {
    if (!PicoSerial.supported) {
      throw new Error('이 브라우저는 Web Serial을 지원하지 않습니다. Chrome/Edge를 사용하세요.');
    }
    // 피코(RP2040/RP2350) USB CDC. 필터 없이 열어 다른 MicroPython 보드도 허용한다.
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.writer = port.writable!.getWriter();
    this.onStateChange(true);
    void this.readLoop();
    // 연결 직후 프롬프트를 띄워 사용자에게 REPL이 살아있음을 보여준다.
    await this.write('\r');
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    if (!port) return;
    this.port = null;
    try {
      await this.reader?.cancel();
    } catch {
      /* 이미 닫힘 */
    }
    await sleep(50); // readLoop가 락을 해제할 시간
    try {
      this.writer?.releaseLock();
    } catch {
      /* 이미 해제됨 */
    }
    this.writer = null;
    try {
      await port.close();
    } catch {
      /* 이미 닫힘 */
    }
    this.notify(); // 대기 중인 readUntil을 깨워 연결 끊김을 감지하게 한다
    this.onStateChange(false);
  }

  async write(data: string | Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('보드가 연결되어 있지 않습니다.');
    await this.writer.write(typeof data === 'string' ? encoder.encode(data) : data);
  }

  /** 실행 중인 프로그램 중단 (KeyboardInterrupt) */
  async interrupt(): Promise<void> {
    await this.write('\x03');
  }

  /**
   * 코드를 raw REPL로 실행한다. 표준 출력은 emit으로, 오류(traceback)는 emitErr로
   * 실시간 스트리밍된다. 프로그램이 끝나거나 인터럽트될 때까지 대기한다.
   */
  async run(
    code: string,
    emit?: (s: string) => void,
    emitErr?: (s: string) => void,
  ): Promise<RunResult> {
    if (!this.connected) throw new Error('보드가 연결되어 있지 않습니다.');
    if (this.busy) throw new Error('이미 코드를 실행 중입니다. 정지 후 다시 시도하세요.');

    this.busy = true;
    this.rawMode = true;
    this.buffer = '';
    try {
      // 실행 중일지 모르는 프로그램을 중단하고 raw REPL 진입
      await this.write('\r\x03');
      await sleep(80);
      await this.write('\x03');
      await sleep(80);
      this.buffer = '';
      await this.write('\x01');
      await this.readUntil('raw REPL; CTRL-B to exit', 3000);
      await this.readUntil('>', 1000);

      // 코드 전송: USB CDC 버퍼 오버플로를 피하기 위해 잘라서 보낸다
      const bytes = encoder.encode(code);
      for (let i = 0; i < bytes.length; i += 256) {
        await this.write(bytes.subarray(i, i + 256));
        await sleep(10);
      }
      await this.write('\x04'); // 실행 시작

      await this.readUntil('OK', 5000);
      const output = await this.readUntil('\x04', 0, emit); // 실행이 끝날 때까지 무제한 대기
      const error = await this.readUntil('\x04', 5000, emitErr);
      await this.readUntil('>', 2000).catch(() => {});
      return { output, error };
    } finally {
      try {
        await this.write('\x02'); // friendly REPL 복귀
      } catch {
        /* 연결이 끊겼을 수 있음 */
      }
      this.rawMode = false;
      this.buffer = '';
      this.busy = false;
    }
  }

  /**
   * 보드 파일시스템에 파일을 저장한다.
   * 임의의 코드(따옴표·개행 포함)를 안전하게 넣기 위해 base64로 전송한다.
   */
  async saveFile(path: string, content: string): Promise<void> {
    const b64 = toBase64(encoder.encode(content));
    const lines = ['import binascii', `_f = open(${JSON.stringify(path)}, 'wb')`];
    for (let i = 0; i < b64.length; i += 3000) {
      lines.push(`_f.write(binascii.a2b_base64('${b64.slice(i, i + 3000)}'))`);
    }
    lines.push('_f.close()');
    const { error } = await this.run(lines.join('\n'));
    if (error.trim()) throw new Error(`저장 실패: ${error.trim()}`);
  }

  // ---------- 내부 구현 ----------

  private async readLoop(): Promise<void> {
    while (this.port?.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (!value) continue;
          const text = this.decoder.decode(value, { stream: true });
          if (this.rawMode) {
            this.buffer += text;
            this.notify();
          } else {
            this.onData(text);
          }
        }
      } catch {
        break; // USB 분리 등
      } finally {
        try {
          this.reader?.releaseLock();
        } catch {
          /* noop */
        }
        this.reader = null;
      }
    }
    // 케이블 분리 등으로 스트림이 끝난 경우 정리
    if (this.port) void this.disconnect();
  }

  private notify(): void {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  private waitData(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onData = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.waiters = this.waiters.filter((w) => w !== onData);
              reject(new Error('보드 응답 시간 초과'));
            }, timeoutMs)
          : null;
      this.waiters.push(onData);
    });
  }

  /**
   * 수신 버퍼에서 marker가 나올 때까지 읽는다. timeoutMs가 0이면 무제한 대기.
   * emit이 주어지면 marker 이전의 데이터를 도착하는 대로 스트리밍한다.
   */
  private async readUntil(
    marker: string,
    timeoutMs: number,
    emit?: (s: string) => void,
  ): Promise<string> {
    let out = '';
    for (;;) {
      if (!this.port) throw new Error('보드 연결이 끊어졌습니다.');
      const idx = this.buffer.indexOf(marker);
      if (idx >= 0) {
        const chunk = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + marker.length);
        if (chunk) emit?.(chunk);
        return out + chunk;
      }
      // marker가 여러 글자면 청크 경계에 걸칠 수 있으므로 스트리밍하지 않고 모은다
      if (emit && marker.length === 1 && this.buffer) {
        emit(this.buffer);
        out += this.buffer;
        this.buffer = '';
      }
      await this.waitData(timeoutMs);
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
