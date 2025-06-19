import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'
import ffmpeg from 'fluent-ffmpeg'
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg'

ffmpeg.setFfmpegPath(ffmpegPath)

const app = express()
const port = 3333

// Serve static files
app.use(express.static('public'))

// Create HTTP server
const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`)
})

// // Create WebSocket server
// const wss = new WebSocketServer({ server })

app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'close'
    })

    const command = ffmpeg()
        .input('/dev/video0')
        .inputFormat('v4l2')
        .inputOptions('-input_format mjpeg')
        .outputOptions([
            '-f mjpeg',
            '-update 1', // Важно для MJPEG потока
        ])
        .noAudio()
        .on('start', (cmd) => {
            console.log('FFmpeg started with command:', cmd)
        })
        .on('stderr', (stderr) => {
            console.log('FFmpeg stderr:', stderr)
        })
        .on('error', (err) => {
            console.error('FFmpeg error:', err.message)
            res.end()
        });

    command.pipe(res, { end: false })

    req.on('close', () => {
        console.log('Client disconnected')
        command.kill('SIGKILL')
    })
})
/*
// Webcam stream setup
wss.on('connection', (ws) => {
    console.log('Client connected')

    // Find your webcam device (usually /dev/video0)
    const webcamDevice = '/dev/video0'

    // Create FFmpeg command to capture webcam
    const command = ffmpeg()
        .input(webcamDevice)
        .inputFormat('v4l2')
        .inputOptions([
            '-framerate 30',
            '-video_size 640x360'
        ])
        // .inputFormat('mjpeg')
        // .inputOptions([
        //     '-framerate 30',
        //     // '-video_size 640x360'
        // ])
        .outputFormat('mp4')
        .videoCodec('libx264')
        .noAudio()
        .size('640x360')
        .outputOptions([
            '-movflags frag_keyframe+empty_moov',
            '-f mp4',
            '-preset ultrafast',
            '-tune zerolatency',
        ])
        .on('error', (err) => {
            console.log('Error:', err.message)
        })

    // Pipe FFmpeg output to WebSocket
    const stream = command.pipe()

    // Буферизация данных перед отправкой
    let buffer = Buffer.alloc(0)

    stream.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk)
        }

        // buffer = Buffer.concat([buffer, chunk])

        // // Отправляем данные порциями по 64KB
        // while (buffer.length >= 65536) {
        //     const chunkToSend = buffer.slice(0, 65536)
        //     buffer = buffer.slice(65536)

        //     if (ws.readyState === WebSocket.OPEN) {
        //         ws.send(chunkToSend)
        //     }
        // }
    })

    ws.on('close', () => {
        console.log('Client disconnected')
        stream.destroy()
    })
})
*/
