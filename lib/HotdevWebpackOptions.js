import assert from 'assert'
import webpack from 'webpack'

// handle hotdev ( default ) Options
function mergeOptions(hotdev) {
    const defaults = {
        headings: hotdev.headings || 'hotdev-webpack :',
        watchOptions: {
            aggregateTimeout: hotdev.watchOptions.aggregateTimeout || 100,
            poll: hotdev.watchOptions.poll || 200,
            ignored: hotdev.watchOptions.ignored || ''
        },
        statsOptions: {
            context: process.cwd()
        },
        heartbeat: hotdev.heartbeat || 100,
        hmrPath: hotdev.hmrPath || '/__pack_hmr/',
        log: {
            out: console.log || hotdev.log,
            info: function(...args) {
                this.out(chalk.green(`[${defaults.headings}]`), ...args)
            },
            error: function(...args) {
                this.out(chalk.red(`[${defaults.headings}]`), ...args)
            },
            warn: function(...args) {
                this.out(chalk.yellow(`[${defaults.headings}]`), ...args)
            }
        },
        lazy: false,
        mimeTypes: mime.define(hotdev.mimeTypes)
    }

    if(defaults.lazy) {
        if(typeof defaults.filename === 'string') {
            let str = defaults.filename.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')
                .replace(/\\\[[a-z]+\\\]/ig, '.+')
            defaults.filename = new RegExp('^[\/]{0,1}' + str + '$')
        }
    }
    return defaults
}

// hotdev-webpack Options validate
export class HotdevWebpackOptions {

    constructor({ hotdev = null, config = null, compiler = null }) {
        /**
            优先保证config的使用
            ********************************************************
            1 . 当config存在时
                a . 当compiler不存在 或 compiler不是webpack.Compiler实例时 ，由当前config生成一个compiler实例 , 并且悬挂config
                b . 与条件a相反时，抛出断言错误
            2 . 与条件1对立时, 抛出断言错误
        */
        const noComplier = !compiler || !(compiler instanceof webpack.Compiler)
        if(config) {
            if(noComplier) {
                assert.ok(title + '由config产生了compiler实例')
                compiler = webpack(config)
                config = null
            }
        } else if(noComplier) {
            assert.ifError(new Error(title + '请传入一个合理webpack配置或一个webpack.Complier实例'))
            return false
        }
        if(compiler && config) {
            assert.ok(title + '当webpack Config 、Compiler实例同时传入时，忽略对config的处理')
            config = null
        }
        if(!hotdev) {
            assert.ok(title + '没有配置hotdev，webpack只做资源处理用')
            return false
        }
        hotdev = mergeOptions(hotdev)
        hotdev.publicPath = compiler.options.output.publicPath
        return { hotdev, compiler }
    }
}
