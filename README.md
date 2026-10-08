# `nanotar`: decompression finishes before filtering

This reproduction uses `nanotar@0.3.0`. An 8,248-byte gzip archive expands into
8,396,800 tar bytes before `parseTarGzip` calls its `filter`, even when that filter
rejects every entry. The API has no option to limit decompressed bytes.

The script uses one fixed 8 MiB file. It does not attempt to exhaust memory.

## Run

Use Node.js 22 or later:

```sh
git clone https://github.com/why-reproductions-are-required/nanotar-decompression-limit-repro.git
cd nanotar-decompression-limit-repro
npm ci
npm run repro
```

`npm test` runs the same assertions. A successful exit means the script reproduced
the current behavior.

## Observed output

Tested with Node.js `v22.23.2` and npm `10.9.8`:

```text
Node: v22.23.2
File payload: 8388608 bytes
Tar archive: 8396800 bytes
Gzip archive: 8248 bytes
parseTarGzip: resolved with 0 entries
Bytes decompressed before the first filter call: 8396800
Filter calls: 1
gunzipSync: rejected with ERR_BUFFER_TOO_LARGE at a 1048576-byte limit
Reproduced: parseTarGzip fully decompresses the archive before filtering.
```

The compressed size can vary with the runtime's zlib version. The assertions do
not depend on its exact value.

## What the script checks

The script creates the archive in memory. A pass-through observer counts bytes
from the native `DecompressionStream`. It does not change those bytes or modify
`nanotar`. The script restores the original global after the check.

When the first `filter` call runs, the decompressor has already produced the entire
tar archive. Returning `false` prevents an entry from appearing in the result, but
does not limit decompression.

For comparison, Node's `gunzipSync` rejects the same archive with
`maxOutputLength: 1048576`. This option belongs to Node's API; `nanotar@0.3.0` has
no equivalent option.

## Why it happens

[`parseTarGzip`](https://github.com/unjs/nanotar/blob/v0.3.0/src/parse.ts#L182-L195)
reads the complete decompressed stream with `new Response(stream).arrayBuffer()`.
It then passes that buffer to `parseTar`, which calls the filter.

A compressed input size limit does not bound decompressed memory to the same size.
Applications that accept untrusted archives need a separate output limit.

An optional limit on decompressed bytes would let callers stop decompression
before collecting the whole archive. The default behavior could remain unchanged.
