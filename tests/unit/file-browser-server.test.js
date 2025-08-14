const FileBrowserServer = require('../../FileBrowserServer');
const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;

// Mock ngrok to avoid actual network calls in tests
jest.mock('@ngrok/ngrok', () => ({
  forward: jest.fn().mockResolvedValue({
    url: () => 'https://test-ngrok-url.ngrok.io',
    close: jest.fn().mockResolvedValue(undefined)
  })
}));

describe('FileBrowserServer', () => {
  let server;
  let testProjectRoot;
  
  beforeEach(() => {
    // Use current test directory as project root
    testProjectRoot = __dirname;
    server = new FileBrowserServer(testProjectRoot);
  });
  
  afterEach(async () => {
    if (server.server) {
      await server.stop();
    }
  });

  describe('File Browser HTTP Server', () => {
    test('should serve main page with file list', async () => {
      const response = await request(server.app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('Project File Browser');
      expect(response.text).toContain('file-browser-server.test.js');
    });

    test('should handle directory navigation', async () => {
      // Navigate to parent directory
      const response = await request(server.app)
        .get('/?path=../');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('Project File Browser');
    });

    test('should serve file content viewer', async () => {
      // Create a test file path relative to test directory
      const testFilePath = 'file-browser-server.test.js';
      
      const response = await request(server.app)
        .get(`/view?path=${encodeURIComponent(testFilePath)}`);
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('File Browser');
      expect(response.text).toContain('FileBrowserServer');
    });

    test('should handle file not found', async () => {
      const response = await request(server.app)
        .get('/view?path=nonexistent-file.txt');
      
      expect(response.status).toBe(404);
      expect(response.text).toContain('Error');
    });

    test('should prevent path traversal attacks', async () => {
      const response = await request(server.app)
        .get('/?path=../../../etc/passwd');
      
      expect(response.status).toBe(404);
      expect(response.text).toContain('Access denied');
    });
  });

  describe('File Browser Integration', () => {
    test('should format file sizes correctly', () => {
      expect(server.formatFileSize(0)).toBe('0 B');
      expect(server.formatFileSize(1024)).toBe('1 KB');
      expect(server.formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(server.formatFileSize(1536)).toBe('1.5 KB');
    });

    test('should get correct file icons', () => {
      expect(server.getFileIcon('test.js')).toBe('📄');
      expect(server.getFileIcon('image.png')).toBe('🖼️');
      expect(server.getFileIcon('style.css')).toBe('🎨');
      expect(server.getFileIcon('unknown.xyz')).toBe('📄');
    });

    test('should escape HTML correctly', () => {
      const testString = '<script>alert("test")</script>';
      const escaped = server.escapeHtml(testString);
      
      expect(escaped).toBe('&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;');
      expect(escaped).not.toContain('<script>');
    });

    test('should get correct language for syntax highlighting', () => {
      expect(server.getLanguageForHighlighting('.js')).toBe('javascript');
      expect(server.getLanguageForHighlighting('.json')).toBe('json');
      expect(server.getLanguageForHighlighting('.md')).toBe('markdown');
      expect(server.getLanguageForHighlighting('.unknown')).toBe('text');
    });
  });

  describe('Ngrok Integration', () => {
    test('should start server with ngrok tunnel', async () => {
      const url = await server.start();
      
      expect(url).toBe('https://test-ngrok-url.ngrok.io');
      expect(server.server).toBeTruthy();
      expect(server.ngrokListener).toBeTruthy();
    });

    test('should stop server and close ngrok tunnel', async () => {
      await server.start();
      expect(server.server).toBeTruthy();
      
      await server.stop();
      expect(server.server).toBeNull();
      expect(server.ngrokListener).toBeNull();
    });

    test('should handle multiple start calls gracefully', async () => {
      const url1 = await server.start();
      const url2 = await server.start(); // Should return same URL
      
      expect(url1).toBe(url2);
    });

    test('should handle stop when not running', async () => {
      // Should not throw error
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  describe('Security Features', () => {
    test('should validate paths within project directory', async () => {
      const maliciousPath = path.join(testProjectRoot, '../../../etc/passwd');
      
      await expect(server.validatePath(maliciousPath))
        .rejects.toThrow('Access denied: Path outside project directory');
    });

    test('should filter out hidden files and node_modules', async () => {
      const { directories, files } = await server.generateFileList(testProjectRoot, '');
      
      // Should not contain any hidden files (starting with .)
      const allItems = [...directories, ...files];
      const hasHiddenFiles = allItems.some(item => item.name.startsWith('.'));
      const hasNodeModules = allItems.some(item => item.name === 'node_modules');
      
      expect(hasHiddenFiles).toBe(false);
      expect(hasNodeModules).toBe(false);
    });

    test('should handle directory traversal in generateFileList', async () => {
      // Test with safe path
      const result = await server.generateFileList(testProjectRoot, '');
      expect(result.files).toBeDefined();
      expect(result.directories).toBeDefined();
      expect(result.currentPath).toBe('');
    });
  });

  describe('Error Handling', () => {
    test('should generate proper error HTML', () => {
      const errorHtml = server.generateErrorHTML('Test error message');
      
      expect(errorHtml).toContain('Error - File Browser');
      expect(errorHtml).toContain('Test error message');
      expect(errorHtml).toContain('Back to file browser');
    });

    test('should handle missing file path in view endpoint', async () => {
      const response = await request(server.app).get('/view');
      
      expect(response.status).toBe(400);
      expect(response.text).toContain('File path required');
    });

    test('should redirect directory view to main page', async () => {
      const response = await request(server.app)
        .get(`/view?path=../`);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/?path=');
    });
  });

  describe('Breadcrumbs', () => {
    test('should generate correct breadcrumbs for root', () => {
      const breadcrumbs = server.generateBreadcrumbs('');
      expect(breadcrumbs).toBe('Project Root');
    });

    test('should generate correct breadcrumbs for nested path', () => {
      const breadcrumbs = server.generateBreadcrumbs('tests/unit');
      expect(breadcrumbs).toContain('Project Root');
      expect(breadcrumbs).toContain('tests');
      expect(breadcrumbs).toContain('unit');
    });
  });
});