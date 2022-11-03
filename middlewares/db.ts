import { Pool } from 'pg';

const pool = new Pool();

const query = (text : string, _params : Array<string>) => pool.query(text, _params);

export const log = (params : Array<any>) => pool.query(`INSERT INTO "public.Logs" (log_time, status, message, type) VALUES (NOW(), $2, $1, $3)`, params)

export default query;