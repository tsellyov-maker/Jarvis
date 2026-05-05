import { createErrorResponse, createJarvisResponse } from './response.mjs';
import { logger } from './logger.mjs';
import { eventBus } from './eventBus.mjs';

class Pipeline {
  constructor({ interpreter, brain, ttsService, memoryService, metricsService } = {}) {
    this.interpreter = interpreter;
    this.brain = brain;
    this.ttsService = ttsService;
    this.memoryService = memoryService;
    this.metricsService = metricsService;
  }

  async handleText(text, { source = 'api', speak = true, rawAudioPath = null } = {}) {
    const startedAt = process.hrtime.bigint();
    const command = String(text || '').trim();
    eventBus.emitEvent('jarvis:command', { text: command, source, rawAudioPath });

    if (!command) {
      const emptyResponse = createJarvisResponse({
        ok: false,
        text: 'Nao ouvi nenhum comando claro.',
        source,
        intent: { type: 'empty' }
      });

      eventBus.emitEvent('jarvis:response', emptyResponse);
      this.recordMetrics({
        source,
        intent: 'empty',
        ok: false,
        startedAt
      });
      return emptyResponse;
    }

    let intentType = 'unknown';

    try {
      logger.info('pipeline', 'Processando entrada.', { source, text: command });
      const intent = await this.interpreter.interpret(command);
      intentType = intent.type;
      const moduleResult = await this.brain.process(intent, {
        text: command,
        source,
        rawAudioPath
      });

      let audioPath = null;
      if (speak && moduleResult?.text && this.ttsService) {
        const speech = await this.ttsService.speak(moduleResult.text);
        audioPath = speech?.audioPath || null;
      }

      const response = createJarvisResponse({
        ok: moduleResult?.ok !== false,
        text: moduleResult?.text || '',
        intent,
        source,
        data: moduleResult?.data || null,
        audioPath
      });

      if (this.memoryService) {
        await this.memoryService.addHistory({
          source,
          input: command,
          intent: intent.type,
          response: response.text,
          audioPath
        });
      }

      eventBus.emitEvent('jarvis:response', response);
      this.recordMetrics({
        source,
        intent: intentType,
        ok: response.ok,
        startedAt
      });
      return response;
    } catch (error) {
      logger.error('pipeline', 'Erro ao processar entrada.', error);
      const response = createErrorResponse(error, {
        source,
        text: 'Tive um problema ao processar isso, mas continuo online.'
      });

      if (speak && this.ttsService) {
        const speech = await this.ttsService.speak(response.text);
        response.audioPath = speech?.audioPath || null;
      }

      eventBus.emitEvent('jarvis:response', response);
      this.recordMetrics({
        source,
        intent: intentType,
        ok: false,
        startedAt
      });
      return response;
    }
  }

  recordMetrics({ source, intent, ok, startedAt }) {
    if (!this.metricsService) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.metricsService.observePipeline({
      source,
      intent,
      ok,
      durationMs
    });
  }
}

export { Pipeline };
