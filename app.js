const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const uri = "mysql://avnadmin:AVNS_bSkOd-71tCrWAhg3adi@gestaodeimoveis-darquiowendel2021-1acc.b.aivencloud.com:17599/defaultdb?ssl-mode=REQUIRED";

const db = mysql.createConnection(uri);

db.connect((err) => {
    if (err) {
        console.error('❌ Erro ao conectar na Aiven:', err.message);
    } else {
        console.log('✅ Conectado com sucesso ao banco da Aiven!');
    }
});


app.post('/registrar', (req, res) => {
    const { nome, login, senha } = req.body;

    const sql = "INSERT INTO `seguranca.tbUsuarios` (nome, login, senha) VALUES (?, ?, ?)";
    
    db.query(sql, [nome, login, senha], (err) => {
        if (err) {
            console.error('Erro no SQL de registro:', err);
            return res.status(500).send({ message: "Erro ao salvar no banco." });
        }
        res.send({ ok: true });
    });
});

app.post('/login', (req, res) => {
    const { login, senha } = req.body;
    const sql = "SELECT * FROM `seguranca.tbUsuarios` WHERE login = ? AND senha = ?";
    
    db.query(sql, [login, senha], (err, results) => {
        if (err) {
            console.error('Erro no SQL de login:', err);
            return res.status(500).send(err);
        }
        
        if (results.length > 0) {
            res.send({ ok: true, nome: results[0].nome });
        } else {
            res.send({ ok: false, message: "Usuário ou senha inválidos" });
        }
    });
});

app.listen(3000, () => {
    console.log("🚀 Servidor rodando na porta 3000");
    console.log("Acesse o seu projeto pelo navegador!");
});