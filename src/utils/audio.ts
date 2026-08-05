/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV ArrayBuffer.
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const resultLength = 44 + buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(resultLength);
  const view = new DataView(arrayBuffer);
  
  let offset = 0;
  
  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
    offset += str.length;
  };
  
  const writeUint16 = (val: number) => {
    view.setUint16(offset, val, true);
    offset += 2;
  };
  
  const writeUint32 = (val: number) => {
    view.setUint32(offset, val, true);
    offset += 4;
  };
  
  writeString('RIFF');
  writeUint32(resultLength - 8);
  writeString('WAVE');
  
  writeString('fmt ');
  writeUint32(16);
  writeUint16(format);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * numChannels * (bitDepth / 8));
  writeUint16(numChannels * (bitDepth / 8));
  writeUint16(bitDepth);
  
  writeString('data');
  writeUint32(buffer.length * numChannels * (bitDepth / 8));
  
  // Write interleaved PCM samples
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }
  
  for (let sampleIdx = 0; sampleIdx < buffer.length; sampleIdx++) {
    for (let chanIdx = 0; chanIdx < numChannels; chanIdx++) {
      let sample = channelData[chanIdx][sampleIdx];
      // Clamp
      sample = Math.max(-1, Math.min(1, sample));
      const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, val, true);
      offset += 2;
    }
  }
  
  return arrayBuffer;
}

/**
 * Generates a beautiful synthesized chime melody for simulated recording fallback.
 * Falls back gracefully to correct-duration silence if AudioContext is unavailable.
 */
export async function generateSimulatedChime(durationSec: number): Promise<Blob> {
  const duration = Math.max(1, durationSec);
  const sampleRate = 44100;
  const numSamples = sampleRate * duration;
  
  try {
    const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OfflineCtxClass) {
      throw new Error('OfflineAudioContext not supported');
    }
    
    const offlineCtx = new OfflineCtxClass(1, numSamples, sampleRate);
    
    // Ambient major pentatonic chime notes (C4, D4, E4, G4, A4, C5, D5, E5, G5)
    const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
    const noteInterval = 0.5; // beautiful fast pulsing arpeggio
    
    for (let t = 0; t < duration - 0.2; t += noteInterval) {
      const noteIndex = Math.floor((t / noteInterval) % notes.length);
      const freq = notes[noteIndex];
      
      const osc = offlineCtx.createOscillator();
      const gainNode = offlineCtx.createGain();
      
      // Alternating oscillator types for a rich harmonic texture
      osc.type = (Math.floor(t / noteInterval) % 2 === 0) ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      
      // Gentle volume envelope for a delicate chime sound
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.12, t + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t + noteInterval - 0.02);
      
      osc.connect(gainNode);
      gainNode.connect(offlineCtx.destination);
      
      osc.start(t);
      osc.stop(t + noteInterval);
    }
    
    const renderedBuffer = await offlineCtx.startRendering();
    const wavArrayBuffer = audioBufferToWav(renderedBuffer);
    return new Blob([wavArrayBuffer], { type: 'audio/wav' });
  } catch (err) {
    console.warn('Procedural audio generation failed, falling back to silence of correct duration', err);
    
    // Generate valid silent PCM WAV of exactly correct length
    const fallbackSampleRate = 8000;
    const fallbackNumChannels = 1;
    const fallbackBitsPerSample = 16;
    const dummyLength = duration * fallbackSampleRate * fallbackNumChannels * (fallbackBitsPerSample / 8);
    const dummyBytes = new Uint8Array(dummyLength);
    
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dummyBytes.length, true); // chunk length
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // chunk length
    view.setUint16(20, 1, true); // Linear PCM
    view.setUint16(22, fallbackNumChannels, true);
    view.setUint32(24, fallbackSampleRate, true);
    view.setUint32(28, fallbackSampleRate * fallbackNumChannels * (fallbackBitsPerSample / 8), true);
    view.setUint16(32, fallbackNumChannels * (fallbackBitsPerSample / 8), true);
    view.setUint16(34, fallbackBitsPerSample, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dummyBytes.length, true);
    
    return new Blob([wavHeader, dummyBytes], { type: 'audio/wav' });
  }
}
