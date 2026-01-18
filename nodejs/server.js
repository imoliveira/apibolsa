const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const NodeCache = require('node-cache');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');
const cheerio = require('cheerio');

// Kafka
const kafkaProducer = require('./kafka-producer');
const kafkaConsumer = require('./kafka-consumer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do cache
// Usar Data Grid se disponível, senão usar cache local
const useDataGrid = process.env.DATAGRID_ENABLED === 'true';
const dataGridUrl = process.env.DATAGRID_URL || 'http://apibolsa-cache:11222';
const dataGridUser = process.env.DATAGRID_USER || 'developer';
const dataGridPassword = process.env.DATAGRID_PASSWORD || 'developer';

// Cache local como fallback
const localCache = new NodeCache({
  stdTTL: 3600, // 1 hora
  checkperiod: 600, // Verificar a cada 10 minutos
  useClones: false
});

// Função para verificar se cache existe e criar se necessário
async function ensureCacheExists() {
  if (!useDataGrid || !dataGridAvailable) return false;
  
  try {
    // Verificar se cache existe
    await axios.head(`${dataGridUrl}/rest/v2/caches/default`, {
      auth: { username: dataGridUser, password: dataGridPassword },
      timeout: 2000
    });
    return true;
  } catch (error) {
    // Se cache não existe, criar
    if (error.response?.status === 404) {
      try {
        await axios.post(`${dataGridUrl}/rest/v2/caches/default`, {
          "distributed-cache": {
            "mode": "SYNC",
            "statistics": true
          }
        }, {
          auth: { username: dataGridUser, password: dataGridPassword },
          headers: { 'Content-Type': 'application/json' },
          timeout: 3000
        });
        console.log('✅ Cache "default" criado no Data Grid');
        return true;
      } catch (createError) {
        // Não logar erro de criação repetidamente
        return false;
      }
    }
    return false;
  }
}

// Flag para rastrear se Data Grid está disponível
let dataGridAvailable = false;
let dataGridCheckTime = 0;
const DATA_GRID_CHECK_INTERVAL = 60000; // Verificar a cada 1 minuto

// Função para verificar se Data Grid está disponível
async function checkDataGridAvailability() {
  const now = Date.now();
  
  // Se já verificou recentemente, retornar status em cache
  if (now - dataGridCheckTime < DATA_GRID_CHECK_INTERVAL) {
    return dataGridAvailable;
  }
  
  if (!useDataGrid) {
    dataGridAvailable = false;
    return false;
  }
  
  try {
    // Tentar uma requisição simples para verificar disponibilidade
    await axios.head(`${dataGridUrl}/rest/v2/caches`, {
      auth: { username: dataGridUser, password: dataGridPassword },
      timeout: 2000
    });
    dataGridAvailable = true;
    dataGridCheckTime = now;
    return true;
  } catch (error) {
    dataGridAvailable = false;
    dataGridCheckTime = now;
    return false;
  }
}

// Função para obter valor do cache
async function getCache(key) {
  // Verificar disponibilidade do Data Grid primeiro
  const isAvailable = await checkDataGridAvailability();
  
  if (isAvailable) {
    try {
      const response = await axios.get(`${dataGridUrl}/rest/v2/caches/default/${key}`, {
        auth: {
          username: dataGridUser,
          password: dataGridPassword
        },
        timeout: 2000,
        validateStatus: (status) => status === 200 || status === 404
      });
      
      if (response.status === 404) {
        return undefined; // Chave não existe
      }
      return response.data;
    } catch (error) {
      // Se falhar, marcar como indisponível e usar cache local
      dataGridAvailable = false;
      return localCache.get(key);
    }
  }
  
  // Usar cache local se Data Grid não estiver disponível
  return localCache.get(key);
}

// Função para definir valor no cache
async function setCache(key, value, ttl = 3600) {
  // Verificar disponibilidade do Data Grid primeiro
  const isAvailable = await checkDataGridAvailability();
  
  if (isAvailable) {
    try {
      // Garantir que cache existe
      await ensureCacheExists();
      
      await axios.put(`${dataGridUrl}/rest/v2/caches/default/${key}`, value, {
        auth: {
          username: dataGridUser,
          password: dataGridPassword
        },
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 2000
      });
      return true;
    } catch (error) {
      // Se falhar, marcar como indisponível e usar cache local
      dataGridAvailable = false;
      return localCache.set(key, value, ttl);
    }
  }
  
  // Usar cache local se Data Grid não estiver disponível
  return localCache.set(key, value, ttl);
}

// Função para remover do cache
async function deleteCache(key) {
  const isAvailable = await checkDataGridAvailability();
  
  if (isAvailable) {
    try {
      await axios.delete(`${dataGridUrl}/rest/v2/caches/default/${key}`, {
        auth: {
          username: dataGridUser,
          password: dataGridPassword
        },
        timeout: 2000,
        validateStatus: (status) => status === 200 || status === 404
      });
      return true;
    } catch (error) {
      dataGridAvailable = false;
      return localCache.del(key);
    }
  }
  return localCache.del(key);
}

// Função para limpar cache
async function clearCache() {
  const isAvailable = await checkDataGridAvailability();
  
  if (isAvailable) {
    try {
      await axios.delete(`${dataGridUrl}/rest/v2/caches/default`, {
        auth: {
          username: dataGridUser,
          password: dataGridPassword
        },
        timeout: 3000
      });
      return true;
    } catch (error) {
      dataGridAvailable = false;
      localCache.flushAll();
      return false;
    }
  }
  localCache.flushAll();
  return true;
}

// Configuração do banco de dados (apibolsa - teste de conexão)
const dbConfig = {
  host: process.env.DB_HOST || 'mysql',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'apibolsa',
  password: process.env.DB_PASSWORD || 'apibolsa123',
  database: process.env.DB_NAME || 'apibolsa',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Configuração do banco de dados de login
const loginDbConfig = {
  host: process.env.DB_HOST || 'mysql',
  port: process.env.DB_PORT || 3306,
  user: process.env.LOGIN_DB_USER || 'teste',
  password: process.env.LOGIN_DB_PASSWORD || 'teste',
  database: process.env.LOGIN_DB_NAME || 'loginapibolsaDB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'apibolsa-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Variável para armazenar status da conexão
let connectionStatus = {
  connected: false,
  lastCheck: null,
  error: null,
  serverInfo: null
};

// Função para testar conexão (banco apibolsa) com cache
async function testConnection() {
  const cacheKey = 'db_connection_test';
  
  // Tentar obter do cache primeiro
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log('📦 Dados obtidos do cache');
    return { success: true, info: cached, fromCache: true };
  }

  // Se não estiver no cache, buscar do banco
  let connection = null;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT VERSION() as version, DATABASE() as dbname, USER() as username');
    const result = rows[0];
    
    connectionStatus = {
      connected: true,
      lastCheck: new Date().toISOString(),
      error: null,
      serverInfo: result
    };
    
    // Armazenar no cache por 5 minutos
    await setCache(cacheKey, result, 300);
    
    return { success: true, info: result, fromCache: false };
  } catch (error) {
    connectionStatus = {
      connected: false,
      lastCheck: new Date().toISOString(),
      error: error.message,
      serverInfo: null
    };
    return { success: false, error: error.message };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Função para inicializar banco de login
async function initLoginDatabase() {
  let connection = null;
  try {
    // Conectar como root para criar banco e usuário
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'mysql',
      port: process.env.DB_PORT || 3306,
      user: 'root',
      password: process.env.MYSQL_ROOT_PASSWORD || 'root123'
    });

    // Criar banco de dados
    await connection.execute('CREATE DATABASE IF NOT EXISTS loginapibolsaDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    
    // Criar usuário
    await connection.execute(`CREATE USER IF NOT EXISTS 'teste'@'%' IDENTIFIED BY 'teste'`);
    
    // Conceder permissões
    await connection.execute('GRANT ALL PRIVILEGES ON loginapibolsaDB.* TO \'teste\'@\'%\'');
    await connection.execute('FLUSH PRIVILEGES');
    
    await connection.end();

    // Conectar ao banco de login
    connection = await mysql.createConnection(loginDbConfig);
    
    // Criar tabela de usuários
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        nome_completo VARCHAR(255),
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ultimo_login TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Criar índice (verificar se já existe)
    try {
      await connection.execute('CREATE INDEX idx_username ON usuarios(username)');
    } catch (error) {
      // Índice já existe, ignorar erro
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }

    // Verificar se usuário teste existe
    const [users] = await connection.execute('SELECT * FROM usuarios WHERE username = ?', ['teste']);
    
    if (users.length === 0) {
      // Criar usuário teste (senha: teste)
      const passwordHash = await bcrypt.hash('teste', 10);
      await connection.execute(
        'INSERT INTO usuarios (username, password_hash, email, nome_completo, ativo) VALUES (?, ?, ?, ?, ?)',
        ['teste', passwordHash, 'teste@apibolsa.local', 'Usuário Teste', true]
      );
      console.log('✅ Usuário teste criado (senha: teste)');
    } else {
      // Atualizar hash do usuário teste para garantir que está correto
      const passwordHash = await bcrypt.hash('teste', 10);
      await connection.execute(
        'UPDATE usuarios SET password_hash = ? WHERE username = ?',
        [passwordHash, 'teste']
      );
      console.log('✅ Hash do usuário teste atualizado (senha: teste)');
    }

    await connection.end();
    console.log('✅ Banco loginapibolsaDB inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de login:', error.message);
  }
}

// ==================== ROTAS PÚBLICAS ====================

// Rota principal - página de teste de conexão
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota de login
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Redirecionar GET /api/login para /login
app.get('/api/login', (req, res) => {
  res.redirect('/login');
});

// API: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  let connection = null;
  try {
    connection = await mysql.createConnection(loginDbConfig);
    const [users] = await connection.execute(
      'SELECT * FROM usuarios WHERE username = ? AND ativo = TRUE',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Atualizar último login
    await connection.execute(
      'UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    // Criar sessão
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      nome_completo: user.nome_completo
    };

    res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nome_completo: user.nome_completo
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// API: Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  });
});

// API: Verificar sessão
app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Não autenticado' });
  }
});

// ==================== ROTAS PROTEGIDAS ====================

// Middleware de autenticação
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

// Dashboard Financeiro
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ==================== ROTAS DE TESTE ====================

// API: Testar conexão (banco apibolsa)
app.get('/api/test-connection', async (req, res) => {
  const result = await testConnection();
  res.json({
    ...result,
    timestamp: new Date().toISOString(),
    config: {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user
    }
  });
});

// API: Status da conexão
app.get('/api/status', (req, res) => {
  res.json(connectionStatus);
});

// API: Executar query de teste
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query não fornecida' });
  }

  let connection = null;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// API: Status do cache
