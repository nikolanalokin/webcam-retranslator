import { spawn } from 'node:child_process'
import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'

const app = express()

app.use(express.static('./static'))

const server = app.listen(3000, () => {
    console.log('MJPEG stream server listening on port 3000')
})

const wss = new WebSocketServer({ server })

const ffmpeg = spawn('ffmpeg', [
    '-i', '/dev/video0',
    '-f', 'mjpeg',
    '-q:v', '5',
    '-vf', 'scale=240:-1',
    '-r', '15',
    'pipe:1' // Output to stdout
])

ffmpeg.stderr.on('data', (data) => {
    console.error(`ffmpeg stderr: ${data}`)
})

ffmpeg.stdout.on('data', (data) => {
    mjpeg.emit(data)
})

app.get('/stream', (req, res) => {
    console.log('stream request')

    ffmpeg.stdout.on('end', () => {
        res.end()
    })

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace;boundary=--boundary',
        'Cache-Control': 'no-cache'
    })

    const unsubscribe = mjpeg.subscribe((data) => {
        res.write('--boundary\r\n')
        res.write('Content-Type: image/jpeg\r\n')
        res.write('Content-Length: ' + data.length + '\r\n')
        res.write('\r\n')
        res.write(data, 'binary')
        res.write('\r\n')
    })

    function close () {
        unsubscribe()
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

app.get('/kill', (req, res) => {
    console.log('kill request')

    ffmpeg.kill('SIGINT')

    res.end()
})

wss.on('connection', (ws) => {
    console.log('Client connected')

    const unsubscribe = mjpeg.subscribe((data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, { binary: true })
        }
    })

    ws.on('close', () => {
        console.log('Client disconnected')
        unsubscribe()
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
