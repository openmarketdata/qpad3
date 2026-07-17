import { Buffer } from 'buffer';

// ---------------------------------------------------------------------------
// IPC — q binary protocol codec
// ---------------------------------------------------------------------------

const SHORT_NULL = -32768;
const SHORT_POSITIVE_INFINITY = 32767;
const SHORT_NEGATIVE_INFINITY = -32767;
const INT_NULL = -2147483648;
const INT_POSITIVE_INFINITY = 2147483647;
const INT_NEGATIVE_INFINITY = -2147483647;
const LONG_NULL = -9223372036854775808n;
const LONG_POSITIVE_INFINITY = 9223372036854775807n;
const LONG_NEGATIVE_INFINITY = -9223372036854775807n;
const MS_DIFF = 946684800000;
const MS_PER_DAY = 86400000;
const K_TYPE_CHAR = ' bg xhijefcspmdznuvt';

const SIZE_BY_K_TYPE = {
  1: 1, 2: 16, 4: 1, 5: 2, 6: 4, 7: 8, 8: 4, 9: 8, 10: 1,
  12: 8, 13: 4, 14: 4, 15: 8, 16: 8, 17: 4, 18: 4, 19: 4, 101: 1,
};

const K101 = {
  0: null, 1: '+:', 2: '-:', 3: '*:', 4: '%:', 5: '&:', 6: '|:', 7: '^:', 8: '=:',
  9: '<:', 10: '>:', 11: '$:', 12: ',:', 13: '#:', 14: '_:', 15: '~:', 16: '!:',
  17: '?:', 18: '@:', 19: '.:', 20: '0::', 21: '1::', 22: '2::', 23: 'avg',
  24: 'last', 25: 'sum', 26: 'prd', 27: 'min', 28: 'max', 29: 'exit',
  30: 'getenv', 31: 'abs', 32: 'sqrt', 33: 'log', 34: 'exp', 35: 'sin',
  36: 'asin', 37: 'cos', 38: 'acos', 39: 'tan', 40: 'atan', 41: 'enlist',
  42: 'var', 43: 'dev', 44: 'hopen', 255: '::',
};

const K102 = {
  0: ':', 1: '+', 2: '-', 3: '*', 4: '%', 5: '&', 6: '|', 7: '^', 8: '=',
  9: '<', 10: '>', 11: '$', 12: ',', 13: '#', 14: '_', 15: '~', 16: '!',
  17: '?', 18: '@', 19: '.', 20: '0:', 21: '1:', 22: '2:', 23: 'in',
  24: 'within', 25: 'like', 26: 'bin', 27: 'ss', 28: 'insert', 29: 'wsum',
  30: 'wavg', 31: 'div', 32: 'xexp', 33: 'setenv', 34: 'binr', 35: 'cov', 36: 'cor',
};

const K103 = { 0: '\'', 1: '/', 2: '\\', 3: '\':', 4: '/:', 5: '\\:' };

function decompress(cMsg) {
  const oLen = cMsg.readInt32LE(8);
  const msg = Buffer.alloc(oLen);
  cMsg.copy(msg, 0, 0, 4);
  msg[2] = 0;
  cMsg.copy(msg, 4, 8, 12);
  let cPos = 12, oPos = 8, xPos = oPos, n = 0, s = 0, r = 0, i = 0, j = 0;
  const x = new Int32Array(256);
  while (oPos < oLen) {
    if (i === 0) { n = cMsg[cPos++]; i = 1; }
    r = 0;
    if (n & i) {
      s = x[cMsg[cPos++]];
      r = cMsg[cPos++];
      for (j = 0; j < r + 2; j++) msg[oPos + j] = msg[s + j];
      oPos += 2;
    } else {
      msg[oPos++] = cMsg[cPos++];
    }
    while (xPos < (oPos - 1)) x[msg[xPos] ^ msg[xPos + 1]] = xPos++;
    if (n & i) xPos = (oPos += r);
    i *= 2;
    if (i === 256) i = 0;
  }
  return msg;
}

function bigintToTimespan(ns) {
  if (!Number.isNaN(ns)) {
    const sign = ns < 0n ? '-' : '';
    if (ns < 0n) ns = -1n * ns;
    const second = ns / 1000000000n;
    return `${sign}${ns / 86400000000000n}D${String(second / 3600n % 24n).padStart(2, '0')}:${String(second / 60n % 60n).padStart(2, '0')}:${String(second % 60n).padStart(2, '0')}.${String(ns % 1000000000n).padStart(9, '0')}`;
  }
  return null;
}

