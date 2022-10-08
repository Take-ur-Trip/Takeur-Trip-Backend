import { Pool } from 'pg';

const pool = new Pool();

const query = (text : string, _params : Array<string>) => pool.query(text, _params);

export default query;