const { Kafka } = require('kafkajs');

// Configuração do Kafka
const kafkaConfig = {
  clientId: 'apibolsa-consumer',
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 10,
    multiplier: 2,
    maxRetryTime: 30000
  },
  connectionTimeout: 10000,
  requestTimeout: 30000,
  // Configurações para melhorar resiliência
  allowAutoTopicCreation: false
};

const kafka = new Kafka(kafkaConfig);

// Armazenar consumers ativos
const activeConsumers = new Map();

// Criar consumer para um tópico
function createConsumer(groupId, topic) {
  const consumerId = `${groupId}-${topic}`;
  
  if (activeConsumers.has(consumerId)) {
    return activeConsumers.get(consumerId);
  }

  const consumer = kafka.consumer({ 
    groupId: groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxInFlightRequests: 1,
    retry: {
      initialRetryTime: 300,
      retries: 10
    }
  });

  activeConsumers.set(consumerId, {
    consumer,
    topic,
    groupId,
    isRunning: false,
    messageHandler: null
  });

  return { consumer, topic, groupId };
}

// Iniciar consumo de mensagens
async function startConsumer(groupId, topic, messageHandler) {
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const { consumer } = createConsumer(groupId, topic);
      const consumerId = `${groupId}-${topic}`;
      const consumerData = activeConsumers.get(consumerId);

      if (consumerData.isRunning) {
        console.log(`⚠️  Consumer já está rodando para ${topic} (grupo: ${groupId})`);
        return;
      }

      // Tentar conectar com timeout
      await Promise.race([
        consumer.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        )
      ]);
      
      console.log(`✅ Consumer conectado: ${topic} (grupo: ${groupId})`);

      // Aguardar um pouco antes de se inscrever
      await new Promise(resolve => setTimeout(resolve, 1000));

      await consumer.subscribe({ topic: topic, fromBeginning: false });
      console.log(`📥 Inscrito no tópico: ${topic}`);

      consumerData.isRunning = true;
      consumerData.messageHandler = messageHandler;

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const value = message.value.toString();
            let parsedValue;
            
            try {
              parsedValue = JSON.parse(value);
            } catch (e) {
              parsedValue = { raw: value };
            }

            const messageData = {
              topic: topic,
              partition: partition,
              offset: message.offset,
              key: message.key ? message.key.toString() : null,
              value: parsedValue,
              timestamp: message.timestamp,
              headers: message.headers
            };

            console.log(`📨 Mensagem recebida de "${topic}":`, {
              partition,
              offset: message.offset,
              key: message.key?.toString()
            });

            // Chamar handler se fornecido
            if (messageHandler) {
              await messageHandler(messageData);
            }
          } catch (error) {
            console.error(`❌ Erro ao processar mensagem de "${topic}":`, error.message);
          }
        }
      });

      return { success: true, consumerId, topic, groupId };
    } catch (error) {
      retryCount++;
      const errorMsg = error.message || String(error);
      
      // Se for erro de coordenador, aguardar mais tempo
      if (errorMsg.includes('group coordinator') || errorMsg.includes('coordinator')) {
        console.warn(`⚠️  Erro de coordenador ao iniciar consumer para "${topic}" (tentativa ${retryCount}/${maxRetries}):`, errorMsg);
        if (retryCount < maxRetries) {
          const waitTime = Math.min(5000 * retryCount, 30000); // Esperar até 30 segundos
          console.log(`⏳ Aguardando ${waitTime/1000}s antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        console.error(`❌ Erro ao iniciar consumer para "${topic}":`, errorMsg);
        if (retryCount < maxRetries) {
          const waitTime = 2000 * retryCount;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      // Se chegou aqui, todas as tentativas falharam
      console.error(`❌ Falha ao iniciar consumer para "${topic}" após ${maxRetries} tentativas`);
      throw error;
    }
  }
}

// Parar consumer
async function stopConsumer(groupId, topic) {
  try {
    const consumerId = `${groupId}-${topic}`;
    const consumerData = activeConsumers.get(consumerId);

    if (!consumerData || !consumerData.isRunning) {
      console.log(`⚠️  Consumer não está rodando para ${topic}`);
      return { success: false, message: 'Consumer não está rodando' };
    }

    await consumerData.consumer.disconnect();
    consumerData.isRunning = false;
    activeConsumers.delete(consumerId);

    console.log(`✅ Consumer parado: ${topic} (grupo: ${groupId})`);
    return { success: true, consumerId, topic };
  } catch (error) {
    console.error(`❌ Erro ao parar consumer para "${topic}":`, error.message);
    throw error;
  }
}

// Parar todos os consumers
async function stopAllConsumers() {
  const promises = [];
  for (const [consumerId, consumerData] of activeConsumers.entries()) {
    if (consumerData.isRunning) {
      promises.push(stopConsumer(consumerData.groupId, consumerData.topic));
    }
  }
  await Promise.all(promises);
  console.log('✅ Todos os consumers parados');
}

// Listar consumers ativos
function getActiveConsumers() {
  const consumers = [];
  for (const [consumerId, consumerData] of activeConsumers.entries()) {
    if (consumerData.isRunning) {
      consumers.push({
        consumerId,
        topic: consumerData.topic,
        groupId: consumerData.groupId,
        isRunning: consumerData.isRunning
      });
    }
  }
  return consumers;
}

module.exports = {
  createConsumer,
  startConsumer,
  stopConsumer,
  stopAllConsumers,
  getActiveConsumers
};

