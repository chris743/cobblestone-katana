import {config} from '../../config';
import sql from 'mssql';

let poolDM01: sql.ConnectionPool | null = null;
let poolDM03: sql.ConnectionPool | null = null;

const sqlConfigDM01: sql.config = {
  server: config.dm01.server,
  database: config.dm01.database,
  user: config.dm01.username,
  password: config.dm01.password,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

const sqlConfigDM03: sql.config = {
  server: config.dm03.server,
  database: config.dm03.database,
  user: config.dm03.username,
  password: config.dm03.password,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!poolDM01) {
    poolDM01 = await sql.connect(sqlConfigDM01);
  }
  return poolDM01;
}

export async function getPoolDM03(): Promise<sql.ConnectionPool> {
  if (!poolDM03) {
    poolDM03 = await sql.connect(sqlConfigDM03);
  }
  return poolDM03;
}

export async function closeConnections(): Promise<void> {
  if (poolDM01) {
    await poolDM01.close();
    poolDM01 = null;
  }
  if (poolDM03) {
    await poolDM03.close();
    poolDM03 = null;
  }
}