/**
 * Performance Monitor untuk Settings Manager
 * Monitor real-time performance dan statistics
 */

class SettingsPerformanceMonitor {
    constructor() {
        this.stats = {
            totalCalls: 0,
            cacheHits: 0,
            cacheMisses: 0,
            fileReads: 0,
            avgResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: Infinity,
            responseTimes: [],
            lastReset: Date.now()
        };
        
        this.isEnabled = process.env.NODE_ENV !== 'production'; // Disable di production
    }
    
    recordCall(startTime, wasCacheHit = false) {
        if (!this.isEnabled) return;
        
        const responseTime = Date.now() - startTime;
        
        this.stats.totalCalls++;
        this.stats.responseTimes.push(responseTime);
        
        if (wasCacheHit) {
            this.stats.cacheHits++;
        } else {
            this.stats.cacheMisses++;
            this.stats.fileReads++;
        }
        
        // Update response time stats
        this.stats.maxResponseTime = Math.max(this.stats.maxResponseTime, responseTime);
        this.stats.minResponseTime = Math.min(this.stats.minResponseTime, responseTime);
        
        // Calculate running average (last 100 calls)
        if (this.stats.responseTimes.length > 100) {
            this.stats.responseTimes = this.stats.responseTimes.slice(-100);
        }
        
        this.stats.avgResponseTime = this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length;
    }
    
    getStats() {
        const uptime = Date.now() - this.stats.lastReset;
        const cacheHitRate = this.stats.totalCalls > 0 ? 
            (this.stats.cacheHits / this.stats.totalCalls * 100).toFixed(2) : 0;
        
        return {
            ...this.stats,
            uptime: uptime,
            cacheHitRate: `${cacheHitRate}%`,
            callsPerSecond: this.stats.totalCalls > 0 ? 
                (this.stats.totalCalls / (uptime / 1000)).toFixed(2) : 0
        };
    }
    
    getPerformanceReport() {
        const stats = this.getStats();
        
        return `
📊 Settings Manager Performance Report
=====================================
⏱️  Uptime: ${Math.round(stats.uptime / 1000)}s
📞 Total Calls: ${stats.totalCalls}
🎯 Cache Hit Rate: ${stats.cacheHitRate}
📈 Calls/second: ${stats.callsPerSecond}

Response Times:
  • Average: ${stats.avgResponseTime.toFixed(2)}ms
  • Min: ${stats.minResponseTime === Infinity ? 'N/A' : stats.minResponseTime}ms  
  • Max: ${stats.maxResponseTime}ms

Cache Performance:
  • Cache Hits: ${stats.cacheHits}
  • Cache Misses: ${stats.cacheMisses}
  • File Reads: ${stats.fileReads}

Performance Status: ${this.getPerformanceStatus(stats)}
        `.trim();
    }
    
    getPerformanceStatus(stats) {
        if (stats.avgResponseTime < 0.5) {
            return '✅ EXCELLENT';
        } else if (stats.avgResponseTime < 2) {
            return '✅ GOOD';
        } else if (stats.avgResponseTime < 5) {
            return '⚠️ ACCEPTABLE';
        } else {
            return '❌ POOR - May cause delays';
        }
    }
    
    reset() {
        this.stats = {
            totalCalls: 0,
            cacheHits: 0,
            cacheMisses: 0,
            fileReads: 0,
            avgResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: Infinity,
            responseTimes: [],
            lastReset: Date.now()
        };
    }
    
    // Method untuk debugging via WhatsApp command
    getQuickStats() {
        const stats = this.getStats();
        return `📊 Settings Performance: ${stats.totalCalls} calls, ${stats.cacheHitRate} cache hit, ${stats.avgResponseTime.toFixed(1)}ms avg`;
    }
}

// Singleton instance
const monitor = new SettingsPerformanceMonitor();

module.exports = monitor;
