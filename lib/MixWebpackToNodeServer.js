import { join } from 'path'
import url from 'url'
import mime from 'mime'
import querystring from 'querystring'
import parseRange from 'range-parser'
import HotdevWebpackWatcher from './HotdevWebpackWatcher'

const urlParse = url.parse

const HASH_REGEXP = /[0-9a-f]{10,}/

function pathMatch(url, path) {
    if(url === path) {
        return true
    }
    let q = url.indexOf('?')
    if(q === -1) {
        return false
    }
    return url.substring(0, q) === path
}


// webpack mix to Server Context
export class MixWebpackToNodeServer extends HotdevWebpackWatcher {
    constructor({ hotdev, compiler }) {
        super(compiler, hotdev)
        this.serverOptions = null
        this.start()
    }

    // load server Options
    load(serverOptions, callback = () => { }) {
        this.serverOptions = serverOptions
        callback()
    }

    // TCP Handler
    handler(req, res, next) {
        getFilenameFromUrl.bind(this, context.options.publicPath, context.compiler)
        function goNext() {
            if(!context.options.serverSideRender) {
                return next()
            }
            return new Promise(function(resolve) {
                shared.ready(function() {
                    res.locals.webpackStats = context.webpackStats
                    resolve(next())
                }, req)
            })
        }

        if(req.method !== 'GET') {
            return goNext()
        }

        let filename = getFilenameFromUrl(context.options.publicPath, context.compiler, req.url)
        if(filename === false) {
            return goNext()
        }

        return new Promise(function(resolve) {
            shared.handleRequest(filename, processRequest, req)
            function processRequest() {
                try {
                    let stat = context.fs.statSync(filename)
                    if(!stat.isFile()) {
                        if(stat.isDirectory()) {
                            let index = context.options.index

                            if(index === undefined || index === true) {
                                index = 'index.html'
                            } else if(!index) {
                                throw 'next'
                            }

                            filename = join(filename, index)
                            stat = context.fs.statSync(filename)
                            if(!stat.isFile()) {
                                throw 'next'
                            }
                        } else {
                            throw 'next'
                        }
                    }
                } catch(e) {
                    return resolve(goNext())
                }

                // server content
                let content = context.fs.readFileSync(filename)
                content = shared.handleRangeHeaders(content, req, res)
                res.setHeader('Content-Type', mime.lookup(filename) + '; charset=UTF-8')
                res.setHeader('Content-Length', content.length)
                if(context.options.headers) {
                    for(let name in context.options.headers) {
                        res.setHeader(name, context.options.headers[name])
                    }
                }

                // Express automatically sets the statusCode to 200, but not all servers do (Koa).
                res.statusCode = res.statusCode || 200
                if(res.send) {
                    res.send(content)
                } else {
                    res.end(content)
                }
                resolve()
            }
        })

        opts = opts || {}
        opts.log = typeof opts.log === 'undefined' ? console.log.bind(console) : opts.log
        opts.path = opts.path || '/__webpack_hmr'
        opts.heartbeat = opts.heartbeat || 10 * 1000

        let eventStream = createEventStream(opts.heartbeat)
        let latestStats = null
        let middleware = function(req, res, next) {
            if(!pathMatch(req.url, opts.path)) {
                return next()
            }
            eventStream.handler(req, res)
            if(latestStats) {
                // Explicitly not passing in `log` fn as we don't want to log again on
                // the server
                publishStats('sync', latestStats, eventStream)
            }
        }
        middleware.publish = eventStream.publish
        return middleware
    }

    handleRangeHeaders(content, req, res) {
        //assumes express API. For other servers, need to add logic to access alternative header APIs
        res.setHeader('Accept-Ranges', 'bytes')
        if(req.headers.range) {
            let ranges = parseRange(content.length, req.headers.range)

            // unsatisfiable
            if(-1 === ranges) {
                res.setHeader('Content-Range', 'bytes */' + content.length)
                res.statusCode = 416
            }

            // valid (syntactically invalid/multiple ranges are treated as a regular response)
            if(-2 !== ranges && ranges.length === 1) {
                // Content-Range
                res.statusCode = 206
                let length = content.length
                res.setHeader(
                    'Content-Range',
                    'bytes ' + ranges[0].start + '-' + ranges[0].end + '/' + length
                )

                content = content.slice(ranges[0].start, ranges[0].end + 1)
            }
        }
        return content
    }

