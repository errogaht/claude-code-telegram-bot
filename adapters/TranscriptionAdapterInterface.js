/**
 * Base interface for voice transcription adapters
 * Provides common contract for different transcription services
 */
class TranscriptionAdapterInterface {
  /**
   * Transcribe audio to text
   * @param {string|Buffer} audioData - File ID or audio buffer depending on adapter
   * @returns {Promise<string>} Transcribed text
   */
  async transcribe(_audioData) {
    throw new Error('transcribe method must be implemented by subclass');
  }

  /**
   * Get the human-readable name of this adapter
   * @returns {string} Adapter name
   */
  getName() {
    throw new Error('getName method must be implemented by subclass');
  }
}

module.exports = TranscriptionAdapterInterface;