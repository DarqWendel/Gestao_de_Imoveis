require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

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

app.get('/api/ping', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 as ok');
        res.json({ ok: true, db: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                login VARCHAR(255) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                perfil VARCHAR(100) DEFAULT 'Usuário',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(100) DEFAULT 'Usuário'
        `).catch(() => {});

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imoveis (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50) NOT NULL UNIQUE,
                descricao VARCHAR(255) NOT NULL,
                tipo ENUM('Apartamento','Casa','Terreno','Sala Comercial','Galpão','Outro') NOT NULL DEFAULT 'Apartamento',
                status ENUM('Disponível','Alugado','Vendido','Em Reforma','Inativo') NOT NULL DEFAULT 'Disponível',
                area DECIMAL(10,2) DEFAULT NULL,
                quartos TINYINT UNSIGNED DEFAULT NULL,
                banheiros TINYINT UNSIGNED DEFAULT NULL,
                vagas TINYINT UNSIGNED DEFAULT NULL,
                valor_venda DECIMAL(15,2) DEFAULT NULL,
                valor_aluguel DECIMAL(15,2) DEFAULT NULL,
                cep VARCHAR(10) DEFAULT NULL,
                logradouro VARCHAR(255) DEFAULT NULL,
                numero VARCHAR(20) DEFAULT NULL,
                complemento VARCHAR(100) DEFAULT NULL,
                bairro VARCHAR(100) DEFAULT NULL,
                cidade VARCHAR(100) DEFAULT NULL,
                estado CHAR(2) DEFAULT NULL,
                observacoes TEXT DEFAULT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('Tabelas verificadas/criadas com sucesso');
    } catch (err) {
        console.error('Erro ao criar tabelas:', err.message);
    }
}

initDB();

// ─── AUTH ────────────────────────────────────────────────

app.post('/api/registrar', async (req, res) => {
    const { nome, email, login, senha } = req.body;
    if (!nome || !email || !login || !senha)
        return res.status(400).json({ ok: false, error: 'Todos os campos são obrigatórios.' });
    try {
        const [existe] = await pool.query(
            'SELECT id FROM usuarios WHERE email = ? OR login = ?', [email, login]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'E-mail ou usuário já cadastrado.' });
        await pool.query(
            'INSERT INTO usuarios (nome, email, login, senha, perfil) VALUES (?, ?, ?, ?, ?)',
            [nome, email, login, senha, 'Administrador']
        );
        res.json({ ok: true, message: 'Conta criada com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha)
        return res.status(400).json({ ok: false, error: 'E-mail e senha são obrigatórios.' });
    try {
        const [rows] = await pool.query(
            'SELECT * FROM usuarios WHERE email = ? AND senha = ?', [email, senha]
        );
        if (rows.length > 0)
            res.json({ ok: true, nome: rows[0].nome, email: rows[0].email });
        else
            res.status(401).json({ ok: false, error: 'E-mail ou senha incorretos.' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── USUÁRIOS CRUD ───────────────────────────────────────

app.get('/api/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, nome, email, login, perfil, criado_em FROM usuarios ORDER BY id ASC'
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, nome, email, login, perfil FROM usuarios WHERE id = ?',
            [req.params.id]
        );
        if (rows.length === 0)
            return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/usuarios', async (req, res) => {
    const { nome, email, login, senha, perfil } = req.body;
    if (!nome || !email || !login || !senha)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios: nome, email, login, senha.' });
    try {
        const [existe] = await pool.query(
            'SELECT id FROM usuarios WHERE email = ? OR login = ?', [email, login]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'E-mail ou login já cadastrado.' });
        const [result] = await pool.query(
            'INSERT INTO usuarios (nome, email, login, senha, perfil) VALUES (?, ?, ?, ?, ?)',
            [nome, email, login, senha, perfil || 'Usuário']
        );
        res.json({ ok: true, id: result.insertId, message: 'Usuário cadastrado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    const { nome, email, login, senha, perfil } = req.body;
    if (!nome || !email || !login)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios: nome, email, login.' });
    try {
        const [existe] = await pool.query(
            'SELECT id FROM usuarios WHERE (email = ? OR login = ?) AND id != ?',
            [email, login, req.params.id]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'E-mail ou login já em uso por outro usuário.' });
        let sql, params;
        if (senha) {
            sql = 'UPDATE usuarios SET nome=?, email=?, login=?, senha=?, perfil=? WHERE id=?';
            params = [nome, email, login, senha, perfil || 'Usuário', req.params.id];
        } else {
            sql = 'UPDATE usuarios SET nome=?, email=?, login=?, perfil=? WHERE id=?';
            params = [nome, email, login, perfil || 'Usuário', req.params.id];
        }
        const [result] = await pool.query(sql, params);
        if (result.affectedRows === 0)
            return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, message: 'Usuário atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, message: 'Usuário excluído com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── IMÓVEIS CRUD ────────────────────────────────────────

app.get('/api/imoveis', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, codigo, descricao, tipo, status, area, quartos, banheiros, vagas,
                    valor_venda, valor_aluguel, cidade, estado, bairro, criado_em
             FROM imoveis ORDER BY id ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/imoveis/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM imoveis WHERE id = ?', [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/imoveis', async (req, res) => {
    const {
        codigo, descricao, tipo, status, area, quartos, banheiros, vagas,
        valor_venda, valor_aluguel, cep, logradouro, numero, complemento,
        bairro, cidade, estado, observacoes
    } = req.body;

    if (!codigo || !descricao || !tipo || !status)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios: código, descrição, tipo, status.' });

    try {
        const [existe] = await pool.query('SELECT id FROM imoveis WHERE codigo = ?', [codigo]);
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'Código de imóvel já cadastrado.' });

        const [result] = await pool.query(
            `INSERT INTO imoveis
             (codigo, descricao, tipo, status, area, quartos, banheiros, vagas,
              valor_venda, valor_aluguel, cep, logradouro, numero, complemento,
              bairro, cidade, estado, observacoes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                codigo, descricao, tipo, status,
                area || null, quartos || null, banheiros || null, vagas || null,
                valor_venda || null, valor_aluguel || null,
                cep || null, logradouro || null, numero || null, complemento || null,
                bairro || null, cidade || null, estado || null, observacoes || null
            ]
        );
        res.json({ ok: true, id: result.insertId, message: 'Imóvel cadastrado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.put('/api/imoveis/:id', async (req, res) => {
    const {
        codigo, descricao, tipo, status, area, quartos, banheiros, vagas,
        valor_venda, valor_aluguel, cep, logradouro, numero, complemento,
        bairro, cidade, estado, observacoes
    } = req.body;

    if (!codigo || !descricao || !tipo || !status)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios: código, descrição, tipo, status.' });

    try {
        const [existe] = await pool.query(
            'SELECT id FROM imoveis WHERE codigo = ? AND id != ?', [codigo, req.params.id]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'Código já em uso por outro imóvel.' });

        const [result] = await pool.query(
            `UPDATE imoveis SET
                codigo=?, descricao=?, tipo=?, status=?, area=?, quartos=?, banheiros=?, vagas=?,
                valor_venda=?, valor_aluguel=?, cep=?, logradouro=?, numero=?, complemento=?,
                bairro=?, cidade=?, estado=?, observacoes=?
             WHERE id=?`,
            [
                codigo, descricao, tipo, status,
                area || null, quartos || null, banheiros || null, vagas || null,
                valor_venda || null, valor_aluguel || null,
                cep || null, logradouro || null, numero || null, complemento || null,
                bairro || null, cidade || null, estado || null, observacoes || null,
                req.params.id
            ]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.delete('/api/imoveis/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM imoveis WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel excluído com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = app;
