import { c, ConfigJS, envDriver } from './src';
const config = new ConfigJS(envDriver, {
    app: {
        port: c.number({
            default: 4555
        }),
    },
    port: c.number({
        default: 6300
    }),
    is_live: c.boolean({
        default: true
    }),
    is_off: c.boolean({
        default: true
    }),
    num_one: c.boolean({
        default: true
    }),
});
config.load();
config.get('app.port')
config.set('app.port', 3000);