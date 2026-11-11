// ZIP en flujo (sin compresión, con "data descriptor"): empieza a responder de inmediato y usa memoria constante,
// aunque sean cientos de MB de video. Reemplaza armar el ZIP completo en memoria (zip.js) en las descargas grandes.
import fs from 'node:fs';
import { once } from 'node:events';

const TABLA = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crcSigue = (crc, buf) => { let c = crc ^ 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export class ZipEscritor {
  constructor(res) {
    this.res = res; this.offset = 0; this.central = [];
    const d = new Date();
    this.time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    this.date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  }
  async _w(buf) {
    if (this.res.destroyed || this.res.writableEnded) throw new Error('El navegador cerró la descarga');
    this.offset += buf.length;
    if (!this.res.write(buf)) await Promise.race([once(this.res, 'drain'), once(this.res, 'close')]);
  }
  async _entrada(name, trozos) {
    const nombre = Buffer.from(name, 'utf8'); const inicio = this.offset;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0808, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(this.time, 10); lh.writeUInt16LE(this.date, 12); lh.writeUInt16LE(nombre.length, 26);
    await this._w(lh); await this._w(nombre);
    let crc = 0, size = 0;
    for await (const t of trozos) { crc = crcSigue(crc, t); size += t.length; await this._w(t); }
    const dd = Buffer.alloc(16);
    dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(size, 8); dd.writeUInt32LE(size, 12);
    await this._w(dd);
    this.central.push({ nombre, crc, size, inicio });
  }
  agregarBuffer(name, data) { const b = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'); return this._entrada(name, (async function* () { yield b; })()); }
  agregarArchivo(name, ruta) { return this._entrada(name, fs.createReadStream(ruta, { highWaterMark: 1 << 20 })); }
  async cerrar() {
    const iniCentral = this.offset;
    for (const e of this.central) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0808, 8); c.writeUInt16LE(0, 10);
      c.writeUInt16LE(this.time, 12); c.writeUInt16LE(this.date, 14); c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(e.size, 20); c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.nombre.length, 28); c.writeUInt32LE(e.inicio, 42);
      await this._w(c); await this._w(e.nombre);
    }
    const tamCentral = this.offset - iniCentral;
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(this.central.length, 8); fin.writeUInt16LE(this.central.length, 10);
    fin.writeUInt32LE(tamCentral, 12); fin.writeUInt32LE(iniCentral, 16);
    await this._w(fin); this.res.end();
  }
}
