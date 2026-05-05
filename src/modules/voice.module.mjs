import { logger } from '../core/logger.mjs';

class VoiceModule {
  constructor({ ttsService } = {}) {
    this.ttsService = ttsService;
  }

  async acknowledgeWake() {
    if (!this.ttsService) {
      return { ok: false, audioPath: null };
    }

    try {
      return await this.ttsService.speak('Sim?');
    } catch (error) {
      logger.warn('voice-module', 'Nao consegui falar a confirmacao de wake word.', error);
      return { ok: false, audioPath: null, error };
    }
  }
}

export { VoiceModule };
