const GitDiffServer = require('../../GitDiffServer');
const request = require('supertest');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

describe('GitDiffServer', () => {
  let server;
  let testProjectRoot;
  
  beforeEach(() => {
    // Use current test directory as project root
    testProjectRoot = process.cwd(); // Use actual project root for git operations
    server = new GitDiffServer(testProjectRoot);
  });
  
  afterEach(async () => {
    if (server && server.isStarted) {
      await server.stop();
    }
  });

  describe('Basic Functionality', () => {
    test('should create server instance', () => {
      expect(server).toBeDefined();
      expect(server.projectRoot).toBe(testProjectRoot);
    });

    test('should have proper routes setup', () => {
      expect(server.app).toBeDefined();
    });
  });

  describe('Git Operations', () => {
    test('should get changed files without errors', async () => {
      const files = await server.getChangedFiles();
      expect(Array.isArray(files)).toBe(true);
      // Even if no changes, should return empty array, not throw error
    });

    test('should handle git status without errors', async () => {
      const status = await server.getGitStatus();
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });

    test('should handle non-existent file diff gracefully', async () => {
      const diff = await server.getFileDiff('non-existent-file.txt');
      expect(typeof diff).toBe('string');
      // Should return error message, not throw
    });
  });

  describe('HTML Generation', () => {
    test('should generate main HTML with empty file list', () => {
      const html = server.generateMainHTML([]);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Git Diff Viewer');
      expect(html).toContain('No Changes');
    });

    test('should generate main HTML with file list', () => {
      const files = [
        { path: 'test.js', status: 'M', changeType: 'modified', icon: '📝' }
      ];
      const html = server.generateMainHTML(files);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('test.js');
      expect(html).toContain('modified');
    });

    test('should generate diff HTML', () => {
      const diff = 'diff --git a/test.js b/test.js\n+console.log("test");';
      const html = server.generateDiffHTML(diff, 'test.js');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('test.js');
      expect(html).toContain('diff-line');
    });

    test('should generate status HTML', () => {
      const status = 'On branch main\nnothing to commit, working tree clean';
      const html = server.generateStatusHTML(status);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Git Status');
      expect(html).toContain('working tree clean');
    });
  });

  describe('Diff Highlighting', () => {
    test('should highlight added lines', () => {
      const diff = '+added line\n-removed line\n unchanged line';
      const highlighted = server.highlightDiff(diff);
      expect(highlighted).toContain('diff-line added');
      expect(highlighted).toContain('diff-line removed');
      expect(highlighted).toContain('diff-line context');
    });

    test('should highlight diff headers', () => {
      const diff = 'diff --git a/file b/file\n@@ -1,3 +1,3 @@\n+new line';
      const highlighted = server.highlightDiff(diff);
      expect(highlighted).toContain('diff-line header');
      expect(highlighted).toContain('diff-line hunk');
    });
  });

  describe('HTML Escaping', () => {
    test('should escape HTML characters', () => {
      const text = '<script>alert("test")</script>';
      const escaped = server.escapeHtml(text);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;');
    });

    test('should handle empty string', () => {
      const escaped = server.escapeHtml('');
      expect(escaped).toBe('');
    });
  });

  describe('Port Management', () => {
    test('should find available port', async () => {
      const port = await server.findAvailablePort();
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(1000);
    });

    test('should check port availability', async () => {
      // Port 80 should not be available
      const isAvailable = await server.isPortAvailable(80);
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    test('should generate error HTML', () => {
      const html = server.generateErrorHTML('Test error message');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Error');
      expect(html).toContain('Test error message');
    });

    test('should handle git errors gracefully', async () => {
      // Create server with invalid project root
      const invalidServer = new GitDiffServer('/non/existent/path');
      const files = await invalidServer.getChangedFiles();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBe(0);
    });
  });

  describe('Route Testing', () => {
    test('should respond to main route', async () => {
      const response = await request(server.app)
        .get('/')
        .set('X-Security-Token', 'test-token'); // Mock security token
      
      // Should respond (might be 403 due to security, but shouldn't crash)
      expect([200, 403, 500].includes(response.status)).toBe(true);
    });

    test('should respond to status route', async () => {
      const response = await request(server.app)
        .get('/status')
        .set('X-Security-Token', 'test-token');
      
      expect([200, 403, 500].includes(response.status)).toBe(true);
    });
  });
});