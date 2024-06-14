const express = require('express');
const bodyParser = require('body-parser');
const mqtt = require('mqtt');
const cron = require('node-cron');
const mysql = require('mysql2');
const ejs = require('ejs');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // Untuk melayani file statis dari folder public

const mqttClient = mqtt.connect('ws://broker.emqx.io:8083/mqtt'); // atau alamat broker MQTT yang lain

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'alarm_db'
});

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
    mqttClient.publish('PET/BTN', 'Connected with web'); // Publish pesan saat terhubung ke broker MQTT
    mqttClient.subscribe('PET/LED', (err) => {
        if (err) {
            console.error('Failed to subscribe to MQTT topic:', err);
        }
    });
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to database');
});

// Set EJS sebagai template engine
app.set('view engine', 'ejs');
app.set('views', 'views'); // Folder tempat file EJS disimpan

// API untuk menambahkan jadwal alarm
app.post('/add-alarm', (req, res) => {
  const { day, hour, minute, message } = req.body;
  console.log('Received alarm data:', { day, hour, minute, message }); // Debugging log
  const query = 'INSERT INTO alarms (day, hour, minute, message) VALUES (?, ?, ?, ?)';
  db.query(query, [day, hour, minute, message], (err, results) => {
    if (err) {
      console.error('Database error:', err); // Log error
      res.status(500).send({ success: false });
      return;
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

// Rute untuk melayani index.html
app.get('/', (req, res) => {
  // Ambil data dari database
  const query = 'SELECT * FROM alarms';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Error fetching data');
    }
    // Render template dengan data dari database
    res.render('index', { alarms: results });
  });
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
