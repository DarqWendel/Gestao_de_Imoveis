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
        // Usuários
        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguranca.tbUsuarios (
                usuario_id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                login VARCHAR(50) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                atualizado_por INT
            )
        `);
        await pool.query(`ALTER TABLE seguranca.tbUsuarios ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE`).catch(() => {});
        await pool.query(`ALTER TABLE seguranca.tbUsuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(100) DEFAULT 'Usuário'`).catch(() => {});

        // Tipo de imóvel
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tblImovelTipo (
                imovel_tipo_id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL UNIQUE
            )
        `);

        // Tipo de pessoa
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dominio.tbPessoaTipo (
                pessoa_tipo_id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL UNIQUE
            )
        `);

        // Pessoas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cadastro.tbPessoas (
                pessoa_id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                cpf VARCHAR(14) NOT NULL UNIQUE,
                nascimento DATE,
                telefone VARCHAR(20),
                pessoa_tipo_id INT,
                atualizado_por INT,
                atualizado_em DATE
            )
        `);

        // Imóveis
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tblImovel (
                imovel_id INT AUTO_INCREMENT PRIMARY KEY,
                endereco VARCHAR(200) NOT NULL,
                valor DECIMAL(19,2),
                area DECIMAL(19,2),
                proprietario_id INT,
                imovel_tipo_id INT,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                atualizado_por INT
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
            'SELECT usuario_id FROM seguranca.tbUsuarios WHERE email = ? OR login = ?', [email, login]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'E-mail ou usuário já cadastrado.' });
        await pool.query(
            'INSERT INTO seguranca.tbUsuarios (nome, email, login, senha, perfil) VALUES (?, ?, ?, ?, ?)',
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
            'SELECT * FROM seguranca.tbUsuarios WHERE email = ? AND senha = ?', [email, senha]
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
            'SELECT usuario_id as id, nome, email, login, perfil, atualizado_em FROM seguranca.tbUsuarios ORDER BY usuario_id ASC'
        );
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT usuario_id as id, nome, email, login, perfil FROM seguranca.tbUsuarios WHERE usuario_id = ?', [req.params.id]
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
            'SELECT usuario_id FROM seguranca.tbUsuarios WHERE email = ? OR login = ?', [email, login]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'E-mail ou login já cadastrado.' });
        const [result] = await pool.query(
            'INSERT INTO seguranca.tbUsuarios (nome, email, login, senha, perfil) VALUES (?, ?, ?, ?, ?)',
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
            'SELECT usuario_id FROM seguranca.tbUsuarios WHERE (email = ? OR login = ?) AND usuario_id != ?',
            [email, login, req.params.id]
        );
        if (existe.length > 0)
            return res.status(409).json({ ok: false, error: 'E-mail ou login já em uso.' });
        const sql = senha
            ? 'UPDATE seguranca.tbUsuarios SET nome=?, email=?, login=?, senha=?, perfil=? WHERE usuario_id=?'
            : 'UPDATE seguranca.tbUsuarios SET nome=?, email=?, login=?, perfil=? WHERE usuario_id=?';
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
        const [result] = await pool.query('DELETE FROM seguranca.tbUsuarios WHERE usuario_id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        res.json({ ok: true, message: 'Usuário excluído com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ═══════════════════════════════════════════════
// IMÓVEIS CRUD  (7° Sprint)
// ═══════════════════════════════════════════════

// Listar tipos (para o select do form)
app.get('/api/imovel-tipos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT imovel_tipo_id as id, descricao FROM tblImovelTipo ORDER BY descricao ASC');
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Listar todos os imóveis
app.get('/api/imoveis', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT i.imovel_id as id, i.endereco, i.valor, i.area,
                   p.nome as proprietario, t.descricao as tipo, i.atualizado_em
            FROM tblImovel i
            LEFT JOIN cadastro.tbPessoas p ON p.pessoa_id = i.proprietario_id
            LEFT JOIN tblImovelTipo t ON t.imovel_tipo_id = i.imovel_tipo_id
            ORDER BY i.imovel_id ASC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/imoveis/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM tblImovel WHERE imovel_id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/imoveis', async (req, res) => {
    const { endereco, valor, area, proprietario_id, imovel_tipo_id } = req.body;
    if (!endereco) return res.status(400).json({ ok: false, error: 'Endereço é obrigatório.' });
    try {
        const [result] = await pool.query(
            'INSERT INTO tblImovel (endereco, valor, area, proprietario_id, imovel_tipo_id) VALUES (?, ?, ?, ?, ?)',
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
            'UPDATE tblImovel SET endereco=?, valor=?, area=?, proprietario_id=?, imovel_tipo_id=? WHERE imovel_id=?',
            [endereco, valor || null, area || null, proprietario_id || null, imovel_tipo_id || null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel atualizado com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/imoveis/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM tblImovel WHERE imovel_id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel excluído com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ═══════════════════════════════════════════════
// PESSOAS CRUD  (8° Sprint)
// ═══════════════════════════════════════════════

// Listar tipos de pessoa (para o select)
app.get('/api/pessoa-tipos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT pessoa_tipo_id as id, descricao FROM dominio.tbPessoaTipo ORDER BY descricao ASC');
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Listar todas as pessoas
app.get('/api/pessoas', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.pessoa_id as id, p.nome, p.cpf, p.nascimento, p.telefone,
                   t.descricao as tipo
            FROM cadastro.tbPessoas p
            LEFT JOIN dominio.tbPessoaTipo t ON t.pessoa_tipo_id = p.pessoa_tipo_id
            ORDER BY p.pessoa_id ASC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/pessoas/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM cadastro.tbPessoas WHERE pessoa_id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Pessoa não encontrada.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/pessoas', async (req, res) => {
    const { nome, cpf, nascimento, telefone, pessoa_tipo_id } = req.body;
    if (!nome || !cpf) return res.status(400).json({ ok: false, error: 'Nome e CPF são obrigatórios.' });
    try {
        const [existe] = await pool.query('SELECT pessoa_id FROM cadastro.tbPessoas WHERE cpf = ?', [cpf]);
        if (existe.length > 0) return res.status(409).json({ ok: false, error: 'CPF já cadastrado.' });
        const [result] = await pool.query(
            'INSERT INTO cadastro.tbPessoas (nome, cpf, nascimento, telefone, pessoa_tipo_id) VALUES (?, ?, ?, ?, ?)',
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
            'SELECT pessoa_id FROM cadastro.tbPessoas WHERE cpf = ? AND pessoa_id != ?', [cpf, req.params.id]
        );
        if (existe.length > 0) return res.status(409).json({ ok: false, error: 'CPF já em uso por outra pessoa.' });
        const [result] = await pool.query(
            'UPDATE cadastro.tbPessoas SET nome=?, cpf=?, nascimento=?, telefone=?, pessoa_tipo_id=? WHERE pessoa_id=?',
            [nome, cpf, nascimento || null, telefone || null, pessoa_tipo_id || null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Pessoa não encontrada.' });
        res.json({ ok: true, message: 'Pessoa atualizada com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/pessoas/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM cadastro.tbPessoas WHERE pessoa_id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Pessoa não encontrada.' });
        res.json({ ok: true, message: 'Pessoa excluída com sucesso!' });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = app;
