import { logger } from '../core/logger.mjs';

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

class AiService {
  constructor({
    provider = process.env.AI_PROVIDER || 'ollama',
    ollamaService,
    commandModel = process.env.OLLAMA_MODEL_COMMAND || 'llama3.1',
    chatModel = process.env.OLLAMA_MODEL_CHAT || 'mixtral',
    fallbackModel = process.env.OLLAMA_MODEL_FALLBACK || 'llama3.1'
  } = {}) {
    this.provider = provider;
    this.ollamaService = ollamaService;
    this.commandModel = commandModel;
    this.chatModel = chatModel;
    this.fallbackModel = fallbackModel;
  }

  ensureOllama() {
    if (this.provider !== 'ollama') {
      throw new Error(`AI_PROVIDER ${this.provider} nao suportado neste projeto. Use ollama.`);
    }

    if (!this.ollamaService) {
      throw new Error('OllamaService nao configurado.');
    }
  }

  async classifyCommand(text) {
    this.ensureOllama();

    const prompt = [
      'Voce e um classificador de comandos para um assistente local chamado Jarvis.',
      'Retorne somente JSON valido, sem markdown.',
      'Tipos permitidos: light_on, light_off, scene, memory_add, memory_list, reminder_create, reminder_list, time, system_status, conversation.',
      'A IA nunca executa a acao diretamente; ela so classifica a intencao.',
      'Use scene apenas para os valores cinema, relaxar, foco ou noturno.',
      'Formato exato:',
      '{"type":"conversation","confidence":0.0,"parameters":{}}',
      `Entrada: ${JSON.stringify(text)}`
    ].join('\n');

    try {
      const response = await this.ollamaService.generate({
        model: this.commandModel,
        prompt,
        format: 'json',
        options: {
          temperature: 0
        },
        timeoutMs: 30000
      });

      return parseJsonLoose(response);
    } catch (error) {
      logger.warn('ai', 'Falha ao classificar comando com Ollama.', error);
      return null;
    }
  }

  async chat(text, { history = [], preferences = [], facts = [] } = {}) {
    this.ensureOllama();

    const system = [
      'Voce e Jarvis, um assistente pessoal local profissional.',
      'Responda em portugues brasileiro, de forma objetiva, util e natural.',
      'Nao afirme que executou acoes de automacao durante conversa geral.',
      'Quando a pergunta for tecnica, seja direto e claro.',
      'Se faltar contexto, faca uma pergunta curta.'
    ].join(' ');

    const contextLines = [];

    if (preferences.length > 0) {
      contextLines.push(`Preferencias lembradas: ${preferences.map((item) => item.text).join('; ')}`);
    }

    if (facts.length > 0) {
      contextLines.push(`Fatos lembrados: ${facts.map((item) => item.text).join('; ')}`);
    }

    const recentHistory = history.flatMap((item) => ([
      { role: 'user', content: item.input || '' },
      { role: 'assistant', content: item.response || '' }
    ])).filter((item) => item.content);

    const messages = [
      { role: 'system', content: system },
      ...contextLines.map((line) => ({ role: 'system', content: line })),
      ...recentHistory,
      { role: 'user', content: text }
    ];

    try {
      const response = await this.ollamaService.chat({
        model: this.chatModel,
        messages,
        options: {
          temperature: 0.5
        },
        timeoutMs: 90000
      });

      return response.trim() || 'Estou online, mas nao consegui formular uma resposta agora.';
    } catch (error) {
      logger.warn('ai', 'Modelo de conversa falhou; tentando fallback.', error);
      return this.fallback(text, { system });
    }
  }

  async fallback(text, { system = '' } = {}) {
    try {
      const response = await this.ollamaService.generate({
        model: this.fallbackModel,
        system,
        prompt: text,
        options: {
          temperature: 0.3
        },
        timeoutMs: 60000
      });

      return response.trim() || 'Estou online, mas nao consegui responder agora.';
    } catch (error) {
      logger.error('ai', 'Fallback do Ollama tambem falhou.', error);
      return 'Estou online, mas nao consegui acessar o Ollama agora.';
    }
  }
}

export { AiService };
