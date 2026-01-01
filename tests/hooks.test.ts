import { describe, it, expect } from "bun:test";
import { KfgDriver, Kfg, c } from "../src";

describe("Driver Hooks: onRequest and unmount", () => {
    it("should call onRequest before every operation", async () => {
        let requestCount = 0;
        const hookDriver = new KfgDriver<any, false>({
            identify: "hook-driver",
            async: false,
            onRequest() {
                requestCount++;
            },
            onMount(kfg, opts) { 
                requestCount++; // Count mount as a request
                return { foo: "bar" }; 
            },
            onGet(kfg, { path }) { return "bar"; }, // Simple mock
            onUpdate(kfg, opts) {},
            onDelete(kfg, opts) {}
        });

        const config = new Kfg(hookDriver, { foo: c.string() });
        
        await config.load();
        const countAfterLoad = requestCount;
        expect(countAfterLoad).toBeGreaterThanOrEqual(1);

        const baseCount = requestCount;
        
        config.get("foo");
        expect(requestCount).toBe(baseCount + 1);

        await config.set("foo", "baz");
        // get + set = +2
        expect(requestCount).toBe(baseCount + 2); 
    });

    it("should handle async onRequest properly", async () => {
        let val = 0;
        const asyncHookDriver = new KfgDriver<any, true>({
            identify: "async-hook-driver",
            async: true,
            async onRequest() {
                await new Promise(resolve => setTimeout(resolve, 10));
                val = 42;
            },
            async onMount(kfg, opts) { return { val }; },
            async onGet(kfg, { path }) {
                if (path === "val") return val;
                return { val };
            }
        });

        const config = new Kfg(asyncHookDriver, { val: c.number() });
        await config.load();
        
        expect(await config.get("val")).toBe(42);
    });

    it("should call unmount when requested", () => {
        let unmounted = false;
        const unmountDriver = new KfgDriver<any, false>({
            identify: "unmount-driver",
            async: false,
            onUnmount() {
                unmounted = true;
            }
        });

        const config = new Kfg(unmountDriver, {});
        config.unmount();
        expect(unmounted).toBe(true);
    });

    it("should allow state management via closures (Example Cache Logic)", async () => {
        const createCacheDriver = (opts: { cache_time: number }) => {
            let data: any = null;
            let lastFetch = 0;

            return new KfgDriver<{ cache_time: number }, false>({
                identify: "cache-driver",
                async: false,
                onRequest() {
                    const now = Date.now();
                    if (!data || now - lastFetch > (opts.cache_time ?? 5000)) {
                        // Simulate expensive load
                        data = { timestamp: now };
                        lastFetch = now;
                    }
                },
                onMount() { 
                    const now = Date.now();
                    if (!data || now - lastFetch > (opts.cache_time ?? 5000)) {
                        data = { timestamp: now };
                        lastFetch = now;
                    }
                    return data;
                },
                onGet(kfg, { path }) { return path ? data[path] : data; }
            });
        };

        const config = new Kfg(createCacheDriver({ cache_time: 100 }), { timestamp: c.number() });
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