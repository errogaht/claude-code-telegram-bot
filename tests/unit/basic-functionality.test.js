describe('Basic Jest Setup', () => {
  describe('Test Environment', () => {
    it('should have Jest globals available', () => {
      expect(expect).toBeDefined();
      expect(describe).toBeDefined();
      expect(it).toBeDefined();
      expect(beforeEach).toBeDefined();
      expect(afterEach).toBeDefined();
    });

    it('should have test helpers available', () => {
      expect(global.testHelpers).toBeDefined();
      expect(global.testHelpers.createMockTelegramResponse).toBeInstanceOf(Function);
      expect(global.testHelpers.createMockMessage).toBeInstanceOf(Function);
      expect(global.testHelpers.createMockClaudeResponse).toBeInstanceOf(Function);
    });

    it('should have sinon available', () => {
      expect(global.sinon).toBeDefined();
      expect(global.sinon.stub).toBeInstanceOf(Function);
      expect(global.sinon.spy).toBeInstanceOf(Function);
    });

    it('should have environment variables set', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.ANTHROPIC_API_KEY).toBe('test-key-12345');
      expect(process.env.TELEGRAM_BOT_TOKEN).toBe('test:token');
    });
  });

  describe('Test Helpers', () => {
    it('should create mock Telegram responses', () => {
      const response = global.testHelpers.createMockTelegramResponse();
      expect(response).toHaveProperty('ok', true);
      expect(response).toHaveProperty('result');
    });

    it('should create mock Telegram messages', () => {
      const message = global.testHelpers.createMockMessage();
      expect(message).toHaveProperty('message_id');
      expect(message).toHaveProperty('from');
      expect(message).toHaveProperty('chat');
      expect(message).toHaveProperty('text');
    });

    it('should create mock Claude responses', () => {
      const response = global.testHelpers.createMockClaudeResponse();
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('type', 'message');
      expect(response).toHaveProperty('role', 'assistant');
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
    });

    it('should generate random data', () => {
      const str1 = global.testHelpers.randomString();
      const str2 = global.testHelpers.randomString();
      expect(str1).not.toBe(str2);
      expect(str1.length).toBeGreaterThan(0);

      const id1 = global.testHelpers.randomId();
      const id2 = global.testHelpers.randomId();
      expect(typeof id1).toBe('number');
      expect(typeof id2).toBe('number');
    });

    it('should provide sleep utility', async () => {
      const start = Date.now();
      await global.testHelpers.sleep(10);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(8); // Allow for small timing variations
    });
  });

  describe('File System Operations', () => {
    it('should be able to require Node.js modules', () => {
      const fs = require('fs');
      const path = require('path');
      
      expect(fs).toBeDefined();
      expect(path).toBeDefined();
      expect(typeof fs.existsSync).toBe('function');
      expect(typeof path.join).toBe('function');
    });

    it('should have access to project files', () => {
      const fs = require('fs');
      const path = require('path');
      const packageJsonPath = path.join(__dirname, '../../package.json');
      
      expect(fs.existsSync(packageJsonPath)).toBe(true);
    });
  });

  describe('Mock Functions', () => {
    it('should create and use Jest mocks', () => {
      const mockFn = jest.fn();
      mockFn('test');
      
      expect(mockFn).toHaveBeenCalledWith('test');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should create and use Sinon stubs', () => {
      const obj = { method: () => 'original' };
      const stub = global.sinon.stub(obj, 'method').returns('stubbed');
      
      expect(obj.method()).toBe('stubbed');
      expect(stub.calledOnce).toBe(true);
      
      stub.restore();
      expect(obj.method()).toBe('original');
    });
  });

  describe('Async Operations', () => {
    it('should handle promises', async () => {
      const promise = Promise.resolve('test');
      const result = await promise;
      expect(result).toBe('test');
    });

    it('should handle async functions', async () => {
      const asyncFn = async () => {
        await global.testHelpers.sleep(1);
        return 'async result';
      };
      
      const result = await asyncFn();
      expect(result).toBe('async result');
    });

    it('should handle promise rejections', async () => {
      const promise = Promise.reject(new Error('test error'));
      await expect(promise).rejects.toThrow('test error');
    });
  });
});