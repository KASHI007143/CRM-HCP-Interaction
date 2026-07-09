import mysql from 'mysql2/promise';

let pool: mysql.Pool;

export async function initDb() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'hcp_crm';

  console.log(`[MySQL Database] Connecting to MySQL server at ${host}:${port} as ${user}...`);

  try {
    // 1. Create connection without database specified to ensure DB exists
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await connection.end();

    // 2. Create the connection pool with the database specified
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // 3. Create table if not exists (camelCase column names for easy matching with JS objects)
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS hcp_interactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hcpName VARCHAR(255) NOT NULL,
        interactionType VARCHAR(50) NOT NULL,
        date VARCHAR(50) NOT NULL,
        time VARCHAR(50) NOT NULL,
        attendees TEXT,
        topicsDiscussed TEXT,
        materialsShared JSON,
        samplesDistributed JSON,
        sentiment VARCHAR(50),
        outcomes TEXT,
        followUpActions TEXT,
        aiSuggestedFollowUps JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await pool.query(createTableQuery);
    console.log(`[MySQL Database] Initialized successfully. Table \`hcp_interactions\` is ready.`);
  } catch (err: any) {
    console.error(`[MySQL Database] Initialization error: ${err.message}`);
    throw err;
  }
}

export async function getPool(): Promise<mysql.Pool> {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDb() first.');
  }
  return pool;
}

export async function saveInteraction(interaction: any) {
  const p = await getPool();
  const query = `
    INSERT INTO hcp_interactions (
      hcpName, interactionType, date, time, attendees, topicsDiscussed, 
      materialsShared, samplesDistributed, sentiment, outcomes, followUpActions, aiSuggestedFollowUps
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Clean arrays to string for MySQL storage, fallback to empty arrays
  const materials = Array.isArray(interaction.materialsShared) ? interaction.materialsShared : [];
  const samples = Array.isArray(interaction.samplesDistributed) ? interaction.samplesDistributed : [];
  const suggestions = Array.isArray(interaction.aiSuggestedFollowUps) ? interaction.aiSuggestedFollowUps : [];

  const values = [
    interaction.hcpName || '',
    interaction.interactionType || 'Meeting',
    interaction.date || '',
    interaction.time || '',
    interaction.attendees || '',
    interaction.topicsDiscussed || '',
    JSON.stringify(materials),
    JSON.stringify(samples),
    interaction.sentiment || '',
    interaction.outcomes || '',
    interaction.followUpActions || '',
    JSON.stringify(suggestions)
  ];

  const [result] = await p.query(query, values);
  return result;
}

export async function getAllInteractions() {
  const p = await getPool();
  const [rows] = await p.query('SELECT * FROM hcp_interactions ORDER BY createdAt DESC');
  
  return (rows as any[]).map(row => {
    // Parse helper
    const parseField = (val: any) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return val || [];
    };

    return {
      id: row.id,
      hcpName: row.hcpName,
      interactionType: row.interactionType,
      date: row.date,
      time: row.time,
      attendees: row.attendees,
      topicsDiscussed: row.topicsDiscussed,
      materialsShared: parseField(row.materialsShared),
      samplesDistributed: parseField(row.samplesDistributed),
      sentiment: row.sentiment,
      outcomes: row.outcomes,
      followUpActions: row.followUpActions,
      aiSuggestedFollowUps: parseField(row.aiSuggestedFollowUps),
      createdAt: row.createdAt
    };
  });
}
