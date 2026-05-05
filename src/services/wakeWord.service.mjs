function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

class WakeWordService {
  constructor({ wakeWord = process.env.WAKE_WORD || 'jarvis' } = {}) {
    this.wakeWord = wakeWord;
    this.normalizedWakeWord = normalize(wakeWord);
  }

  detect(text) {
    const normalized = normalize(text);
    if (!normalized || !this.normalizedWakeWord) {
      return false;
    }

    const escaped = this.normalizedWakeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s|\\b)${escaped}(\\b|\\s|$)`, 'i');
    return regex.test(normalized);
  }
}

export { WakeWordService };
