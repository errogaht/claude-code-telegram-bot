const TranscriptionAdapterInterface = require('./TranscriptionAdapterInterface');

/**
 * Test transcription adapter for unit testing
 * Returns fixed test transcription without making API calls
 */
class TestTranscriptionAdapter extends TranscriptionAdapterInterface {
  constructor() {
    super();
  }

  getName() {
    return 'Test Mode';
  }

  async transcribe(_audioData) {
    return 'Test voice message transcription';
  }
}

module.exports = TestTranscriptionAdapter;