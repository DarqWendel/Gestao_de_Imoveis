require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Pool de conexões com SSL e timeout configurado
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        ca: process.env.DB_SSL_CERT,
        rejectUnauthorized: true
    },
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 30000,
    queueLimit: 0
});

// Rota de teste
app.get('/api/ping', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 as ok');
        res.json({ ok: true, db: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Criar tabela se não existir
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                login VARCHAR(255) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Tabela usuarios verificada/criada com sucesso');
    } catch (err) {
        console.error('Erro ao criar tabela:', err.message);
    }
}

initDB();

// Cadastro
app.post('/api/registrar', async (req, res) => {
    const { nome, email, login, senha } = req.body;

    if (!nome || !email || !login || !senha) {
        return res.status(400).json({ ok: false, error: 'Todos os campos são obrigatórios.' });
    }

    try {
        // Verificar se email ou login já existe
        const [existe] = await pool.query(
            'SELECT id FROM usuarios WHERE email = ? OR login = ?',
            [email, login]
        );

        if (existe.length > 0) {
            return res.status(409).json({ ok: false, error: 'E-mail ou usuário já cadastrado.' });
        }

        await pool.query(
            'INSERT INTO usuarios (nome, email, login, senha) VALUES (?, ?, ?, ?)',
            [nome, email, login, senha]
        );

        res.json({ ok: true, message: 'Conta criada com sucesso!' });
    } catch (err) {
        console.error('Erro no cadastro:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ ok: false, error: 'E-mail e senha são obrigatórios.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM usuarios WHERE email = ? AND senha = ?',
            [email, senha]
        );

        if (rows.length > 0) {
            res.json({ ok: true, nome: rows[0].nome, email: rows[0].email });
        } else {
            res.status(401).json({ ok: false, error: 'E-mail ou senha incorretos.' });
        }
    } catch (err) {
        console.error('Erro no login:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = app;
