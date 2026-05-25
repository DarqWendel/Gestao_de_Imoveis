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
    ssl: { ca: process.env.DB_SSL_CERT, rejectUnauthorized: true },
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
        // Usuários (tabela original que já funcionava)
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
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(100) DEFAULT 'Usuário'`).catch(() => {});

        // Tipo de imóvel
        await pool.query(`
            CREATE TABLE IF NOT EXISTS imovel_tipo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL UNIQUE
            )
        `);

        // Imóveis
        await pool.query(`
            CREATE TABLE IF NOT EXISTS imoveis (
                id INT AUTO_INCREMENT PRIMARY KEY,
                endereco VARCHAR(200) NOT NULL,
                valor DECIMAL(19,2),
                area DECIMAL(19,2),
                proprietario_id INT,
                imovel_tipo_id INT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tipo de pessoa
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pessoa_tipo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL UNIQUE
            )
        `);

        // Pessoas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pessoas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                cpf VARCHAR(14) NOT NULL UNIQUE,
                nascimento DATE,
                telefone VARCHAR(20),
                pessoa_tipo_id INT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Tabelas verificadas/criadas com sucesso');
    } catch (err) {
        console.error('Erro ao iniciar DB:', err.message);
    }
}

initDB();

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// USUÁRIOS CRUD
// ═══════════════════════════════════════════════

app.get('/api/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, nome, email, login, perfil, criado_em FROM usuarios ORDER BY id ASC'
        );
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, nome, email, login, perfil FROM usuarios WHERE id = ?', [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
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
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
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
            return res.status(409).json({ ok: false, error: 'E-mail ou login já em uso.' });
        const sql = senha
            ? 'UPDATE usuarios SET nome=?, email=?, login=?, senha=?, perfil=? WHERE id=?'
            : 'UPDATE usuarios SET nome=?, email=?, login=?, perfil=? WHERE id=?';
        const params = senha
            ? [nome, email, login, senha, perfil || 'Usuário', req.params.id]
            : [nome, email, login, perfil || 'Usuário', req.params.id];
        const [result] = await pool.query(sql, params);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, message: 'Usuário atualizado com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, message: 'Usuário excluído com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ═══════════════════════════════════════════════
// IMÓVEIS CRUD
// ═══════════════════════════════════════════════

app.get('/api/imovel-tipos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, descricao FROM imovel_tipo ORDER BY descricao ASC');
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/imoveis', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT i.id, i.endereco, i.valor, i.area,
                   p.nome AS proprietario,
                   t.descricao AS tipo,
                   i.criado_em
            FROM imoveis i
            LEFT JOIN pessoas p ON p.id = i.proprietario_id
            LEFT JOIN imovel_tipo t ON t.id = i.imovel_tipo_id
            ORDER BY i.id ASC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/imoveis/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM imoveis WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/imoveis', async (req, res) => {
    const { endereco, valor, area, proprietario_id, imovel_tipo_id } = req.body;
    if (!endereco) return res.status(400).json({ ok: false, error: 'Endereço é obrigatório.' });
    try {
        const [result] = await pool.query(
            'INSERT INTO imoveis (endereco, valor, area, proprietario_id, imovel_tipo_id) VALUES (?, ?, ?, ?, ?)',
            [endereco, valor || null, area || null, proprietario_id || null, imovel_tipo_id || null]
        );
        res.json({ ok: true, id: result.insertId, message: 'Imóvel cadastrado com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.put('/api/imoveis/:id', async (req, res) => {
    const { endereco, valor, area, proprietario_id, imovel_tipo_id } = req.body;
    if (!endereco) return res.status(400).json({ ok: false, error: 'Endereço é obrigatório.' });
    try {
        const [result] = await pool.query(
            'UPDATE imoveis SET endereco=?, valor=?, area=?, proprietario_id=?, imovel_tipo_id=? WHERE id=?',
            [endereco, valor || null, area || null, proprietario_id || null, imovel_tipo_id || null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel atualizado com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/imoveis/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM imoveis WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel excluído com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ═══════════════════════════════════════════════
// PESSOAS CRUD
// ═══════════════════════════════════════════════

app.get('/api/pessoa-tipos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, descricao FROM pessoa_tipo ORDER BY descricao ASC');
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/pessoas', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.nome, p.cpf, p.nascimento, p.telefone,
                   t.descricao AS tipo
            FROM pessoas p
            LEFT JOIN pessoa_tipo t ON t.id = p.pessoa_tipo_id
            ORDER BY p.id ASC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/pessoas/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM pessoas WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Pessoa não encontrada.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/pessoas', async (req, res) => {
    const { nome, cpf, nascimento, telefone, pessoa_tipo_id } = req.body;
    if (!nome || !cpf) return res.status(400).json({ ok: false, error: 'Nome e CPF são obrigatórios.' });
    try {
        const [existe] = await pool.query('SELECT id FROM pessoas WHERE cpf = ?', [cpf]);
        if (existe.length > 0) return res.status(409).json({ ok: false, error: 'CPF já cadastrado.' });
        const [result] = await pool.query(
            'INSERT INTO pessoas (nome, cpf, nascimento, telefone, pessoa_tipo_id) VALUES (?, ?, ?, ?, ?)',
            [nome, cpf, nascimento || null, telefone || null, pessoa_tipo_id || null]
        );
        res.json({ ok: true, id: result.insertId, message: 'Pessoa cadastrada com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.put('/api/pessoas/:id', async (req, res) => {
    const { nome, cpf, nascimento, telefone, pessoa_tipo_id } = req.body;
    if (!nome || !cpf) return res.status(400).json({ ok: false, error: 'Nome e CPF são obrigatórios.' });
    try {
        const [existe] = await pool.query(
            'SELECT id FROM pessoas WHERE cpf = ? AND id != ?', [cpf, req.params.id]
        );
        if (existe.length > 0) return res.status(409).json({ ok: false, error: 'CPF já em uso.' });
        const [result] = await pool.query(
            'UPDATE pessoas SET nome=?, cpf=?, nascimento=?, telefone=?, pessoa_tipo_id=? WHERE id=?',
            [nome, cpf, nascimento || null, telefone || null, pessoa_tipo_id || null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Pessoa não encontrada.' });
        res.json({ ok: true, message: 'Pessoa atualizada com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/pessoas/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM pessoas WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Pessoa não encontrada.' });
        res.json({ ok: true, message: 'Pessoa excluída com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = app;
