import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createTar, parseTarGzip } from 'nanotar';

const payloadBytes = 8 * 1024 * 1024;
const outputLimit = 1024 * 1024;
const tar = createTar([
  {
    name: 'package/large.bin',
    data: new Uint8Array(payloadBytes),
    attrs: { mtime: 0, uid: 0, gid: 0 },
  },
]);
const gzip = gzipSync(tar);
assert.ok(gzip.byteLength < 16 * 1024);

console.log(`Node: ${process.version}`);
console.log(`File payload: ${payloadBytes} bytes`);
console.log(`Tar archive: ${tar.byteLength} bytes`);
console.log(`Gzip archive: ${gzip.byteLength} bytes`);

let decompressedBytes = 0;
let bytesAtFirstFilter;
let filterCalls = 0;
const NativeDecompressionStream = globalThis.DecompressionStream;

// Observe the output of the native decompressor without changing its chunks.
globalThis.DecompressionStream = class {
  constructor(format) {
    const stream = new NativeDecompressionStream(format);
    this.writable = stream.writable;
    this.readable = stream.readable.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          decompressedBytes += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );
  }
};

try {
  const entries = await parseTarGzip(gzip, {
    filter() {
      filterCalls++;
      bytesAtFirstFilter ??= decompressedBytes;
      return false;
    },
  });

  assert.equal(entries.length, 0);
  assert.equal(filterCalls, 1);
  assert.equal(decompressedBytes, tar.byteLength);
  assert.equal(bytesAtFirstFilter, tar.byteLength);
  assert.ok(bytesAtFirstFilter > outputLimit);

  console.log(`parseTarGzip: resolved with ${entries.length} entries`);
  console.log(`Bytes decompressed before the first filter call: ${bytesAtFirstFilter}`);
  console.log(`Filter calls: ${filterCalls}`);
} finally {
  globalThis.DecompressionStream = NativeDecompressionStream;
}

// This limit belongs to Node's API. nanotar 0.3.0 has no equivalent option.
assert.throws(() => gunzipSync(gzip, { maxOutputLength: outputLimit }), {
  code: 'ERR_BUFFER_TOO_LARGE',
});
console.log(`gunzipSync: rejected with ERR_BUFFER_TOO_LARGE at a ${outputLimit}-byte limit`);
console.log('Reproduced: parseTarGzip fully decompresses the archive before filtering.');
