import {test} from 'node:test';
import assert from 'node:assert/strict';
import {digest,verifyArtifact} from '../scripts/deploy-assets.mjs';

test('deployment rejects truncated or altered artifacts before packaging',()=>{
  const original=Buffer.from('synthetic emulator artifact');
  const expected={size:original.length,sha256:digest(original)};
  assert.doesNotThrow(()=>verifyArtifact(original,expected,'test'));
  assert.throws(()=>verifyArtifact(original.subarray(1),expected,'test'),/mismatch/);
  const altered=Buffer.from(original);altered[0]^=1;
  assert.throws(()=>verifyArtifact(altered,expected,'test'),/mismatch/);
});
