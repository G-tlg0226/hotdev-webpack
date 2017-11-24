import { PassThrough } from 'stream'
import { HotdevWebpackOptions } from './lib/HotdevWebpackOptions'
import { MixWebpackToNodeServer } from './lib/MixWebpackToNodeServer'

let mix = null
const stream = new PassThrough()

/**
 * @description For koa middleware
 * @param {object} options
 */
export function koaMiddleware(options = {}) {
    options = new HotdevWebpackOptions(options)
    if(options === false) {
        return async(ctx, next) => {
            ctx.throw('根据你传入的配置得出webpack并没有和当前的KOA实例融合！')
        }
    }
    if(!mix) {
        mix = new MixWebpackToNodeServer(options)
    }
    return async(ctx, next) => {
        await new Promise((resolve, reject) => {
            mix.load({
                locals: ctx.state,
                setHeader: ctx.set.bind(ctx),
                write: stream.write.bind(stream),
                writeHead: (status, headers) => {
                    ctx.body = stream
                    ctx.status = status
                    ctx.set(headers)
                },
                end: (content) => {
                    ctx.body = content
                    resolve()
                }
            }, () => {
                mix.handler(ctx.req, ctx.res, next)
            })
        })
    }
}
