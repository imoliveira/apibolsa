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
    const url = 'https://br.investing.com/currencies/usd-brl';
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
    
    // Tentar encontrar o valor do dólar na página
    let lastValue = null;
    let variation = null;
    let percent = null;
    let maxValue = null;
    let minValue = null;
    
    // Tentar seletores comuns do Investing.com
    const selectors = [
      '#last_last',
      '[data-test="instrument-price-last"]',
      '.text-2xl',
      '.instrument-price_last__',
      '#quotes_summary_current_data .text-2xl'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = element.text().trim();
        const match = text.match(/[\d,]+\.?\d*/);
        if (match) {
          lastValue = match[0].replace(/,/g, '');
          break;
        }
      }
    }
    
    // Buscar variação
    const variationElement = $('[data-test="instrument-price-change"], .instrument-price_change__').first();
    if (variationElement.length) {
      const varText = variationElement.text().trim();
      const varMatch = varText.match(/([+-]?[\d,]+\.?\d*)/);
      if (varMatch) {
        variation = varMatch[1].replace(/,/g, '');
      }
      
      // Buscar percentual
      const percentMatch = varText.match(/([+-]?[\d,]+\.?\d*%)/);
      if (percentMatch) {
        percent = percentMatch[1];
      }
    }
    
    // Buscar máxima e mínima
    const highElement = $('[data-test="high-value"], .high-low-value').first();
    const lowElement = $('[data-test="low-value"], .high-low-value').last();
    
    if (highElement.length) {
      const highText = highElement.text().trim();
      const highMatch = highText.match(/[\d,]+\.?\d*/);
      if (highMatch) {
        maxValue = highMatch[0].replace(/,/g, '');
      }
    }
    
    if (lowElement.length) {
      const lowText = lowElement.text().trim();
      const lowMatch = lowText.match(/[\d,]+\.?\d*/);
      if (lowMatch) {
        minValue = lowMatch[0].replace(/,/g, '');
      }
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

// Cache para dados do dólar (atualizar a cada 30 segundos)
let dollarCache = null;
let dollarCacheTime = null;
const DOLLAR_CACHE_TTL = 30000; // 30 segundos

async function getDollarData() {
  const now = Date.now();
  
  // Se o cache é válido, retornar
  if (dollarCache && dollarCacheTime && (now - dollarCacheTime) < DOLLAR_CACHE_TTL) {
    return dollarCache;
  }
  
  // Buscar novos dados
  const dollarData = await fetchDollarFromInvesting();
  
  if (dollarData.success) {
    dollarCache = dollarData;
    dollarCacheTime = now;
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
    const contracts = [];
    
    // Buscar contratos futuros do Brazilian Real
    // CME Group geralmente usa tabelas com dados de contratos
    $('table.quotes-table tbody tr, .quotes-table tbody tr, table tbody tr').each((index, element) => {
      if (index >= 10) return false; // Limitar a 10 contratos
      
      const $el = $(element);
      const cells = $el.find('td');
      
      if (cells.length >= 5) {
        const contract = cells.eq(0).text().trim() || '';
        const last = cells.eq(1).text().trim() || '';
        const change = cells.eq(2).text().trim() || '';
        const changePercent = cells.eq(3).text().trim() || '';
        const volume = cells.eq(4).text().trim() || '';
        const openInterest = cells.eq(5) ? cells.eq(5).text().trim() : '';
        
        if (contract && last) {
          // Extrair valores numéricos
          const lastValue = last.replace(/[^\d.,-]/g, '').replace(',', '');
          const changeValue = change.replace(/[^\d.,+\-]/g, '').replace(',', '');
          const changePercentValue = changePercent.replace(/[^\d.,+\-%]/g, '').replace(',', '');
          
          contracts.push({
            name: contract || 'BRL/USD',
            mes: contract.includes('Mar') ? 'Mar' : contract.includes('Jun') ? 'Jun' : contract.includes('Sep') ? 'Sep' : contract.includes('Dec') ? 'Dec' : '',
            value: lastValue || '0.00',
            variation: changeValue || '0.00',
            percent: changePercentValue ? (changePercentValue.includes('%') ? changePercentValue : changePercentValue + '%') : '0.00%',
            volume: volume || '0',
            openInterest: openInterest || '0',
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          });
        }
      }
    });
    
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
      return {
        success: true,
        contracts: contracts
      };
    } else {
      console.log('⚠️  Não foi possível extrair dados do Brazilian Real');
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

// Função para gerar dados mockados do Brazilian Real (fallback)
function generateMockBrazilianReal() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  return [
    {
      name: 'BRL/USD',
      mes: 'Mar 26',
      value: '0.2015',
      max: '0.2020',
      min: '0.2010',
      variation: '+0.0005',
      percent: '+0.25%',
      volume: '1,234',
      openInterest: '5,678',
      time: timeStr
    },
    {
      name: 'BRL/USD',
      mes: 'Jun 26',
      value: '0.2025',
      max: '0.2030',
      min: '0.2020',
      variation: '+0.0010',
      percent: '+0.50%',
      volume: '2,345',
      openInterest: '6,789',
      time: timeStr
    },
    {
      name: 'BRL/USD',
      mes: 'Sep 26',
      value: '0.2035',
      max: '0.2040',
      min: '0.2030',
      variation: '+0.0015',
      percent: '+0.74%',
      volume: '1,567',
      openInterest: '4,321',
      time: timeStr
    }
  ];
}

// Cache para Brazilian Real (atualizar a cada 2 minutos)
let brazilianRealCache = null;
let brazilianRealCacheTime = null;
const BRAZILIAN_REAL_CACHE_TTL = 120000; // 2 minutos

async function getBrazilianReal() {
  const now = Date.now();
  
  // Se o cache é válido, retornar
  if (brazilianRealCache && brazilianRealCacheTime && 
      (now - brazilianRealCacheTime) < BRAZILIAN_REAL_CACHE_TTL) {
    return brazilianRealCache;
  }
  
  // Buscar novos dados
  const realData = await fetchBrazilianRealFromCME();
  
  if (realData.success || realData.contracts) {
    brazilianRealCache = realData;
    brazilianRealCacheTime = now;
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
      { name: 'Dólar', value: '5.1291', variation: '0.00', percent: '0.00%', time: '' },
      { name: 'Euro', value: '5.5488', variation: '0.00', percent: '0.00%', time: '' },
      { name: 'Índice Dólar DXY', value: '101.25', variation: '-0.15', percent: '-0.15%', time: '' },
      { name: 'USD/EUR', value: '0.9150', variation: '-0.0010', percent: '-0.11%', time: '' },
      { name: 'USD/JPY', value: '148.50', variation: '+0.25', percent: '+0.17%', time: '' },
      { name: 'USD/GBP', value: '0.7850', variation: '+0.0010', percent: '+0.13%', time: '' },
      { name: 'USD/CAD', value: '1.3450', variation: '+0.0025', percent: '+0.19%', time: '' },
      { name: 'USD/SEK', value: '10.3750', variation: '+0.0125', percent: '+0.12%', time: '' },
      { name: 'USD/CHF', value: '0.8750', variation: '-0.0010', percent: '-0.11%', time: '' }
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
    // Gerar dados base
    const data = generateFinancialData();
    
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
      
      // Atualizar Dólar no box MOEDAS / CESTA DX
      const dolarIndex = data.moedas.findIndex(item => item.name === 'Dólar');
      if (dolarIndex !== -1) {
        data.moedas[dolarIndex] = {
          ...data.moedas[dolarIndex],
          value: dollarData.value,
          variation: dollarData.variation,
          percent: dollarData.percent,
          time: dollarData.time
        };
      }
      
      // Sincronizar moedas comuns entre dolarMundo e moedas
      const syncCurrency = (currencyName) => {
        const mundoIndex = data.dolarMundo.findIndex(item => item.name === currencyName);
        const moedasIndex = data.moedas.findIndex(item => item.name === currencyName);
        
        if (mundoIndex !== -1 && moedasIndex !== -1) {
          // Copiar dados de dolarMundo para moedas
          data.moedas[moedasIndex] = {
            ...data.dolarMundo[mundoIndex]
          };
        }
      };
      
      // Sincronizar moedas comuns
      syncCurrency('USD/EUR');
      syncCurrency('USD/JPY');
      syncCurrency('USD/GBP');
      syncCurrency('USD/CAD');
      syncCurrency('USD/SEK');
      syncCurrency('USD/CHF');
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

