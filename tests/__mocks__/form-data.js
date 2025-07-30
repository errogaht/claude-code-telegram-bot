/**
 * Mock for form-data module
 */

class MockFormData {
  constructor() {
    this._fields = [];
  }

  append(name, value, options) {
    this._fields.push({ name, value, options });
  }

  getBuffer() {
    return Buffer.from('mock-form-data');
  }

  getHeaders() {
    return {
      'content-type': 'multipart/form-data; boundary=mock-boundary'
    };
  }

  // Mock method for getting all fields (for testing)
  getFields() {
    return this._fields;
  }
}

module.exports = MockFormData;