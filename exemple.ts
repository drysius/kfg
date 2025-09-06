import { c, ConfigJS, envDriver } from './src';
const config = new ConfigJS({
    driver: envDriver,
    schema: {
        app: {
            port: c.number(),
        },
        port: c.number(),
        is_live: c.boolean(),
        is_off: c.boolean(),
        num_one: c.boolean(),
    }
});

config.get('app.port')
config.set('app.port', 3000);