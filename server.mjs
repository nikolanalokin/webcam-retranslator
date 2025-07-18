import EventEmitter from 'node:events'
import { spawn } from 'node:child_process'
import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'

const isWebm = process.argv[2] === 'webm' ? true : false

console.log('webm enabled', isWebm)

const app = express()

app.use(express.static('./static'))

const server = app.listen(3000, () => {
    console.log('MJPEG stream server listening on port 3000')
})

// process.on('SIGINT', () => {
//     console.log('process SIGINT')
//     webcam.stop()
//     server.close(() => process.exit(1))
// })

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

            ...(isWebm ? [
                '-c:v', 'libvpx', // Кодек VP8
                '-b:v', '256k',
                '-vf', 'scale=240:-1',
                '-f', 'webm',
            ] : [
                '-f', 'mjpeg',
                '-q:v', '5',
                '-vf', 'scale=240:-1',
                '-r', '15',
            ]),

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
        'access-control-allow-origin': '*',

        ...(isWebm ? {
            // 'transfer-encoding': 'chunked',
            'content-type': 'video/webm',
            'cache-control': 'no-cache'
        } : {
            'content-type': 'multipart/x-mixed-replace;boundary=--boundary',
            'cache-control': 'no-cache'
        })
    })

    function handleData (data) {
        if (isWebm) {
            res.write(data, 'binary')
        } else {
            res.write('--boundary\r\n')
            res.write('Content-Type: image/jpeg\r\n')
            res.write('Content-Length: ' + data.length + '\r\n')
            res.write('\r\n')
            res.write(data, 'binary')
            res.write('\r\n')
        }
    }

    function handleEnd () {
        res.end()
    }

    webcam.on('data', handleData)
    webcam.on('end', handleEnd)

    function close () {
        webcam.off('data', handleData)
        webcam.off('end', handleEnd)

        if (isWebm) webcam.stop()
    }

    if (isWebm) webcam.start()

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

if (!isWebm) {
    webcam.start()
}
