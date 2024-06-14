const express = require('express');
const bodyParser = require('body-parser');
const mqtt = require('mqtt');
const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2');
const cron = require('node-cron');
const ejs = require('ejs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());
app.use(express.static('public'));

const mqttClient = mqtt.connect('ws://broker.emqx.io:8083/mqtt'); // Sesuaikan dengan alamat broker MQTT Anda

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'alarm_db'
});

let latestMessage = ''; // Untuk menyimpan pesan terbaru dari MQTT

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttClient.publish('PET/BTN', 'Connected with web');
  mqttClient.subscribe('PET/LED', (err) => {
    if (err) {
      console.error('Failed to subscribe to MQTT topic:', err);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  if (topic === 'PET/LED') {
    latestMessage = message.toString();
    console.log(`Received message: ${latestMessage}`);
    // Kirim pesan melalui WebSocket ke klien yang terhubung
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(latestMessage);
      }
    });
  }
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database');
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  // Kirim pesan terbaru ke klien yang baru terhubung
  if (latestMessage) {
    ws.send(latestMessage);
  }
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
});

// Set EJS sebagai template engine
app.set('view engine', 'ejs');
app.set('views', 'views');

// Rute untuk melayani index.html
app.get('/', (req, res) => {
  const query = 'SELECT * FROM alarms';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Error fetching data');
    }
    res.render('index', { alarms: results, latestMessage });
  });
});


// Endpoint untuk menerima pesan dari frontend via GET parameter
app.get('/send-message', (req, res) => {
  const message = req.query.message;

  client.publish('PET/BTN', message, (err) => {
    if (err) {
      return res.status(500).send('Failed to publish message');
    }
    res.send('Message sent to MQTT broker');
  });
});

// Endpoint untuk menambahkan alarm
app.post('/add-alarm', (req, res) => {
  const { day, hour, minute, message } = req.body;
  console.log('Received alarm data:', { day, hour, minute, message });

  const query = 'INSERT INTO alarms (day, hour, minute, message) VALUES (?, ?, ?, ?)';
  db.query(query, [day, hour, minute, message], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send({ success: false, error: err.message });
    }

    // Jika alarm yang ditambahkan aktif pada saat ini, kirim pesan ke MQTT
    const now = new Date();
    if ((day === now.getDay() || day === 7) && (hour === now.getHours() || hour === -1) && (minute === now.getMinutes() || minute === -1)) {
      mqttClient.publish('PET/BTN', message);
    }

    res.send({ success: true });
  });
});

// Scheduler untuk mengecek alarm
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentDay = now.getDay(); // 0-6 (Minggu - Sabtu)
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  console.log('Current time:', currentDay, currentHour, currentMinute);

  // Ambil semua alarm yang harus aktif saat ini
  const query = 'SELECT * FROM alarms WHERE (day = ? OR day = 7) AND (hour = ? OR hour = -1) AND (minute = ? OR minute = -1)';
  db.query(query, [currentDay, currentHour, currentMinute], (err, results) => {
    if (err) throw err;

    // Kirim pesan ke MQTT untuk setiap alarm yang aktif
    results.forEach(alarm => {
      mqttClient.publish('PET/BTN', alarm.message);
    });
  });
});

// Server mendengarkan pada port 3000
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