function intToTemporal(unit, kType) {
  if (!Number.isFinite(unit)) return null;
  let yyyy, MM, hh, mm, ss, SSS;
  const sign = unit < 0 ? '-' : '';
  const absUnit = Math.abs(unit);
  switch (kType) {
    case 243: case 13:
      yyyy = 2000 + (unit / 12) >>> 0;
      MM = unit % 12;
      return `${yyyy}.${String(MM + (MM < 0 ? 13 : 1)).padStart(2, '0')}m`;
    case 239: case 17:
      hh = (absUnit / 60) >>> 0; mm = absUnit % 60;
      return sign + [hh, mm].map(v => String(v).padStart(2, '0')).join(':');
    case 238: case 18:
      hh = (absUnit / 3600) >>> 0; mm = (absUnit / 60) % 60 >>> 0; ss = absUnit % 60;
      return sign + [hh, mm, ss].map(v => String(v).padStart(2, '0')).join(':');
    case 237: case 19:
      hh = (absUnit / 3600000) >>> 0; mm = (absUnit / 60000) % 60 >>> 0;
      ss = absUnit / 1000 % 60 >>> 0; SSS = absUnit % 1000;
      return sign + [hh, mm, ss].map(v => String(v).padStart(2, '0')).join(':') + '.' + String(SSS).padStart(3, '0');
    default:
      throw new Error('FAILED_TO_CAST_TO_TEMPORAL_STRING - ' + kType);
  }
}

function convertI16(i16) {
  if (i16 === SHORT_NULL) return NaN;
  if (i16 === SHORT_POSITIVE_INFINITY) return Infinity;
  if (i16 === SHORT_NEGATIVE_INFINITY) return -Infinity;
  return i16;
}

function convertI32(i32) {
  if (i32 === INT_NULL) return NaN;
  if (i32 === INT_POSITIVE_INFINITY) return Infinity;
  if (i32 === INT_NEGATIVE_INFINITY) return -Infinity;
  return i32;
}

function convertBigI64(bigI64) {
  if (bigI64 === LONG_NULL) return NaN;
  if (bigI64 === LONG_POSITIVE_INFINITY) return Infinity;
  if (bigI64 === LONG_NEGATIVE_INFINITY) return -Infinity;
  return bigI64;
}

