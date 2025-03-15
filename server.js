import http from "http";
import { WebSocketServer } from "ws";

// สร้าง HTTP Server เพื่อรองรับ WebSocket และจัดการ HTTP Request
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket Server Running");
});

// ผูก WebSocket Server กับ HTTP Server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");
  let running = false;
  ws.on("message", (message) => {
    let msg = message.toString();
    try {
      msg = JSON.parse(msg);
    } catch {}
    if (msg["command"] === "start") {
      running = true;
    }
    if (msg["command"] === "stop") {
      running = false;
    }
    console.log(running);
    console.log("Received:", msg);
    ws.send(message);
  });

  function generateECGWave(i) {
    const t = (i % 100) / 100;
    if (t < 0.1) return 120; // P wave
    if (t < 0.15) return 85; // PR segment
    if (t < 0.2) return 150; // QRS Complex (sharp peak)
    if (t < 0.3) return 75; // ST segment
    if (t < 0.35) return 110; // T wave
    return 80; // Baseline
  }

  function saveAsAudio(ecgData) {
    if (ecgData.length === 0) {
      alert("❌ ไม่มีข้อมูลให้บันทึก!");
      return;
    }

    const sampleRate = 44100; // ความละเอียดเสียง
    const audioContext = new AudioContext();
    const buffer = audioContext.createBuffer(1, ecgData.length, sampleRate);
    const channelData = buffer.getChannelData(0);

    // แปลงค่า ECG ให้เป็นเสียง
    for (let i = 0; i < ecgData.length; i++) {
      channelData[i] = (ecgData[i] - 80) / 40; // Normalize อยู่ในช่วง -1 ถึง 1
    }

    // แปลงเป็น WAV
    const offlineCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start();

    offlineCtx
      .startRendering()
      .then((renderedBuffer) => {
        const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
        const url = URL.createObjectURL(wavBlob);

        // ดาวน์โหลดไฟล์เสียง
        const a = document.createElement("a");
        a.href = url;
        a.download = "heart_sound.wav";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch((error) => {
        console.error("❌ Error generating audio file:", error);
      });
  }

  // ฟังก์ชันแปลง AudioBuffer เป็นไฟล์ WAV
  function bufferToWave(abuffer, len) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    const setUint16 = (data) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // "RIFF" chunk descriptor
    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);

    // "fmt " sub-chunk
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);

    // "data" sub-chunk
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    // Write interleaved data
    for (i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // Clip
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0; // Scale
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  ws.send(JSON.stringify({ message: "Welcome to WebSocket Server!" }));
  let i = 0;
  setInterval(() => {
    if (running) {
      ws.send(
        JSON.stringify({
          data: generateECGWave(i),
          time: Date.now(),
        })
      );
      i++;
    }
  }, 1);
});

server.listen(8080, () => {
  console.log("✅ Server running on http://localhost:8080");
  console.log("✅ WebSocket running on ws://localhost:8080");
});
