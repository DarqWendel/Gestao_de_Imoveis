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

        // As tabelas tblmovel e tblmovelTipo são gerenciadas pelo professor — não criamos aqui.
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

// ─── IMÓVEIS CRUD (tblmovel + tblmovelTipo) ──────────────

// Lista todos os tipos de imóvel (para popular o select)
// Se a tabela estiver vazia, insere tipos padrão automaticamente
app.get('/api/imoveis/tipos', async (req, res) => {
    try {
        let [rows] = await pool.query('SELECT imovel_tipo_id, descricao FROM tblmovelTipo ORDER BY descricao ASC');

        if (rows.length === 0) {
            const tiposPadrao = ['Apartamento', 'Casa', 'Terreno', 'Sala Comercial', 'Galpao', 'Outro'];
            for (const desc of tiposPadrao) {
                await pool.query('INSERT IGNORE INTO tblmovelTipo (descricao) VALUES (?)', [desc]);
            }
            [rows] = await pool.query('SELECT imovel_tipo_id, descricao FROM tblmovelTipo ORDER BY descricao ASC');
        }

        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/imoveis', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT m.imovel_id, m.endereco, m.valor, m.area,
                    m.proprietario_id, m.imovel_tipo_id, m.atualizado_em, m.atualizado_por,
                    t.descricao AS tipo_descricao
             FROM tblmovel m
             LEFT JOIN tblmovelTipo t ON t.imovel_tipo_id = m.imovel_tipo_id
             ORDER BY m.imovel_id ASC`
        );
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/imoveis/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT m.imovel_id, m.endereco, m.valor, m.area,
                    m.proprietario_id, m.imovel_tipo_id, m.atualizado_em, m.atualizado_por,
                    t.descricao AS tipo_descricao
             FROM tblmovel m
             LEFT JOIN tblmovelTipo t ON t.imovel_tipo_id = m.imovel_tipo_id
             WHERE m.imovel_id = ?`,
            [req.params.id]
        );
        if (rows.length === 0)
            return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/imoveis', async (req, res) => {
    const { endereco, valor, area, imovel_tipo_id } = req.body;

    if (!endereco || !imovel_tipo_id)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios: endereço e tipo.' });

    try {
        // Garante que existe uma pessoa padrão para usar como proprietário
        await pool.query(`
            INSERT IGNORE INTO cadastro.tbPessoas (nome) VALUES ('Padrão')
        `).catch(() => {});
        const [[pessoa]] = await pool.query('SELECT pessoa_id FROM cadastro.tbPessoas LIMIT 1');
        const pessoaId = pessoa ? pessoa.pessoa_id : 1;

        const [result] = await pool.query(
            `INSERT INTO tblmovel (endereco, valor, area, proprietario_id, imovel_tipo_id, atualizado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                endereco,
                valor || null,
                area  || null,
                pessoaId,
                imovel_tipo_id,
                pessoaId
            ]
        );
        res.json({ ok: true, id: result.insertId, message: 'Imóvel cadastrado com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.put('/api/imoveis/:id', async (req, res) => {
    const { endereco, valor, area, imovel_tipo_id } = req.body;

    if (!endereco || !imovel_tipo_id)
        return res.status(400).json({ ok: false, error: 'Campos obrigatórios: endereço e tipo.' });

    try {
        await pool.query(`
            INSERT IGNORE INTO cadastro.tbPessoas (nome) VALUES ('Padrão')
        `).catch(() => {});
        const [[pessoaUpd]] = await pool.query('SELECT pessoa_id FROM cadastro.tbPessoas LIMIT 1');
        const pessoaIdUpd = pessoaUpd ? pessoaUpd.pessoa_id : 1;

        const [result] = await pool.query(
            `UPDATE tblmovel SET
                endereco=?, valor=?, area=?, imovel_tipo_id=?, proprietario_id=?, atualizado_por=?
             WHERE imovel_id=?`,
            [
                endereco,
                valor || null,
                area  || null,
                imovel_tipo_id,
                pessoaIdUpd,
                pessoaIdUpd,
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
        const [result] = await pool.query('DELETE FROM tblmovel WHERE imovel_id = ?', [req.params.id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ ok: false, error: 'Imóvel não encontrado.' });
        res.json({ ok: true, message: 'Imóvel excluído com sucesso!' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = app;
