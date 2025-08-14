const request = require('supertest');
const WebServerSecurity = require('../WebServerSecurity');
const BaseWebServer = require('../BaseWebServer');
const FileBrowserServer = require('../FileBrowserServer');
const SimpleStatusPage = require('../examples/SimpleStatusPage');

describe('Security System Integration Tests', () => {
    let security;
    let baseServer;
    let statusPage;
    let fileBrowser;
    const testBotInstance = 'test-bot';

    beforeAll(() => {
        // Create shared security instance for testing
        security = new WebServerSecurity(testBotInstance);
    });

    afterAll(async () => {
        // Clean up all servers
        if (baseServer && baseServer.server) {
            await baseServer.stop();
        }
        if (statusPage && statusPage.server) {
            await statusPage.stop();
        }
        if (fileBrowser && fileBrowser.server) {
            await fileBrowser.stop();
        }
    });

    describe('WebServerSecurity Core Features', () => {
        test('should generate secure 64-character tokens', () => {
            expect(security.getToken()).toBeDefined();
            expect(security.getToken()).toHaveLength(64);
            expect(/^[a-f0-9]+$/.test(security.getToken())).toBe(true);
        });

        test('should generate secure URLs with tokens', () => {
            const url = security.secureUrl('/test', { param: 'value' });
            expect(url).toContain('token=');
            expect(url).toContain('param=value');
            expect(url).toMatch(/^\/test\?.*token=[a-f0-9]{64}/);
        });

        test('should generate secure external URLs', () => {
            const baseUrl = 'https://example.ngrok.io';
            const url = security.secureExternalUrl(baseUrl, '/dashboard', { tab: 'stats' });
            expect(url).toBe(`${baseUrl}/dashboard?tab=stats&token=${security.getToken()}`);
        });

        test('should identify excluded paths correctly', () => {
            expect(security.isPathExcluded('/static/css/style.css')).toBe(true);
            expect(security.isPathExcluded('/assets/images/logo.png')).toBe(true);
            expect(security.isPathExcluded('/public/js/app.js')).toBe(true);
            expect(security.isPathExcluded('/protected-page')).toBe(false);
        });
    });

    describe('BaseWebServer Security Integration', () => {
        beforeAll(() => {
            // Create BaseWebServer with test routes
            baseServer = new BaseWebServer({
                botInstance: testBotInstance,
                security: security,
                routes: [
                    {
                        method: 'GET',
                        path: '/api/test',
                        handler: (req, res) => {
                            res.json({ message: 'API endpoint accessed', botInstance: testBotInstance });
                        }
                    }
                ]
            });
        });

        test('should protect main routes with token authentication', async () => {
            // Test without token - should fail
            const responseUnauth = await request(baseServer.app)
                .get('/')
                .expect(403);
            
            expect(responseUnauth.text).toContain('Access Denied');
            expect(responseUnauth.text).toContain('security token required');

            // Test with valid token - should succeed  
            const responseAuth = await request(baseServer.app)
                .get('/')
                .query({ token: security.getToken() })
                .expect(200);
            
            expect(responseAuth.text).toContain('OK');
        });

        test('should protect custom API routes', async () => {
            // Test API without token
            await request(baseServer.app)
                .get('/api/test')
                .expect(403);

            // Test API with valid token
            const response = await request(baseServer.app)
                .get('/api/test')
                .query({ token: security.getToken() })
                .expect(200);

            expect(response.body.message).toBe('API endpoint accessed');
            expect(response.body.botInstance).toBe(testBotInstance);
        });

        test('should allow access to excluded static paths', async () => {
            // Static paths should not require tokens
            // Note: These will return 404 because files don't exist, but security shouldn't block them
            await request(baseServer.app)
                .get('/static/test.css')
                .expect(404); // File not found, but not blocked by security

            await request(baseServer.app)
                .get('/assets/logo.png')
                .expect(404); // File not found, but not blocked by security
        });

        test('should reject invalid tokens', async () => {
            const invalidToken = 'invalid-token-12345';
            
            await request(baseServer.app)
                .get('/')
                .query({ token: invalidToken })
                .expect(403);
        });
    });

    describe('SimpleStatusPage Security Integration', () => {
        beforeAll(() => {
            statusPage = new SimpleStatusPage(testBotInstance);
            // Use the same security instance for consistent tokens
            statusPage.security = security;
        });

        test('should protect status dashboard', async () => {
            // Without token
            await request(statusPage.app)
                .get('/')
                .expect(403);

            // With valid token
            const response = await request(statusPage.app)
                .get('/')
                .query({ token: security.getToken() })
                .expect(200);

            expect(response.text).toContain('Bot Status Dashboard');
            expect(response.text).toContain(testBotInstance);
        });

        test('should protect system info page', async () => {
            // Without token
            await request(statusPage.app)
                .get('/system')
                .expect(403);

            // With valid token
            const response = await request(statusPage.app)
                .get('/system')
                .query({ token: security.getToken() })
                .expect(200);

            expect(response.text).toContain('System Information');
            expect(response.text).toContain('hostname');
        });

        test('should protect API endpoints', async () => {
            // Without token
            await request(statusPage.app)
                .get('/api/status')
                .expect(403);

            // With valid token
            const response = await request(statusPage.app)
                .get('/api/status')
                .query({ token: security.getToken() })
                .expect(200);

            expect(response.body.status).toBe('active');
            expect(response.body.botInstance).toBe(testBotInstance);
        });
    });

    describe('FileBrowserServer Security Integration', () => {
        beforeAll(() => {
            // Use current working directory as project root for testing
            fileBrowser = new FileBrowserServer(process.cwd(), testBotInstance, null, security);
        });

        test('should protect file browser main page', async () => {
            // Without token
            await request(fileBrowser.app)
                .get('/')
                .expect(403);

            // With valid token
            const response = await request(fileBrowser.app)
                .get('/')
                .query({ token: security.getToken() })
                .expect(200);

            expect(response.text).toContain('Project File Browser');
        });

        test('should protect file viewer', async () => {
            // Without token
            await request(fileBrowser.app)
                .get('/view')
                .query({ path: 'package.json' })
                .expect(403);

            // With valid token (but invalid path to test security, not file system)
            const response = await request(fileBrowser.app)
                .get('/view')
                .query({ 
                    token: security.getToken(),
                    path: 'package.json'
                })
                .expect(200);

            // Should get through security (200) even if file viewing has other logic
        });

        test('should allow static assets without token', async () => {
            // Static assets should bypass token validation
            await request(fileBrowser.app)
                .get('/static/nonexistent.css')
                .expect(404); // File not found, but security didn't block it
        });
    });

    describe('Security System Cross-Page Consistency', () => {
        test('should use same token across different server types', () => {
            const token1 = baseServer.security.getToken();
            const token2 = statusPage.security.getToken();
            const token3 = fileBrowser.security.getToken();
            
            // All should use the same token since we passed the same security instance
            expect(token1).toBe(token2);
            expect(token2).toBe(token3);
        });

        test('should generate consistent secure URLs across servers', () => {
            const path = '/test-page';
            const params = { id: '123' };
            
            const url1 = baseServer.security.secureUrl(path, params);
            const url2 = statusPage.security.secureUrl(path, params);
            const url3 = fileBrowser.security.secureUrl(path, params);
            
            expect(url1).toBe(url2);
            expect(url2).toBe(url3);
        });

        test('should handle security error pages consistently', async () => {
            // Test error page consistency across different server types
            const baseResponse = await request(baseServer.app).get('/').expect(403);
            const statusResponse = await request(statusPage.app).get('/').expect(403);
            const browserResponse = await request(fileBrowser.app).get('/').expect(403);
            
            // All should contain the same security error elements
            [baseResponse, statusResponse, browserResponse].forEach(response => {
                expect(response.text).toContain('Access Denied');
                expect(response.text).toContain('security token required');
                expect(response.text).toContain('🔒');
            });
        });
    });

    describe('Token Regeneration', () => {
        test('should invalidate old tokens after regeneration', async () => {
            const oldToken = security.getToken();
            
            // Should work with old token
            await request(baseServer.app)
                .get('/')
                .query({ token: oldToken })
                .expect(200);
            
            // Regenerate token
            const newToken = security.regenerateToken();
            expect(newToken).not.toBe(oldToken);
            expect(newToken).toHaveLength(64);
            
            // Old token should no longer work
            await request(baseServer.app)
                .get('/')
                .query({ token: oldToken })
                .expect(403);
            
            // New token should work
            await request(baseServer.app)
                .get('/')
                .query({ token: newToken })
                .expect(200);
        });
    });

    describe('Security Information', () => {
        test('should provide comprehensive security info', () => {
            const info = security.getSecurityInfo();
            
            expect(info).toHaveProperty('botInstance', testBotInstance);
            expect(info).toHaveProperty('tokenLength', 64);
            expect(info).toHaveProperty('tokenPreview');
            expect(info).toHaveProperty('excludedPaths');
            expect(info).toHaveProperty('active', true);
            
            expect(info.excludedPaths).toContain('/static');
            expect(info.excludedPaths).toContain('/assets');
            expect(info.excludedPaths).toContain('/public');
        });
    });
});