app.get('/api/cache/status', requireAuth, async (req, res) => {
  try {
    const stats = localCache.getStats();
    res.json({
      success: true,
      cache: {
        type: useDataGrid ? 'Data Grid' : 'Local',
        enabled: useDataGrid,
        url: useDataGrid ? dataGridUrl : 'local',
        stats: {
          keys: localCache.keys().length,
          hits: stats.hits,
          misses: stats.misses,
          ksize: stats.ksize,
          vsize: stats.vsize
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Limpar cache
app.post('/api/cache/clear', requireAuth, async (req, res) => {
  try {
    await clearCache();
    res.json({ success: true, message: 'Cache limpo com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ROTAS KAFKA ====================

// Conectar Kafka Producer na inicialização
let kafkaProducerConnected = false;
async function initKafka() {
  try {
    await kafkaProducer.connectProducer();
    kafkaProducerConnected = true;
    console.log('✅ Kafka Producer inicializado');
  } catch (error) {
    console.warn('⚠️  Kafka Producer não disponível:', error.message);
    kafkaProducerConnected = false;
  }
}

// Armazenar mensagens recebidas para WebSocket
const receivedMessages = {
  pedidos: [],
  pagamentos: [],
  notificacoes: [],
  logs: []
};

// Handler para mensagens Kafka
async function handleKafkaMessage(messageData) {
  const { topic, value } = messageData;
  
  // Armazenar mensagem (manter últimas 100)
  if (receivedMessages[topic]) {
    receivedMessages[topic].unshift({
      ...messageData,
      receivedAt: new Date().toISOString()
    });
    if (receivedMessages[topic].length > 100) {
      receivedMessages[topic].pop();
    }
  }

  // Enviar via WebSocket se houver clientes conectados
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'kafka_message',
          topic: topic,
          data: messageData
        }));
      }
    });
  }
}

// Iniciar consumers para todos os tópicos
async function startKafkaConsumers() {
  const topics = ['pedidos', 'pagamentos', 'notificacoes', 'logs'];
  const groupId = 'apibolsa-consumer-group';

  // Aguardar mais tempo para o Kafka estar totalmente pronto
  console.log('⏳ Aguardando Kafka estar pronto...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  let connectedCount = 0;
  
  for (const topic of topics) {
    try {
      // Timeout de 15 segundos por consumer
      await Promise.race([
        kafkaConsumer.startConsumer(groupId, topic, handleKafkaMessage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Consumer timeout')), 15000)
        )
      ]);
      console.log(`✅ Consumer iniciado para tópico: ${topic}`);
      connectedCount++;
    } catch (error) {
      const errorMsg = error.message || String(error);
      
      // Se for erro de coordenador, é problema do Kafka (não crítico)
      if (errorMsg.includes('group coordinator') || errorMsg.includes('coordinator')) {
        console.warn(`⚠️  Kafka não está pronto para ${topic} (coordenador indisponível). A aplicação continuará sem consumer.`);
      } else if (!errorMsg.includes('ENOTFOUND') && !errorMsg.includes('ECONNREFUSED') && !errorMsg.includes('timeout')) {
        console.warn(`⚠️  Não foi possível iniciar consumer para ${topic}:`, errorMsg);
      }
    }
  }
  
  if (connectedCount === 0) {
    console.warn('⚠️  Nenhum consumer Kafka conectado. A aplicação continuará funcionando normalmente.');
    console.warn('💡 Dica: O Kafka pode estar configurando o tópico __consumer_offsets. Isso pode levar alguns minutos.');
    console.warn('💡 O dashboard financeiro funciona perfeitamente mesmo sem os consumers do Kafka.');
  } else if (connectedCount < topics.length) {
    console.log(`✅ ${connectedCount} de ${topics.length} consumers conectados. Alguns podem estar aguardando o tópico __consumer_offsets ser criado.`);
  } else {
    console.log(`✅ ${connectedCount} de ${topics.length} consumers conectados com sucesso.`);
  }
  
  // Tentar reconectar após 60 segundos se nenhum conectou
  if (connectedCount === 0) {
    setTimeout(async () => {
      console.log('🔄 Tentando reconectar consumers após 60 segundos...');
      await startKafkaConsumers();
    }, 60000);
  }
}

// API: Status do Kafka
app.get('/api/kafka/status', requireAuth, (req, res) => {
  res.json({
    success: true,
    producer: {
      connected: kafkaProducer.isConnected()
    },
    consumers: kafkaConsumer.getActiveConsumers(),
    topics: ['pedidos', 'pagamentos', 'notificacoes', 'logs']
  });
});

// API: Enviar mensagem (Producer)
app.post('/api/kafka/produce', requireAuth, async (req, res) => {
  const { topic, message, key } = req.body;

  if (!topic || !message) {
    return res.status(400).json({ 
      success: false, 
      error: 'Tópico e mensagem são obrigatórios' 
    });
  }

  const validTopics = ['pedidos', 'pagamentos', 'notificacoes', 'logs'];
  if (!validTopics.includes(topic)) {
    return res.status(400).json({ 
      success: false, 
      error: `Tópico inválido. Use: ${validTopics.join(', ')}` 
    });
  }

  try {
    const result = await kafkaProducer.sendMessage(topic, message, key);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: Enviar pedido
app.post('/api/kafka/pedidos', requireAuth, async (req, res) => {
  try {
    const result = await kafkaProducer.sendPedido(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Enviar pagamento
app.post('/api/kafka/pagamentos', requireAuth, async (req, res) => {
  try {
    const result = await kafkaProducer.sendPagamento(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Enviar notificação
app.post('/api/kafka/notificacoes', requireAuth, async (req, res) => {
  try {
    const result = await kafkaProducer.sendNotificacao(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Enviar log
app.post('/api/kafka/logs', requireAuth, async (req, res) => {
  try {
    const result = await kafkaProducer.sendLog(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Listar mensagens recebidas
app.get('/api/kafka/messages/:topic?', requireAuth, (req, res) => {
  const { topic } = req.params;
  
  if (topic) {
    if (receivedMessages[topic]) {
      res.json({ 
        success: true, 
        topic: topic,
        count: receivedMessages[topic].length,
        messages: receivedMessages[topic].slice(0, 50) // Últimas 50
      });
    } else {
      res.status(404).json({ success: false, error: 'Tópico não encontrado' });
    }
  } else {
    const allMessages = {};
    for (const [topic, messages] of Object.entries(receivedMessages)) {
      allMessages[topic] = {
        count: messages.length,
        lastMessages: messages.slice(0, 10) // Últimas 10 de cada
      };
    }
    res.json({ success: true, messages: allMessages });
  }
});

// Rota para interface Kafka
app.get('/kafka', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kafka.html'));
});

// Rota para dashboard financeiro
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ==================== ROTAS FINANCEIRAS ====================

// Função para buscar dados reais do dólar do Investing.com
async function fetchDollarFromInvesting() {
  try {
    const url = 'https://br.investing.com/currencies/streaming-forex-rates-majors';
    console.log('🌐 Buscando dados do dólar em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    // Tentar encontrar o valor do dólar na página (tabela de streaming)
    let lastValue = null;
    let variation = null;
    let percent = null;
    let maxValue = null;
    let minValue = null;
    
    // Buscar USD/BRL na tabela de streaming
    // Procurar por linhas da tabela que contenham USD/BRL ou Dólar/BRL
    console.log('🔍 Procurando USD/BRL na tabela...');
    
    // Tentar diferentes seletores de tabela
    const tableSelectors = [
      'table#forex-rates',
      'table.genTbl',
      'table.genTbl.openTbl',
      'table tbody',
      'table',
      '[data-test="forex-rates-table"]'
    ];
    
    let usdBrlRow = null;
    
    for (const tableSelector of tableSelectors) {
      const table = $(tableSelector).first();
      if (table.length) {
        console.log(`📋 Tabela encontrada com seletor: ${tableSelector}`);
        usdBrlRow = table.find('tr').filter((i, el) => {
          const text = $(el).text().toUpperCase();
          return text.includes('USD/BRL') || text.includes('USD BRL') || 
                 text.includes('USDBRL') ||
                 (text.includes('DÓLAR') && text.includes('BRL')) ||
                 (text.includes('DOLLAR') && text.includes('BRL'));
        }).first();
        
        if (usdBrlRow.length) {
          console.log('✅ Linha USD/BRL encontrada!');
          break;
        }
      }
    }
    
    // Se não encontrou, tentar buscar em todas as linhas
    if (!usdBrlRow || !usdBrlRow.length) {
      console.log('🔍 Buscando em todas as linhas da página...');
      usdBrlRow = $('tr').filter((i, el) => {
        const text = $(el).text().toUpperCase();
        return text.includes('USD/BRL') || text.includes('USD BRL') || 
               text.includes('USDBRL') ||
               (text.includes('DÓLAR') && text.includes('BRL')) ||
               (text.includes('DOLLAR') && text.includes('BRL'));
      }).first();
    }
    
    if (usdBrlRow && usdBrlRow.length) {
      console.log('📊 Extraindo dados da linha...');
      // Extrair dados da linha da tabela
      const cells = usdBrlRow.find('td');
      console.log(`📊 Número de células encontradas: ${cells.length}`);
      
      // Normalmente a estrutura é: Nome | Último | Variação | Var% | Máxima | Mínima | etc
      // Tentar diferentes índices de colunas
      const tryExtractValue = (index, name) => {
        if (cells.length > index) {
          const cell = cells.eq(index);
          const text = cell.text().trim();
          console.log(`  ${name} (coluna ${index}): "${text}"`);
          const match = text.match(/[\d,]+\.?\d*/);
          if (match) {
            let value = match[0];
            // Converter formato brasileiro para numérico
            if (value.includes(',')) {
              value = value.replace(/\./g, '').replace(',', '.');
            } else {
              value = value.replace(/,/g, '');
            }
            if (!isNaN(parseFloat(value))) {
              return value;
            }
          }
        }
        return null;
      };
      
      // Tentar diferentes posições para o último valor
      for (let i = 1; i < Math.min(cells.length, 6); i++) {
        const value = tryExtractValue(i, `Último (tentativa ${i})`);
        if (value && parseFloat(value) > 1 && parseFloat(value) < 10) {
          lastValue = value;
          console.log(`✅ Último valor encontrado na coluna ${i}: ${lastValue}`);
          break;
        }
      }
      
      // Buscar variação e percentual
      for (let i = 2; i < Math.min(cells.length, 8); i++) {
        const cell = cells.eq(i);
        const text = cell.text().trim();
        
        // Verificar se contém variação
        const varMatch = text.match(/([+-]?[\d,]+\.?\d*)/);
        if (varMatch && !variation) {
          let varValue = varMatch[1];
          if (varValue.includes(',')) {
            varValue = varValue.replace(/\./g, '').replace(',', '.');
          } else {
            varValue = varValue.replace(/,/g, '');
          }
          if (!isNaN(parseFloat(varValue))) {
            variation = varValue;
            console.log(`✅ Variação encontrada na coluna ${i}: ${variation}`);
          }
        }
        
        // Verificar se contém percentual
        const percentMatch = text.match(/([+-]?[\d,]+\.?\d*%)/);
        if (percentMatch && !percent) {
          percent = percentMatch[1];
          console.log(`✅ Percentual encontrado na coluna ${i}: ${percent}`);
        }
      }
      
      // Buscar máxima e mínima
      for (let i = 4; i < Math.min(cells.length, 8); i++) {
        const value = tryExtractValue(i, `Máx/Mín (tentativa ${i})`);
        if (value && !maxValue && parseFloat(value) > parseFloat(lastValue || '0')) {
          maxValue = value;
          console.log(`✅ Máxima encontrada na coluna ${i}: ${maxValue}`);
        } else if (value && !minValue && parseFloat(value) < parseFloat(lastValue || '999')) {
          minValue = value;
          console.log(`✅ Mínima encontrada na coluna ${i}: ${minValue}`);
        }
      }
    } else {
      console.log('⚠️  Linha USD/BRL não encontrada na tabela');
    }
    
    // Se não encontrou na tabela, tentar seletores alternativos
    if (!lastValue) {
      const selectors = [
        '[data-pair-code="USDBRL"]',
        '[data-symbol="USDBRL"]',
        '[id*="usdbrl"]',
        '[id*="USDBRL"]',
        '.pair_1',
        '#pair_1'
      ];
      
      for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length) {
          const text = element.text().trim();
          const match = text.match(/[\d,]+\.?\d*/);
          if (match) {
            let value = match[0];
            if (value.includes(',')) {
              value = value.replace(/\./g, '').replace(',', '.');
            } else {
              value = value.replace(/,/g, '');
            }
            if (!isNaN(parseFloat(value))) {
              lastValue = value;
              break;
            }
          }
        }
      }
    }
    
    // Fallback: tentar buscar dados em scripts JavaScript
    if (!lastValue) {
      console.log('🔍 Buscando em scripts JavaScript...');
      // Buscar em scripts que podem conter dados JSON
      const scripts = $('script');
      scripts.each((i, script) => {
        try {
          const scriptContent = $(script).html();
          if (!scriptContent) return;
          
          // Procurar por USDBRL ou USD/BRL no script
          if (scriptContent.includes('USDBRL') || scriptContent.includes('USD/BRL')) {
            console.log('📜 Script com USDBRL encontrado');
            
            // Tentar extrair valor usando regex
            const valueMatch = scriptContent.match(/USDBRL["\']?\s*[:=]\s*["\']?([\d,]+\.?\d*)/i);
            if (valueMatch) {
              let value = valueMatch[1];
              if (value.includes(',')) {
                value = value.replace(/\./g, '').replace(',', '.');
              } else {
                value = value.replace(/,/g, '');
              }
              if (!isNaN(parseFloat(value)) && parseFloat(value) > 1 && parseFloat(value) < 10) {
                lastValue = value;
                console.log(`✅ Valor encontrado no script: ${lastValue}`);
                return false; // Parar iteração
              }
            }
            
            // Tentar parsear como JSON
            try {
              const jsonMatch = scriptContent.match(/\{[\s\S]*USDBRL[\s\S]*\}/i);
              if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                if (json.price || json.last || json.value) {
                  let value = String(json.price || json.last || json.value);
                  if (value.includes(',')) {
                    value = value.replace(/\./g, '').replace(',', '.');
                  }
                  if (!isNaN(parseFloat(value)) && parseFloat(value) > 1 && parseFloat(value) < 10) {
                    lastValue = value;
                    console.log(`✅ Valor encontrado no JSON do script: ${lastValue}`);
                    return false;
                  }
                }
              }
            } catch (e) {
              // Ignorar erros de parsing JSON
            }
          }
        } catch (e) {
          // Ignorar erros
        }
      });
    }
    
    // Fallback: buscar em scripts JSON-LD
    if (!lastValue) {
      console.log('🔍 Buscando em scripts JSON-LD...');
      const scripts = $('script[type="application/ld+json"]');
      scripts.each((i, script) => {
        try {
          const json = JSON.parse($(script).html());
          if (json.offers && json.offers.price) {
            let value = String(json.offers.price).replace(/,/g, '');
            if (value.includes(',')) {
              value = value.replace(/\./g, '').replace(',', '.');
            }
            if (!isNaN(parseFloat(value)) && parseFloat(value) > 1 && parseFloat(value) < 10) {
              lastValue = value;
              console.log(`✅ Valor encontrado no JSON-LD: ${lastValue}`);
              return false;
            }
          }
        } catch (e) {
          // Ignorar erros de parsing
        }
      });
    }
    
    if (lastValue) {
      console.log('✅ Dados do dólar obtidos:', { lastValue, variation, percent, maxValue, minValue });
      return {
        success: true,
        value: parseFloat(lastValue).toFixed(4),
        variation: variation || '0.00',
        percent: percent || '0.00%',
        max: maxValue ? parseFloat(maxValue).toFixed(4) : lastValue,
        min: minValue ? parseFloat(minValue).toFixed(4) : lastValue,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    } else {
      console.log('⚠️  Não foi possível extrair o valor do dólar da página');
      return { success: false };
    }
  } catch (error) {
    console.error('❌ Erro ao buscar dólar do Investing.com:', error.message);
    return { success: false, error: error.message };
  }
}

// Cache para dados do dólar (atualizar a cada 5 segundos para tempo real)
let dollarCache = null;
let dollarCacheTime = null;
const DOLLAR_CACHE_TTL = 5000; // 5 segundos (reduzido para atualizações em tempo real)

async function getDollarData() {
  const now = Date.now();
  
  // Se o cache é válido, retornar
  if (dollarCache && dollarCacheTime && (now - dollarCacheTime) < DOLLAR_CACHE_TTL) {
    console.log('💾 Retornando dados do dólar do cache');
    return dollarCache;
  }
  
  console.log('🔄 Cache expirado ou inexistente, buscando novos dados do dólar...');
  // Buscar novos dados
  const dollarData = await fetchDollarFromInvesting();
  
  if (dollarData.success) {
    console.log('✅ Dados do dólar atualizados no cache');
    dollarCache = dollarData;
    dollarCacheTime = now;
  } else {
    console.log('⚠️  Falha ao buscar dados do dólar, usando cache anterior se disponível');
    // Se falhou mas tem cache antigo, usar ele
    if (dollarCache) {
      return dollarCache;
    }
  }
  
  return dollarData;
}

// Função para buscar calendário econômico do Investing.com
async function fetchEconomicCalendar() {
  try {
    const url = 'https://br.investing.com/economic-calendar';
    console.log('🌐 Buscando calendário econômico em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const events = [];
    
    // Buscar eventos do calendário econômico
    // O investing.com usa uma tabela com eventos
    $('.js-event-item, .eventRow, [data-event-id]').each((index, element) => {
      if (index >= 10) return false; // Limitar a 10 eventos
      
      const $el = $(element);
      
      // Extrair dados do evento
      const time = $el.find('.time, .timeCol').text().trim() || '';
      const country = $el.find('.flagCur, .country').text().trim() || '';
      const event = $el.find('.event, .eventCol').text().trim() || '';
      const actual = $el.find('.actual, .actualCol').text().trim() || '';
      const forecast = $el.find('.forecast, .forecastCol').text().trim() || '';
      const previous = $el.find('.previous, .previousCol').text().trim() || '';
      const impact = $el.find('.impact, .imp').attr('title') || $el.find('.impact, .imp').text().trim() || '';
      
      if (event) {
        events.push({
          time: time || 'N/A',
          country: country || 'N/A',
          event: event,
          actual: actual || '-',
          forecast: forecast || '-',
          previous: previous || '-',
          impact: impact || 'Média'
        });
      }
    });
    
    // Se não encontrou eventos com os seletores acima, tentar estrutura alternativa
    if (events.length === 0) {
      $('table#economicCalendarData tbody tr, .calendarRow').each((index, element) => {
        if (index >= 10) return false;
        
        const $el = $(element);
        const time = $el.find('td').eq(0).text().trim();
        const country = $el.find('td').eq(1).text().trim();
        const event = $el.find('td').eq(2).text().trim();
        const actual = $el.find('td').eq(3).text().trim();
        const forecast = $el.find('td').eq(4).text().trim();
        const previous = $el.find('td').eq(5).text().trim();
        
        if (event) {
          events.push({
            time: time || 'N/A',
            country: country || 'N/A',
            event: event,
            actual: actual || '-',
            forecast: forecast || '-',
            previous: previous || '-',
            impact: 'Média'
          });
        }
      });
    }
    
    if (events.length > 0) {
      console.log(`✅ Calendário econômico obtido: ${events.length} eventos`);
      return {
        success: true,
        events: events
      };
    } else {
      console.log('⚠️  Não foi possível extrair eventos do calendário econômico');
      return { 
        success: false,
        events: generateMockEconomicCalendar()
      };
    }
  } catch (error) {
    console.error('❌ Erro ao buscar calendário econômico do Investing.com:', error.message);
    return { 
      success: false, 
      error: error.message,
      events: generateMockEconomicCalendar()
    };
  }
}

// Função para buscar Treasuries do Investing.com
async function fetchTreasuriesFromInvesting() {
  try {
    const url = 'https://www.investing.com/rates-bonds/usa-government-bonds';
    console.log('🌐 Buscando Treasuries em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const treasuries = [];
    
    // Procurar pela tabela de Treasuries - Investing.com usa diferentes seletores
    const tableSelectors = [
      '#rates_bonds_table tbody tr',
      'table.genTbl.openTbl.ratesTbl tbody tr',
      'table#rates_bonds_table tbody tr',
      'table.datatable tbody tr',
      'table tbody tr[data-test="rates-row"]',
      '.js-currency-table tbody tr',
      'table.genTbl tbody tr',
      'table tbody tr:has(td:first-child a)',
      '[data-test="rates-table"] tbody tr',
      '.rates-table tbody tr'
    ];
    
    let foundRows = false;
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      console.log(`📋 Tentando seletor: ${tableSelector} (${rows.length} linhas encontradas)`);
      
      rows.each((index, element) => {
        if (index >= 20) return false; // Limitar a 20 títulos
      
      const $row = $(element);
      const cells = $row.find('td');
      
        if (cells.length < 4) return;
        
        // Log para debug - mostrar primeira linha completa
        if (index === 0) {
          console.log(`📊 Primeira linha encontrada com ${cells.length} células:`);
          cells.each((i, cell) => {
            console.log(`  Coluna ${i}: "${$(cell).text().trim()}"`);
          });
        }
        
        // Estrutura REAL do Investing.com para Treasuries (descoberta pelos logs):
        // Coluna 0: "" (vazia)
        // Coluna 1: Name (U.S. 1M, U.S. 3M, etc.)
        // Coluna 2: Yield (rendimento atual)
        // Coluna 3: Prev. (anterior)
        // Coluna 4: High (máxima)
        // Coluna 5: Low (mínima)
        // Coluna 6: Chg. (variação absoluta)
        // Coluna 7: Chg. % (variação percentual)
        // Coluna 8: Time (data no formato 16/01)
        
        const nameCell = $row.find('td').eq(1); // Nome está na coluna 1 (coluna 0 é vazia)
      const name = nameCell.find('a').text().trim() || nameCell.text().trim() || '';
        
        // Log para debug - mostrar primeira linha completa
        if (index === 0) {
          console.log(`📊 Primeira linha encontrada com ${cells.length} células:`);
          cells.each((i, cell) => {
            console.log(`  Coluna ${i}: "${$(cell).text().trim()}"`);
          });
        }
        
        // Pular linhas vazias ou de cabeçalho
        if (!name || name.length < 3) {
          if (index < 3) console.log(`⚠️  Linha ${index} pulada: nome vazio ou muito curto`);
          return;
        }
        
        // Verificar se é um título válido (deve conter "U.S." ou números com Month/Year)
        if (!name.includes('U.S.') && !name.match(/\d+\s*(Month|Year|M|Y)/i) && !name.match(/^U\.S\./i)) {
          if (index < 3) console.log(`⚠️  Linha ${index} pulada: nome "${name}" não é um título válido`);
          return;
        }
        
        console.log(`✅ Processando linha ${index}: ${name}`);
        
        // Função auxiliar para limpar valores numéricos
        const cleanNumeric = (str) => {
          if (!str) return '';
          // Remover símbolos e manter apenas números, pontos, vírgulas e sinais
          return str.replace(/[^\d.,+\-]/g, '').replace(/,/g, '').trim();
        };
        
        // Extrair dados na ordem CORRETA do Investing.com (baseado nos logs):
        // Coluna 0: "" (vazia)
        // Coluna 1: Name (U.S. 1M, U.S. 3M, etc.)
        // Coluna 2: Yield (rendimento atual)
        // Coluna 3: Prev. (anterior)
        // Coluna 4: High (máxima)
        // Coluna 5: Low (mínima)
        // Coluna 6: Chg. (variação absoluta)
        // Coluna 7: Chg. % (variação percentual)
        // Coluna 8: Time (data no formato 16/01)
        let yieldValue = $row.find('td').eq(2).text().trim() || ''; // Coluna 2: Yield
        let previous = $row.find('td').eq(3).text().trim() || ''; // Coluna 3: Prev
        let high = $row.find('td').eq(4).text().trim() || ''; // Coluna 4: High
        let low = $row.find('td').eq(5).text().trim() || ''; // Coluna 5: Low
        let change = $row.find('td').eq(6).text().trim() || ''; // Coluna 6: Chg
        let changePercent = $row.find('td').eq(7).text().trim() || ''; // Coluna 7: Chg%
        let time = $row.find('td').eq(8).text().trim() || ''; // Coluna 8: Time
        
        // Se não encontrou dados nas posições esperadas, tentar buscar em todas as células
        if (!yieldValue || !high || !low) {
          // Buscar valores numéricos em todas as células
          cells.each((i, cell) => {
            const cellText = $(cell).text().trim();
            const cellNum = parseFloat(cellText.replace(/[^\d.,+\-]/g, '').replace(/,/g, ''));
            
            // Se é um número válido entre 0.1 e 10, provavelmente é yield
            if (!yieldValue && cellNum >= 0.1 && cellNum <= 10 && i > 0) {
              yieldValue = cellText;
            }
            
            // Se é maior que yield, pode ser high
            if (yieldValue && cellNum > parseFloat(yieldValue.replace(/[^\d.,+\-]/g, '').replace(/,/g, ''))) {
              if (!high || parseFloat(high.replace(/[^\d.,+\-]/g, '').replace(/,/g, '')) < cellNum) {
                high = cellText;
              }
            }
            
            // Se é menor que yield mas maior que 0, pode ser low
            if (yieldValue && cellNum < parseFloat(yieldValue.replace(/[^\d.,+\-]/g, '').replace(/,/g, '')) && cellNum > 0) {
              if (!low || parseFloat(low.replace(/[^\d.,+\-]/g, '').replace(/,/g, '')) > cellNum) {
                low = cellText;
              }
            }
            
            // Se contém + ou - e é um número pequeno, pode ser change
            if ((cellText.includes('+') || cellText.includes('-')) && Math.abs(cellNum) < 1 && i > 2) {
              if (!change) change = cellText;
            }
            
            // Se contém % e é um número pequeno, pode ser changePercent
            if (cellText.includes('%') && Math.abs(cellNum) < 100 && i > 2) {
              if (!changePercent) changePercent = cellText;
            }
            
            // Se tem formato de data (dd/mm ou dd/mm/yyyy), é time
            if (cellText.match(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/) && !time) {
              time = cellText;
            }
          });
        }
        
        // Se ainda não encontrou, tentar buscar por atributos data-*
        let last = yieldValue;
        if (!last) {
          last = $row.attr('data-yield') || $row.find('[data-yield]').first().attr('data-yield') || '';
        }
        
        if (!high) {
          high = $row.attr('data-high') || $row.find('[data-high]').first().attr('data-high') || '';
        }
        
        if (!low) {
          low = $row.attr('data-low') || $row.find('[data-low]').first().attr('data-low') || '';
        }
      
        // Limpar e formatar os dados
        const cleanName = name.replace(/\s+/g, ' ').trim();
        
        // Log para debug da primeira linha válida
        if (index === 0 && cleanName.includes('U.S.')) {
          console.log(`📊 Dados extraídos da primeira linha:`);
          console.log(`  Name: ${cleanName}`);
          console.log(`  Yield: ${yieldValue}`);
          console.log(`  High: ${high}`);
          console.log(`  Low: ${low}`);
          console.log(`  Change: ${change}`);
          console.log(`  Change%: ${changePercent}`);
          console.log(`  Time: ${time}`);
        }
        const cleanLast = cleanNumeric(last);
        const cleanChange = cleanNumeric(change);
        const cleanChangePercent = cleanNumeric(changePercent);
        const cleanHigh = cleanNumeric(high);
        const cleanLow = cleanNumeric(low);
        
        const value = parseFloat(cleanLast) || 0;
        
        // Log detalhado para debug
        if (treasuries.length === 0) {
          console.log(`📊 Dados extraídos da primeira linha válida:`);
          console.log(`  Name: "${cleanName}"`);
          console.log(`  Yield (raw): "${yieldValue}" -> (clean): "${cleanLast}" -> (parsed): ${value}`);
          console.log(`  High (raw): "${high}" -> (clean): "${cleanHigh}"`);
          console.log(`  Low (raw): "${low}" -> (clean): "${cleanLow}"`);
          console.log(`  Change (raw): "${change}" -> (clean): "${cleanChange}"`);
          console.log(`  Change% (raw): "${changePercent}" -> (clean): "${cleanChangePercent}"`);
          console.log(`  Time: "${time}"`);
        }
        const changeValue = parseFloat(cleanChange) || 0;
        const changePercentValue = parseFloat(cleanChangePercent) || 0;
        
        // Validar se temos pelo menos o valor principal
        if (value === 0) {
          console.log(`⚠️  Linha ${index} pulada: valor yield é zero ou inválido`);
          return;
        }
        
        // Extrair High e Low - são obrigatórios no Investing.com
        let maxValue = parseFloat(cleanHigh);
        let minValue = parseFloat(cleanLow);
        
        // Se não encontrou high/low, usar value como fallback mínimo
        if (!maxValue || isNaN(maxValue)) {
          maxValue = value;
        }
        if (!minValue || isNaN(minValue)) {
          minValue = value;
        }
        
        // Garantir que max >= value >= min
        if (maxValue < value) maxValue = value;
        if (minValue > value) minValue = value;
        
        // Formatar variação com sinal (já vem formatado do site, mas garantir)
        let variationFormatted = change;
        if (changeValue !== 0) {
          variationFormatted = changeValue >= 0 ? 
            `+${changeValue.toFixed(3)}` : changeValue.toFixed(3);
        } else {
          variationFormatted = '0.000';
        }
        
        // Formatar percentual com sinal
        let percentFormatted = changePercent;
        if (changePercentValue !== 0) {
          percentFormatted = changePercentValue >= 0 ? 
          `+${changePercentValue.toFixed(2)}%` : `${changePercentValue.toFixed(2)}%`;
        } else {
          percentFormatted = '0.00%';
        }
        
        // Extrair mês se disponível no nome (ex: "U.S. 2 Year" -> "2 Year" ou "U.S. 1M" -> "1M")
        let mes = '';
        const mesMatch = cleanName.match(/(\d+\s*(?:Month|Year|M|Y))/i);
        if (mesMatch) {
          mes = mesMatch[1].replace(/\s+/g, '');
        }
        
        // Limpar e formatar time - pode vir como "16/01" (data) ou hora
        let cleanTime = time.trim();
        // Se não tem formato de hora, manter como está (pode ser data como "16/01")
        if (!cleanTime.includes(':') && !cleanTime.match(/\d{2}\/\d{2}/)) {
          // Se não tem formato conhecido, deixar vazio
          cleanTime = '';
        }
        
        // Extrair Previous (Prev.) da coluna 3
        const previousValue = parseFloat(cleanNumeric(previous)) || value;
        
        // Log para debug
        if (treasuries.length === 0) {
          console.log(`📊 Dados finais do primeiro Treasury:`);
          console.log(`  Name: "${cleanName}"`);
          console.log(`  Yield: ${value.toFixed(3)}`);
          console.log(`  Prev.: ${previousValue.toFixed(3)}`);
          console.log(`  High: ${maxValue.toFixed(3)}`);
          console.log(`  Low: ${minValue.toFixed(3)}`);
          console.log(`  Chg.: ${variationFormatted}`);
          console.log(`  Chg.%: ${percentFormatted}`);
          console.log(`  Time: "${cleanTime}"`);
        }
        
          treasuries.push({
            name: cleanName,
            mes: mes,
          value: value.toFixed(3), // 3 casas decimais como no Investing.com - Yield
          previous: previousValue.toFixed(3), // Prev. (anterior)
          max: maxValue.toFixed(3), // 3 casas decimais - High
          min: minValue.toFixed(3), // 3 casas decimais - Low
          variation: variationFormatted, // Chg.
          percent: percentFormatted, // Chg.%
          time: cleanTime || '' // Time
          });
          
          foundRows = true;
      });
      
      if (foundRows && treasuries.length > 0) {
        console.log(`✅ Treasuries encontrados com seletor ${tableSelector}: ${treasuries.length} títulos`);
        break;
      }
    }
    
    // Se não encontrou na estrutura de tabela, tentar buscar em scripts JSON
    if (treasuries.length === 0) {
      console.log('⚠️  Tentando buscar dados em scripts JSON...');
      const scripts = $('script').toArray();
      
      for (const script of scripts) {
        const scriptContent = $(script).html() || '';
        
        // Procurar por dados JSON no script
        const jsonMatches = [
          scriptContent.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/),
          scriptContent.match(/var\s+bondsData\s*=\s*(\[.+?\]);/),
          scriptContent.match(/data:\s*(\[.+?\])/),
          scriptContent.match(/bondsData\s*[:=]\s*(\[.+?\])/),
          scriptContent.match(/treasuries\s*[:=]\s*(\[.+?\])/),
          scriptContent.match(/ratesData\s*[:=]\s*(\[.+?\])/),
          scriptContent.match(/__NEXT_DATA__.*?"bonds":(\[.+?\])/),
        ];
        
        for (const jsonMatch of jsonMatches) {
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[1]);
              // Tentar extrair dados dos bonds
              const bondsData = Array.isArray(data) ? data : (data.bonds || data.rates || data.treasuries || data.data || []);
              if (Array.isArray(bondsData)) {
                bondsData.forEach(bond => {
                  if (bond.name || bond.title || bond.symbol) {
                    const name = bond.name || bond.title || bond.symbol || '';
                    const value = parseFloat(bond.value || bond.last || bond.price || bond.yield || bond.close || 0);
                    const change = parseFloat(bond.change || bond.variation || bond.chg || 0);
                    const changePercent = parseFloat(bond.changePercent || bond.percent || bond.chgPercent || bond.pctChange || 0);
                    const high = parseFloat(bond.max || bond.high || bond.h || 0);
                    const low = parseFloat(bond.min || bond.low || bond.l || 0);
                    
                    // Verificar se é um título válido
                    if (name && (name.includes('U.S.') || name.match(/\d+\s*(Month|Year|M|Y)/i))) {
                      const maxValue = high || value;
                      const minValue = low || value;
                      
                      // Se max e min são iguais ao value e temos change, calcular aproximado
                      let finalMax = maxValue;
                      let finalMin = minValue;
                      if (maxValue === value && minValue === value && change !== 0) {
                        finalMax = value + Math.abs(change * 0.5);
                        finalMin = value - Math.abs(change * 0.5);
                      }
                      
                      treasuries.push({
                        name: name,
                        mes: bond.mes || bond.month || bond.maturity || '',
                        value: value.toFixed(3), // 3 casas decimais
                        previous: (bond.previous || bond.prev || value).toFixed(3), // Prev.
                        max: finalMax.toFixed(3), // 3 casas decimais
                        min: finalMin.toFixed(3), // 3 casas decimais
                        variation: change >= 0 ? `+${change.toFixed(3)}` : change.toFixed(3),
                        percent: changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`,
                        time: bond.time || bond.lastUpdate || ''
                      });
                    }
                  }
                });
                if (treasuries.length > 0) break;
              }
            } catch (e) {
              console.log('⚠️  Erro ao parsear JSON:', e.message);
            }
          }
        }
        if (treasuries.length > 0) break;
      }
    }
    
    if (treasuries.length > 0) {
      console.log(`✅ Treasuries obtidos: ${treasuries.length} títulos`);
      // Log completo do primeiro Treasury para debug - garantir que previous está presente
      const firstTreasury = treasuries[0];
      console.log('📊 Primeiro Treasury exemplo completo:', JSON.stringify({
        name: firstTreasury.name,
        mes: firstTreasury.mes,
        value: firstTreasury.value,
        previous: firstTreasury.previous || 'N/A',
        max: firstTreasury.max,
        min: firstTreasury.min,
        variation: firstTreasury.variation,
        percent: firstTreasury.percent,
        time: firstTreasury.time
      }, null, 2));
      return treasuries;
    } else {
      console.log('⚠️  Não foi possível extrair Treasuries, usando dados mockados');
      return null; // Retornar null para usar dados mockados
    }
  } catch (error) {
    console.error('❌ Erro ao buscar Treasuries do Investing.com:', error.message);
    return null; // Retornar null para usar dados mockados
  }
}

// Função para gerar calendário econômico mockado (fallback)
function generateMockEconomicCalendar() {
  const now = new Date();
  const today = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  
  return [
    {
      time: '09:00',
      country: '🇺🇸 EUA',
      event: 'Taxa de Desemprego',
      actual: '3.7%',
      forecast: '3.8%',
      previous: '3.9%',
      impact: 'Alta'
    },
    {
      time: '10:30',
      country: '🇧🇷 Brasil',
      event: 'IPCA Mensal',
      actual: '0.45%',
      forecast: '0.50%',
      previous: '0.42%',
      impact: 'Alta'
    },
    {
      time: '11:00',
      country: '🇪🇺 Zona Euro',
      event: 'PIB Trimestral',
      actual: '0.3%',
      forecast: '0.2%',
      previous: '0.1%',
      impact: 'Média'
    },
    {
      time: '14:00',
      country: '🇺🇸 EUA',
      event: 'Vendas no Varejo',
      actual: '0.5%',
      forecast: '0.3%',
      previous: '0.2%',
      impact: 'Média'
    },
    {
      time: '15:30',
      country: '🇬🇧 Reino Unido',
      event: 'Inflação (CPI)',
      actual: '2.1%',
      forecast: '2.0%',
      previous: '2.2%',
      impact: 'Alta'
    }
  ];
}

// Cache para calendário econômico (atualizar a cada 5 minutos)
let economicCalendarCache = null;
let economicCalendarCacheTime = null;
const ECONOMIC_CALENDAR_CACHE_TTL = 300000; // 5 minutos

async function getEconomicCalendar() {
  const now = Date.now();
  
  // Se o cache é válido, retornar
  if (economicCalendarCache && economicCalendarCacheTime && 
      (now - economicCalendarCacheTime) < ECONOMIC_CALENDAR_CACHE_TTL) {
    return economicCalendarCache;
  }
  
  // Buscar novos dados
  const calendarData = await fetchEconomicCalendar();
  
  if (calendarData.success || calendarData.events) {
    economicCalendarCache = calendarData;
    economicCalendarCacheTime = now;
  }
  
  return calendarData;
}

// Função para buscar dados do Brazilian Real do CME Group
async function fetchBrazilianRealFromCME() {
  try {
    const url = 'https://www.cmegroup.com/markets/fx/emerging-market/brazilian-real.quotes.html';
    console.log('🌐 Buscando dados do Brazilian Real em:', url);
    console.log('📅 Timestamp da busca:', new Date().toISOString());
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.cmegroup.com/'
      },
      timeout: 20000
    });
    
    console.log(`✅ Resposta recebida do CME Group: ${response.status} ${response.statusText}`);
    console.log(`📄 Tamanho da resposta: ${response.data.length} caracteres`);
    
    const $ = cheerio.load(response.data);
    const contracts = [];
    
    // Verificar quantas tabelas foram encontradas
    const tableCount = $('table').length;
    console.log(`📊 Total de tabelas encontradas na página: ${tableCount}`);
    
    // Se não encontrou tabelas, pode ser que os dados estejam em divs ou scripts
    if (tableCount === 0) {
      console.log('⚠️  Nenhuma tabela encontrada, procurando em divs e scripts...');
      // Procurar por divs que possam conter dados de contratos
      const dataDivs = $('[class*="quote"], [class*="contract"], [class*="row"], [data-contract], [data-symbol]');
      console.log(`📊 Divs com dados encontradas: ${dataDivs.length}`);
    }
    
    // Procurar pela tabela de contratos - CME Group usa diferentes seletores
    // Priorizar seletores mais específicos primeiro
    const tableSelectors = [
      'table tbody tr', // Seletor mais genérico primeiro
      'table.quotes-table tbody tr',
      '.quotes-table tbody tr',
      'table.genTbl tbody tr',
      'table.quotes tbody tr',
      '[data-test="quotes-table"] tbody tr',
      '.contract-table tbody tr',
      '.market-data-table tbody tr',
      '[class*="quote"] tbody tr',
      '[class*="contract"] tbody tr',
      'tbody tr[data-contract]',
      'tr[data-symbol]',
      'div[class*="quote-row"]',
      'div[class*="contract-row"]'
    ];
    
    let foundRows = false;
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      console.log(`📋 Tentando seletor Brazilian Real: ${tableSelector} (${rows.length} linhas encontradas)`);
      
      // Verificar se é uma tabela de dados (não header)
      rows.each((index, element) => {
        if (index >= 15) return false; // Limitar a 15 contratos
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 5) {
          // Pode ser header ou linha vazia
          if (index < 2) {
            console.log(`⚠️  Linha ${index} pulada: apenas ${cells.length} células (provavelmente header)`);
          }
          return;
        }
        
        // Log para debug - mostrar primeiras 3 linhas completas
        if (index < 3 && contracts.length === 0) {
          console.log(`📊 Linha ${index} Brazilian Real encontrada com ${cells.length} células:`);
          cells.each((i, cell) => {
            const cellText = $(cell).text().trim();
            const cellHtml = $(cell).html();
            console.log(`  Coluna ${i}: "${cellText}"`);
            if (cellText.length === 0 && cellHtml && cellHtml.length < 200) {
              console.log(`    HTML: ${cellHtml}`);
            }
          });
        }
        
        // Estrutura REAL do CME Group conforme a tabela:
        // Coluna 0: MONTH (FEB 2026 6LG6)
        // Coluna 1: OPTIONS (botão)
        // Coluna 2: CHART (ícone)
        // Coluna 3: LAST (0.1856)
        // Coluna 4: CHANGE (-0.00035 (-0.19%))
        // Coluna 5: PRIOR SETTLE (-)
        // Coluna 6: OPEN (0.18595)
        // Coluna 7: HIGH (0.1861)
        // Coluna 8: LOW (0.1848)
        // Coluna 9: VOLUME (12,080)
        // Coluna 10: UPDATED (15:58:02 CT)
        
        // Extrair dados na ordem das colunas da tabela CME Group
        let month = cells.eq(0).text().trim() || '';
        let last = cells.eq(3).text().trim() || ''; // Coluna 3: LAST
        let change = cells.eq(4).text().trim() || ''; // Coluna 4: CHANGE
        let priorSettle = cells.eq(5).text().trim() || ''; // Coluna 5: PRIOR SETTLE
        let open = cells.eq(6).text().trim() || ''; // Coluna 6: OPEN
        let high = cells.eq(7).text().trim() || ''; // Coluna 7: HIGH
        let low = cells.eq(8).text().trim() || ''; // Coluna 8: LOW
        let volume = cells.eq(9).text().trim() || ''; // Coluna 9: VOLUME
        let updated = cells.eq(10).text().trim() || ''; // Coluna 10: UPDATED
        
        // Se não encontrou nas posições esperadas, tentar buscar por conteúdo
        if (!month || !last) {
          // Tentar encontrar MONTH procurando por padrões específicos
          if (!month) {
            cells.each((i, cell) => {
              const cellText = $(cell).text().trim();
              // Procurar por "FEB 2026" ou código GLOBEX como "6LG6"
              if (cellText.match(/[A-Z]{3}\s+\d{4}/) || cellText.match(/\d{1}[A-Z]{2}\d{1}/)) {
                month = cellText;
                return false; // Parar iteração
              }
            });
          }
        }
        
        // Se não encontrou nas posições esperadas, tentar buscar em todas as células
        if (!last || !change) {
          cells.each((i, cell) => {
            const cellText = $(cell).text().trim();
            
            // MONTH: pode conter "FEB 2026" ou "6LG6"
            if (!month && (cellText.match(/[A-Z]{3}\s+\d{4}/) || cellText.match(/^\d{1}[A-Z]{2}\d{1}$/))) {
              month = cellText;
            }
            
            // LAST: número decimal com 4 casas (ex: 0.1856)
            if (!last && cellText.match(/^\d+\.\d{4}$/)) {
              last = cellText;
            }
            
            // CHANGE: pode vir como "-0.00035 (-0.19%)"
            if (!change && cellText.includes('(') && cellText.includes('%)')) {
              change = cellText;
            }
            
            // OPEN: número decimal com 4-5 casas
            if (!open && cellText.match(/^\d+\.\d{4,5}$/) && cellText !== last) {
              open = cellText;
            }
            
            // HIGH: número decimal maior que LAST
            if (!high && cellText.match(/^\d+\.\d{4}$/)) {
              const num = parseFloat(cellText);
              if (num > parseFloat(last || '0')) {
                high = cellText;
              }
            }
            
            // LOW: número decimal menor que LAST
            if (!low && cellText.match(/^\d+\.\d{4}$/)) {
              const num = parseFloat(cellText);
              if (num < parseFloat(last || '999') && num > 0) {
                low = cellText;
              }
            }
            
            // VOLUME: número grande com vírgula (ex: 12,080)
            if (!volume && cellText.match(/^\d{1,3}(,\d{3})*$/)) {
              volume = cellText;
            }
            
            // UPDATED: formato de hora/data
            if (!updated && (cellText.match(/\d{2}:\d{2}:\d{2}/) || cellText.match(/\d{2}\s+[A-Z]{3}\s+\d{4}/))) {
              updated = cellText;
            }
          });
        }
        
        // Extrair código GLOBEX do MONTH (ex: "FEB 2026 6LG6" -> "6LG6")
        let contract = '';
        let mes = '';
        if (month) {
          const globexMatch = month.match(/(\d{1}[A-Z]{2}\d{1})/);
          if (globexMatch) {
            contract = globexMatch[1];
          }
          const monthMatch = month.match(/([A-Z]{3})\s+\d{4}/);
          if (monthMatch) {
            mes = monthMatch[1];
          }
        }
        
        // Se não encontrou contrato válido, pular
        if (!contract && !month) {
          if (index < 3) console.log(`⚠️  Linha ${index} pulada: não encontrou código GLOBEX ou MONTH`);
          return;
        }
        
        // Se não tem LAST válido, pular
        if (!last || parseFloat(last) === 0) {
          if (index < 3) console.log(`⚠️  Linha ${index} pulada: LAST inválido`);
          return;
        }
        
        // Função auxiliar para limpar valores numéricos
        const cleanNumeric = (str) => {
          if (!str) return '';
          return str.replace(/[^\d.,+\-]/g, '').replace(/,/g, '').trim();
        };
        
        // Processar CHANGE que pode vir como "-0.00035 (-0.19%)"
        let changeValue = change;
        let changePercentValue = changePercent;
        
        // Se change contém o percentual entre parênteses, extrair ambos
        if (change && change.includes('(') && change.includes('%)')) {
          const changeMatch = change.match(/([+-]?\d+\.?\d*)\s*\(([+-]?\d+\.?\d*)%\)/);
          if (changeMatch) {
            changeValue = changeMatch[1];
            changePercentValue = changeMatch[2];
          }
        }
        
          // Extrair valores numéricos
        const lastValue = cleanNumeric(last);
        const openValue = cleanNumeric(open);
        const changeNum = parseFloat(cleanNumeric(changeValue)) || 0;
        const changePercentNum = parseFloat(cleanNumeric(changePercentValue)) || 0;
        const highValue = cleanNumeric(high);
        const lowValue = cleanNumeric(low);
        
        const value = parseFloat(lastValue) || 0;
        const openNum = parseFloat(openValue) || value;
        
        if (value === 0) {
          if (index < 3) console.log(`⚠️  Linha ${index} pulada: valor LAST é zero ou inválido`);
          return; // Pular se não tem valor válido
        }
        
        // Calcular max e min
        let maxValue = parseFloat(highValue) || value;
        let minValue = parseFloat(lowValue) || value;
        
        // Se max e min são iguais ao value, tentar calcular baseado na variação
        if (maxValue === value && minValue === value && changeNum !== 0) {
          maxValue = value + Math.abs(changeNum * 0.5);
          minValue = value - Math.abs(changeNum * 0.5);
        }
        
        // Garantir que max >= value >= min
        if (maxValue < value) maxValue = value;
        if (minValue > value) minValue = value;
        
        // Formatar variação com sinal (4 casas decimais) - manter formato original se possível
        let variationFormatted = change;
        if (changeNum !== 0 && !variationFormatted.includes('(')) {
          variationFormatted = changeNum >= 0 ? 
            `+${changeNum.toFixed(4)}` : changeNum.toFixed(4);
        }
        
        // Formatar percentual com sinal - manter formato original se possível
        let percentFormatted = changePercent || (changePercentNum !== 0 ? 
          (changePercentNum >= 0 ? `+${changePercentNum.toFixed(2)}%` : `${changePercentNum.toFixed(2)}%`) : '0.00%');
        
        // Se CHANGE já contém o percentual, usar ele
        if (change && change.includes('(') && change.includes('%)')) {
          variationFormatted = change;
          // Extrair apenas o percentual para campo separado
          const changeMatch = change.match(/\(([+-]?\d+\.?\d*)%\)/);
          if (changeMatch) {
            percentFormatted = changeMatch[1];
            if (!percentFormatted.startsWith('+') && !percentFormatted.startsWith('-')) {
              percentFormatted = changeNum >= 0 ? `+${percentFormatted}%` : `${percentFormatted}%`;
            } else {
              percentFormatted = percentFormatted + '%';
            }
          }
        }
        
        // Limpar e formatar time
        let cleanTime = updated.trim() || time.trim();
        if (!cleanTime) {
          cleanTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
        // Log para debug da primeira linha válida
        if (contracts.length === 0) {
          console.log(`📊 Dados extraídos da primeira linha Brazilian Real:`);
          console.log(`  MONTH: "${month}" -> Contract: "${contract}", Mês: "${mes}"`);
          console.log(`  LAST: "${last}" -> ${value}`);
          console.log(`  CHANGE: "${change}" -> ${variationFormatted}`);
          console.log(`  OPEN: "${open}" -> ${openNum}`);
          console.log(`  HIGH: "${high}" -> ${maxValue}`);
          console.log(`  LOW: "${low}" -> ${minValue}`);
          console.log(`  VOLUME: "${volume}"`);
          console.log(`  UPDATED: "${updated}"`);
        }
          
          contracts.push({
          name: contract || month || 'BRL/USD',
          mes: mes,
          value: value.toFixed(4), // 4 casas decimais como na CME Group
          max: maxValue.toFixed(4),
          min: minValue.toFixed(4),
          open: openNum.toFixed(4),
          priorSettle: priorSettle || '-',
          variation: variationFormatted,
          percent: percentFormatted,
            volume: volume || '0',
            openInterest: openInterest || '0',
          time: cleanTime
        });
        
        foundRows = true;
      });
      
      if (foundRows && contracts.length > 0) {
        console.log(`✅ Brazilian Real encontrados com seletor ${tableSelector}: ${contracts.length} contratos`);
        break;
      }
    }
    
    // Se não encontrou na tabela, tentar buscar em divs ou outras estruturas
    if (contracts.length === 0) {
      $('.quote-row, .contract-row, [data-contract]').each((index, element) => {
        if (index >= 10) return false;
        
        const $el = $(element);
        const contract = $el.find('.contract-name, .symbol').text().trim();
        const last = $el.find('.last-price, .price').text().trim();
        const change = $el.find('.change, .net-change').text().trim();
        
        if (contract && last) {
          const lastValue = last.replace(/[^\d.,-]/g, '').replace(',', '');
          const changeValue = change.replace(/[^\d.,+-]/g, '').replace(',', '');
          
          contracts.push({
            name: contract,
            mes: '',
            value: lastValue || '0.00',
            variation: changeValue || '0.00',
            percent: '0.00%',
            volume: '0',
            openInterest: '0',
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          });
        }
      });
    }
    
    if (contracts.length > 0) {
      console.log(`✅ Dados do Brazilian Real obtidos: ${contracts.length} contratos`);
      console.log(`📊 Primeiro contrato exemplo:`, JSON.stringify(contracts[0], null, 2));
      return {
        success: true,
        contracts: contracts
      };
    } else {
      console.log('⚠️  Não foi possível extrair dados do Brazilian Real da página');
      console.log('💡 Tentando buscar em scripts JSON...');
      
      // Tentar buscar em scripts JSON
      console.log('💡 Buscando dados em scripts JSON...');
      const scripts = $('script').toArray();
      console.log(`📜 Total de scripts encontrados: ${scripts.length}`);
      
      // Primeiro, tentar encontrar dados em scripts que contenham "6LG" ou "brazilian"
      let foundInScripts = false;
      
      for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex++) {
        const script = scripts[scriptIndex];
        const scriptContent = $(script).html() || '';
        
        if (!scriptContent || scriptContent.length < 50) continue;
        
        // Verificar se contém referências ao Brazilian Real
        const hasBrazilianReal = scriptContent.includes('6LG') || 
                                 scriptContent.includes('brazilian') || 
                                 scriptContent.includes('Brazilian') ||
                                 scriptContent.includes('Brazilian Real') ||
                                 scriptContent.match(/6L[GHJKMNQUVXZ]\d/); // Padrão de códigos GLOBEX
        
        if (hasBrazilianReal) {
          console.log(`📜 Script ${scriptIndex} contém referências ao Brazilian Real (${scriptContent.length} caracteres)`);
          
          // Tentar extrair dados usando diferentes padrões
          // Padrão 1: Array de objetos com dados de contratos
          const arrayPattern = /\[[\s\S]{0,5000}\{[^}]*"symbol"[^}]*"6L[GHJKMNQUVXZ]\d[^}]*\}[\s\S]{0,5000}\]/;
          const arrayMatch = scriptContent.match(arrayPattern);
          if (arrayMatch) {
            console.log(`📊 Possível array encontrado (${arrayMatch[0].length} caracteres)`);
            try {
              // Tentar encontrar o contexto completo do array
              const contextMatch = scriptContent.match(/(?:contracts|quotes|data|instruments|products)\s*[:=]\s*(\[[\s\S]{0,10000}\])/);
              if (contextMatch) {
                const parsed = JSON.parse(contextMatch[1]);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  console.log(`✅ Array válido encontrado com ${parsed.length} itens`);
                  parsed.forEach(item => {
                    if (item.symbol && item.symbol.match(/6L[GHJKMNQUVXZ]\d/)) {
                      const value = parseFloat(item.last || item.price || item.settle || 0);
                      const change = parseFloat(item.change || item.netChange || 0);
                      const changePercent = parseFloat(item.changePercent || item.pctChange || 0);
                      const high = parseFloat(item.high || item.max || value);
                      const low = parseFloat(item.low || item.min || value);
                      
                      if (value > 0) {
                        contracts.push({
                          name: item.symbol,
                          mes: item.month || item.maturity || item.expiration || '',
                          value: value.toFixed(4),
                          max: high.toFixed(4),
                          min: low.toFixed(4),
                          variation: change >= 0 ? `+${change.toFixed(4)}` : change.toFixed(4),
                          percent: changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`,
                          volume: item.volume || '0',
                          openInterest: item.openInterest || '0',
                          open: (item.open || value).toFixed(4),
                          priorSettle: item.priorSettle || '-',
                          time: item.time || item.lastUpdate || ''
                        });
                      }
                    }
                  });
                  if (contracts.length > 0) {
                    foundInScripts = true;
                    break;
                  }
                }
              }
            } catch (e) {
              console.log(`⚠️  Erro ao parsear array: ${e.message}`);
            }
          }
          
          // Padrão 2: Objeto com propriedades que contêm arrays
          const objectPattern = /\{[^}]*"(?:contracts|quotes|data|instruments|products)"\s*:\s*(\[[\s\S]{0,10000}\])[^}]*\}/;
          const objectMatch = scriptContent.match(objectPattern);
          if (objectMatch && !foundInScripts) {
            try {
              const parsed = JSON.parse(objectMatch[0]);
              const dataArray = parsed.contracts || parsed.quotes || parsed.data || parsed.instruments || parsed.products || [];
              if (Array.isArray(dataArray) && dataArray.length > 0) {
                console.log(`✅ Objeto com array encontrado: ${dataArray.length} itens`);
                dataArray.forEach(item => {
                  if (item.symbol && item.symbol.match(/6L[GHJKMNQUVXZ]\d/)) {
                    const value = parseFloat(item.last || item.price || item.settle || 0);
                    if (value > 0) {
                      contracts.push({
                        name: item.symbol,
                        mes: item.month || item.maturity || '',
                        value: value.toFixed(4),
                        max: (item.high || value).toFixed(4),
                        min: (item.low || value).toFixed(4),
                        variation: (item.change || 0) >= 0 ? `+${(item.change || 0).toFixed(4)}` : (item.change || 0).toFixed(4),
                        percent: (item.changePercent || 0) >= 0 ? `+${(item.changePercent || 0).toFixed(2)}%` : `${(item.changePercent || 0).toFixed(2)}%`,
                        volume: item.volume || '0',
                        openInterest: item.openInterest || '0',
                        open: (item.open || value).toFixed(4),
                        priorSettle: item.priorSettle || '-',
                        time: item.time || ''
                      });
                    }
                  }
                });
                if (contracts.length > 0) {
                  foundInScripts = true;
                  break;
                }
              }
            } catch (e) {
              console.log(`⚠️  Erro ao parsear objeto: ${e.message}`);
            }
          }
        }
      }
      
      // Se ainda não encontrou, tentar padrões mais genéricos e buscar diretamente valores numéricos
      if (!foundInScripts) {
        console.log('💡 Tentando padrões alternativos de extração...');
        
        // Tentar encontrar valores diretamente no HTML usando padrões específicos do CME Group
        // Procurar por padrões como: "6LG6", "0.1856", "-0.00035", etc.
        const htmlContent = response.data;
        
        // Padrão: encontrar código GLOBEX seguido de valores próximos
        const globexPattern = /(6L[GHJKMNQUVXZ]\d)[\s\S]{0,500}?(\d+\.\d{4})[\s\S]{0,200}?([+-]?\d+\.\d{5})[\s\S]{0,200}?\(([+-]?\d+\.?\d*)%\)/g;
        let match;
        const foundContracts = new Map();
        
        while ((match = globexPattern.exec(htmlContent)) !== null && foundContracts.size < 10) {
          const symbol = match[1];
          const last = match[2];
          const change = match[3];
          const changePercent = match[4];
          
          if (!foundContracts.has(symbol) && parseFloat(last) > 0) {
            foundContracts.set(symbol, {
              name: symbol,
              mes: symbol.substring(0, 3) + ' 2026', // Aproximação
              value: parseFloat(last).toFixed(4),
              max: (parseFloat(last) + 0.001).toFixed(4),
              min: (parseFloat(last) - 0.001).toFixed(4),
              variation: parseFloat(change) >= 0 ? `+${parseFloat(change).toFixed(4)}` : parseFloat(change).toFixed(4),
              percent: parseFloat(changePercent) >= 0 ? `+${parseFloat(changePercent).toFixed(2)}%` : `${parseFloat(changePercent).toFixed(2)}%`,
              volume: '0',
              openInterest: '0',
              open: parseFloat(last).toFixed(4),
              priorSettle: '-',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            });
          }
        }
        
        if (foundContracts.size > 0) {
          console.log(`✅ Encontrados ${foundContracts.size} contratos usando padrões de texto`);
          contracts = Array.from(foundContracts.values());
          foundInScripts = true;
        }
      }
      
      // Última tentativa: buscar em todos os scripts com padrões mais genéricos
      if (!foundInScripts) {
        for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex++) {
          const script = scripts[scriptIndex];
          const scriptContent = $(script).html() || '';
          
          if (!scriptContent || scriptContent.length < 100) continue;
        
          // Procurar por dados JSON no script com padrões mais amplos
          const jsonMatches = [
            scriptContent.match(/contracts\s*[:=]\s*(\[.+?\])/),
            scriptContent.match(/quotes\s*[:=]\s*(\[.+?\])/),
            scriptContent.match(/data\s*[:=]\s*(\[.+?\])/),
            scriptContent.match(/__NEXT_DATA__.*?"contracts":(\[.+?\])/),
            scriptContent.match(/brazilianReal\s*[:=]\s*(\[.+?\])/i),
            scriptContent.match(/brazilian.*real.*\[(.+?)\]/is),
            scriptContent.match(/6LG[0-9A-Z].*?(\d+\.\d{4})/), // Buscar código GLOBEX seguido de valor
            scriptContent.match(/"symbol"\s*:\s*"6LG[0-9A-Z]".*?(\{[^}]+\})/), // Buscar objeto com símbolo 6LG
          ];
          
          // Também tentar buscar objetos JSON completos
          try {
            // Procurar por objetos que contenham "6LG" ou "brazilian"
            if (scriptContent.includes('6LG') || scriptContent.includes('brazilian') || scriptContent.includes('Brazilian')) {
              console.log(`📜 Script ${scriptIndex} contém referências a Brazilian Real (${scriptContent.length} caracteres)`);
              
              // Tentar extrair objetos JSON que contenham esses termos
              const jsonObjectMatches = scriptContent.match(/\{[\s\S]*?"symbol"[\s\S]*?"6LG[\s\S]*?\}/g);
              if (jsonObjectMatches) {
                console.log(`📊 Encontrados ${jsonObjectMatches.length} possíveis objetos JSON`);
              }
              
              // Tentar encontrar arrays de objetos com dados de contratos
              // Padrão comum: [{symbol: "6LG6", last: 0.1856, ...}, ...]
              const arrayPattern = /\[[\s\S]*?\{[\s\S]*?"symbol"[\s\S]*?"6LG[\s\S]*?\}[\s\S]*?\]/;
              const arrayMatch = scriptContent.match(arrayPattern);
              if (arrayMatch) {
                console.log(`📊 Possível array de contratos encontrado (${arrayMatch[0].length} caracteres)`);
                try {
                  const parsed = JSON.parse(arrayMatch[0]);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log(`✅ Array válido encontrado com ${parsed.length} itens`);
                    jsonMatches.push(arrayMatch);
                  }
                } catch (e) {
                  console.log(`⚠️  Erro ao parsear array: ${e.message}`);
                }
              }
              
              // Tentar encontrar window.__INITIAL_STATE__ ou similar
              const initialStateMatch = scriptContent.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
              if (initialStateMatch) {
                console.log(`📊 window.__INITIAL_STATE__ encontrado`);
                try {
                  const state = JSON.parse(initialStateMatch[1]);
                  // Procurar por dados de contratos no estado
                  if (state.contracts || state.quotes || state.data) {
                    console.log(`✅ Dados encontrados em __INITIAL_STATE__`);
                    jsonMatches.push(initialStateMatch);
                  }
                } catch (e) {
                  console.log(`⚠️  Erro ao parsear __INITIAL_STATE__: ${e.message}`);
                }
              }
            }
          } catch (e) {
            console.log(`⚠️  Erro ao processar script ${scriptIndex}: ${e.message}`);
          }
          
          for (const jsonMatch of jsonMatches) {
            if (jsonMatch) {
              try {
                const data = JSON.parse(jsonMatch[1]);
                const contractsData = Array.isArray(data) ? data : (data.contracts || data.quotes || []);
                if (Array.isArray(contractsData) && contractsData.length > 0) {
                  console.log(`✅ Encontrados ${contractsData.length} contratos em JSON`);
                  // Processar dados JSON
                  contractsData.forEach(contract => {
                    if (contract.symbol || contract.name) {
                      const name = contract.symbol || contract.name || 'BRL/USD';
                      const value = parseFloat(contract.last || contract.price || contract.value || 0);
                      const change = parseFloat(contract.change || contract.netChange || 0);
                      const changePercent = parseFloat(contract.changePercent || contract.pctChange || 0);
                      const high = parseFloat(contract.high || contract.max || value);
                      const low = parseFloat(contract.low || contract.min || value);
                      
                      if (value > 0) {
                        contracts.push({
                          name: name,
                          mes: contract.month || contract.maturity || '',
                          value: value.toFixed(4),
                          max: high.toFixed(4),
                          min: low.toFixed(4),
                          variation: change >= 0 ? `+${change.toFixed(4)}` : change.toFixed(4),
                          percent: changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`,
                          volume: contract.volume || '0',
                          openInterest: contract.openInterest || '0',
                          open: (contract.open || value).toFixed(4),
                          priorSettle: contract.priorSettle || '-',
                          time: contract.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        });
                      }
                    }
                  });
                  if (contracts.length > 0) {
                    foundInScripts = true;
                    break;
                  }
                }
              } catch (e) {
                console.log('⚠️  Erro ao parsear JSON:', e.message);
              }
            }
          }
          if (foundInScripts) break;
        }
      }
      
      if (contracts.length > 0) {
        console.log(`✅ Dados do Brazilian Real obtidos via JSON: ${contracts.length} contratos`);
        return {
          success: true,
          contracts: contracts
        };
      }
      
      console.log('⚠️  Não foi possível extrair dados do Brazilian Real, usando dados mockados');
      return { 
        success: false,
        contracts: generateMockBrazilianReal()
      };
    }
  } catch (error) {
    console.error('❌ Erro ao buscar Brazilian Real do CME Group:', error.message);
    return { 
      success: false, 
      error: error.message,
      contracts: generateMockBrazilianReal()
    };
  }
}

// Função para buscar Principais Índices Mundiais do Investing.com
async function fetchMoedasFromInvesting() {
  try {
    const url = 'https://br.investing.com/indices/major-indices';
    console.log('🌐 Buscando Principais Índices Mundiais em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const indices = [];
    
    // Procurar pela tabela de índices
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#cross_rates_container tbody tr',
      'table.datatable tbody tr',
      'table tbody tr[data-test="rates-row"]',
      '#indices_table tbody tr',
      'table#cr1 tbody tr',
      'table tbody tr[data-pair-id]',
      '.js-table-wrapper table tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      console.log(`📋 Tentando seletor Índices: ${tableSelector} (${rows.length} linhas encontradas)`);
      
      rows.each((index, element) => {
        if (index >= 30) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 5) return;
        
        // Log para debug - mostrar primeira linha completa
        if (index === 0) {
          console.log(`📊 Primeira linha Índices encontrada com ${cells.length} células:`);
          cells.each((i, cell) => {
            console.log(`  Coluna ${i}: "${$(cell).text().trim()}"`);
          });
        }
        
        // Tentar diferentes estruturas de colunas
        // Estrutura comum: Name (col 1), Last (col 2), High (col 3), Low (col 4), Change (col 5), Change% (col 6), Time (col 7)
        let name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        let value = cells.eq(2).text().trim();
        let high = cells.eq(3).text().trim();
        let low = cells.eq(4).text().trim();
        let variation = cells.eq(5).text().trim();
        let percent = cells.eq(6).text().trim();
        let time = cells.eq(7) ? cells.eq(7).text().trim() : '';
        
        // Se não encontrou dados nas posições esperadas, tentar estrutura alternativa
        if (!value || !parseFloat(value.replace(/[^\d.,\-]/g, '').replace(',', '.'))) {
          // Estrutura alternativa: Name (col 1), Last (col 2), Change (col 3), Change% (col 4), Time (col 5)
          value = cells.eq(2).text().trim();
          variation = cells.eq(3).text().trim();
          percent = cells.eq(4).text().trim();
          time = cells.eq(5) ? cells.eq(5).text().trim() : '';
          high = value; // Usar Last como High se não tiver
          low = value; // Usar Last como Low se não tiver
        }
        
        // Pular linhas vazias ou de cabeçalho
        if (!name || name.length < 2) return;
        
        // Verificar se é um índice válido (não é cabeçalho)
        if (name.toUpperCase().includes('NOME') || name.toUpperCase().includes('NAME') || 
            name.toUpperCase().includes('ÍNDICE') || name.toUpperCase().includes('INDEX')) {
          return;
        }
        
        if (name && value && parseFloat(value.replace(/[^\d.,\-]/g, '').replace(',', '.'))) {
          const cleanValue = value.replace(/[^\d.,\-]/g, '').replace(',', '.');
          const cleanHigh = high ? high.replace(/[^\d.,\-]/g, '').replace(',', '.') : cleanValue;
          const cleanLow = low ? low.replace(/[^\d.,\-]/g, '').replace(',', '.') : cleanValue;
          const cleanVariation = variation.replace(/[^\d.,+\-]/g, '').replace(',', '.');
          const cleanPercent = percent.replace(/[^\d.,+\-%]/g, '').replace(',', '.');
          
          const numValue = parseFloat(cleanValue);
          const numHigh = parseFloat(cleanHigh) || numValue;
          const numLow = parseFloat(cleanLow) || numValue;
          
          // Garantir que High >= Value >= Low
          const finalHigh = Math.max(numHigh, numValue);
          const finalLow = Math.min(numLow, numValue);
          
          indices.push({
            name: name,
            value: numValue.toFixed(2),
            variation: cleanVariation,
            percent: cleanPercent.includes('%') ? cleanPercent : cleanPercent + '%',
            max: finalHigh.toFixed(2),
            min: finalLow.toFixed(2),
            time: time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          });
        }
      });
      
      if (indices.length > 0) {
        console.log(`✅ Principais Índices Mundiais encontrados: ${indices.length} itens`);
        if (indices.length > 0) {
          console.log(`📊 Primeiro índice exemplo:`, JSON.stringify(indices[0], null, 2));
        }
        return indices;
      }
    }
    
    // Tentar buscar em scripts JSON se não encontrou na tabela
    console.log('⚠️  Tentando buscar dados em scripts JSON...');
    try {
      const scripts = $('script');
      scripts.each((index, script) => {
        const scriptContent = $(script).html();
        if (scriptContent && (scriptContent.includes('window.__INITIAL_STATE__') || 
            scriptContent.includes('window.__PRELOADED_STATE__') ||
            scriptContent.includes('window.__NEXT_DATA__'))) {
          try {
            // Tentar extrair dados JSON do script
            const jsonMatch = scriptContent.match(/window\.__[A-Z_]+__\s*=\s*({.+?});/);
            if (jsonMatch) {
              const jsonData = JSON.parse(jsonMatch[1]);
              console.log('📊 Dados JSON encontrados no script');
              // Processar dados JSON se necessário
            }
          } catch (e) {
            console.log('⚠️  Erro ao parsear JSON do script:', e.message);
          }
        }
      });
    } catch (e) {
      console.log('⚠️  Erro ao buscar em scripts:', e.message);
    }
    
    console.log('⚠️  Não foi possível extrair índices, usando dados mockados');
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Principais Índices Mundiais:', error.message);
    return null;
  }
}

// Função para buscar Dólar x Mundo do Investing.com
async function fetchDolarMundoFromInvesting() {
  try {
    const url = 'https://br.investing.com/currencies/streaming-forex-rates-majors';
    console.log('🌐 Buscando Dólar x Mundo em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const moedas = [];
    
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#pair_ table tbody tr',
      'table.datatable tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      rows.each((index, element) => {
        if (index >= 25) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 5) return;
        
        const name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        const value = cells.eq(2).text().trim();
        const variation = cells.eq(3).text().trim();
        const percent = cells.eq(4).text().trim();
        
        if (name && value && name.includes('/')) {
          const cleanValue = value.replace(/[^\d.,-]/g, '').replace(',', '.');
          if (parseFloat(cleanValue)) {
            moedas.push({
              name: name,
              value: parseFloat(cleanValue).toFixed(4),
              variation: variation,
              percent: percent.includes('%') ? percent : percent + '%',
              time: ''
            });
          }
        }
      });
      
      if (moedas.length > 0) {
        console.log(`✅ Dólar x Mundo encontrado: ${moedas.length} itens`);
        return moedas;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Dólar x Mundo:', error.message);
    return null;
  }
}

// Função para buscar Dólar x Emergentes do Investing.com
async function fetchDolarEmergentesFromInvesting() {
  try {
    const url = 'https://br.investing.com/currencies/exotic-currency-pairs';
    console.log('🌐 Buscando Dólar x Emergentes em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const moedas = [];
    
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#pair_ table tbody tr',
      'table.datatable tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      rows.each((index, element) => {
        if (index >= 15) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 5) return;
        
        const name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        const value = cells.eq(2).text().trim();
        const variation = cells.eq(3).text().trim();
        const percent = cells.eq(4).text().trim();
        
        if (name && value && name.includes('/')) {
          const cleanValue = value.replace(/[^\d.,-]/g, '').replace(',', '.');
          if (parseFloat(cleanValue)) {
            moedas.push({
              name: name,
              value: parseFloat(cleanValue).toFixed(4),
              variation: variation,
              percent: percent.includes('%') ? percent : percent + '%',
              time: ''
            });
          }
        }
      });
      
      if (moedas.length > 0) {
        console.log(`✅ Dólar x Emergentes encontrado: ${moedas.length} itens`);
        return moedas;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Dólar x Emergentes:', error.message);
    return null;
  }
}

// Função para buscar Américas (Futuros CFDs) do Investing.com
async function fetchAmericasFromInvesting() {
  try {
    const url = 'https://br.investing.com/indices/us-indices-futures';
    console.log('🌐 Buscando Américas (Futuros CFDs) em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const indices = [];
    
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#cross_rates_container tbody tr',
      'table.datatable tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      rows.each((index, element) => {
        if (index >= 20) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 6) return;
        
        const name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        const value = cells.eq(2).text().trim();
        const variation = cells.eq(3).text().trim();
        const percent = cells.eq(4).text().trim();
        const time = cells.eq(5) ? cells.eq(5).text().trim() : '';
        
        if (name && value) {
          const cleanValue = value.replace(/[^\d.,-]/g, '').replace(',', '.');
          if (parseFloat(cleanValue)) {
            indices.push({
              name: name,
              mes: '',
              value: parseFloat(cleanValue).toFixed(2),
              max: parseFloat(cleanValue).toFixed(2),
              min: parseFloat(cleanValue).toFixed(2),
              variation: variation,
              percent: percent.includes('%') ? percent : percent + '%',
              time: time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      });
      
      if (indices.length > 0) {
        console.log(`✅ Américas encontrado: ${indices.length} itens`);
        return indices;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Américas:', error.message);
    return null;
  }
}

// Função para buscar Europa (Futuros CFDs) do Investing.com
async function fetchEuropaFromInvesting() {
  try {
    const url = 'https://www.investing.com/indices/european-indices';
    console.log('🌐 Buscando Europa (Futuros CFDs) em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const indices = [];
    
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#cross_rates_container tbody tr',
      'table.datatable tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      rows.each((index, element) => {
        if (index >= 15) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 6) return;
        
        const name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        const value = cells.eq(2).text().trim();
        const variation = cells.eq(3).text().trim();
        const percent = cells.eq(4).text().trim();
        const time = cells.eq(5) ? cells.eq(5).text().trim() : '';
        
        if (name && value) {
          const cleanValue = value.replace(/[^\d.,-]/g, '').replace(',', '.');
          if (parseFloat(cleanValue)) {
            indices.push({
              name: name,
              value: parseFloat(cleanValue).toFixed(2),
              variation: variation,
              percent: percent.includes('%') ? percent : percent + '%',
              time: time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      });
      
      if (indices.length > 0) {
        console.log(`✅ Europa encontrado: ${indices.length} itens`);
        return indices;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Europa:', error.message);
    return null;
  }
}

// Função para buscar Ásia e Oceania (Futuros CFDs) do Investing.com
async function fetchAsiaOceaniaFromInvesting() {
  try {
    const url = 'https://br.investing.com/indices/asia-pacific';
    console.log('🌐 Buscando Ásia e Oceania (Futuros CFDs) em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const indices = [];
    
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#cross_rates_container tbody tr',
      'table.datatable tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      rows.each((index, element) => {
        if (index >= 15) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 6) return;
        
        const name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        const value = cells.eq(2).text().trim();
        const variation = cells.eq(3).text().trim();
        const percent = cells.eq(4).text().trim();
        const time = cells.eq(5) ? cells.eq(5).text().trim() : '';
        
        if (name && value) {
          const cleanValue = value.replace(/[^\d.,-]/g, '').replace(',', '.');
          if (parseFloat(cleanValue)) {
            indices.push({
              name: name,
              value: parseFloat(cleanValue).toFixed(2),
              variation: variation,
              percent: percent.includes('%') ? percent : percent + '%',
              time: time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      });
      
      if (indices.length > 0) {
        console.log(`✅ Ásia e Oceania encontrado: ${indices.length} itens`);
        return indices;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Ásia e Oceania:', error.message);
    return null;
  }
}

// Função para buscar Dólar Cupom da B3
async function fetchDolarCupomFromB3() {
  try {
    const url = 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/consultas/mercado-de-derivativos/indicadores/indicadores-financeiros/';
    console.log('🌐 Buscando Dólar Cupom da B3 em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.b3.com.br/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const valores = {};
    
    // Primeiro, tentar buscar em scripts JSON (dados podem estar carregados via JS)
    const scripts = $('script').toArray();
    console.log(`📜 Encontrados ${scripts.length} scripts na página`);
    
    for (const script of scripts) {
      const scriptContent = $(script).html() || '';
      
      // Procurar por padrões JSON que possam conter os dados
      if (scriptContent.includes('cupom') || scriptContent.includes('DIF OPER') || scriptContent.includes('SPOT')) {
        console.log('💡 Script potencial encontrado, tentando extrair dados...');
        
        // Tentar extrair valores usando regex mais flexível
        const indicadores = [
          { nome: 'DIF OPER CASADA - COMPRA', chave: 'difOperCasada', patterns: [/DIF\s*OPER\s*CASADA[\s\S]{0,200}(\d+[.,]\d+)/i, /difOperCasada[\s\S]{0,100}["\']?(\d+[.,]\d+)/i] },
          { nome: 'DÓLAR CUPOM LIMPO', chave: 'cupomLimpo', patterns: [/DÓLAR\s*CUPOM\s*LIMPO[\s\S]{0,200}(\d+[.,]\d+)/i, /cupomLimpo[\s\S]{0,100}["\']?(\d+[.,]\d+)/i] },
          { nome: 'DÓLAR BMF SPOT - 2 DIAS', chave: 'spot2Dias', patterns: [/DÓLAR\s*BMF\s*SPOT[\s\S]{0,200}(\d+[.,]\d+)/i, /spot2Dias[\s\S]{0,100}["\']?(\d+[.,]\d+)/i] },
          { nome: 'DOLAR SPOT BMF PARA 1 DIA', chave: 'spot1Dia', patterns: [/SPOT\s*BMF\s*PARA\s*1\s*DIA[\s\S]{0,200}(\d+[.,]\d+)/i, /spot1Dia[\s\S]{0,100}["\']?(\d+[.,]\d+)/i] }
        ];
        
        indicadores.forEach(indicador => {
          if (!valores[indicador.chave]) {
            for (const pattern of indicador.patterns) {
              const match = scriptContent.match(pattern);
              if (match && match[1]) {
                valores[indicador.chave] = match[1].replace(',', '.');
                console.log(`✅ ${indicador.nome} encontrado em script: ${valores[indicador.chave]}`);
                break;
              }
            }
          }
        });
      }
    }
    
    // Se não encontrou em scripts, tentar buscar no HTML
    if (Object.keys(valores).length === 0) {
      console.log('💡 Tentando buscar no HTML...');
      const pageText = $('body').text();
      
      // Buscar usando padrões mais flexíveis
      const indicadores = [
        { nome: 'DIF OPER CASADA - COMPRA', chave: 'difOperCasada', patterns: [/DIF\s*OPER\s*CASADA[\s\S]{0,200}(\d+[.,]\d+)/i] },
        { nome: 'DÓLAR CUPOM LIMPO', chave: 'cupomLimpo', patterns: [/DÓLAR\s*CUPOM\s*LIMPO[\s\S]{0,200}(\d+[.,]\d+)/i] },
        { nome: 'DÓLAR BMF SPOT - 2 DIAS', chave: 'spot2Dias', patterns: [/DÓLAR\s*BMF\s*SPOT[\s\S]{0,200}(\d+[.,]\d+)/i] },
        { nome: 'DOLAR SPOT BMF PARA 1 DIA', chave: 'spot1Dia', patterns: [/SPOT\s*BMF\s*PARA\s*1\s*DIA[\s\S]{0,200}(\d+[.,]\d+)/i] }
      ];
      
      indicadores.forEach(indicador => {
        if (!valores[indicador.chave]) {
          for (const pattern of indicador.patterns) {
            const match = pageText.match(pattern);
            if (match && match[1]) {
              valores[indicador.chave] = match[1].replace(',', '.');
              console.log(`✅ ${indicador.nome} encontrado no HTML: ${valores[indicador.chave]}`);
              break;
            }
          }
        }
      });
      
      // Tentar buscar em tabelas específicas
      $('table tbody tr').each((index, element) => {
        const rowText = $(element).text();
        const cells = $(element).find('td');
        
        cells.each((cellIndex, cell) => {
          const cellText = $(cell).text().trim();
          
          indicadores.forEach(indicador => {
            if (cellText.includes(indicador.nome.split(' - ')[0]) && !valores[indicador.chave]) {
              // Procurar valor na mesma linha
              const valueMatch = rowText.match(/(\d+[.,]\d+)/);
              if (valueMatch) {
                valores[indicador.chave] = valueMatch[1].replace(',', '.');
                console.log(`✅ ${indicador.nome} encontrado em tabela: ${valores[indicador.chave]}`);
              }
            }
          });
        });
      });
    }
    
    if (Object.keys(valores).length > 0) {
      console.log(`✅ Dólar Cupom encontrado (${Object.keys(valores).length}/4 valores):`, valores);
      return {
        success: true,
        valores: valores,
        cupomLimpo: valores.cupomLimpo || '0.0000',
        timestamp: new Date().toISOString()
      };
    }
    
    console.log('⚠️  Dólar Cupom não encontrado na página (usando dados mockados)');
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Dólar Cupom da B3:', error.message);
    return null;
  }
}

// Função para buscar Criptomoedas do Investing.com
async function fetchCriptomoedasFromInvesting() {
  try {
    // Tentar URL alternativa se a principal falhar
    const url = 'https://br.investing.com/crypto/';
    console.log('🌐 Buscando Criptomoedas em:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://br.investing.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const cryptos = [];
    
    const tableSelectors = [
      'table.genTbl tbody tr',
      '#crypto_table tbody tr',
      'table.datatable tbody tr'
    ];
    
    for (const tableSelector of tableSelectors) {
      const rows = $(tableSelector);
      if (rows.length === 0) continue;
      
      rows.each((index, element) => {
        if (index >= 15) return false;
        
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 5) return;
        
        const name = cells.eq(1).find('a').text().trim() || cells.eq(1).text().trim();
        const value = cells.eq(2).text().trim();
        const variation = cells.eq(3).text().trim();
        const percent = cells.eq(4).text().trim();
        
        if (name && value) {
          const cleanValue = value.replace(/[^\d.,-]/g, '').replace(',', '.');
          if (parseFloat(cleanValue)) {
            cryptos.push({
              name: name,
              value: parseFloat(cleanValue).toFixed(2),
              variation: variation,
              percent: percent.includes('%') ? percent : percent + '%',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      });
      
      if (cryptos.length > 0) {
        console.log(`✅ Criptomoedas encontrado: ${cryptos.length} itens`);
        return cryptos;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar Criptomoedas:', error.message);
    return null;
  }
}

// Função para gerar dados mockados do Brazilian Real (fallback)
function generateMockBrazilianReal() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  // Valores com 4-5 casas decimais como na CME Group - formato igual à página real
  return [
    {
      name: '6LG6', // Código GLOBEX
      mes: 'FEB 2026', // Mês completo
      value: '0.1856',
      max: '0.1861',
      min: '0.1848',
      variation: '-0.00035',
      percent: '-0.19%',
      volume: '12,080',
      openInterest: '0',
      open: '0.18595',
      priorSettle: '-',
      time: timeStr
    },
    {
      name: '6LH6', // Código GLOBEX MAR 2026
      mes: 'MAR 2026',
      value: '0.1845',
      max: '0.18475',
      min: '0.1837',
      variation: '-0.00035',
      percent: '-0.19%',
      volume: '0',
      openInterest: '0',
      open: '0.18455',
      priorSettle: '-',
      time: timeStr
    },
    {
      name: '6LJ6', // Código GLOBEX JUN 2026
      mes: 'JUN 2026',
      value: '0.1835',
      max: '0.1840',
      min: '0.1825',
      variation: '-0.00025',
      percent: '-0.14%',
      volume: '0',
      openInterest: '0',
      open: '0.18375',
      priorSettle: '-',
      time: timeStr
    }
  ];
}

// Cache para Brazilian Real (atualizar a cada 5 segundos para tempo real)
let brazilianRealCache = null;
let brazilianRealCacheTime = null;
const BRAZILIAN_REAL_CACHE_TTL = 5000; // 5 segundos (reduzido para atualizações em tempo real)

async function getBrazilianReal() {
  const now = Date.now();
  
  // Se o cache é válido, retornar
  if (brazilianRealCache && brazilianRealCacheTime && 
      (now - brazilianRealCacheTime) < BRAZILIAN_REAL_CACHE_TTL) {
    console.log('💾 Retornando dados do Brazilian Real do cache');
    return brazilianRealCache;
  }
  
  console.log('🔄 Cache expirado ou inexistente, buscando novos dados do Brazilian Real...');
  // Buscar novos dados
  const realData = await fetchBrazilianRealFromCME();
  
  if (realData.success || realData.contracts) {
    console.log(`✅ Dados do Brazilian Real atualizados no cache: ${realData.contracts?.length || 0} contratos`);
    brazilianRealCache = realData;
    brazilianRealCacheTime = now;
  } else {
    console.log('⚠️  Falha ao buscar dados do Brazilian Real, usando cache anterior se disponível');
    // Se falhou mas tem cache antigo, usar ele
    if (brazilianRealCache) {
      return brazilianRealCache;
    }
  }
  
  return realData;
}

// Função para gerar dados mockados financeiros
function generateFinancialData() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  // Função auxiliar para gerar variação aleatória
  const randomVariation = (base, range = 0.1) => {
    const variation = (Math.random() - 0.5) * range * 2;
    const value = base * (1 + variation);
    const percent = (variation * 100).toFixed(2);
    return { value, variation: (value - base).toFixed(2), percent };
  };
  
  // Função para gerar mês de vencimento (formato: "Fev 26", "Mar 26", etc.)
  const getMesVencimento = () => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mesAtual = now.getMonth();
    const dia = now.getDate();
    return `${meses[mesAtual]} ${dia}`;
  };
  
  return {
    americas: [
      { name: 'Ibovespa', mes: getMesVencimento(), value: '162857.00', max: '165035.00', min: '162530.00', variation: '-1073.00', percent: '-0.65%', time: timeStr },
      { name: 'IBRX50', mes: getMesVencimento(), value: '27167.00', max: '27462.00', min: '27271.00', variation: '-118.00', percent: '-0.43%', time: timeStr },
      { name: 'US 30', mes: '', value: '48329.60', max: '48383.70', min: '47825.90', variation: '+266.30', percent: '+0.55%', time: timeStr },
      { name: 'US 500', mes: '', value: '6853.70', max: '6893.00', min: '6820.50', variation: '+8.60', percent: '+0.13%', time: timeStr },
      { name: 'US Tech 100', mes: '', value: '25188.70', max: '25596.20', min: '25063.20', variation: '-60.10', percent: '-0.24%', time: timeStr },
      { name: 'US 2000', mes: '', value: '2504.00', max: '2508.90', min: '2476.90', variation: '+22.10', percent: '+0.89%', time: timeStr },
      { name: 'S&P 500 VIX', mes: getMesVencimento(), value: '16.10', max: '16.53', min: '16.03', variation: '-0.43', percent: '-2.62%', time: timeStr },
      { name: 'DAX', mes: getMesVencimento(), value: '24697.00', max: '24828.80', min: '24592.30', variation: '+7.00', percent: '+0.03%', time: timeStr }
    ],
    futuros: [
      { name: 'Dow Jones Fut', mes: '', value: '37680.00', max: '37720.00', min: '37650.00', variation: '-95.00', percent: '-0.25%', time: '07:01:15' },
      { name: 'S&P 500 Fut', mes: '', value: '4785.00', max: '4790.00', min: '4780.00', variation: '-12.50', percent: '-0.26%', time: '07:01:20' },
      { name: 'Nasdaq Fut', mes: '', value: '15050.00', max: '15080.00', min: '15020.00', variation: '-75.00', percent: '-0.50%', time: '07:01:25' },
      { name: 'E. Stoxx 50 Fut', mes: getMesVencimento(), value: '4520.50', max: '4525.00', min: '4515.00', variation: '+15.25', percent: '+0.34%', time: '07:01:30' },
      { name: 'China A50 Fut', mes: getMesVencimento(), value: '12580.00', max: '12600.00', min: '12550.00', variation: '+85.00', percent: '+0.68%', time: '07:01:35' },
      { name: 'Ibovespa Fut', mes: getMesVencimento(), value: '132600.00', max: '132800.00', min: '132400.00', variation: '+350.00', percent: '+0.26%', time: '30/12' },
      { name: 'Dólar Fut', mes: getMesVencimento(), value: '4.9850', max: '4.9900', min: '4.9800', variation: '+0.0125', percent: '+0.25%', time: '30/12' },
      { name: 'CDI 1D Fut', mes: getMesVencimento(), value: '10.25', max: '10.30', min: '10.20', variation: '0.00', percent: '0.00%', time: '30/12' }
    ],
    economicCalendar: generateMockEconomicCalendar(),
    dolarEmergentes: [
      { name: 'USD/ARS', value: '850.50', variation: '-2.25', percent: '-0.26%', time: '' },
      { name: 'USD/AUD', value: '1.4850', variation: '+0.0025', percent: '+0.17%', time: '' },
      // USD/BRL será atualizado com dados reais
      { name: 'USD/CNY', value: '7.1250', variation: '+0.0050', percent: '+0.07%', time: '' },
      { name: 'USD/IDR', value: '15650.00', variation: '+25.00', percent: '+0.16%', time: '' },
      { name: 'USD/INR', value: '83.25', variation: '+0.15', percent: '+0.18%', time: '' },
      { name: 'USD/KRW', value: '1320.50', variation: '+2.50', percent: '+0.19%', time: '' },
      { name: 'USD/MXN', value: '17.1250', variation: '+0.0250', percent: '+0.15%', time: '' },
      { name: 'USD/SAR', value: '3.7500', variation: '-0.0010', percent: '-0.03%', time: '' },
      { name: 'USD/TRY', value: '30.1250', variation: '+0.1250', percent: '+0.42%', time: '' },
      { name: 'USD/ZAR', value: '18.7500', variation: '+0.1250', percent: '+0.67%', time: '' }
    ],
    dolarMundo: [
      { name: 'USD/CHF', value: '0.8750', variation: '-0.0010', percent: '-0.11%', time: '' },
      { name: 'USD/CZK', value: '22.50', variation: '+0.05', percent: '+0.22%', time: '' },
      { name: 'USD/DKK', value: '6.8750', variation: '+0.0025', percent: '+0.04%', time: '' },
      { name: 'USD/EUR', value: '0.9150', variation: '-0.0010', percent: '-0.11%', time: '' },
      { name: 'USD/GBP', value: '0.7850', variation: '+0.0010', percent: '+0.13%', time: '' },
      { name: 'USD/HUF', value: '365.50', variation: '+1.25', percent: '+0.34%', time: '' },
      { name: 'USD/NOK', value: '10.6250', variation: '+0.0125', percent: '+0.12%', time: '' },
      { name: 'USD/SEK', value: '10.3750', variation: '+0.0125', percent: '+0.12%', time: '' },
      { name: 'USD/EGP', value: '30.8750', variation: '+0.1250', percent: '+0.41%', time: '' },
      { name: 'USD/NGN', value: '850.00', variation: '+32.50', percent: '+3.96%', time: '' },
      { name: 'USD/ZAR', value: '18.7500', variation: '+0.1250', percent: '+0.67%', time: '' },
      { name: 'USD/CNY', value: '7.1250', variation: '+0.0050', percent: '+0.07%', time: '' },
      { name: 'USD/HKD', value: '7.8250', variation: '+0.0010', percent: '+0.01%', time: '' },
      { name: 'USD/ILS', value: '3.6250', variation: '+0.0025', percent: '+0.07%', time: '' },
      { name: 'USD/IDR', value: '15650.00', variation: '+25.00', percent: '+0.16%', time: '' },
      { name: 'USD/INR', value: '83.25', variation: '+0.15', percent: '+0.18%', time: '' },
      { name: 'USD/JPY', value: '148.50', variation: '+0.25', percent: '+0.17%', time: '' },
      { name: 'USD/KRW', value: '1320.50', variation: '+2.50', percent: '+0.19%', time: '' },
      { name: 'USD/MYR', value: '4.6250', variation: '+0.0025', percent: '+0.05%', time: '' },
      { name: 'USD/PHP', value: '55.75', variation: '+0.05', percent: '+0.09%', time: '' },
      { name: 'USD/RUB', value: '92.50', variation: '+0.25', percent: '+0.27%', time: '' },
      { name: 'USD/SAR', value: '3.7500', variation: '-0.0010', percent: '-0.03%', time: '' },
      { name: 'USD/SGD', value: '1.3350', variation: '+0.0010', percent: '+0.07%', time: '' },
      { name: 'USD/TRY', value: '30.1250', variation: '+0.1250', percent: '+0.42%', time: '' },
      { name: 'USD/TWD', value: '31.25', variation: '+0.05', percent: '+0.16%', time: '' },
      { name: 'USD/AUD', value: '1.4850', variation: '+0.0025', percent: '+0.17%', time: '' },
      { name: 'USD/NZD', value: '1.6250', variation: '+0.0025', percent: '+0.15%', time: '' }
    ],
    europa: [
      { name: 'Euro Stoxx 50', value: '4520.50', variation: '+15.25', percent: '+0.34%', time: '13:35:20' },
      { name: 'Inglaterra', value: '7680.00', variation: '+25.50', percent: '+0.33%', time: '13:30:15' },
      { name: 'França', value: '7450.25', variation: '+18.75', percent: '+0.25%', time: '13:32:10' },
      { name: 'Alemanha', value: '16850.00', variation: '+45.00', percent: '+0.27%', time: '13:31:05' },
      { name: 'Holanda', value: '825.50', variation: '+2.25', percent: '+0.27%', time: '13:33:25' },
      { name: 'Portugal', value: '5420.00', variation: '+12.50', percent: '+0.23%', time: '13:34:15' },
      { name: 'Espanha', value: '10250.00', variation: '+22.50', percent: '+0.22%', time: '13:32:45' },
      { name: 'Itália', value: '31250.00', variation: '+75.00', percent: '+0.24%', time: '13:33:30' },
      { name: 'Suécia', value: '2450.50', variation: '-5.25', percent: '-0.21%', time: '12:09:59' },
      { name: 'Suíça', value: '11250.00', variation: '+15.00', percent: '+0.13%', time: '30/12' },
      { name: 'Rússia', value: '3250.00', variation: '+8.50', percent: '+0.26%', time: '30/12' },
      { name: 'Turquia', value: '9850.00', variation: '+25.00', percent: '+0.25%', time: '30/12' }
    ],
    commodities: [
      { name: 'Petróleo WTI', value: '72.50', variation: '0.00', percent: '0.00%', time: '' },
      { name: 'Petróleo Brent', value: '78.25', variation: '0.00', percent: '0.00%', time: '' },
      { name: 'Ouro', value: '2050.00', variation: '0.00', percent: '0.00%', time: '' },
      { name: 'BCOM', value: '245.50', variation: '0.00', percent: '0.00%', time: '' },
      { name: 'M. Ferro DLN', value: '125.50', variation: '-0.72', percent: '-0.57%', time: '04:03:16' }
    ],
    treasuries: [
      { name: 'U.S. 1 Month', value: '5.25', variation: '+0.01', percent: '+0.19%', time: '' },
      { name: 'U.S. 3 Month', value: '5.28', variation: '+0.02', percent: '+0.38%', time: '' },
      { name: 'U.S. 6 Month', value: '5.32', variation: '+0.01', percent: '+0.19%', time: '' },
      { name: 'U.S. 1 Year', value: '5.15', variation: '+0.03', percent: '+0.59%', time: '' },
      { name: 'U.S. 2 Year', value: '4.85', variation: '+0.05', percent: '+1.04%', time: '' },
      { name: 'U.S. 3 Year', value: '4.65', variation: '+0.04', percent: '+0.87%', time: '' },
      { name: 'U.S. 5 Year', value: '4.45', variation: '+0.03', percent: '+0.68%', time: '' },
      { name: 'U.S. 7 Year', value: '4.35', variation: '+0.02', percent: '+0.46%', time: '' },
      { name: 'U.S. 10 Year', value: '4.25', variation: '+0.01', percent: '+0.24%', time: '' },
      { name: 'U.S. 20 Year', value: '4.55', variation: '+0.02', percent: '+0.44%', time: '' },
      { name: 'U.S. 30 Year', value: '4.45', variation: '+0.01', percent: '+0.23%', time: '' },
      { name: 'Germany 10Y', value: '2.35', variation: '+0.02', percent: '+0.86%', time: '' },
      { name: 'Japan 10Y', value: '0.75', variation: '+0.01', percent: '+1.35%', time: '' }
    ],
    asiaOceania: [
      { name: '1325 Next Funds', value: '2850.00', variation: '+12.50', percent: '+0.44%', time: '30/12' },
      { name: 'Japão', value: '33250.00', variation: '-125.00', percent: '-0.37%', time: '03:29:59' },
      { name: 'Coreia do Sul', value: '2650.50', variation: '+8.75', percent: '+0.33%', time: '04:59:59' },
      { name: 'Hong Kong', value: '16850.00', variation: '+45.00', percent: '+0.27%', time: '31/12' },
      { name: 'Taiwan', value: '17850.00', variation: '+35.00', percent: '+0.20%', time: '06:59:59' },
      { name: 'Tailândia', value: '1420.50', variation: '+3.25', percent: '+0.23%', time: '01/01' },
      { name: 'China', value: '3120.00', variation: '+8.50', percent: '+0.27%', time: '01/01' },
      { name: 'China A50', value: '12580.00', variation: '-25.00', percent: '-0.20%', time: '01/01' },
      { name: 'Índia', value: '72500.00', variation: '+125.00', percent: '+0.17%', time: '01/01' },
      { name: 'Israel', value: '1850.50', variation: '+4.25', percent: '+0.23%', time: '01/01' },
      { name: 'Arábia Saudita', value: '12580.00', variation: '+15.00', percent: '+0.12%', time: '01/01' },
      { name: 'Austrália', value: '7850.00', variation: '+12.50', percent: '+0.16%', time: '01/01' }
    ],
    moedas: [
      // Principais Índices Mundiais - dados mockados (serão substituídos por dados reais)
      { name: 'S&P 500', value: '4850.00', variation: '+15.50', percent: '+0.32%', max: '4855.00', min: '4835.00', time: timeStr },
      { name: 'Dow Jones', value: '37650.00', variation: '+125.00', percent: '+0.33%', max: '37680.00', min: '37520.00', time: timeStr },
      { name: 'NASDAQ', value: '15250.00', variation: '+45.00', percent: '+0.30%', max: '15280.00', min: '15200.00', time: timeStr },
      { name: 'FTSE 100', value: '7680.00', variation: '+25.50', percent: '+0.33%', max: '7690.00', min: '7655.00', time: timeStr },
      { name: 'DAX', value: '16850.00', variation: '+45.00', percent: '+0.27%', max: '16880.00', min: '16820.00', time: timeStr },
      { name: 'CAC 40', value: '7450.25', variation: '+18.75', percent: '+0.25%', max: '7460.00', min: '7435.00', time: timeStr },
      { name: 'Nikkei 225', value: '33250.00', variation: '-125.00', percent: '-0.37%', max: '33300.00', min: '33200.00', time: timeStr },
      { name: 'Hang Seng', value: '16850.00', variation: '+45.00', percent: '+0.27%', max: '16880.00', min: '16820.00', time: timeStr },
      { name: 'Shanghai Composite', value: '3120.00', variation: '+8.50', percent: '+0.27%', max: '3125.00', min: '3115.00', time: timeStr }
    ],
    dolarAmericas: generateMockBrazilianReal(),
    indicesB3: [
      { name: 'IMAT', value: '0.00', variation: '0.00', percent: '0.00%', time: '' }
    ],
    criptomoedas: [
      { name: 'HASH11 BRL', value: '45.25', variation: '-1.25', percent: '-2.69%', time: '' },
      { name: 'Bitcoin', value: '245000.00', variation: '-2500.00', percent: '-1.01%', time: '' },
      { name: 'Ethereum', value: '2850.00', variation: '-35.00', percent: '-1.21%', time: '' },
      { name: 'Binance Coin', value: '325.50', variation: '-15.65', percent: '-4.59%', time: '' },
      { name: 'Cardano', value: '0.5250', variation: '-0.0125', percent: '-2.33%', time: '' },
      { name: 'Dogecoin', value: '0.0850', variation: '-0.0015', percent: '-1.73%', time: '' },
      { name: 'Tether', value: '4.9850', variation: '-0.0005', percent: '-0.01%', time: '' },
      { name: 'XRP', value: '0.6250', variation: '-0.0150', percent: '-2.34%', time: '' }
    ],
    dxyCme: [
      { name: 'DXY', value: '98.18', variation: '+0.13', percent: '+0.13%', time: '02/01' },
      { name: 'USD/EUR', value: '0.9150', variation: '+0.0010', percent: '+0.11%', time: '02/01' },
      { name: 'USD/JPY', value: '148.50', variation: '+0.25', percent: '+0.17%', time: '02/01' },
      { name: 'USD/GBP', value: '0.7850', variation: '+0.0010', percent: '+0.13%', time: '02/01' },
      { name: 'USD/CAD', value: '1.3450', variation: '+0.0025', percent: '+0.19%', time: '02/01' },
      { name: 'USD/SEK', value: '10.3750', variation: '+0.0125', percent: '+0.12%', time: '02/01' },
      { name: 'USD/CHF', value: '0.8750', variation: '-0.0010', percent: '-0.11%', time: '02/01' },
      { name: 'USD/CNY', value: '7.1250', variation: '+0.0025', percent: '+0.04%', time: '02/01' },
      { name: 'USD/ZAR', value: '18.2500', variation: '+0.0150', percent: '+0.08%', time: '02/01' },
      { name: 'USD/RUB', value: '92.5000', variation: '+0.2500', percent: '+0.27%', time: '02/01' }
    ],
    resumo: {
      tendencia: { negative: 17, positive: 75 },
      items: [
        { nome: 'Índices Mundiais', variacao: '+19/-7' },
        { nome: 'Índice DXY', variacao: '-0.2%' },
        { nome: 'Petróleo', variacao: '0.00%' },
        { nome: 'S&P 500 Fut', variacao: '0.00%' }
      ],
      estrangeiros: {
        data: '00/00/0000',
        compra: 0,
        venda: 0,
        saldo: 0
      }
    },
    noticias: [
      { title: 'Mercados globais fecham em alta após dados econômicos', time: '13:45' },
      { title: 'Dólar recua frente ao real em sessão volátil', time: '13:30' },
      { title: 'Petróleo mantém estabilidade após reunião da OPEP+', time: '13:15' },
      { title: 'Bitcoin registra queda após anúncio regulatório', time: '12:50' }
    ]
  };
}

// API: Dashboard financeiro completo
app.get('/api/finance/dashboard', requireAuth, async (req, res) => {
  try {
    const requestTime = new Date().toISOString();
    console.log(`📊 Requisição de dashboard recebida em: ${requestTime}`);
    
    // Headers para evitar cache do navegador
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': `"${Date.now()}"`
    });
    
    // Gerar dados base
    const data = generateFinancialData();
    console.log(`📊 Dados base gerados. Moedas iniciais: ${data.moedas.length} itens`);
    
    // Buscar dados reais do dólar
    const dollarData = await getDollarData();
    
    if (dollarData.success) {
      // Atualizar USD/BRL com dados reais
      const usdBrlIndex = data.dolarEmergentes.findIndex(item => item.name === 'USD/BRL');
      if (usdBrlIndex === -1) {
        // Se não existir, adicionar
        data.dolarEmergentes.push({
          name: 'USD/BRL',
          value: dollarData.value,
          variation: dollarData.variation,
          percent: dollarData.percent,
          max: dollarData.max,
          min: dollarData.min,
          time: dollarData.time
        });
      } else {
        // Atualizar existente
        data.dolarEmergentes[usdBrlIndex] = {
          name: 'USD/BRL',
          value: dollarData.value,
          variation: dollarData.variation,
          percent: dollarData.percent,
          max: dollarData.max,
          min: dollarData.min,
          time: dollarData.time
        };
      }
      
      // Também atualizar em outras seções se houver referências ao dólar
      const updateDollarInSection = (section, name) => {
        if (!section) return;
        const index = section.findIndex(item => item.name === name);
        if (index !== -1) {
          section[index] = {
            ...section[index],
            value: dollarData.value,
            variation: dollarData.variation,
            percent: dollarData.percent,
            max: dollarData.max,
            min: dollarData.min,
            time: dollarData.time
          };
        }
      };
      
      updateDollarInSection(data.dolarMundo, 'USD/BRL');
      
    }
    
    // Buscar calendário econômico
    const calendarData = await getEconomicCalendar();
    if (calendarData.events && calendarData.events.length > 0) {
      data.economicCalendar = calendarData.events;
    }
    
    // Buscar dados do Brazilian Real do CME Group
    const brazilianRealData = await getBrazilianReal();
    if (brazilianRealData.contracts && brazilianRealData.contracts.length > 0) {
      data.dolarAmericas = brazilianRealData.contracts;
      console.log(`✅ Brazilian Real atualizado no box BRAZILIAN REAL (CME): ${brazilianRealData.contracts.length} contratos`);
      if (brazilianRealData.contracts.length > 0) {
        console.log(`📊 Primeiro contrato exemplo:`, JSON.stringify(brazilianRealData.contracts[0], null, 2));
      }
    } else {
      console.log('⚠️  Brazilian Real não encontrado, usando dados mockados');
    }
    
    // Buscar dados reais dos Treasuries
    const treasuriesData = await fetchTreasuriesFromInvesting();
    if (treasuriesData && treasuriesData.length > 0) {
      data.treasuries = treasuriesData;
    }
    
    // Buscar dados reais de Principais Índices Mundiais
    const moedasData = await fetchMoedasFromInvesting();
    if (moedasData && moedasData.length > 0) {
      data.moedas = moedasData;
      console.log(`✅ Principais Índices Mundiais atualizados: ${moedasData.length} itens`);
    }
    
    // Buscar dados reais de Dólar x Mundo
    const dolarMundoData = await fetchDolarMundoFromInvesting();
    if (dolarMundoData && dolarMundoData.length > 0) {
      data.dolarMundo = dolarMundoData;
      console.log(`✅ Dólar x Mundo atualizado: ${dolarMundoData.length} itens`);
    }
    
    // Buscar dados reais de Dólar x Emergentes
    const dolarEmergentesData = await fetchDolarEmergentesFromInvesting();
    if (dolarEmergentesData && dolarEmergentesData.length > 0) {
      // Manter USD/BRL que já foi atualizado
      const usdBrlIndex = dolarEmergentesData.findIndex(item => item.name === 'USD/BRL');
      if (usdBrlIndex === -1 && dollarData.success) {
        dolarEmergentesData.push({
          name: 'USD/BRL',
          value: dollarData.value,
          variation: dollarData.variation,
          percent: dollarData.percent,
          max: dollarData.max,
          min: dollarData.min,
          time: dollarData.time
        });
      }
      data.dolarEmergentes = dolarEmergentesData;
      console.log(`✅ Dólar x Emergentes atualizado: ${dolarEmergentesData.length} itens`);
    }
    
    // Buscar dados reais de Américas (Futuros CFDs)
    const americasData = await fetchAmericasFromInvesting();
    if (americasData && americasData.length > 0) {
      data.americas = americasData;
      console.log(`✅ Américas atualizado: ${americasData.length} itens`);
    }
    
    // Buscar dados reais de Europa (Futuros CFDs)
    const europaData = await fetchEuropaFromInvesting();
    if (europaData && europaData.length > 0) {
      data.europa = europaData;
      console.log(`✅ Europa atualizado: ${europaData.length} itens`);
    }
    
    // Buscar dados reais de Ásia e Oceania (Futuros CFDs)
    const asiaOceaniaData = await fetchAsiaOceaniaFromInvesting();
    if (asiaOceaniaData && asiaOceaniaData.length > 0) {
      data.asiaOceania = asiaOceaniaData;
      console.log(`✅ Ásia e Oceania atualizado: ${asiaOceaniaData.length} itens`);
    }
    
    // Buscar dados reais de Criptomoedas
    const criptomoedasData = await fetchCriptomoedasFromInvesting();
    if (criptomoedasData && criptomoedasData.length > 0) {
      data.criptomoedas = criptomoedasData;
      console.log(`✅ Criptomoedas atualizado: ${criptomoedasData.length} itens`);
    }
    
    // Buscar Dólar Cupom da B3
    const dolarCupomData = await fetchDolarCupomFromB3();
    if (dolarCupomData && dolarCupomData.success) {
      data.dolarCupom = dolarCupomData;
      console.log(`✅ Dólar Cupom atualizado:`, dolarCupomData.valores || dolarCupomData);
    } else {
      // Dados mockados se não conseguir buscar
      data.dolarCupom = {
        success: false,
        valores: {
          difOperCasada: '17.57',
          cupomLimpo: '5.3688',
          spot2Dias: '5.3697',
          spot1Dia: '5.3684'
        },
        cupomLimpo: '5.3688',
        timestamp: new Date().toISOString()
      };
    }
    
    // Adicionar timestamp para garantir atualização
    data.timestamp = Date.now();
    data.lastUpdate = new Date().toISOString();
    
    console.log(`✅ Dashboard gerado com sucesso. Timestamp: ${data.lastUpdate}`);
    console.log(`📊 Principais Índices Mundiais finais: ${data.moedas.length} itens`);
    if (data.moedas.length > 0) {
      console.log(`   Primeiro índice: ${data.moedas[0].name} = ${data.moedas[0].value} (time: ${data.moedas[0].time})`);
    }
    
    res.json(data);
  } catch (error) {
    console.error('❌ Erro ao gerar dados financeiros:', error);
    // Em caso de erro, retornar dados mockados
    const data = generateFinancialData();
    res.json(data);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Criar servidor HTTP para WebSocket
const server = http.createServer(app);

// WebSocket Server
let wss = null;
try {
  wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    console.log('✅ Cliente WebSocket conectado');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'subscribe') {
          ws.topic = data.topic;
        }
      } catch (error) {
        console.error('Erro ao processar mensagem WebSocket:', error);
      }
    });

    ws.on('close', () => {
      console.log('❌ Cliente WebSocket desconectado');
    });
  });
} catch (error) {
  console.warn('⚠️  WebSocket não disponível:', error.message);
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Configuração do banco: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  
  // Inicializar banco de login
  await initLoginDatabase();
  
  // Verificar Data Grid na inicialização
  if (useDataGrid) {
    const dataGridStatus = await checkDataGridAvailability();
    if (dataGridStatus) {
      console.log('✅ Data Grid disponível:', dataGridUrl);
      await ensureCacheExists();
    } else {
      console.log('⚠️  Data Grid não disponível, usando cache local');
    }
  } else {
    console.log('ℹ️  Data Grid desabilitado, usando cache local');
  }
  
  // Inicializar Kafka
  await initKafka();
  await startKafkaConsumers();
  
  // Testar conexão na inicialização
  testConnection().then(result => {
    if (result.success) {
      console.log('✅ Conexão com MySQL estabelecida!');
    } else {
      console.log('⚠️  Não foi possível conectar ao MySQL:', result.error);
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando servidor...');
  await kafkaProducer.disconnectProducer();
  await kafkaConsumer.stopAllConsumers();
  if (wss) {
    wss.close();
  }
  server.close();
});

module.exports = app;

