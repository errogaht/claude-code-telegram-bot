const TranscriptionAdapterInterface = require('../../adapters/TranscriptionAdapterInterface');
const NexaraTranscriptionAdapter = require('../../adapters/NexaraTranscriptionAdapter');
const TestTranscriptionAdapter = require('../../adapters/TestTranscriptionAdapter');

describe('Transcription Adapters', () => {
  describe('TranscriptionAdapterInterface', () => {
    test('should be an abstract base class', () => {
      const adapter = new TranscriptionAdapterInterface();
      expect(adapter).toBeDefined();
    });

    test('transcribe method should throw error in base class', async () => {
      const adapter = new TranscriptionAdapterInterface();
      await expect(adapter.transcribe('file_id')).rejects.toThrow('transcribe method must be implemented');
    });

    test('getName method should throw error in base class', () => {
      const adapter = new TranscriptionAdapterInterface();
      expect(() => adapter.getName()).toThrow('getName method must be implemented');
    });
  });

  describe('NexaraTranscriptionAdapter', () => {
    const mockApiKey = 'test-nexara-key';
    let adapter;

    beforeEach(() => {
      adapter = new NexaraTranscriptionAdapter(mockApiKey);
    });

    test('should initialize with API key', () => {
      expect(adapter.apiKey).toBe(mockApiKey);
      expect(adapter.getName()).toBe('Nexara API');
    });

    test('should throw error if no API key provided', () => {
      expect(() => new NexaraTranscriptionAdapter()).toThrow('Nexara API key is required');
    });

    test('should have transcribe method', () => {
      expect(typeof adapter.transcribe).toBe('function');
    });

    test('should throw error when transcribe called without valid audio buffer', async () => {
      await expect(adapter.transcribe(null)).rejects.toThrow('Audio buffer is required');
    });
  });

  describe('TestTranscriptionAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new TestTranscriptionAdapter();
    });

    test('should initialize without parameters', () => {
      expect(adapter.getName()).toBe('Test Mode');
    });

    test('should return fixed test transcription', async () => {
      const result = await adapter.transcribe('any_file_id');
      expect(result).toBe('Test voice message transcription');
    });

    test('should handle any file ID', async () => {
      const result1 = await adapter.transcribe('file1');
      const result2 = await adapter.transcribe('file2');
      expect(result1).toBe(result2);
    });
  });
});