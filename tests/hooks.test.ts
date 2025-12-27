import { describe, it, expect, mock } from "bun:test";
import { kfgDriver, Kfg, c } from "../src";

describe("Driver Hooks: onRequest and unmount", () => {
    it("should call onRequest before every operation", async () => {
        let requestCount = 0;
        const hookDriver = kfgDriver<any>((config) => ({
            name: "hook-driver",
            async: false,
            onRequest() {
                requestCount++;
            },
            load(schema, opts) { return { foo: "bar" }; },
            set(key, value, options) {},
            del(key, options) {}
        }));

        const config = new Kfg(hookDriver, { foo: c.string() });
        
        // config.load() calls driver.load()
        // and currently my Kfg implementation also calls driver.inject() inside load
        // so it might call onRequest twice if inject also triggers it.
        await config.load();
        const countAfterLoad = requestCount;
        expect(countAfterLoad).toBeGreaterThanOrEqual(1);

        // Reset for clean count if possible or just check increments
        const baseCount = requestCount;
        
        config.get("foo");
        expect(requestCount).toBe(baseCount + 1);

        // config.set calls driver.get() THEN driver.set()
        await config.set("foo", "baz");
        expect(requestCount).toBe(baseCount + 3); // +1 for get, +1 for set, +1 for previous? 
        // wait, let's just check it increases.
    });

    it("should handle async onRequest properly", async () => {
        let val = 0;
        const asyncHookDriver = kfgDriver<any>((config) => ({
            name: "async-hook-driver",
            async: true,
            async onRequest() {
                await new Promise(resolve => setTimeout(resolve, 10));
                val = 42;
            },
            async load(schema, opts) { return { val }; }
        }));

        const config = new Kfg(asyncHookDriver, { val: c.number() });
        await config.load();
        
        expect(await config.get("val")).toBe(42);
    });

    it("should call unmount when requested", () => {
        let unmounted = false;
        const unmountDriver = kfgDriver<any>((config) => ({
            name: "unmount-driver",
            async: false,
            unmount() {
                unmounted = true;
            }
        }));

        const config = new Kfg(unmountDriver, {});
        config.unmount();
        expect(unmounted).toBe(true);
    });

    it("should allow state management via closures (Example Cache Logic)", async () => {
        const cacheDriver = kfgDriver<{ cache_time: number }>((opts) => {
            let data: any = null;
            let lastFetch = 0;

            return {
                name: "cache-driver",
                async: false,
                onRequest() {
                    const now = Date.now();
                    if (!data || now - lastFetch > (opts.cache_time ?? 5000)) {
                        // Simulate expensive load
                        data = { timestamp: now };
                        lastFetch = now;
                    }
                },
                load() { return data; },
                get(key) { return key ? data[key] : data; }
            };
        });

        const config = new Kfg(cacheDriver({ cache_time: 100 }), { timestamp: c.number() });
        await config.load();
        const t1 = await config.get("timestamp");

        // Immediate call should be cached
        const t2 = await config.get("timestamp");
        expect(t1).toBe(t2);

        // Wait for expiry
        await new Promise(resolve => setTimeout(resolve, 150));
        const t3 = await config.get("timestamp");
        expect(t3).toBeGreaterThan(t1);
    });
});