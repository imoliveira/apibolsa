# ✅ Configuração Final - Kafka

## 🔧 Correções Aplicadas

### 1. Namespace do Kafka
- **Problema**: Node.js tentando conectar ao Kafka no namespace `apibolsa`
- **Solução**: Kafka está no namespace `kafka` com cluster `kafka-lab`
- **Bootstrap Server**: `kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092`

### 2. Tópicos Criados
- ✅ `pedidos` - Criado no namespace `kafka`
- ✅ `pagamentos` - Criado no namespace `kafka`
- ✅ `notificacoes` - Criado no namespace `kafka`
- ✅ `logs` - Criado no namespace `kafka`

### 3. Configuração Atualizada
- ✅ `nodejs-configmap.yaml` - KAFKA_BROKERS atualizado
- ✅ `kafka-producer.js` - Default broker atualizado
- ✅ `kafka-consumer.js` - Default broker atualizado

## 📊 Status Atual

### Kafka
- **Namespace**: `kafka`
- **Cluster**: `kafka-lab`
- **Bootstrap**: `kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092`
- **Status**: Running ✅

### Node.js
- **Status**: Running ✅
- **Conexão**: Conectando ao Kafka ✅
- **Consumers**: Iniciando para os tópicos

## 🧪 Verificar

### 1. Status dos Tópicos
```bash
oc get kafkatopic -n kafka
```

### 2. Logs do Node.js
```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "consumer\|kafka" | tail -10
```

**Esperado**:
- ✅ "Consumer conectado: pedidos"
- ✅ "Consumer conectado: pagamentos"
- ✅ "Consumer conectado: notificacoes"
- ✅ "Consumer conectado: logs"

### 3. Testar Conectividade
```bash
NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
oc exec $NODEJS_POD -n apibolsa -c nodejs -- nc -zv kafka-lab-kafka-bootstrap.kafka.svc.cluster.local 9092
```

## 🎯 Testar Funcionalidade

### Via Interface Web
```
http://apibolsa.apps-crc.testing/kafka
```
1. Login: teste / teste
2. Enviar mensagem para qualquer tópico
3. Ver mensagem chegando em tempo real

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

## ✅ Conclusão

**Kafka configurado corretamente!**

- ✅ Bootstrap server corrigido
- ✅ Tópicos criados no namespace correto
- ✅ Node.js conectando ao Kafka
- ✅ Consumers iniciando

Agora você pode testar o Producer/Consumer em tempo real! 🚀



