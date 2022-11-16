import { Pool } from 'pg';
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
      }
});

const query = (text : string, _params : Array<string>) => pool.query(text, _params);

export const log = (params : Array<any>) => pool.query(`INSERT INTO "public.Logs" (log_time, status, message, type) VALUES (NOW(), $2, $1, $3)`, params)

export default query;