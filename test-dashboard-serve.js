#!/usr/bin/env node
/**
 * ForgeFlow v2 Dashboard Server Test
 * Quick test to verify the dashboard serves correctly
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3011; // Use different port to avoid conflicts
const DASHBOARD_PATH = path.join(__dirname, 'dist', 'web', 'public', 'index.html');

console.log('🧪 ForgeFlow v2 Dashboard Server Test');
console.log('=====================================');

// Create a simple server to serve the dashboard
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        try {
            const dashboardContent = fs.readFileSync(DASHBOARD_PATH, 'utf8');
            
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
            });
            res.end(dashboardContent);
            
            console.log(`✅ Served dashboard successfully to ${req.connection.remoteAddress}`);
        } catch (error) {
            console.error(`❌ Error serving dashboard: ${error.message}`);
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Server Error');
        }
    } else {
        // For any other requests, return 404
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Not Found');
    }
});

// Start server
server.listen(PORT, (err) => {
    if (err) {
        console.error(`❌ Failed to start server: ${err.message}`);
        process.exit(1);
    }
    
    console.log(`🚀 Dashboard test server started on port ${PORT}`);
    console.log(`📂 Serving: ${DASHBOARD_PATH}`);
    console.log(`🌐 Test URL: http://localhost:${PORT}`);
    console.log('\n✅ Dashboard Validation Points:');
    console.log('   1. Page loads without JavaScript errors');
    console.log('   2. Lucide icons display properly (no 404 errors)');
    console.log('   3. WebSocket connection attempts (may fail without backend)');
    console.log('   4. API calls made to load data (will show loading states)');
    console.log('   5. Error handling graceful when backend unavailable');
    
    console.log('\n🔍 Check browser console for:');
    console.log('   • "✅ Lucide icons initialized successfully"');
    console.log('   • "🚀 ForgeFlow v2 Dashboard initializing..."');
    console.log('   • "✅ Core functionality initialized"');
    console.log('   • "✅ ForgeFlow v2 Dashboard initialization complete"');
    
    console.log('\n⏱️  Server will auto-close in 30 seconds...');
    
    // Auto-close after 30 seconds
    setTimeout(() => {
        console.log('\n🛑 Test server shutting down...');
        server.close(() => {
            console.log('✅ Dashboard server test complete!');
            process.exit(0);
        });
    }, 30000);
});

// Handle server errors
server.on('error', (err) => {
    console.error(`❌ Server error: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
        console.log(`💡 Port ${PORT} is in use. Try stopping other servers first.`);
    }
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down test server...');
    server.close(() => {
        console.log('✅ Test server closed gracefully');
        process.exit(0);
    });
});