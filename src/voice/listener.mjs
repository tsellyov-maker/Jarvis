import { logger } from '../core/logger.mjs';
import { eventBus } from '../core/eventBus.mjs';

class VoiceListener {
  constructor({
    microphoneService,
    sttService,
    commandDurationSeconds = 6
  } = {}) {
    this.microphoneService = microphoneService;
    this.sttService = sttService;
    this.commandDurationSeconds = commandDurationSeconds;
    this.running = false;
    this.lastTranscript = '';
    this.lastAudioPath = null;
  }

  start() {
    this.running = true;
    logger.info('voice-listener', 'Listener do microfone iniciado.');
    eventBus.emitEvent('voice:listener-started', this.getStatus());
  }

  stop() {
    this.running = false;
    logger.info('voice-listener', 'Listener do microfone parado.');
    eventBus.emitEvent('voice:listener-stopped', this.getStatus());
  }

  async listenOnce({ durationSeconds = this.commandDurationSeconds, prefix = 'command' } = {}) {
    if (!this.running) {
      this.start();
    }

    const audioPath = await this.microphoneService.record({
      durationSeconds,
      prefix
    });

    this.lastAudioPath = audioPath;

    if (!audioPath) {
      return {
        ok: false,
        audioPath: null,
        text: ''
      };
    }

    const text = await this.sttService.transcribe(audioPath);
    this.lastTranscript = text;
    logger.info('voice-listener', 'Transcricao recebida.', { text, audioPath });
    eventBus.emitEvent('voice:transcript', { text, audioPath });

    return {
      ok: Boolean(text),
      audioPath,
      text
    };
  }

  getStatus() {
    return {
      running: this.running,
      lastTranscript: this.lastTranscript,
      lastAudioPath: this.lastAudioPath
    };
  }
}

export { VoiceListener };
