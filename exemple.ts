import { c, ConfigJS, envDriver } from './src';
enum AppTest {
    a,
    n
}
const config = new ConfigJS(envDriver, {
    app: {
        port: c.number({
            prop:"DEFAILT",
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
        default: false
    }),
    owners: c.array(c.string(), {
        default: [],
        description: "The Owners of bot"
    }),
    test: c.enum(AppTest, {
        default: AppTest.a,
        description: "The Owners of bot"
    }),
});

config.load();
console.log(config.get('app.port'))
console.log(config.get('test'))
config.set('owners',["test", 'aaaaa', '123'])
config.set('app.port', 3000);