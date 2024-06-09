const express = require('express');
const bodyParser = require('body-parser');
const mqtt = require('mqtt');
const cron = require('node-cron');
const mysql = require('mysql2');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // Tambahkan ini untuk melayani file statis dari folder public

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
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to database');
});
// API untuk menambahkan jadwal alarm
app.post('/add-alarm', (req, res) => {
  const { day, hour, minute, message } = req.body;
  console.log('Received alarm data:', { day, hour, minute, message }); // Debugging log
  const query = 'INSERT INTO alarms (day, hour, minute, message) VALUES (?, ?, ?, 1)';
  db.query(query, [day, hour, minute, message], (err, results) => {
    if (err) {
      console.error('Database error:', err); // Log error
      res.status(500).send({ success: false });
      return;
    }
    res.send({ success: true });
  });
});


// API untuk menambahkan jadwal alarm
// app.post('/add-alarm', (req, res) => {
//   const { day, hour, minute } = req.body;
//   const query = 'INSERT INTO alarms (day, hour, minute) VALUES (?, ?, ?)';
//   db.query(query, [day, hour, minute], (err, results) => {
//     if (err) throw err;
//     res.send({ success: true });
//   });
// });

// Scheduler untuk mengecek alarm
// cron.schedule('* * * * *', () => {
//   const now = new Date();
//   const day = now.getDay(); // 0-6 (Minggu - Sabtu)
//   const hour = now.getHours();
//   const minute = now.getMinutes();

//     const query = 'SELECT * FROM alarms WHERE day = ? AND hour = ? AND minute = ?';
//     // console.log(db.query(query, [day, hour, minute]));
//   db.query(query, [day, hour, minute], (err, results) => {
//     if (err) throw err;
//     if (results.length > 0) {
//       mqttClient.publish('PET/BTN', 'ON');
//     }
//   });
// });

// Scheduler untuk mengecek alarm
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentDay = now.getDay(); // 0-6 (Minggu - Sabtu)
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Ambil semua alarm yang harus aktif saat ini
  const query = 'SELECT * FROM alarms WHERE (day = ? OR day = -1) AND (hour = ? OR hour = -1) AND (minute = ? OR minute = -1)';
  db.query(query, [currentDay, currentHour, currentMinute], (err, results) => {
    if (err) throw err;

    // Kirim pesan ke MQTT untuk setiap alarm yang aktif
    results.forEach(alarm => {
      if (alarm.day === -1) {
        // Jika day == -1, maka hanya periksa hour dan minute
        if (alarm.hour === currentHour && alarm.minute === currentMinute) {
          mqttClient.publish('PET/BTN', alarm.message);
        }
      } else {
        // Jika day != -1, maka periksa day, hour, dan minute
        mqttClient.publish('PET/BTN', alarm.message);
      }
    });
  });
});



// Rute untuk melayani index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
