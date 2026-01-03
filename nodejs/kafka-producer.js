const { Kafka } = require('kafkajs');

// Configuração do Kafka
const kafkaConfig = {
  clientId: 'apibolsa-producer',
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
};

const kafka = new Kafka(kafkaConfig);
const producer = kafka.producer();

let isConnected = false;

// Conectar producer
async function connectProducer() {
  if (isConnected) return;
  
  try {
    await producer.connect();
    isConnected = true;
    console.log('✅ Kafka Producer conectado');
  } catch (error) {
    console.error('❌ Erro ao conectar Kafka Producer:', error.message);
    throw error;
  }
}

// Enviar mensagem para um tópico
async function sendMessage(topic, message, key = null) {
  try {
    if (!isConnected) {
      await connectProducer();
    }

    const messageData = {
      topic: topic,
      messages: [{
        key: key || null,
        value: JSON.stringify(message),
        timestamp: Date.now()
      }]
    };

    const result = await producer.send(messageData);
    
    console.log(`📤 Mensagem enviada para tópico "${topic}":`, {
      topic: result[0].topicName,
      partition: result[0].partition,
      offset: result[0].offset
    });

    return {
      success: true,
      topic: result[0].topicName,
      partition: result[0].partition,
      offset: result[0].offset,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem para "${topic}":`, error.message);
    throw error;
  }
}

// Enviar múltiplas mensagens
async function sendBatchMessages(topic, messages) {
  try {
    if (!isConnected) {
      await connectProducer();
    }

    const messagesData = messages.map(msg => ({
      key: msg.key || null,
      value: JSON.stringify(msg.value),
      timestamp: Date.now()
    }));

    const result = await producer.send({
      topic: topic,
      messages: messagesData
    });

    console.log(`📤 ${messages.length} mensagens enviadas para "${topic}"`);

    return {
      success: true,
      count: messages.length,
      results: result
    };
  } catch (error) {
    console.error(`❌ Erro ao enviar batch para "${topic}":`, error.message);
    throw error;
  }
}

// Desconectar producer
async function disconnectProducer() {
  if (isConnected) {
    try {
      await producer.disconnect();
      isConnected = false;
      console.log('✅ Kafka Producer desconectado');
    } catch (error) {
      console.error('❌ Erro ao desconectar Producer:', error.message);
    }
  }
}

// Exemplo de uso para cada tópico
async function sendPedido(pedidoData) {
  return await sendMessage('pedidos', {
    tipo: 'pedido',
    ...pedidoData,
    timestamp: new Date().toISOString()
  }, pedidoData.id || null);
}

async function sendPagamento(pagamentoData) {
  return await sendMessage('pagamentos', {
    tipo: 'pagamento',
    ...pagamentoData,
    timestamp: new Date().toISOString()
  }, pagamentoData.id || null);
}

async function sendNotificacao(notificacaoData) {
  return await sendMessage('notificacoes', {
    tipo: 'notificacao',
    ...notificacaoData,
    timestamp: new Date().toISOString()
  }, notificacaoData.id || null);
}

async function sendLog(logData) {
  return await sendMessage('logs', {
    tipo: 'log',
    ...logData,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  connectProducer,
  sendMessage,
  sendBatchMessages,
  disconnectProducer,
  sendPedido,
  sendPagamento,
  sendNotificacao,
  sendLog,
  isConnected: () => isConnected
};

