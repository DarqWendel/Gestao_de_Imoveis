require('dotenv').config(); // Carrega variáveis do arquivo .env local
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXÃO COM O BANCO ---
// A Vercel vai ler essa variável automaticamente se você configurá-la no painel
const uri = process.env.DATABASE_URL;

const db = mysql.createConnection(uri);

db.connect((err) => {
    if (err) {
        console.error('❌ Erro de conexão:', err.message);
    } else {
        console.log('✅ Banco de Dados conectado com sucesso!');
    }
});

// --- ROTA DE CADASTRO ---
app.post('/registrar', (req, res) => {
    const { nome, email, senha } = req.body;
    // No seu BD, usamos a coluna 'login' para guardar o e-mail
    const sql = "INSERT INTO `seguranca.tbUsuarios` (nome, login, senha) VALUES (?, ?, ?)";
    
    db.query(sql, [nome, email, senha], (err) => {
        if (err) {
            console.error('Erro no registro:', err);
            return res.status(500).send({ message: "Erro ao cadastrar." });
        }
        res.send({ ok: true });
    });
});

// --- ROTA DE LOGIN ---
app.post('/login', (req, res) => {
    const { login, senha } = req.body;
    const sql = "SELECT * FROM `seguranca.tbUsuarios` WHERE login = ? AND senha = ?";
    
    db.query(sql, [login, senha], (err, results) => {
        if (err) {
            console.error('Erro no login:', err);
            return res.status(500).send(err);
        }
        
        if (results.length > 0) {
            res.send({ ok: true, nome: results[0].nome });
        } else {
            res.send({ ok: false, message: "Usuário ou senha incorretos." });
        }
    });
});

// PORTA DO SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});