function deserialize(buffer, useBigInt = false, includeNanosecond = false, dateToMillisecond = false) {
  if (buffer instanceof ArrayBuffer) buffer = Buffer.from(buffer);
  let offset = 8;

  const readAtomByKType = (kType, useBigInt = false) => {
    switch (kType) {
      case 255: return buffer[offset++] === 1;
      case 254: { const guid = buffer.subarray(offset, offset + 16).toString('hex'); offset += 16; return guid; }
      case 252: return buffer[offset++];
      case 251: { const i16 = buffer.readInt16LE(offset); offset += 2; return convertI16(i16); }
      case 250: { const i32 = buffer.readInt32LE(offset); offset += 4; return convertI32(i32); }
      case 249: { const bigI64 = convertBigI64(buffer.readBigInt64LE(offset)); offset += 8; return useBigInt ? bigI64 : Number(bigI64); }
      case 248: { const real = buffer.readFloatLE(offset); offset += 4; return real; }
      case 247: { const float = buffer.readDoubleLE(offset); offset += 8; return float; }
      case 246: return String.fromCharCode(buffer[offset++]);
      case 245: { const end = buffer.indexOf(0, offset); const sym = buffer.subarray(offset, end).toString(); offset = end + 1; return sym; }
      case 244: {
        const ns = readAtomByKType(249, true);
        if (typeof ns === 'bigint') {
          const date = new Date(Number(ns / 1000000n) + MS_DIFF);
          return includeNanosecond ? date.toISOString().slice(0, -1) + String(ns % 1000000n).padStart(6, '0') : date;
        }
        return includeNanosecond ? '' : null;
      }
      case 243: { const month = readAtomByKType(250); return intToTemporal(month, 243); }
      case 242: { const ms = MS_DIFF + readAtomByKType(250) * MS_PER_DAY; return dateToMillisecond ? ms : Number.isFinite(ms) ? new Date(ms) : null; }
      case 241: { const ms = MS_DIFF + readAtomByKType(247) * MS_PER_DAY; return dateToMillisecond ? ms : Number.isFinite(ms) ? new Date(ms) : null; }
      case 240: { const ns = readAtomByKType(249, true); return typeof ns === 'bigint' ? bigintToTimespan(ns) : null; }
      case 239: { const minute = readAtomByKType(250); return intToTemporal(minute, 239); }
      case 238: { const second = readAtomByKType(250); return intToTemporal(second, 238); }
      case 237: { const ms = readAtomByKType(250); return intToTemporal(ms, 237); }
    }
  };

  const readArray = kType => {
    offset++; // skip attribute
    const n = readAtomByKType(250);
    if (kType === 10) {
      const str = buffer.subarray(offset, offset + n).toString();
      offset += n;
      return str;
    }
    const array = new Array(n);
    let i = 0;
    if (kType === 0) {
      for (i = 0; i < n; i++) array[i] = read();
      return array;
    } else if (kType === 11) {
      for (i = 0; i < n; i++) array[i] = readAtomByKType(245);
      return array;
    } else if (kType === 2) {
      for (i = 0; i < n; i++) array[i] = buffer.subarray(offset + i * 16, offset + (i + 1) * 16).toString('hex');
      offset += 16 * n;
      return array;
    }
    const dv = new DataView(buffer.buffer, offset + buffer.offset, SIZE_BY_K_TYPE[kType] * n);
    const size = SIZE_BY_K_TYPE[kType];
    offset += n * size;
    i = 0;
    switch (kType) {
      case 1: for (i = 0; i < n; i++) array[i] = dv.getUint8(i) === 1; return array;
      case 4: for (i = 0; i < n; i++) array[i] = dv.getUint8(i); return array;
      case 5: for (i = 0; i < n; i++) array[i] = convertI16(dv.getInt16(i * size, true)); return array;
      case 6: for (i = 0; i < n; i++) array[i] = convertI32(dv.getInt32(i * size, true)); return array;
      case 7:
        if (useBigInt) { for (i = 0; i < n; i++) array[i] = convertBigI64(dv.getBigInt64(i * size, true)); }
        else { for (i = 0; i < n; i++) array[i] = Number(convertBigI64(dv.getBigInt64(i * size, true))); }
        return array;
      case 8: for (i = 0; i < n; i++) array[i] = dv.getFloat32(i * size, true); return array;
      case 9: for (i = 0; i < n; i++) array[i] = dv.getFloat64(i * size, true); return array;
      case 12:
        for (i = 0; i < n; i++) {
          const ns = dv.getBigInt64(i * size, true);
          if (ns === LONG_NULL || ns === LONG_POSITIVE_INFINITY || ns === LONG_NEGATIVE_INFINITY) { array[i] = includeNanosecond ? '' : null; }
          else { const date = new Date(Number(ns / 1000000n) + MS_DIFF); array[i] = includeNanosecond ? date.toISOString().slice(0, -1) + String(ns % 1000000n).padStart(6, '0') : date; }
        }
        return array;
      case 13: case 17: case 18: case 19:
        for (i = 0; i < n; i++) { const unit = convertI32(dv.getInt32(i * size, true)); array[i] = Number.isFinite(unit) ? intToTemporal(unit, kType) : null; }
        return array;
      case 14:
        for (i = 0; i < n; i++) { const ms = MS_DIFF + convertI32(dv.getInt32(i * size, true)) * MS_PER_DAY; array[i] = dateToMillisecond ? ms : Number.isFinite(ms) ? new Date(ms) : null; }
        return array;
      case 15:
        for (i = 0; i < n; i++) { const ms = MS_DIFF + dv.getFloat64(i * size, true) * MS_PER_DAY; array[i] = dateToMillisecond ? ms : Number.isFinite(ms) ? new Date(ms) : null; }
        return array;
      case 16:
        for (i = 0; i < n; i++) { const ns = dv.getBigInt64(i * size, true); array[i] = (ns === LONG_NULL || ns === LONG_POSITIVE_INFINITY || ns === LONG_NEGATIVE_INFINITY) ? null : bigintToTimespan(ns); }
        return array;
      default: throw new Error('UNSUPPORTED_K_LIST - ' + kType);
    }
  };

  const read = (flipTable = false) => {
    const kType = buffer[offset++];
    if (kType === 128) throw new Error(readAtomByKType(245));
    if (237 <= kType && kType <= 255) return readAtomByKType(kType, useBigInt);
    if (0 <= kType && kType <= 19) {
      const array = readArray(kType);
      if (Array.isArray(array)) array[Symbol.for('kType')] = K_TYPE_CHAR[kType];
      return array;
    }
    if (kType === 99) {
      const isKeyTable = buffer[offset] === 98;
      const k = read();
      const v = k[Symbol.for('meta')] ? read() : read(flipTable = true);
      if (isKeyTable) {
        for (const [key, value] of Object.entries(v)) k[key] = value;
        const meta = k[Symbol.for('meta')];
        k[Symbol.for('keys')] = meta.c.slice();
        const vMeta = v[Symbol.for('meta')];
        meta.c.push(...vMeta.c);
        meta.t.push(...vMeta.t);
        k[Symbol.for('meta')] = meta;
        return k;
      } else {
        const dict = {};
        k.forEach((k, i) => dict[k] = v[i]);
        return dict;
      }
    }
    if (kType === 98) {
      offset += 3;
      const column = readArray(11);
      offset += 6;
      const meta = { c: column, t: [] };
      const table = {};
      column.forEach(c => {
        const kType = buffer[offset++];
        table[c] = readArray(kType);
        meta.t.push(K_TYPE_CHAR[kType]);
      });
      table[Symbol.for('meta')] = meta;
      if (flipTable) {
        const rows = new Array(table[meta.c[0]].length);
        table[meta.c[0]].forEach((_v, i) => {
          const row = {};
          meta.c.forEach(col => row[col] = table[col][i]);
          rows[i] = row;
        });
        return rows;
      }
      return table;
    }
    if (kType === 100) { if (buffer[offset++] > 0) offset++; offset++; return readArray(10); }
    if (kType === 101) return K101[buffer[offset++]];
    if (kType === 102) return K102[buffer[offset++]];
    if (kType === 103) return K103[buffer[offset++]];
    if (kType === 104) { offset--; return readArray(0); }
    throw new Error('UNSUPPORTED_K_TYPE[read] - ' + kType);
  };

  if (buffer[2] === 1) buffer = decompress(buffer);
  return read();
}