    handleRequest(filename, processRequest, req) {
        if(this.options.lazy && (!this.options.filename || this.options.filename.test(filename))) {
            this.rebuild()
        }
        if(HASH_REGEXP.test(filename)) {
            try {
                if(this.fs.statSync(filename).isFile()) {
                    processRequest()
                    return
                }
            } catch(e) {
            }
        }
    }

    getFilenameFromUrl(publicPath, outputPath, url) {
        let filename

        // localPrefix is the folder our bundle should be in
        let localPrefix = urlParse(publicPath || '/', false, true)
        let urlObject = urlParse(url)

        // publicPath has the hostname that is not the same as request url's, should fail
        if(localPrefix.hostname !== null && urlObject.hostname !== null &&
            localPrefix.hostname !== urlObject.hostname) {
            return false
        }

        // publicPath is not in url, so it should fail
        if(publicPath && localPrefix.hostname === urlObject.hostname && url.indexOf(publicPath) !== 0) {
            return false
        }

        // strip localPrefix from the start of url
        if(urlObject.pathname.indexOf(localPrefix.pathname) === 0) {
            filename = urlObject.pathname.substr(localPrefix.pathname.length)
        }

        if(!urlObject.hostname && localPrefix.hostname &&
            url.indexOf(localPrefix.path) !== 0) {
            return false
        }

        // and if not match, use outputPath as filename
        return querystring.unescape(filename ? join(outputPath, filename) : outputPath)
    }

    getFilenameFromUrl(publicPath, compiler, url) {
        let paths = getPaths(publicPath, compiler, url)
        return getFilenameFromUrl(paths.publicPath, paths.outputPath, url)
    }

    getPaths(publicPath, compiler, url) {
        let compilers = compiler && compiler.compilers
        if(Array.isArray(compilers)) {
            let compilerPublicPath
            for(let i = 0; i < compilers.length; i++) {
                compilerPublicPath = compilers[i].options
                    && compilers[i].options.output
                    && compilers[i].options.output.publicPath
                if(url.indexOf(compilerPublicPath) === 0) {
                    return {
                        publicPath: compilerPublicPath,
                        outputPath: compilers[i].outputPath
                    }
                }
            }
        }
        return {
            publicPath: publicPath,
            outputPath: compiler.outputPath
        }
    }

    createEventStream(heartbeat) {
        let clientId = 0
        let clients = {}
        function everyClient(fn) {
            Object.keys(clients).forEach(function(id) {
                fn(clients[id])
            })
        }
        setInterval(function heartbeatTick() {
            everyClient(function(client) {
                client.write('data: \uD83D\uDC93\n\n')
            })
        }, heartbeat).unref()
        return {
            handler: function(req, res) {
                req.socket.setKeepAlive(true)
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'text/event-stream;charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no'
                })
                res.write('\n')
                let id = clientId++
                clients[id] = res
                req.on('close', function() {
                    delete clients[id]
                })
            },
            publish: function(payload) {
                everyClient(function(client) {
                    client.write('data: ' + JSON.stringify(payload) + '\n\n')
                })
            }
        }
    }

    publishStats(action, statsResult, eventStream, log) {
        // For multi-compiler, stats will be an object with a 'children' array of stats
        let bundles = extractBundles(statsResult.toJson({ errorDetails: false }))
        bundles.forEach(function(stats) {
            if(log) {
                log('webpack built ' + (stats.name ? stats.name + ' ' : '') + stats.hash + ' in ' + stats.time + 'ms')
            }
            eventStream.publish({
                name: stats.name,
                action: action,
                time: stats.time,
                hash: stats.hash,
                warnings: stats.warnings || [],
                errors: stats.errors || [],
                modules: buildModuleMap(stats.modules)
            })
        })
    }

    extractBundles(stats) {
        // Stats has modules, single bundle
        if(stats.modules) {
            return [stats]
        }

        // Stats has children, multiple bundles
        if(stats.children && stats.children.length) {
            return stats.children
        }

        // Not sure, assume single
        return [stats]
    }

    buildModuleMap(modules) {
        let map = {}
        modules.forEach(function(module) {
            map[module.id] = module.name
        })
        return map
    }
}

