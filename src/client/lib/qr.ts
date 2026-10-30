import qrcode from 'qrcode-generator';

/** The QR modules for a text: true = dark square. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** One SVG path for all dark squares: crisp at any size, drawn as data, never HTML. */
export function qrPath(modules: boolean[][]): string {
  return modules
    .flatMap((row, r) => row.map((dark, c) => (dark ? `M${String(c)} ${String(r)}h1v1h-1z` : '')))
    .join('');
}
