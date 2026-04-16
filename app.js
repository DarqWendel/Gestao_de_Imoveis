require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const db = mysql.createConnection(process.env.DATABASE_URL);

app.post('/api/registrar', (req, res) => {
    const { nome, login, senha } = req.body;
    const sql = "INSERT INTO `seguranca.tbUsuarios` (nome, login, senha) VALUES (?, ?, ?)";
    db.query(sql, [nome, login, senha], (err) => {
        if (err) return res.status(500).json({ ok: false });
        res.json({ ok: true });
    });
});

app.post('/api/login', (req, res) => {
    const { login, senha } = req.body;
    const sql = "SELECT * FROM `seguranca.tbUsuarios` WHERE login = ? AND senha = ?";
    db.query(sql, [login, senha], (err, results) => {
        if (err) return res.status(500).json({ ok: false });
        if (results.length > 0) res.json({ ok: true, nome: results[0].nome });
        else res.json({ ok: false });
    });
});

module.exports = app;