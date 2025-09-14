export interface VocabularyItem {
  id: string;
  gesture: string;
  phrase: string;
  keywords: string[];
  description: string;
  emoji: string;
}

export class VocabularyService {
  private vocabulary: VocabularyItem[] = [
    {
      id: 'fist',
      gesture: 'fist',
      phrase: 'Hello',
      keywords: ['hello', 'hi', 'greeting'],
      description: 'A closed fist represents greeting',
      emoji: '👋',
    },
    {
      id: 'open_hand',
      gesture: 'open_hand',
      phrase: 'Stop',
      keywords: ['stop', 'halt', 'wait'],
      description: 'An open hand means stop or wait',
      emoji: '✋',
    },
    {
      id: 'peace',
      gesture: 'peace',
      phrase: 'Peace',
      keywords: ['peace', 'victory', 'two'],
      description: 'Peace sign with index and middle finger up',
      emoji: '✌️',
    },
    {
      id: 'thumbs_up',
      gesture: 'thumbs_up',
      phrase: 'Good',
      keywords: ['good', 'great', 'yes', 'approve'],
      description: 'Thumbs up means good or approval',
      emoji: '👍',
    },
    {
      id: 'thumbs_down',
      gesture: 'thumbs_down',
      phrase: 'Bad',
      keywords: ['bad', 'no', 'disapprove', 'reject'],
      description: 'Thumbs down means bad or disapproval',
      emoji: '👎',
    },
    {
      id: 'pointing',
      gesture: 'pointing',
      phrase: 'Look',
      keywords: ['look', 'see', 'point', 'there'],
      description: 'Pointing finger means look or attention',
      emoji: '👆',
    },
    {
      id: 'ok',
      gesture: 'ok',
      phrase: 'OK',
      keywords: ['ok', 'okay', 'alright', 'good'],
      description: 'OK sign with thumb and index finger',
      emoji: '👌',
    },
    {
      id: 'wave',
      gesture: 'wave',
      phrase: 'Bye',
      keywords: ['bye', 'goodbye', 'see you', 'farewell'],
      description: 'Waving hand means goodbye',
      emoji: '👋',
    },
  ];

  getPhraseForGesture(gesture: string): VocabularyItem | null {
    return this.vocabulary.find((item) => item.gesture === gesture) || null;
  }

  getAllVocabulary(): VocabularyItem[] {
    return this.vocabulary;
  }

  searchByKeyword(keyword: string): VocabularyItem[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.vocabulary.filter(
      (item) =>
        item.keywords.some((k) => k.toLowerCase().includes(lowerKeyword)) ||
        item.phrase.toLowerCase().includes(lowerKeyword) ||
        item.description.toLowerCase().includes(lowerKeyword),
    );
  }

  getRandomPhrase(): VocabularyItem {
    const randomIndex = Math.floor(Math.random() * this.vocabulary.length);
    return this.vocabulary[randomIndex];
  }

  getPhraseById(id: string): VocabularyItem | null {
    return this.vocabulary.find((item) => item.id === id) || null;
  }
}