function getKType(x) {
  if (x === null || x === undefined) return 101;
  if (x instanceof Date) return 244;
  if (Array.isArray(x)) {
    const kTypeChar = x[Symbol.for('kType')];
    const kType = kTypeChar ? K_TYPE_CHAR.indexOf(kTypeChar) : 0;
    return kType > 0 ? kType : 0;
  }
  switch (typeof x) {
    case 'number': return 247;
    case 'boolean': return 255;
    case 'string': return 10;
    case 'object': return x[Symbol.for('meta')] ? 98 : 99;
  }
}

function calcMsgLength(obj, kType = null) {
  kType = kType ?? getKType(obj);
  if (kType !== 10 && kType < 20 && !Array.isArray(obj)) throw new Error('NOT_AN_ARRAY[calcMsgLength]');
  switch (kType) {
    case 101: return 1 + SIZE_BY_K_TYPE[kType];
    case 244: case 246: case 247: case 255: return 1 + SIZE_BY_K_TYPE[256 - kType];
    case 98: {
      let length = 3;
      const meta = obj[Symbol.for('meta')];
      const column = meta.c;
      length += calcMsgLength(column, 11);
      const size = obj[column[0]].length;
      length += 6;
      column.forEach((c, i) => {
        if (size !== obj[c].length) throw new Error('NOT_SAME_SIZE_COLUMN - ' + c);
        let t = K_TYPE_CHAR.indexOf(meta.t[i]);
        t = t > 0 ? t : 0;
        length += calcMsgLength(obj[c], t);
      });
      return length;
    }
    case 99: { const k = Object.keys(obj); const v = Object.values(obj); return 1 + calcMsgLength(k, 11) + calcMsgLength(v); }
    case 0: { let length = 6; obj.forEach(item => length += calcMsgLength(item)); return length; }
    case 11: { let length = 6; obj.forEach(item => length += item.length + 1); return length; }
    case 10: return 6 + Buffer.byteLength(obj, 'utf8');
    case 1: case 2: case 6: case 7: case 9: case 12: case 14: case 15:
      return 6 + SIZE_BY_K_TYPE[kType] * obj.length;
    default: throw new Error('UNSUPPORTED_K_TYPE[calcMsgLength] - ' + kType);
  }
}

