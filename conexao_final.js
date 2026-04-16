const mysql = require('mysql2');


const uri = 'mysql://avnadmin:AVNS_bSkOd-71tCrWAHg3adi@gestaodeimoveis-darquiowendel2021-1acc.b.aivencloud.com:17599/defaultdb?ssl-mode=REQUIRED'; 

const connection = mysql.createReference(uri);


const connectionConfig = {
    uri: uri,
    ssl: {
        rejectUnauthorized: false
    }
};

const db = mysql.createConnection(uri + "?ssl-mode=REQUIRED");

db.connect((err) => {
    if (err) {
        console.error('--- ERRO DE CONEXÃO ---');
        console.error('Mensagem:', err.message);
        console.error('Código:', err.code);
        console.error('DICA: Se a senha tiver caracteres especiais, a URI é o melhor jeito.');
    } else {
        console.log('--- SUCESSO! ---');
        console.log('Você está conectado ao banco da Aiven!');
    }
    db.end();
});