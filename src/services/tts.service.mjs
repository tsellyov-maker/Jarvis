import { logger } from '../core/logger.mjs';

class TtsService {
  constructor({
    provider = process.env.TTS_PROVIDER || 'fish_audio',
    fishAudioService,
    audioPlayerService,
    localTtsService,
    networkService
  } = {}) {
    this.provider = provider;
    this.fishAudioService = fishAudioService;
    this.audioPlayerService = audioPlayerService;
    this.localTtsService = localTtsService;
    this.networkService = networkService;
  }

  async speak(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return { ok: false, audioPath: null, played: false };
    }

    if (this.provider !== 'fish_audio') {
      logger.warn('tts', `TTS_PROVIDER ${this.provider} nao suportado. Resposta ficara apenas em texto.`);
      return this.speakLocal(cleanText, { reason: 'unsupported-provider' });
    }

    if (this.networkService?.isOffline?.()) {
      logger.warn('tts', 'Modo offline ativo; Fish Audio remoto sera ignorado.');
      return this.speakLocal(cleanText, { reason: 'offline' });
    }

    const audioPath = await this.fishAudioService.generate(cleanText);
    if (!audioPath) {
      return this.speakLocal(cleanText, { reason: 'fish-audio-failed' });
    }

    const playback = await this.audioPlayerService.play(audioPath);
    return {
      ok: true,
      audioPath,
      played: playback.ok,
      playback,
      provider: 'fish_audio'
    };
  }

  async speakLocal(text, { reason = 'fallback' } = {}) {
    if (!this.localTtsService) {
      return { ok: false, audioPath: null, played: false, provider: null, reason };
    }

    const audioPath = await this.localTtsService.generate(text);
    if (!audioPath) {
      return { ok: false, audioPath: null, played: false, provider: this.localTtsService.provider, reason };
    }

    const playback = await this.audioPlayerService.play(audioPath);
    return {
      ok: true,
      audioPath,
      played: playback.ok,
      playback,
      provider: this.localTtsService.provider,
      reason
    };
  }

  getStatus() {
    return {
      provider: this.provider,
      remoteConfigured: this.fishAudioService?.configured || false,
      localFallback: this.localTtsService?.getStatus?.() || null
    };
  }
}

export { TtsService };
