/**
 * Cache Utility untuk Optimasi Performance
 * Enhancement untuk sistem mapping ONU tanpa mengubah fungsi existing
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 5 menit default
    }

    /**
     * Set cache dengan TTL
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, data, ttl = this.defaultTTL) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now(),
            ttl: ttl
        });
    }

    /**
     * Get cache data jika masih valid
     * @param {string} key - Cache key
     * @returns {any|null} - Cached data or null if expired/not found
     */
    get(key) {
        const cached = this.cache.get(key);
        
        if (!cached) {
            return null;
        }

        // Check if expired
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * Clear specific cache key
     * @param {string} key - Cache key to clear
     */
    clear(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clearAll() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {object} - Cache stats
     */
    getStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > value.ttl) {
                expiredEntries++;
            } else {
                validEntries++;
            }
        }

        return {
            totalEntries: this.cache.size,
            validEntries,
            expiredEntries,
            memoryUsage: this.cache.size
        };
    }

    /**
     * Clean expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > value.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

// Singleton instance
const cacheManager = new CacheManager();

// Auto cleanup setiap 10 menit
setInterval(() => {
    cacheManager.cleanup();
}, 10 * 60 * 1000);

module.exports = cacheManager;
