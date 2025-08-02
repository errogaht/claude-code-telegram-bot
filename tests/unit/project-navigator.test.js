/**
 * Unit Tests for ProjectNavigator
 * Tests project navigation, directory management, and Claude project integration
 */

const ProjectNavigator = require('../../ProjectNavigator');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('os');

const createMockBot = () => ({
  sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  editMessageText: jest.fn().mockResolvedValue(true),
  safeSendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
  safeEditMessage: jest.fn().mockResolvedValue(true)
});

const createMockOptions = () => ({
  workingDirectory: '/current/project'
});

describe('ProjectNavigator', () => {
  let projectNavigator;
  let mockBot;
  let mockOptions;
  let mockFs;
  let mockPath;
  let mockOs;

  beforeEach(() => {
    mockBot = createMockBot();
    mockOptions = createMockOptions();
    mockFs = fs;
    mockPath = path;
    mockOs = os;

    projectNavigator = new ProjectNavigator(mockBot, mockOptions, mockBot);

    // Setup default mocks
    mockOs.homedir.mockReturnValue('/home/user');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.basename.mockImplementation((fullPath) => fullPath.split('/').pop());

    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with bot and options', () => {
      expect(projectNavigator.bot).toBe(mockBot);
      expect(projectNavigator.options).toBe(mockOptions);
    });

    test('should initialize empty project cache', () => {
      expect(projectNavigator.projectCache).toBeInstanceOf(Map);
      expect(projectNavigator.projectCache.size).toBe(0);
      expect(projectNavigator.projectCacheCounter).toBe(0);
    });
  });

  describe('Get Claude Projects', () => {
    beforeEach(() => {
      mockPath.join.mockReturnValue('/home/user/.claude.json');
    });

    test('should return empty array if config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual([]);
      expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ ~/.claude.json not found');

      consoleLogSpy.mockRestore();
    });

    test('should return empty array if no projects section exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ someOtherConfig: true }));
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual([]);
      expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ No projects section found in ~/.claude.json');

      consoleLogSpy.mockRestore();
    });

    test('should return existing project directories', () => {
      const claudeConfig = {
        projects: {
          '/home/user/project1': { lastUsed: 1000 },
          '/home/user/project2': { lastUsed: 2000 },
          '/home/user/nonexistent': { lastUsed: 3000 }
        }
      };

      mockFs.existsSync
        .mockReturnValueOnce(true) // .claude.json exists
        .mockReturnValueOnce(true) // project1 exists
        .mockReturnValueOnce(true) // project2 exists
        .mockReturnValueOnce(false); // nonexistent doesn't exist

      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual(['/home/user/project2', '/home/user/project1']); // Sorted by lastUsed desc
    });

    test('should filter out non-directories', () => {
      const claudeConfig = {
        projects: {
          '/home/user/project1': { lastUsed: 1000 },
          '/home/user/file.txt': { lastUsed: 2000 }
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync
        .mockReturnValueOnce({ isDirectory: () => true })
        .mockReturnValueOnce({ isDirectory: () => false });

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual(['/home/user/project1']);
    });

    test('should sort projects by lastUsed timestamp', () => {
      const claudeConfig = {
        projects: {
          '/home/user/old-project': { lastUsed: 1000 },
          '/home/user/new-project': { lastUsed: 3000 },
          '/home/user/mid-project': { lastUsed: 2000 }
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual([
        '/home/user/new-project',
        '/home/user/mid-project',
        '/home/user/old-project'
      ]);
    });

    test('should handle projects without lastUsed timestamp', () => {
      const claudeConfig = {
        projects: {
          '/home/user/project1': { lastUsed: 2000 },
          '/home/user/project2': {}, // No lastUsed
          '/home/user/project3': { lastUsed: 1000 }
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual([
        '/home/user/project1',
        '/home/user/project3',
        '/home/user/project2' // No lastUsed should be last
      ]);
    });

    test('should handle JSON parse errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error reading Claude config:',
        expect.any(String)
      );

      consoleErrorSpy.mockRestore();
    });

    test('should handle file system errors', () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error reading Claude config:',
        'Permission denied'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Show Project Selection', () => {
    test('should show message when no projects found', async () => {
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue([]);

      await projectNavigator.showProjectSelection(123);

      expect(mockBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('❌ No Claude projects found')
      );
    });

    test('should show project selection with inline keyboard', async () => {
      const projects = ['/home/user/project1', '/home/user/project2'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(mockBot.safeSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('📋 **Select Claude Project:**'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
    });

    test('should create correct inline keyboard structure', async () => {
      const projects = ['/home/user/project1', '/home/user/project2'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      const call = mockBot.sendMessage.mock.calls[0];
      const keyboard = call[2].reply_markup.inline_keyboard;

      expect(keyboard).toHaveLength(3); // 2 projects + refresh button
      expect(keyboard[0]).toEqual([{
        text: '📁 project1',
        callback_data: 'setdir:p0'
      }]);
      expect(keyboard[1]).toEqual([{
        text: '📁 project2',
        callback_data: 'setdir:p1'
      }]);
      expect(keyboard[2]).toEqual([{
        text: '🔄 Refresh Projects',
        callback_data: 'setdir:refresh'
      }]);
    });

    test('should mark current directory with checkmark', async () => {
      const projects = ['/current/project', '/home/user/other-project'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      const call = mockBot.sendMessage.mock.calls[0];
      const keyboard = call[2].reply_markup.inline_keyboard;

      expect(keyboard[0]).toEqual([{
        text: '✅ project',
        callback_data: 'setdir:p0'
      }]);
      expect(keyboard[1]).toEqual([{
        text: '📁 other-project',
        callback_data: 'setdir:p1'
      }]);
    });

    test('should limit to 15 projects', async () => {
      const projects = Array.from({ length: 20 }, (_, i) => `/home/user/project${i}`);
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      const call = mockBot.sendMessage.mock.calls[0];
      const keyboard = call[2].reply_markup.inline_keyboard;

      expect(keyboard).toHaveLength(16); // 15 projects + refresh button
    });

    test('should cache project paths with short IDs', async () => {
      const projects = ['/home/user/project1', '/home/user/project2'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(projectNavigator.projectCache.get('p0')).toBe('/home/user/project1');
      expect(projectNavigator.projectCache.get('p1')).toBe('/home/user/project2');
      expect(projectNavigator.projectCacheCounter).toBe(2);
    });

    test('should clear cache before creating new selection', async () => {
      // Set up initial cache
      projectNavigator.projectCache.set('old', '/old/path');
      projectNavigator.projectCacheCounter = 5;

      const projects = ['/home/user/project1'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(projectNavigator.projectCache.size).toBe(1);
      expect(projectNavigator.projectCache.has('old')).toBe(false);
      expect(projectNavigator.projectCache.get('p0')).toBe('/home/user/project1');
    });

    test('should include current directory in message', async () => {
      const projects = ['/home/user/project1'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('📁 *Current Directory*\n/current/project'),
        expect.any(Object)
      );
    });
  });

  describe('Project Cache Management', () => {
    test('should generate sequential short IDs', async () => {
      const projects = ['/path1', '/path2', '/path3'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(projectNavigator.projectCache.get('p0')).toBe('/path1');
      expect(projectNavigator.projectCache.get('p1')).toBe('/path2');
      expect(projectNavigator.projectCache.get('p2')).toBe('/path3');
    });

    test('should reset counter when clearing cache', async () => {
      projectNavigator.projectCacheCounter = 10;
      projectNavigator.projectCache.set('test', 'value');

      const projects = ['/home/user/project1'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(projectNavigator.projectCacheCounter).toBe(1);
      expect(projectNavigator.projectCache.get('p0')).toBe('/home/user/project1');
    });

    test('should handle multiple selections without interference', async () => {
      const projects1 = ['/project1'];
      const projects2 = ['/project2', '/project3'];

      projectNavigator.getClaudeProjects = jest.fn()
        .mockReturnValueOnce(projects1)
        .mockReturnValueOnce(projects2);

      await projectNavigator.showProjectSelection(123);
      expect(projectNavigator.projectCache.get('p0')).toBe('/project1');

      await projectNavigator.showProjectSelection(456);
      expect(projectNavigator.projectCache.get('p0')).toBe('/project2');
      expect(projectNavigator.projectCache.get('p1')).toBe('/project3');
      expect(projectNavigator.projectCache.size).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle bot sendMessage errors', async () => {
      mockBot.sendMessage.mockRejectedValueOnce(new Error('Send failed'));
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue([]);

      await expect(projectNavigator.showProjectSelection(123)).rejects.toThrow('Send failed');
    });

    test('should handle getClaudeProjects errors gracefully', async () => {
      projectNavigator.getClaudeProjects = jest.fn().mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(projectNavigator.showProjectSelection(123)).rejects.toThrow('Config error');
    });

    test('should handle invalid project paths', async () => {
      const claudeConfig = {
        projects: {
          '': { lastUsed: 1000 }, // Empty path
          null: { lastUsed: 2000 }, // null path
          '/valid/path': { lastUsed: 3000 }
        }
      };

      mockFs.existsSync
        .mockReturnValueOnce(true) // .claude.json exists
        .mockReturnValueOnce(false) // empty path doesn't exist
        .mockReturnValueOnce(false) // null path doesn't exist  
        .mockReturnValueOnce(true); // valid path exists

      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const projects = projectNavigator.getClaudeProjects();

      expect(projects).toEqual(['/valid/path']);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete project selection workflow', async () => {
      const claudeConfig = {
        projects: {
          '/home/user/active-project': { lastUsed: Date.now() },
          '/home/user/old-project': { lastUsed: Date.now() - 86400000 }
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      await projectNavigator.showProjectSelection(123);

      // Should send message with keyboard
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('📋 *Select Claude Project:*'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              [{ text: '📁 active-project', callback_data: 'setdir:p0' }],
              [{ text: '📁 old-project', callback_data: 'setdir:p1' }],
              [{ text: '🔄 Refresh Projects', callback_data: 'setdir:refresh' }]
            ])
          })
        })
      );

      // Should cache project paths
      expect(projectNavigator.projectCache.get('p0')).toBe('/home/user/active-project');
      expect(projectNavigator.projectCache.get('p1')).toBe('/home/user/old-project');
    });

    test('should handle projects with same basename', async () => {
      const projects = ['/home/user/myapp', '/work/projects/myapp'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      const call = mockBot.sendMessage.mock.calls[0];
      const keyboard = call[2].reply_markup.inline_keyboard;

      expect(keyboard[0]).toEqual([{
        text: '📁 myapp',
        callback_data: 'setdir:p0'
      }]);
      expect(keyboard[1]).toEqual([{
        text: '📁 myapp',
        callback_data: 'setdir:p1'
      }]);

      // Should cache different full paths
      expect(projectNavigator.projectCache.get('p0')).toBe('/home/user/myapp');
      expect(projectNavigator.projectCache.get('p1')).toBe('/work/projects/myapp');
    });

    test('should handle edge case with no home directory', async () => {
      mockOs.homedir.mockImplementation(() => {
        throw new Error('No home directory');
      });

      const projects = projectNavigator.getClaudeProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('Path Utilities', () => {
    test('should correctly extract project names', async () => {
      const projects = [
        '/very/long/path/to/my-awesome-project',
        '/short/path',
        '/single'
      ];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      const call = mockBot.sendMessage.mock.calls[0];
      const keyboard = call[2].reply_markup.inline_keyboard;

      expect(keyboard[0][0].text).toBe('📁 my-awesome-project');
      expect(keyboard[1][0].text).toBe('📁 path');
      expect(keyboard[2][0].text).toBe('📁 single');
    });

    test('should handle paths with trailing slashes', async () => {
      const projects = ['/home/user/project/'];
      projectNavigator.getClaudeProjects = jest.fn().mockReturnValue(projects);

      await projectNavigator.showProjectSelection(123);

      expect(projectNavigator.projectCache.get('p0')).toBe('/home/user/project/');
    });
  });

  describe('Configuration Validation', () => {
    test('should handle malformed project entries', async () => {
      const claudeConfig = {
        projects: {
          '/valid/project': { lastUsed: 1000 },
          '/another/project': 'invalid-config', // String instead of object
          '/third/project': null // Null config
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(claudeConfig));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const projects = projectNavigator.getClaudeProjects();

      // Should still include all projects, just treat invalid configs as having no lastUsed
      expect(projects).toHaveLength(3);
      expect(projects).toContain('/valid/project');
      expect(projects).toContain('/another/project');
      expect(projects).toContain('/third/project');
    });
  });
});