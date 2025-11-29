// db.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',        // 본인 DB 정보로 수정
  user: 'root',             // 본인 DB 계정
  password: 'rootroot',     // 본인 비밀번호
  database: 'db_portfolio_hub',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
