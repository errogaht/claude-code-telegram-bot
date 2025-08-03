const axios = require('axios');
const FormData = require('form-data');
const TranscriptionAdapterInterface = require('./TranscriptionAdapterInterface');

/**
 * Nexara API transcription adapter
 * Uses Nexara's Whisper API for voice transcription
 */
class NexaraTranscriptionAdapter extends TranscriptionAdapterInterface {
  constructor(apiKey) {
    super();
    
    if (!apiKey) {
      throw new Error('Nexara API key is required');
    }
    
    this.apiKey = apiKey;
  }

  getName() {
    return 'Nexara API';
  }

  async transcribe(audioBuffer) {
    if (!audioBuffer) {
      throw new Error('Audio buffer is required');
    }

    try {
      console.log('[Nexara] Transcribing audio...');
      
      const formData = new FormData();
      
      formData.append('file', audioBuffer, {
        filename: 'audio.ogg',
        contentType: 'audio/ogg'
      });
      
      formData.append('model', 'whisper-1');
      
      const response = await axios.post('https://api.nexara.ru/api/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        timeout: 30000
      });
      
      if (response.data && response.data.text) {
        console.log(`[Nexara] Transcribed: "${response.data.text}"`);
        return response.data.text;
      } else {
        throw new Error('Empty response from Nexara API');
      }
      
    } catch (error) {
      if (error.response) {
        throw new Error(`Nexara API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      } else if (error.request) {
        throw new Error('No response from Nexara API. Check internet connection.');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }
}

module.exports = NexaraTranscriptionAdapter;