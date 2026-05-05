class ConversationModule {
  constructor({ aiService, memoryService } = {}) {
    this.aiService = aiService;
    this.memoryService = memoryService;
  }

  async handle(intent, context = {}) {
    const memory = this.memoryService ? await this.memoryService.getMemory() : null;
    const history = Array.isArray(memory?.history) ? memory.history.slice(-8) : [];
    const preferences = Array.isArray(memory?.preferences) ? memory.preferences.slice(-10) : [];
    const facts = Array.isArray(memory?.facts) ? memory.facts.slice(-10) : [];

    const text = await this.aiService.chat(context.text, {
      history,
      preferences,
      facts
    });

    return {
      ok: true,
      text,
      data: {
        provider: this.aiService.provider,
        model: this.aiService.chatModel,
        intentSource: intent.source
      }
    };
  }
}

export { ConversationModule };
