import { createPcmBlob, decode } from './audio-utils.ts';
import assert from 'node:assert';

// Mock btoa and atob for Node environment
if (typeof btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof atob === 'undefined') {
  global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

function testCreatePcmBlob() {
  console.log('--- Testing createPcmBlob ---');

  // Test case 1: Standard values
  console.log('Test case 1: Standard values (0, 0.5, -0.5, 1.0, -1.0)');
  const input1 = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const result1 = createPcmBlob(input1);

  assert.strictEqual(result1.mimeType, 'audio/pcm;rate=16000', 'Should have correct mimeType');

  const decoded1 = new Int16Array(decode(result1.data).buffer);

  // Note: Current code uses `int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;`
  // 0.5 * 32767 = 16383.5, which is truncated to 16383 when assigned to Int16Array
  const expected1 = new Int16Array([
    0,
    16383,  // 0.5 * 32767 = 16383.5 -> 16383
    -16383, // -0.5 * 32767 = -16383.5 -> -16383
    32767,  // 1.0 * 32767 = 32767
    -32767  // -1.0 * 32767 = -32767
  ]);

  assert.deepStrictEqual(decoded1, expected1, 'Decoded values should match expected truncated values');
  console.log('✓ Test case 1 passed');

  // Test case 2: Clipping values outside [-1, 1]
  console.log('Test case 2: Clipping values outside [-1, 1]');
  const input2 = new Float32Array([1.5, -2.0, 500, -0.0001]);
  const result2 = createPcmBlob(input2);
  const decoded2 = new Int16Array(decode(result2.data).buffer);

  const expected2 = new Int16Array([
    32767,  // 1.5 capped to 1.0 * 32767
    -32767, // -2.0 capped to -1.0 * 32767
    32767,  // 500 capped to 1.0 * 32767
    -3      // -0.0001 * 32767 = -3.2767 -> -3
  ]);

  assert.deepStrictEqual(decoded2, expected2, 'Decoded values should be correctly clipped and truncated');
  console.log('✓ Test case 2 passed');

  // Test case 3: Empty input
  console.log('Test case 3: Empty input');
  const input3 = new Float32Array([]);
  const result3 = createPcmBlob(input3);
  const decoded3 = new Int16Array(decode(result3.data).buffer);
  assert.strictEqual(decoded3.length, 0, 'Should return an empty buffer for empty input');
  console.log('✓ Test case 3 passed');

  console.log('--- All tests passed! ---');
}

try {
  testCreatePcmBlob();
} catch (error) {
  console.error('Test failed!');
  console.error(error);
  process.exit(1);
}
