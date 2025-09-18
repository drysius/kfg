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
    owners: c.array(c.string({
        default: [],
    }), {
        prop: 'BOT_OWNERS',
        description: "The Owners of bot"
    }),
});
config.load();
config.get('owners')
config.set('app.port', 3000);