import * as fs from 'fs';
import { CarriageClient } from '../net/carriage-client';

export function buildQrLoginHandlers() {
  let qrcode: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    qrcode = require('qrcode-terminal');
  } catch {
    qrcode = null;
  }

  const onQrUrl = (url: string) => {
    console.log('\n[QR] Scan this code in KakaoTalk > Settings > QR Login.\n');
    if (qrcode && typeof qrcode.generate === 'function') {
      qrcode.generate(url, { small: true }, (qr: string) => {
        console.log(qr);
      });
    }
    console.log(`  ${url}\n`);
  };

  const onPasscode = (passcode: string) => {
    if (!passcode) return;
    const digits = String(passcode).split('');
    const big: Record<string, string[]> = {
      '0': [' 000 ', '0   0', '0   0', '0   0', ' 000 '],
      '1': ['  1  ', ' 11  ', '  1  ', '  1  ', ' 111 '],
      '2': [' 222 ', '2   2', '  2  ', ' 2   ', '22222'],
      '3': ['3333 ', '    3', ' 333 ', '    3', '3333 '],
      '4': ['4   4', '4   4', '44444', '    4', '    4'],
      '5': ['55555', '5    ', '5555 ', '    5', '5555 '],
      '6': [' 666 ', '6    ', '6666 ', '6   6', ' 666 '],
      '7': ['77777', '   7 ', '  7  ', ' 7   ', ' 7   '],
      '8': [' 888 ', '8   8', ' 888 ', '8   8', ' 888 '],
      '9': [' 999 ', '9   9', ' 9999', '    9', ' 999 '],
    };

    process.stdout.write('\x1B[2J\x1B[H');
    console.log('\n[QR] Passcode:\n');
    for (let row = 0; row < 5; row += 1) {
      const line = digits.map((d) => (big[d] ? big[d][row] : '     ')).join('   ');
      console.log('      ' + line);
    }
    console.log('\nEnter this passcode on your phone.\n');
  };

  return { onQrUrl, onPasscode };
}

export async function streamEncryptedFile(
  client: CarriageClient,
  filePath: string,
  startOffset: number,
  totalSize: number,
  onProgress?: (sent: number, total: number) => void
) {
  const stream = fs.createReadStream(filePath, {
    start: startOffset > 0 ? startOffset : 0,
    highWaterMark: 64 * 1024,
  });
  let sent = startOffset > 0 ? startOffset : 0;
  for await (const chunk of stream) {
    await client.writeEncrypted(chunk as Buffer);
    sent += (chunk as Buffer).length;
    if (onProgress) onProgress(sent, totalSize);
  }
}