function serialize(obj) {
  let offset = 8;
  const msgLength = calcMsgLength(obj, null);
  const buffer = Buffer.alloc(8 + msgLength);
  buffer[0] = 1;
  buffer.writeUInt32LE(msgLength + 8, 4);

  const write = (obj) => {
    const kType = getKType(obj);
    buffer[offset++] = kType;
    switch (kType) {
      case 101: buffer[offset++] = 0; break;
      case 244: { const i64 = BigInt(obj.getTime() - MS_DIFF) * 1000000n; buffer.writeBigInt64LE(i64, offset); offset += 8; } break;
      case 247: buffer.writeDoubleLE(obj, offset); offset += 8; break;
      case 255: buffer[offset++] = obj ? 1 : 0; break;
      case 98: {
        buffer[offset++] = 0; buffer[offset++] = 99;
        const meta = obj[Symbol.for('meta')];
        const column = meta.c;
        buffer[offset++] = 11;
        writeArray(Object.keys(obj), 11);
        buffer[offset++] = 0; buffer[offset++] = 0;
        buffer.writeUInt32LE(column.length, offset); offset += 4;
        column.forEach((c, i) => {
          let t = K_TYPE_CHAR.indexOf(meta.t[i]);
          t = t > 0 ? t : 0;
          buffer[offset++] = t;
          writeArray(obj[c], t);
        });
      } break;
      case 99: {
        const k = Object.keys(obj); const v = Object.values(obj);
        buffer[offset++] = 11; writeArray(k, 11); buffer[offset++] = 0; writeArray(v, 0);
      } break;
      case 0: case 1: case 2: case 6: case 7: case 9: case 10: case 11: case 12: case 14: case 15:
        writeArray(obj, kType);
    }
  };

  const writeArray = (obj, kType = 0) => {
    buffer[offset++] = 0; // attribute
    if (kType === 10) {
      const length = buffer.write(obj, offset + 4);
      buffer.writeUInt32LE(length, offset); offset += 4 + length;
    } else {
      buffer.writeUInt32LE(obj.length, offset); offset += 4;
    }
    switch (kType) {
      case 0: obj.forEach(o => write(o)); break;
      case 1: obj.forEach(b => buffer[offset++] = b ? 1 : 0); break;
      case 2: obj.forEach(g => { Buffer.from(g, 'hex').copy(buffer, offset); offset += 16; }); break;
      case 6:
        obj.forEach(i => {
          buffer.writeInt32LE(i === Infinity ? INT_POSITIVE_INFINITY : i === -Infinity ? INT_NEGATIVE_INFINITY : i || INT_NULL, offset);
          offset += 4;
        }); break;
      case 7:
        obj.forEach(l => {
          if (l) {
            if (l === Infinity) buffer.writeBigInt64LE(LONG_POSITIVE_INFINITY, offset);
            else if (l === -Infinity) buffer.writeBigInt64LE(LONG_NEGATIVE_INFINITY, offset);
            else buffer.writeBigInt64LE(typeof l === 'bigint' ? l : BigInt(l), offset);
          } else { buffer.writeBigInt64LE(LONG_NULL, offset); }
          offset += 8;
        }); break;
      case 9: obj.forEach(f => { buffer.writeDoubleLE(f, offset); offset += 8; }); break;
      case 11: obj.forEach(s => { buffer.write(s, offset); offset += s.length; buffer[offset++] = 0; }); break;
      case 12:
        obj.forEach(d => {
          buffer.writeBigInt64LE(d ? 1000000n * BigInt(d.getTime() - MS_DIFF) : LONG_NULL, offset);
          offset += 8;
        }); break;
      case 14:
        obj.forEach(d => {
          buffer.writeInt32LE(d ? (d.getTime() - MS_DIFF) / MS_PER_DAY : INT_NULL, offset);
          offset += 4;
        }); break;
      case 15:
        obj.forEach(d => {
          buffer.writeDoubleLE(d ? (d.getTime() - MS_DIFF) / MS_PER_DAY : NaN, offset);
          offset += 8;
        }); break;
    }
  };

  write(obj);
  return buffer;
}

//const ACK = Buffer.from('010200000a0000006500', 'hex');

// ---------------------------------------------------------------------------
// QWebSocket — WebSocket lifecycle, HTTP handshake, message dispatch
// ---------------------------------------------------------------------------

class QWebSocket {
  constructor(options = {}) {
    const address = window.location.hostname + (window.location.port.toString() === '' ? '' : ':' + window.location.port);
    this.url = 'http://' + address;
    this.uri = 'ws://' + address + '?encoding=text';
    this.connection = null;
    this.viewer = null; // viewer reference, set via setViewer()
    this.registry = new Map(); // public registry for remote functions
  }
  #registry = new Map(); // internal registry for message handlers
  /**
   * Attach a viewer instance (must have .disp, .setOpacity, .clear)
   * @param {object} viewer
   */
  setViewer(viewer) {
    this.viewer = viewer;
  }

  setGrid(grid) {
    this.grid = grid;
  }

  setFs(fs) {
    this.fs = fs;
  }

  // Send a q command without echoing it into the REPL viewer. Used by the
  // file explorer to invoke the server-side `.ws.ls` / `.ws.get` / `.ws.put`
  // functions, whose results stream back as `fs.*` frames.
  fsCmd(qcode) {
    this.send(this.serialize(qcode));
  }

  register(name,fn) {
    this.registry.set(name,fn);
  }

