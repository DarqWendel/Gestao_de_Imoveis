require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Conexão via Variável de Ambiente (DATABASE_URL)
const db = mysql.createConnection(process.env.DATABASE_URL);

db.connect((err) => {
    if (err) console.error('Erro BD:', err.message);
    else console.log('✅ Banco conectado!');
});

app.post('/registrar', (req, res) => {
    const { nome, login, senha } = req.body;
    const sql = "INSERT INTO `seguranca.tbUsuarios` (nome, login, senha) VALUES (?, ?, ?)";
    db.query(sql, [nome, login, senha], (err) => {
        if (err) return res.status(500).send({ message: "Erro" });
        res.send({ ok: true });
    });
});

app.post('/login', (req, res) => {
    const { login, senha } = req.body;
    const sql = "SELECT * FROM `seguranca.tbUsuarios` WHERE login = ? AND senha = ?";
    db.query(sql, [login, senha], (err, results) => {
        if (err) return res.status(500).send(err);
        if (results.length > 0) res.send({ ok: true, nome: results[0].nome });
        else res.send({ ok: false });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor na porta ${PORT}`));

module.exports = app;