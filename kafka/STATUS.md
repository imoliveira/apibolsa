# 📊 Status - Apache Kafka

## ✅ O que foi criado

### 1. Kafka Cluster
- **Nome**: `apibolsa-kafka`
- **Status**: Criado (aguardando inicialização)
- **Versão**: 3.6.0
- **Réplicas**: 1 (desenvolvimento)

### 2. Tópicos Kafka (4)
- ✅ **pedidos** - Processamento de pedidos
- ✅ **pagamentos** - Processamento de pagamentos
- ✅ **notificacoes** - Sistema de notificações
- ✅ **logs** - Logs da aplicação

### 3. Producer Node.js
- ✅ Código implementado (`kafka-producer.js`)
- ✅ Funções para cada tópico
- ✅ Suporte a chaves e batch

### 4. Consumer Node.js
- ✅ Código implementado (`kafka-consumer.js`)
- ✅ Consumo de todos os tópicos
- ✅ WebSocket para streaming

### 5. Interface Web
- ✅ Dashboard criado (`/kafka`)
- ✅ Producer/Consumer em tempo real
- ✅ Visualização de mensagens

## ⏳ Status Atual

O Kafka está sendo criado e pode levar alguns minutos para ficar totalmente pronto.

### Verificar Status

```bash
# Status do cluster
oc get kafka -n apibolsa

# Pods do Kafka
oc get pods -n apibolsa | grep -E "kafka|zookeeper"

# Tópicos
oc get kafkatopic -n apibolsa

# Logs do Kafka
oc logs apibolsa-kafka-kafka-0 -n apibolsa --tail=20
```

## 🚀 Próximos Passos

1. **Aguardar Kafka ficar pronto** (pode levar 5-10 minutos)
   ```bash
   oc wait --for=condition=Ready kafka/apibolsa-kafka -n apibolsa --timeout=600s
   ```

2. **Verificar se Node.js está rodando**
   ```bash
   oc get pods -n apibolsa | grep nodejs
   oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i kafka
   ```

3. **Acessar interface**
   ```
   http://apibolsa.apps-crc.testing/kafka
   ```

## 🧪 Testar

### Via Interface Web
1. Acesse: `http://apibolsa.apps-crc.testing/kafka`
2. Faça login (teste/teste)
3. Envie mensagens via Producer
4. Veja mensagens chegando via Consumer

### Via API
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
    "valor": 150.00
  }'

# Ver mensagens
curl http://$ROUTE/api/kafka/messages/pedidos -b cookies.txt | jq '.'
```

## 📝 Arquivos Criados

- `kafka/kafka-cluster.yaml` - Cluster Kafka
- `kafka/kafka-topics.yaml` - 4 tópicos
- `kafka/deploy-kafka.sh` - Script de deploy
- `nodejs/kafka-producer.js` - Producer
- `nodejs/kafka-consumer.js` - Consumer
- `nodejs/public/kafka.html` - Interface web
- `kafka/README.md` - Documentação completa

## 🔍 Troubleshooting

### Kafka não inicia

```bash
# Ver eventos
oc get events -n apibolsa --sort-by='.lastTimestamp' | grep kafka

# Ver logs do operador
oc logs -l name=strimzi-cluster-operator -n openshift-operators --tail=50

# Verificar recursos
oc get all -n apibolsa | grep kafka
```

### Producer não conecta

```bash
# Verificar bootstrap server
oc get kafka apibolsa-kafka -n apibolsa -o jsonpath='{.status.listeners[?(@.type=="plain")].bootstrapServers}'

# Verificar variável
oc get deployment nodejs -n apibolsa -o yaml | grep KAFKA_BROKERS

# Testar conectividade
NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
oc exec $NODEJS_POD -n apibolsa -c nodejs -- nc -zv apibolsa-kafka-kafka-bootstrap 9092
```



