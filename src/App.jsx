import React, { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const RealTimeChart = () => {
  const [realData, setRealData] = useState([]);
  const [data, setData] = useState([]);
  const [socket, setSocket] = useState(null);
  const [running, setRunning] = useState(false);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");
    setSocket(ws);

    ws.onopen = () => console.log("✅ Connected to WebSocket");

    ws.onmessage = (event) => {
      let receivedData = event.data;
      try {
        receivedData = JSON.parse(receivedData);
      } catch {}

      if (receivedData.data && receivedData.time) {
        setData((prevData) => [
          ...prevData.slice(-500),
          {
            time: new Date(receivedData.time).toLocaleTimeString(),
            value: receivedData.data,
          },
        ]);
        setRealData((prevData) => [
          ...prevData,
          {
            time: new Date(receivedData.time).toLocaleTimeString(),
            value: receivedData.data,
          },
        ]);
      }
    };

    ws.onclose = () => console.log("❌ WebSocket disconnected");

    return () => ws.close();
  }, []);

  const toggleStreaming = () => {
    if (socket) {
      setRunning(!running);
      socket.send(JSON.stringify({ command: running ? "stop" : "start" }));
    }
  };

  const clearData = () => {
    setData([]);
    socket.send(JSON.stringify({ command: "clear" }));
  };

  const saveAsAudio = (ecgData) => {
    console.log(ecgData);
    if (ecgData.length === 0) {
      alert("❌ ไม่มีข้อมูลให้บันทึก!");
      return;
    }

    const sampleRate = 44100;
    const audioContext = new AudioContext();
    const buffer = audioContext.createBuffer(1, ecgData.length, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < ecgData.length; i++) {
      channelData[i] = (ecgData[i].value - 80) / 40; // Normalize อยู่ในช่วง -1 ถึง 1
    }

    const offlineCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start();

    offlineCtx.startRendering().then((renderedBuffer) => {
      const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
      const url = URL.createObjectURL(wavBlob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "heart_sound.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  // แปลง AudioBuffer เป็นไฟล์ WAV
  const bufferToWave = (abuffer, len) => {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i,
      sample,
      offset = 0,
      pos = 0;

    const setUint16 = (data) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-r from-blue-100 to-blue-300 p-5">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl p-6">
        {/* Header */}
        <h2 className="text-3xl font-bold text-center text-blue-600 mb-5">
          STETHOSCOPE MONITOR
        </h2>

        {/* Buttons */}
        <div className="flex flex-wrap justify-center gap-3 mb-5">
          <button
            onClick={toggleStreaming}
            className={`px-6 py-3 rounded-lg text-white text-lg font-medium shadow-md transition-transform transform active:scale-95 cursor-pointer hover:scale-105 ${
              running
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {running ? "Stop" : "Start"}
          </button>
          <button
            onClick={() => saveAsAudio(realData)}
            className="px-5 py-2 bg-blue-500 text-white rounded-lg font-semibold transition duration-300 hover:bg-blue-600 cursor-pointer hover:scale-105"
          >
            Save Audio
          </button>
          <button
            onClick={clearData}
            className="px-6 py-3 rounded-lg bg-orange-500 text-white text-lg font-medium shadow-md transition-transform transform active:scale-95 hover:bg-orange-600 cursor-pointer hover:scale-105"
          >
            Clear Data
          </button>
        </div>

        {/* Chart */}
        <div className="bg-gray-100 rounded-lg p-4 shadow-md">
          <LineChart
            width={window.innerWidth < 768 ? 350 : 700}
            height={400}
            data={data}
          >
            <XAxis dataKey="time" stroke="#1976D2" />
            <YAxis domain={[40, 120]} stroke="#1976D2" />
            <CartesianGrid strokeDasharray="3 3" stroke="#B0BEC5" />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#D32F2F"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </div>
      </div>
    </div>
  );
};

export default RealTimeChart;
