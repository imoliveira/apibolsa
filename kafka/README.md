# 🚀 Apache Kafka - API Bolsa

## 📋 Visão Geral

Implementação completa de Apache Kafka com Node.js para aprendizado e uso em produção.

## 🎯 O que foi implementado

### 1. Kafka Cluster
- **Cluster**: `apibolsa-kafka`
- **Versão**: 3.6.0
- **Réplicas**: 1 (desenvolvimento)
- **Listeners**: Plain (9092) e TLS (9093)

### 2. Tópicos Kafka (4)
1. **pedidos** - Processamento de pedidos
2. **pagamentos** - Processamento de pagamentos
3. **notificacoes** - Sistema de notificações
4. **logs** - Logs da aplicação

### 3. Producer Node.js
- Envio de mensagens para qualquer tópico
- Funções específicas para cada tópico
- Suporte a chaves de mensagem
- Batch de mensagens

### 4. Consumer Node.js
- Consumo de mensagens de todos os tópicos
- WebSocket para streaming em tempo real
- Armazenamento das últimas 100 mensagens
- Múltiplos grupos de consumidores

### 5. Interface Web
- Dashboard para testar producer/consumer
- Visualização de mensagens em tempo real
- Envio de mensagens de teste
- Estatísticas de tópicos

## 🚀 Deploy

### Pré-requisitos

1. **Strimzi Operator instalado**:
```bash
# Verificar se está instalado
oc get crd kafkas.kafka.strimzi.io

# Se não estiver, instalar:
oc apply -f https://strimzi.io/install/latest?namespace=apibolsa
```

### Deploy Automatizado

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka
./deploy-kafka.sh
```

### Deploy Manual

```bash
# 1. Criar Kafka Cluster
oc apply -f kafka-cluster.yaml

# 2. Aguardar Kafka ficar pronto
oc wait --for=condition=Ready kafka/apibolsa-kafka -n apibolsa --timeout=600s

# 3. Criar tópicos
oc apply -f kafka-topics.yaml

# 4. Atualizar Node.js
oc apply -f ../nodejs/nodejs-configmap.yaml
oc create configmap nodejs-app-code -n apibolsa \
  --from-file=server.js=../nodejs/server.js \
  --from-file=package.json=../nodejs/package.json \
  --from-file=kafka-producer.js=../nodejs/kafka-producer.js \
  --from-file=kafka-consumer.js=../nodejs/kafka-consumer.js \
  --from-file=index.html=../nodejs/public/index.html \
  --from-file=login.html=../nodejs/public/login.html \
  --dry-run=client -o yaml | oc apply -f -
oc rollout restart deployment/nodejs -n apibolsa
```

## 📊 Estrutura dos Tópicos

### pedidos
```json
{
  "tipo": "pedido",
  "id": "123",
  "cliente": "João Silva",
  "valor": 150.00,
  "itens": [...],
  "timestamp": "2025-12-20T..."
}
```

### pagamentos
```json
{
  "tipo": "pagamento",
  "id": "456",
  "pedidoId": "123",
  "valor": 150.00,
  "metodo": "cartao",
  "status": "aprovado",
  "timestamp": "2025-12-20T..."
}
```

### notificacoes
```json
{
  "tipo": "notificacao",
  "id": "789",
  "usuario": "teste",
  "titulo": "Pedido confirmado",
  "mensagem": "Seu pedido foi confirmado",
  "timestamp": "2025-12-20T..."
}
```

### logs
```json
{
  "tipo": "log",
  "nivel": "info",
  "mensagem": "Pedido processado",
  "contexto": {...},
  "timestamp": "2025-12-20T..."
}
```

## 🔧 APIs Disponíveis

### Status do Kafka
```bash
GET /api/kafka/status
```

### Enviar Mensagem (Genérico)
```bash
POST /api/kafka/produce
{
  "topic": "pedidos",
  "message": { ... },
  "key": "optional-key"
}
```

### Enviar para Tópicos Específicos
```bash
POST /api/kafka/pedidos
POST /api/kafka/pagamentos
POST /api/kafka/notificacoes
POST /api/kafka/logs
```

### Listar Mensagens Recebidas
```bash
GET /api/kafka/messages
GET /api/kafka/messages/pedidos
```

## 🧪 Testar

### 1. Acessar Interface Web
```
http://apibolsa.apps-crc.testing/kafka
```

### 2. Via API (após login)
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Enviar pedido
curl -X POST http://$ROUTE/api/kafka/pedidos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "id": "123",
    "cliente": "João Silva",
    "valor": 150.00,
    "itens": ["item1", "item2"]
  }'

# Ver mensagens recebidas
curl http://$ROUTE/api/kafka/messages/pedidos -b cookies.txt | jq '.'
```

## 📚 Conceitos de Kafka

### Producer
- **Função**: Enviar mensagens para tópicos
- **Uso**: Quando você quer publicar eventos/dados
- **Exemplo**: Criar pedido → enviar para tópico "pedidos"

### Consumer
- **Função**: Ler mensagens de tópicos
- **Uso**: Quando você quer processar eventos/dados
- **Exemplo**: Ler de "pedidos" → processar → enviar para "pagamentos"

### Tópico (Topic)
- **Função**: Categoria de mensagens
- **Analogia**: Como uma fila ou canal
- **Exemplo**: "pedidos", "pagamentos"

### Partição (Partition)
- **Função**: Divisão do tópico para paralelismo
- **Benefício**: Múltiplos consumers podem processar em paralelo
- **Configuração**: 3 partições por tópico

### Consumer Group
- **Função**: Grupo de consumers que compartilham trabalho
- **Benefício**: Balanceamento de carga entre consumers
- **Exemplo**: 3 consumers no mesmo grupo → cada um processa 1 partição

## 🐛 Troubleshooting

### Kafka não inicia

```bash
# Verificar pods
oc get pods -n apibolsa | grep kafka

# Ver logs
oc logs apibolsa-kafka-kafka-0 -n apibolsa

# Ver eventos
oc get events -n apibolsa --sort-by='.lastTimestamp' | grep kafka
```

### Producer não conecta

```bash
# Verificar bootstrap server
oc get kafka apibolsa-kafka -n apibolsa -o jsonpath='{.status.listeners[?(@.type=="plain")].bootstrapServers}'

# Verificar variável de ambiente
oc get deployment nodejs -n apibolsa -o yaml | grep KAFKA_BROKERS

# Testar conectividade
NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
oc exec $NODEJS_POD -n apibolsa -c nodejs -- nc -zv apibolsa-kafka-kafka-bootstrap 9092
```

### Consumer não recebe mensagens

```bash
# Verificar se consumer está rodando
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "consumer\|kafka"

# Verificar tópicos
oc get kafkatopic -n apibolsa

# Verificar mensagens no tópico (via kafka console consumer)
oc run kafka-consumer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-consumer.sh \
  --bootstrap-server apibolsa-kafka-kafka-bootstrap:9092 \
  --topic pedidos \
  --from-beginning
```

## 📝 Próximos Passos

- [ ] Adicionar mais tópicos conforme necessário
- [ ] Implementar processamento assíncrono
- [ ] Adicionar métricas e monitoramento
- [ ] Configurar retenção de mensagens
- [ ] Implementar dead letter queue

## 🔗 Referências

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Strimzi Operator](https://strimzi.io/)
- [KafkaJS Documentation](https://kafka.js.org/)



