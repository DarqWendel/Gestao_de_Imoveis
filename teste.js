const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'gestaodeimoveis-darquiowendel2021-1acc.b.aivencloud.com',
  port: 17599,
  user: 'avnadmin',
  password: 'AVNS_bSkOd-71tCrWAHg3adi', // Verifique se não há espaços aqui
  database: 'defaultdb',
  ssl: {
    rejectUnauthorized: false
  }
});

connection.connect(function(err) {
  if (err) {
    console.error('ERRO DETALHADO:', err.message);
    console.error('CÓDIGO DO ERRO:', err.code);
  } else {
    console.log('CONECTADO COM SUCESSO! O problema era no outro código.');
  }
  process.exit();
});