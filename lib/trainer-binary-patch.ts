export interface BinaryMapping {
  offset_dec: number;
  encoding: 'UTF-16LE' | 'ASCII' | 'UTF-8';
  original_text: string;
  translated_text: string;
  max_char_len: number;
}

interface Range { start: number; end: number }

/** 파일 내용과 위치를 오류에 포함하지 않으며, 검증 실패 시 원본은 수정하지 않습니다. */
function reject(): never { throw new Error('안전한 패치 범위 또는 문자 인코딩을 확인할 수 없습니다.'); }
function range(start: number, length: number, limit: number): Range {
  const end = start + length;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || !Number.isSafeInteger(end) || end > limit) reject();
  return { start, end };
}
const intersects = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/** PE32/PE32+의 완전한 헤더와 모든 섹션의 파일 범위를 확인합니다. 오버레이 정책은 변경하지 않습니다. */
function protectedRanges(buffer: ArrayBuffer): Range[] {
  const view = new DataView(buffer);
  const size = buffer.byteLength;
  if (size < 64 || view.getUint16(0, true) !== 0x5a4d) reject();
  const pe = view.getUint32(0x3c, true);
  range(pe, 24, size);
  if (pe < 64 || view.getUint32(pe, true) !== 0x4550) reject();
  const count = view.getUint16(pe + 6, true);
  const optionalSize = view.getUint16(pe + 20, true);
  const optional = pe + 24;
  range(optional, optionalSize, size);
  if (optionalSize < 2 || count === 0) reject();
  const magic = view.getUint16(optional, true);
  const minimum = magic === 0x10b ? 96 : magic === 0x20b ? 112 : reject();
  if (optionalSize < minimum) reject();
  const directoryCount = view.getUint32(optional + minimum - 4, true);
  if (directoryCount > Math.floor((optionalSize - minimum) / 8)) reject();
  const table = optional + optionalSize;
  const tableRange = range(table, count * 40, size);
  const headers = view.getUint32(optional + 60, true);
  if (headers < tableRange.end || headers > size) reject();
  const protectedAreas: Range[] = [{ start: 0, end: headers }];
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < count; index++) {
    const entry = table + index * 40;
    const length = view.getUint32(entry + 16, true);
    const start = view.getUint32(entry + 20, true);
    const raw = range(start, length, size);
    if (length > 0 && start < headers) reject();
    let name = '';
    for (let n = 0; n < 8 && bytes[entry + n]; n++) name += String.fromCharCode(bytes[entry + n]);
    if ((view.getUint32(entry + 36, true) & 0x20000000) !== 0 || name === '.text') protectedAreas.push(raw);
  }
  return protectedAreas;
}

/** 잘못된 서로게이트와 ASCII 미지원 문자를 대체 문자로 바꾸지 않고 거절합니다. */
function encode(text: string, encoding: BinaryMapping['encoding']): Uint8Array {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (encoding === 'ASCII' && code > 127) reject();
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) reject();
    } else if (code >= 0xdc00 && code <= 0xdfff) reject();
  }
  if (encoding !== 'UTF-16LE') return new TextEncoder().encode(text);
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return bytes;
}

/** 모든 슬롯과 최종 바이트를 먼저 계획한 뒤 별도 복제본에 적용합니다. 길이 초과나 줄 손실은 허용하지 않습니다. */
export function patchTrainerBinary(buffer: ArrayBuffer, mappings: readonly BinaryMapping[]): Uint8Array<ArrayBuffer> {
  const protectedAreas = protectedRanges(buffer);
  if (!Array.isArray(mappings) || mappings.length === 0) reject();
  const slots: Range[] = [];
  // 큰 할당이나 문자열 패딩에 앞서 모든 슬롯의 정수·용량·경계를 검증합니다.
  for (const mapping of mappings) {
    if (!mapping || !['UTF-16LE', 'ASCII', 'UTF-8'].includes(mapping.encoding) || !Number.isSafeInteger(mapping.max_char_len) || mapping.max_char_len <= 0 || typeof mapping.original_text !== 'string' || typeof mapping.translated_text !== 'string') reject();
    const slot = range(mapping.offset_dec, mapping.max_char_len * (mapping.encoding === 'UTF-16LE' ? 2 : 1), buffer.byteLength);
    if (protectedAreas.some(area => intersects(slot, area)) || slots.some(other => intersects(slot, other))) reject();
    slots.push(slot);
  }
  const plans = mappings.map((mapping: BinaryMapping, index: number) => {
    const { encoding, original_text, translated_text } = mapping;
    let text = translated_text;
    if (original_text.includes('\n')) {
      const originalLines = original_text.split('\n');
      const translatedLines = translated_text.split('\n');
      if (translatedLines.length > originalLines.length) reject();
      text = originalLines.map((original, line) => {
        const translated = translatedLines[line] ?? '';
        const available = encode(original, encoding).length;
        const used = encode(translated, encoding).length;
        if (used > available) reject();
        // 기존 줄별 공백 맞춤 정책을 유지하되 잘라내기는 허용하지 않습니다.
        return translated + ' '.repeat((available - used) / (encoding === 'UTF-16LE' ? 2 : 1));
      }).join('\n');
    }
    const encoded = encode(text, encoding);
    const length = slots[index].end - slots[index].start;
    if (encoded.length > length) reject();
    const bytes = new Uint8Array(length);
    if (encoding === 'UTF-16LE') {
      for (let i = 0; i < length; i += 2) bytes[i] = 0x20;
    } else bytes.fill(0x20);
    bytes.set(encoded);
    if (encoded.length < length) {
      bytes[encoded.length] = 0;
      if (encoding === 'UTF-16LE') bytes[encoded.length + 1] = 0;
    }
    return bytes;
  });
  const output = new Uint8Array(buffer.slice(0));
  plans.forEach((bytes, index) => output.set(bytes, slots[index].start));
  return output;
}
