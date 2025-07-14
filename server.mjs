import EventEmitter from 'node:events'
import { spawn } from 'node:child_process'
import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'

const app = express()

app.use(express.static('./static'))

const server = app.listen(3000, () => {
    console.log('MJPEG stream server listening on port 3000')
})

const wss = new WebSocketServer({ server })

class Webcam extends EventEmitter {
    started = false

    constructor () {
        super()
        this.ffmpeg = null
    }

    start () {
        if (this.started) return

        this.emit('start')

        this.ffmpeg = spawn('ffmpeg', [
            '-i', '/dev/video0',
            '-f', 'mjpeg',
            '-q:v', '5',
            '-vf', 'scale=240:-1',
            '-r', '15',
            'pipe:1' // Output to stdout
        ])

        this.ffmpeg.stderr.on('data', (data) => {
            console.error(`ffmpeg stderr: ${data}`)
        })

        this.ffmpeg.stdout.on('data', (data) => {
            this.emit('data', data)
        })

        this.ffmpeg.stdout.on('end', () => {
            this.emit('end')
        })

        this.started = true
    }

    stop () {
        if (!this.started) return

        this.ffmpeg.kill('SIGINT')
        this.started = false
    }
}

const webcam = new Webcam()

app.get('/stream', (req, res) => {
    console.log('stream request')

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace;boundary=--boundary',
        'Cache-Control': 'no-cache'
    })

    function handleData (data) {
        res.write('--boundary\r\n')
        res.write('Content-Type: image/jpeg\r\n')
        res.write('Content-Length: ' + data.length + '\r\n')
        res.write('\r\n')
        res.write(data, 'binary')
        res.write('\r\n')
    }

    webcam.on('data', handleData)
    webcam.on('end', () => res.end())

    function close () {
        webcam.off('data', handleData)
    }

    req.on('finish', () => {
        console.log('req finish')
        close()
    })

    req.on('close', () => {
        console.log('req close')
        close()
    })

    req.on('error', () => {
        console.log('req error')
        close()
    })
})

app.get('/start', (req, res) => {
    console.log('start request')

    webcam.start()

    res.end()
})

app.get('/stop', (req, res) => {
    console.log('stop request')

    webcam.stop()

    res.end()
})

wss.on('connection', (ws) => {
    console.log('Client connected')

    if (webcam.started) {
        ws.send('start')
    }

    function handleData (data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, { binary: true })
        }
    }

    webcam.on('start', () => ws.send('start'))
    webcam.on('data', handleData)
    webcam.on('end', () => ws.send('end'))

    ws.on('close', () => {
        console.log('Client disconnected')
    })
})

function createEmitter () {
    const listeners = new Set()
    return {
        emit (value) {
            for (const cb of listeners) {
                cb(value)
            }
        },
        subscribe (cb) {
            listeners.add(cb)
            return () => {
                listeners.delete(cb)
            }
        },
        unsubscribeAll () {
            listeners.clear()
        },
    }
}

const mjpeg = createEmitter()

webcam.start()
