import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { logger } from '../core/logger.mjs';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function defaultAudioOutputDir() {
  const audioDir = process.env.AUDIO_DIR || join(srcDir, 'audio');
  return join(audioDir, 'output');
}

class FishAudioService {
  constructor({
    apiKey = process.env.FISH_AUDIO_API_KEY || '',
    voiceId = process.env.FISH_AUDIO_VOICE_ID || '',
    outputDir = process.env.AUDIO_OUTPUT_DIR || defaultAudioOutputDir(),
    timeoutMs = Number(process.env.FISH_AUDIO_TIMEOUT_MS || 12000)
  } = {}) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.outputDir = outputDir;
    this.timeoutMs = timeoutMs;
    this.endpoint = 'https://api.fish.audio/v1/tts';
  }

  get configured() {
    return Boolean(this.apiKey && this.voiceId);
  }

  async generate(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return null;
    }

    if (!this.configured) {
      logger.warn('fish-audio', 'FISH_AUDIO_API_KEY ou FISH_AUDIO_VOICE_ID ausente; TTS remoto ignorado.');
      return null;
    }

    await mkdir(this.outputDir, { recursive: true });
    const stamp = DateTime.now().toFormat('yyyyLLdd-HHmmss-SSS');
    const audioPath = join(this.outputDir, `jarvis-${stamp}.mp3`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          model: 's2-pro'
        },
        body: JSON.stringify({
          text: cleanText,
          reference_id: this.voiceId,
          temperature: 0.7,
          top_p: 0.7,
          prosody: {
            speed: 1,
            volume: 0,
            normalize_loudness: true
          },
          chunk_length: 300,
          normalize: true,
          format: 'mp3',
          sample_rate: 44100,
          mp3_bitrate: 128,
          latency: 'normal',
          max_new_tokens: 1024,
          repetition_penalty: 1.2,
          min_chunk_length: 50,
          condition_on_previous_chunks: true,
          early_stop_threshold: 1
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Fish Audio respondeu ${response.status}: ${errorText}`);
      }

      const audio = Buffer.from(await response.arrayBuffer());
      await writeFile(audioPath, audio);
      logger.info('fish-audio', 'Audio TTS gerado.', { audioPath });
      return audioPath;
    } catch (error) {
      logger.error('fish-audio', 'Falha ao gerar audio; seguindo sem quebrar o sistema.', error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { FishAudioService };