  #resolve(name) {
    const fn = this.registry.get(name);
    //if (!fn) throw new Error(`Unknown remote function: ${name}`);
    return fn;
  }

  connect() {
    if (window.MozWebSocket) window.WebSocket = window.MozWebSocket;
    else if (!window.WebSocket) throw new Error('This browser does not have support for WebSocket');

    // hex-encoded q expression for .z.ws — decode with: -9!0x<hex>
    const zws = '0x010000004901000064000a00390100007b5b785d2e77732e6275663a2d3921783b683a6e65675b2e7a2e775d3b723a405b76616c75653b2e77732e6275663b7b5b683b785d2068202d3821283a3a3b28607669657765723b28223d3e223b2227222c782929293b685b5d3b27787d5b685d5d3b633a73797374656d2263223b69665b3130683d7479706520723b68202d3821283a3a3b28607669657765723b28223d3e223b245b635b315d3c636f756e745b725d3b225c22222c2828635b315d2d34292372292c222e2e5c22223b725d2929293b3a685b5d5d3b733a2e512e735b725d3b69665b303d636f756e745b732065786365707420225c6e225d3b68202d3821283a3a3b28607669657765723b28223d3e223b2d3321722929293b3a685b5d5d3b68202d3821283a3a3b28607669657765723b28223d3e223b2d315f732929293b3a685b5d7d';
    // {[x].ws.buf:-9!x;h:neg[.z.w];r:@[value;.ws.buf;{[h;x] h -8!(::;(`viewer;("=>";"'",x)));h[];'x}[h]];c:system"c";if[10h=type r;h -8!(::;(`viewer;("=>";$[c[1]<count[r];"\"",((c[1]-4)#r),"..\"";r])));:h[]];s:.Q.s[r];if[0=count[s except "\n"];h -8!(::;(`viewer;("=>";-3!r)));:h[]];h -8!(::;(`viewer;("=>";-1_s)));:h[]}

    fetch(new URL(this.url + '/?(-8!.z.ws)~' + zws))
      .then(res => {
        if (res.status === 400) throw '400';
        return res.text();
      })
      .then(txt => {
        const doc = document.createRange().createContextualFragment(txt);
        this.debug = doc;
        if (doc.querySelector('pre').innerText.replace(/[^\x20-\x7E]/g, '') === '1b') { this.onConnect(); return; }
        if (confirm('WebSocket handle .z.ws is already set by others.\n\nClick [Ok] to overwrite and continue.\n[Cancel] to check .z.ws definition.')) {
          throw 'overwrite';
        } else {
          window.location.replace(new URL(this.url + '/.z.ws'));
        }
      })
      .catch(() => {
        fetch(new URL(this.url + '?.z.ws:-9!' + zws))
          .then(res => {
            if (res.status === 200) this.onConnect();
            else throw new Error('fail to set .z.ws');
          })
          .catch(alert);
      });
  }

  onConnect() {
    const websocket = new WebSocket(this.uri);
    websocket.binaryType = 'arraybuffer';
    // Register callable functions at init time
    this.register('viewer',(...args) => this.viewer.disp(...args));
    this.register('cm.clear', () => this.viewer.clear());
    //this.register('cm.setOpacity', (n)       => this.viewer.setOpacity(n));
    this.register('grid', (...args)    => this.grid.update(...args));
    this.register('grida', (...args)   => this.grid.append(...args));
    this.register('fs.list',  (...args) => this.fs && this.fs.list(...args));
    this.register('fs.open',  (...args) => this.fs && this.fs.open(...args));
    this.register('fs.saved', (...args) => this.fs && this.fs.saved(...args));
    this.register('fs.error', (...args) => this.fs && this.fs.error(...args));
    this.connection = websocket;
    this.connection.onopen    = evt => this.onOpen(evt);
    this.connection.onmessage = evt => this.onMessage(evt);
    this.connection.onerror   = evt => this.onError(evt);
    this.connection.onclose   = evt => this.onClose(evt);
  }

  onOpen(evt) {
    // hex-encoded q grid formatter function — decode with: -9!0x<hex>
    //const wsgrid  = '0x01000000b201000064000a00a20100007b683a6e65675b2e7a2e775d3b703a747970655b785d3b245b703d39393b743a666c69702028606b65796076616c75652921286b657920783b76616c75652078293b702077697468696e20302032303b743a666c6970202860696e6465786076616c756529212874696c20636f756e7420783b78293b703d39383b743a783b272274797065206e6f7420737570706f72746564206279206772696420646973706c6179225d3b68202d3821283a3a3b286075692e7570646174655f7764723b2872617a65207b743a245b785b60745d3d226d223b602422737472696e67223b785b60745d3d2264223b6024226461746520737472696e67223b785b60745d20696e20226e757674223b6074696d653b785b60745d20696e2022707a223b606461746574696d653b785b60745d20696e202268696a6566223b606e756d6265723b60737472696e675d3b28656e6c69737420785b60635d292128656e6c6973742028656e6c697374206074797065292128656e6c697374207429297d656163682030216d65746120743b666c69702076616c756520666c697020742929293b685b5d7d';
    const wsgrid = '0x010000001001000064000a00000100007b5b785d0a2020683a6e65675b2e7a2e775d3b703a747970655b785d3b0a2020245b703d39393b743a666c69702028606b65796076616c75652921286b657920783b76616c75652078293b0a20202020702077697468696e20302032303b743a666c6970202860696e6465786076616c756529212874696c20636f756e7420783b78293b0a20202020703d39383b743a783b0a20202020272274797065206e6f7420737570706f72746564206279206772696420646973706c6179225d3b0a20202e77732e67736368656d613a65786563206321742066726f6d206d65746120743b0a202068202d3821283a3a3b2860677269643b7429293b0a2020685b5d7d';
    const wsgrida = '0x01000000ed00000064000a00dd0000007b5b785d0a2020683a6e65675b2e7a2e775d3b703a747970655b785d3b0a2020245b703d39393b743a666c69702028606b65796076616c75652921286b657920783b76616c75652078293b0a20202020702077697468696e20302032303b743a666c6970202860696e6465786076616c756529212874696c20636f756e7420783b78293b0a20202020703d39383b743a783b0a20202020272274797065206e6f7420737570706f72746564206279206772696420646973706c6179225d3b0a202068202d3821283a3a3b286067726964613b7429293b0a2020685b5d7d';
    const wsclear = '0x010000003a00000064000a002a0000007b683a6e65675b2e7a2e775d3b68202d3821283a3a3b2860636d2e636c6561723b282929293b685b5d7d';
    // hex-encoded q file-system functions, locked to <.ws.wwwroot>/opt.
    // .ws.fsroot: {(@[value;`.ws.wwwroot;""]),"opt/"}
    const fsroot = '0x010000002d00000064000a001d0000007b2e7a2e7379732e765b6051484f4d455d2c222f2e2e2f6f70742f227d';
    // .ws.fssafe: {[rp] not any {x~".."} each "/" vs rp}
    const fssafe = '0x010000003600000064000a00260000007b5b72705d206e6f7420616e79207b787e222e2e227d206561636820222f222076732072707d';
    // .ws.ls: list a directory, push (`fs.list;(rp;names;isdir;sizes))
    const wsls = '0x01000000e301000064000a00d30100007b5b72705d0a2020683a6e65675b2e7a2e775d3b0a202072703a245b3130683d747970652072703b72703b737472696e672072705d3b0a202069665b6e6f74202e77732e6673736166652072703b2068202d3821283a3a3b286066732e6572726f723b22696c6c6567616c20706174682229293b203a685b5d5d3b0a2020643a2e77732e6673726f6f745b5d2c72703b0a202069665b28303c636f756e7420727029616e64206e6f7420222f223d6c61737420643b20643a642c222f225d3b0a20206e733a6b6579206873796d6024643b0a202069665b6e6f74203131683d74797065206e733b2068202d3821283a3a3b286066732e6572726f723b226e6f742061206469726563746f72792229293b203a685b5d5d3b0a202066756c6c3a7b782c737472696e6720797d5b645d2065616368206e733b0a202069736469723a7b3131683d74797065206b6579206873796d6024787d20656163682066756c6c3b0a2020737a3a7b245b3131683d74797065206b6579206873796d6024783b303b68636f756e74206873796d6024785d7d20656163682066756c6c3b0a202068202d3821283a3a3b286066732e6c6973743b2872703b737472696e67206e733b69736469723b737a2929293b0a2020685b5d7d';
    // .ws.get: read a file, push (`fs.open;(rp;content))
    const wsget = '0x010000006901000064000a00590100007b5b72705d0a2020683a6e65675b2e7a2e775d3b0a202072703a245b3130683d747970652072703b72703b737472696e672072705d3b0a202069665b6e6f74202e77732e6673736166652072703b2068202d3821283a3a3b286066732e6572726f723b22696c6c6567616c20706174682229293b203a685b5d5d3b0a2020703a2e77732e6673726f6f745b5d2c72703b0a202069665b3131683d74797065206b6579206873796d6024703b2068202d3821283a3a3b286066732e6572726f723b2269732061206469726563746f72792229293b203a685b5d5d3b0a202069665b6e6f7420636f756e74206b6579206873796d6024703b2068202d3821283a3a3b286066732e6572726f723b226e6f20737563682066696c652229293b203a685b5d5d3b0a202068202d3821283a3a3b286066732e6f70656e3b2872703b226322247265616431206873796d6024702929293b0a2020685b5d7d';
    // .ws.put: write a file, push (`fs.saved;rp) or (`fs.error;msg)
    const wsput = '0x010000002f01000064000a001f0100007b5b72703b636f6e74656e745d0a2020683a6e65675b2e7a2e775d3b0a202072703a245b3130683d747970652072703b72703b737472696e672072705d3b0a202069665b6e6f74202e77732e6673736166652072703b2068202d3821283a3a3b286066732e6572726f723b22696c6c6567616c20706174682229293b203a685b5d5d3b0a2020703a2e77732e6673726f6f745b5d2c72703b0a20206f6b3a2e5b7b6873796d5b6024785d20313a2022632224793b2031627d3b28703b636f6e74656e74293b7b5b655d2030627d5d3b0a2020245b6f6b3b2068202d3821283a3a3b286066732e73617665643b727029293b2068202d3821283a3a3b286066732e6572726f723b227772697465206661696c65642229295d3b0a2020685b5d7d';
    console.info('Connected, initializing');
    evt.currentTarget.send(this.serialize('.ws.gschema:(::);.ws.grid:-9!' + wsgrid + ';.ws.grida:-9!' + wsgrida + ';.ws.clear:-9!' + wsclear
      + ';.ws.fsroot:-9!' + fsroot + ';.ws.fssafe:-9!' + fssafe
      + ';.ws.ls:-9!' + wsls + ';.ws.get:-9!' + wsget + ';.ws.put:-9!' + wsput));
  }

  onClose(evt) {
    alert('Disconnected, code ' + evt.code);
  }

  onError(evt) {
    alert(evt.data);
  }

  onMessage(evt) {
    const msg = evt.data;
    if (!msg) return;

    const t = new Int8Array(msg.slice(0, 15));
    console.info('Deserializing type: ' + t[8]);
    this.buf = this.deserialize(msg);

    if (t[8] === 0 && t[14] === 101) {
      // Remote JS invocation: msg is (::; (`fn; args); (`callback; args))
      if (this.buf.length === 2 || this.buf.length === 3) {
        let ret;
        if (Array.isArray(this.buf[1])) {
          if (this.buf[1].length !== 2) {
            console.error("'malformed JS function call, expect (`function;(args))");
            return;
          }
          try { ret = this.#resolve(this.buf[1][0]).apply(this, Array.isArray(this.buf[1][1]) ? this.buf[1][1] : [this.buf[1][1]]); }
          catch (err) { console.error("'errors in js function:" + this.buf[1][0]); console.error(err); return; }
        } else {
          try { ret = this.#resolve(this.buf[1][0])(); }
          catch (err) { console.error("'errors in js function:" + this.buf[1][0]); console.error(err); return; }
        }

        if (this.buf.length === 3) {
          let callback;
          if (Array.isArray(this.buf[2])) {
            if (this.buf[2].length !== 2) { console.error("'malformed callback, expect (`callback;(args))"); return; }
            try { callback = this.buf[2]; this.send(this.serialize(callback.push(ret))); }
            catch (err) { console.error("'errors in callback"); console.error(err); }
            return;
          } else {
            try { callback = [this.buf[2]]; this.send(this.serialize(callback.push(ret))); }
            catch (err) { console.error("'errors in callback"); console.error(err); }
            return;
          }
        }

        if (this.buf[1] === '::' || this.buf[1] === '::\n') {
          if (this.viewer) this.viewer.setOpacity(1);
          if (this.viewer) this.viewer.disp('=>', this.buf[1]);
        } else {
          try { this.#resolve(this.buf[1]); }
          catch (e) { console.error(e); }
        }
        return;
      } else {
        if (this.buf.length !== 2) {
          if (this.viewer) this.viewer.setOpacity(1);
          console.warn('Received unsupported type: ' + t[8]);
          return;
        } else {
          if (this.viewer) this.viewer.setOpacity(1);
          if (this.viewer) this.viewer.disp('=>', this.buf[1]);
        }
      }
    } else {
      console.info('no data returned');
    }
  }

  send(data) {
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      this.connection.send(data);
    } else {
      console.error('WebSocket is not open');
    }
  }

  // includeNanosecond keeps q timestamps at full nanosecond precision (decoded
  // as an ISO ns string) instead of collapsing to a millisecond JS Date, so the
  // grid can render them as `yyyy.mm.ddDHH:MM:SS.fffffffff`.
  deserialize(msg) { return deserialize(msg, false, true); }
  serialize(data)  { return serialize(data); }
}

//export { ACK, deserialize, serialize };
export default QWebSocket;
