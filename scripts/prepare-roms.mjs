// Local-only input preparation. No game content is uploaded or printed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'pokemon emerald/Pokemon - Emerald Version (USA, Europe).gba');
const targetPath = resolve(root, 'pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba');
const flips = resolve(root, '.local/tools/flips-v198/flips.exe');
const out = resolve(root, '.local/patches');
const patchPath = resolve(out, 'quetzal-english-alpha-8v4.bps');
const rebuiltPath = resolve(out, 'quetzal-roundtrip.gba');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const expected = {
  source: 'a9dec84dfe7f62ab2220bafaef7479da0929d066ece16a6885f6226db19085af',
  target: 'e9fc9cf506ad11db7642e7d65774e2bb0e5f174eb9aceda725cd961ab9aee070',
  tool: 'ca6b364ccb23ab83ff0f4458f589eac001e7baf74315decde73c878a8eb519fd',
};
function requireHash(bytes, expectedHash, name) {
  if (sha256(bytes) !== expectedHash) throw new Error(`${name} differs from the pinned input`);
}
function describe(bytes) {
  if (bytes.length < 192) throw new Error('Input is too short for a GBA header');
  let sum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) sum += bytes[i];
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    sha1: createHash('sha1').update(bytes).digest('hex'),
    headerTitle: bytes.toString('ascii', 0xa0, 0xac).replace(/\0/g, ''),
    gameCode: bytes.toString('ascii', 0xac, 0xb0),
    revision: bytes[0xbc],
    headerChecksumValid: ((-sum - 0x19) & 255) === bytes[0xbd],
  };
}
const source = readFileSync(sourcePath);
const target = readFileSync(targetPath);
requireHash(source, expected.source, 'Source ROM');
requireHash(target, expected.target, 'Target ROM');
requireHash(readFileSync(flips), expected.tool, 'Flips executable');
mkdirSync(out, { recursive: true });
execFileSync(flips, ['--create', '--bps', sourcePath, targetPath, patchPath], { stdio: 'pipe' });
execFileSync(flips, ['--apply', patchPath, sourcePath, rebuiltPath], { stdio: 'pipe' });
const rebuilt = readFileSync(rebuiltPath);
if (!rebuilt.equals(target)) throw new Error('Round-trip output differs from the supplied target');
const wrongSource = spawnSync(flips, ['--apply', patchPath, targetPath,
  resolve(out, 'wrong-source-test.gba')], { encoding: 'utf8' });
if (wrongSource.error || wrongSource.status === null) {
  throw wrongSource.error ?? new Error('Wrong-source check did not finish');
}
if (wrongSource.status === 0) throw new Error('Patcher unexpectedly accepted an incompatible source');
const patch = readFileSync(patchPath);
if (patch.toString('ascii', 0, 4) !== 'BPS1') throw new Error('Not a BPS patch');
const manifest = {
  schemaVersion: 1,
  source: describe(source),
  target: { ...describe(target), labelFromFilename: 'Quetzal English Alpha 8v4',
    releaseAuthenticity: 'Not independently verified against an official release hash' },
  patch: { file: 'quetzal-english-alpha-8v4.bps', bytes: patch.length, sha256: sha256(patch) },
  generator: { name: 'Floating IPS', version: '198', executableSha256: expected.tool,
    release: 'https://github.com/Sir-Walrus/Flips/releases/tag/v198' },
  verification: { byteForByteRoundTrip: true, wrongSourceRejected: true },
  emulator: { coreCommit: null, biosMode: null, serialMode: null, runtimeTested: false },
};
const manifestPath = resolve(root, 'docs/experiments/rom-inputs.json');
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ patchPath, patchBytes: patch.length,
  verification: manifest.verification, sourceHeader: manifest.source.headerChecksumValid,
  targetHeader: manifest.target.headerChecksumValid, manifestPath }, null, 2));
