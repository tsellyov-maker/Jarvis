class MemoryModule {
  constructor({ memoryService } = {}) {
    this.memoryService = memoryService;
  }

  async handle(intent) {
    const kind = intent.parameters?.kind || 'notes';

    if (intent.type === 'memory_add') {
      const text = String(intent.parameters?.text || '').trim();
      if (!text) {
        return {
          ok: false,
          text: 'Nao encontrei o que anotar.',
          data: null
        };
      }

      const item = await this.memoryService.addItem(kind, text);
      return {
        ok: true,
        text: 'Anotado.',
        data: { item }
      };
    }

    const items = await this.memoryService.listItems(kind);
    if (items.length === 0) {
      return {
        ok: true,
        text: 'Nao encontrei notas salvas.',
        data: { items }
      };
    }

    const summary = items
      .slice(-5)
      .map((item, index) => `${index + 1}. ${item.text}`)
      .join('; ');

    return {
      ok: true,
      text: `Suas notas mais recentes: ${summary}.`,
      data: { items }
    };
  }
}

export { MemoryModule };
