const express = require('express');
const { WebSocketServer } = require('ws');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT;

app.use(express.static('public'));

// Store uploaded firmware
const upload = multer({ dest: 'firmware/' });
app.post('/upload', upload.single('firmware'), (req, res) => res.send('Firmware uploaded'));

app.get('/health',(req,res)=>{
  res.status(200
).json({
    message:"success"
})
// OTA endpoint
let devices = [];
app.get('/ota/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const device = devices.find(d => d.id === deviceId);
  if(device && device.ws){
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      device.ws.send(JSON.stringify({ type: 'ota-progress', id: deviceId, progress }));
      if(progress >= 100) clearInterval(interval);
    }, 500);
    res.send(`OTA started for device ${deviceId}`);
  } else {
    res.status(404).send('Device not found');
  }
});

const server = app.listen(PORT, () => console.log(`Backend server running on ${PORT}`));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('Device connected');

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if(data.type === 'register'){
        const existing = devices.find(d => d.id === data.id);
        if(existing){
          existing.status = 'Online';
          existing.ws = ws;
        } else {
          devices.push({
            id: data.id,
            mac: data.mac,
            ip: req.socket.remoteAddress,
            firmware: data.firmware || '1.0.0',
            status: 'Online',
            ws
          });
        }
        broadcastDeviceList();
      }

      if(data.type === 'wifi-config'){
        devices.forEach(d => d.ws.send(JSON.stringify({ type: 'wifi-status', id: d.id, status: 'Received' })));
      }

    } catch(e){
      console.error('Invalid message', e);
    }
  });

  ws.on('close', () => {
    const dev = devices.find(d => d.ws === ws);
    if(dev){
      dev.status = 'Offline';
      broadcastDeviceList();
    }
  });
});

function broadcastDeviceList(){
  const list = devices.map(d => ({
    id: d.id,
    mac: d.mac,
    ip: d.ip,
    firmware: d.firmware,
    status: d.status
  }));
  devices.forEach(d => d.ws.send(JSON.stringify({ type: 'device-list', devices: list })));
}
