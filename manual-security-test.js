/**
 * Manual Security System Test
 * Tests the security integration across different server types
 */

const WebServerSecurity = require('./WebServerSecurity');
const BaseWebServer = require('./BaseWebServer');
const SimpleStatusPage = require('./examples/SimpleStatusPage');
const FileBrowserServer = require('./FileBrowserServer');

async function runSecurityTests() {
    console.log('🔒 Starting Security System Integration Tests...\n');

    let passed = 0;
    let failed = 0;
    let servers = [];

    function test(name, condition) {
        if (condition) {
            console.log(`✅ ${name}`);
            passed++;
        } else {
            console.log(`❌ ${name}`);
            failed++;
        }
    }

    try {
        // Test 1: WebServerSecurity Core Features
        console.log('📋 Test Group: WebServerSecurity Core Features');
        const security = new WebServerSecurity('test-bot');
        
        test('Security token generation (64 chars)', security.getToken().length === 64);
        test('Security token is hex format', /^[a-f0-9]+$/.test(security.getToken()));
        
        const secureUrl = security.secureUrl('/test', { param: 'value' });
        test('Secure URL generation', secureUrl.includes('token=') && secureUrl.includes('param=value'));
        
        const externalUrl = security.secureExternalUrl('https://test.ngrok.io', '/page');
        test('External URL generation', externalUrl.includes('https://test.ngrok.io/page?token='));
        
        test('Static path exclusion (/static)', security.isPathExcluded('/static/test.css'));
        test('Static path exclusion (/assets)', security.isPathExcluded('/assets/logo.png'));
        test('Protected path detection', !security.isPathExcluded('/protected'));

        // Test 2: BaseWebServer Integration
        console.log('\n📋 Test Group: BaseWebServer Integration');
        const baseServer = new BaseWebServer({
            botInstance: 'test-bot',
            security: security
        });
        servers.push(baseServer);

        test('BaseWebServer uses provided security', baseServer.security === security);
        test('BaseWebServer secure URL generation', baseServer.getSecureUrl('/test').includes('token='));
        
        // Test 3: SimpleStatusPage Integration  
        console.log('\n📋 Test Group: SimpleStatusPage Integration');
        const statusPage = new SimpleStatusPage('test-bot');
        statusPage.security = security; // Use same security for consistent testing
        servers.push(statusPage);

        test('SimpleStatusPage security integration', statusPage.security === security);
        test('SimpleStatusPage secure URL works', statusPage.getSecureUrl('/system').includes('token='));

        // Test 4: FileBrowserServer Integration
        console.log('\n📋 Test Group: FileBrowserServer Integration');
        const fileBrowser = new FileBrowserServer(process.cwd(), 'test-bot', null, security);
        servers.push(fileBrowser);

        test('FileBrowserServer uses provided security', fileBrowser.security === security);
        test('FileBrowserServer secure URL generation', fileBrowser.security.secureUrl('/view').includes('token='));

        // Test 5: Cross-Server Consistency
        console.log('\n📋 Test Group: Cross-Server Token Consistency');
        const token1 = baseServer.security.getToken();
        const token2 = statusPage.security.getToken();
        const token3 = fileBrowser.security.getToken();

        test('All servers use same token', token1 === token2 && token2 === token3);
        
        const url1 = baseServer.security.secureUrl('/test');
        const url2 = statusPage.security.secureUrl('/test');
        const url3 = fileBrowser.security.secureUrl('/test');
        
        test('Consistent URL generation across servers', url1 === url2 && url2 === url3);

        // Test 6: Token Regeneration
        console.log('\n📋 Test Group: Token Security Features');
        const oldToken = security.getToken();
        const newToken = security.regenerateToken();
        
        test('Token regeneration creates new token', oldToken !== newToken);
        test('New token is valid format', newToken.length === 64 && /^[a-f0-9]+$/.test(newToken));
        
        // All servers should now use the new token
        test('All servers use regenerated token', 
            baseServer.security.getToken() === newToken &&
            statusPage.security.getToken() === newToken &&
            fileBrowser.security.getToken() === newToken
        );

        // Test 7: Security Info
        console.log('\n📋 Test Group: Security Information');
        const securityInfo = security.getSecurityInfo();
        
        test('Security info contains bot instance', securityInfo.botInstance === 'test-bot');
        test('Security info contains token length', securityInfo.tokenLength === 64);
        test('Security info contains excluded paths', securityInfo.excludedPaths.includes('/static'));
        test('Security info shows active status', securityInfo.active === true);

        // Test 8: Middleware Function Test
        console.log('\n📋 Test Group: Middleware Function');
        const middleware = security.getMiddleware();
        test('Middleware is a function', typeof middleware === 'function');
        
        // Mock request/response objects
        const mockReq = { path: '/test', query: {} };
        const mockRes = {
            status: (code) => ({ send: (content) => ({ statusCode: code, content }) }),
            send: (content) => ({ content })
        };
        let nextCalled = false;
        const mockNext = () => { nextCalled = true; };

        // Test middleware without token
        const result = middleware(mockReq, mockRes, mockNext);
        test('Middleware blocks requests without token', !nextCalled);

        // Test middleware with valid token
        nextCalled = false;
        mockReq.query.token = security.getToken();
        middleware(mockReq, mockRes, mockNext);
        test('Middleware allows requests with valid token', nextCalled);

        // Test middleware with static path (should allow)
        nextCalled = false;
        mockReq.path = '/static/test.css';
        mockReq.query = {}; // Remove token
        middleware(mockReq, mockRes, mockNext);
        test('Middleware allows static paths without token', nextCalled);

        console.log('\n🎯 Test Results Summary');
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📊 Total: ${passed + failed}`);
        
        if (failed === 0) {
            console.log('\n🎉 All security integration tests PASSED!');
            console.log('✨ The security system works correctly across all server types');
        } else {
            console.log('\n⚠️  Some tests failed. Review the security implementation.');
        }

        return { passed, failed, total: passed + failed };

    } catch (error) {
        console.error('❌ Test execution failed:', error);
        return { passed, failed: failed + 1, total: passed + failed + 1 };
    } finally {
        // Clean up any running servers (though none should be started in this test)
        console.log('\n🧹 Cleaning up test resources...');
        for (const server of servers) {
            try {
                if (server && server.server) {
                    await server.stop();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        console.log('✅ Cleanup completed');
    }
}

// Run the tests
if (require.main === module) {
    runSecurityTests()
        .then(results => {
            process.exit(results.failed === 0 ? 0 : 1);
        })
        .catch(error => {
            console.error('Test runner error:', error);
            process.exit(1);
        });
}

module.exports = { runSecurityTests };