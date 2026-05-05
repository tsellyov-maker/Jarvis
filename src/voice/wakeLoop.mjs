import { logger } from '../core/logger.mjs';
import { eventBus } from '../core/eventBus.mjs';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWhileRunning(instance, ms) {
  const sliceMs = 500;
  let elapsed = 0;

  while (instance.running && elapsed < ms) {
    const current = Math.min(sliceMs, ms - elapsed);
    await wait(current);
    elapsed += current;
  }
}

class WakeLoop {
  constructor({
    microphoneService,
    sttService,
    wakeWordService,
    voiceListener,
    voiceModule,
    pipeline,
    chunkDurationSeconds = 3,
    commandDurationSeconds = 6,
    idleDelayMs = 250,
    unavailableDelayMs = 15000
  } = {}) {
    this.microphoneService = microphoneService;
    this.sttService = sttService;
    this.wakeWordService = wakeWordService;
    this.voiceListener = voiceListener;
    this.voiceModule = voiceModule;
    this.pipeline = pipeline;
    this.chunkDurationSeconds = chunkDurationSeconds;
    this.commandDurationSeconds = commandDurationSeconds;
    this.idleDelayMs = idleDelayMs;
    this.unavailableDelayMs = unavailableDelayMs;
    this.running = false;
    this.loopPromise = null;
    this.lastWakeAt = null;
    this.lastWakeText = '';
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    logger.info('wake-loop', 'Wake loop iniciado.', {
      wakeWord: this.wakeWordService.wakeWord,
      chunkDurationSeconds: this.chunkDurationSeconds
    });
    eventBus.emitEvent('wake:started', this.getStatus());
    this.loopPromise = this.loop();
  }

  async stop() {
    this.running = false;
    eventBus.emitEvent('wake:stopped', this.getStatus());

    if (this.loopPromise) {
      await this.loopPromise.catch(() => {});
      this.loopPromise = null;
    }

    logger.info('wake-loop', 'Wake loop parado.');
  }

  async loop() {
    while (this.running) {
      try {
        if (!this.microphoneService.isAvailable()) {
          await waitWhileRunning(this, this.unavailableDelayMs);
          continue;
        }

        const audioPath = await this.microphoneService.record({
          durationSeconds: this.chunkDurationSeconds,
          prefix: 'wake'
        });

        if (!this.running) {
          break;
        }

        if (!audioPath) {
          await waitWhileRunning(this, this.unavailableDelayMs);
          continue;
        }

        const text = await this.sttService.transcribe(audioPath);
        if (text) {
          eventBus.emitEvent('wake:transcript', { text, audioPath });
        }

        if (this.wakeWordService.detect(text)) {
          this.lastWakeAt = new Date().toISOString();
          this.lastWakeText = text;
          logger.info('wake-loop', 'Wake word detectada.', { text });
          eventBus.emitEvent('wake:detected', { text, audioPath });

          await this.voiceModule.acknowledgeWake();
          const command = await this.voiceListener.listenOnce({
            durationSeconds: this.commandDurationSeconds,
            prefix: 'command'
          });

          if (command.text) {
            await this.pipeline.handleText(command.text, {
              source: 'voice',
              speak: true,
              rawAudioPath: command.audioPath
            });
          } else {
            await this.voiceModule.ttsService?.speak('Nao consegui entender o comando.');
          }
        }

        await waitWhileRunning(this, this.idleDelayMs);
      } catch (error) {
        logger.error('wake-loop', 'Erro no wake loop; continuando.', error);
        await waitWhileRunning(this, this.unavailableDelayMs);
      }
    }
  }

  getStatus() {
    return {
      running: this.running,
      wakeWord: this.wakeWordService.wakeWord,
      chunkDurationSeconds: this.chunkDurationSeconds,
      commandDurationSeconds: this.commandDurationSeconds,
      lastWakeAt: this.lastWakeAt,
      lastWakeText: this.lastWakeText
    };
  }
}

export { WakeLoop };
