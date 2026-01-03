# 🧪 Como Testar o Kafka

## 🎯 Métodos de Teste

### 1. ✅ Interface Web (Mais Fácil)

#### Acessar
```
http://apibolsa.apps-crc.testing/kafka
```

#### Passos
1. **Login**: `teste` / `teste`
2. **Producer (lado esquerdo)**:
   - Selecionar tópico (pedidos, pagamentos, notificacoes, logs)
   - Digitar mensagem JSON
   - Clicar em "Enviar Mensagem"
3. **Consumer (lado direito)**:
   - Ver status dos consumers
   - Ver estatísticas por tópico
4. **Mensagens Recebidas (abaixo)**:
   - Ver mensagens chegando em tempo real
   - Filtrar por tópico
   - Ver detalhes de cada mensagem

#### Exemplo de Mensagem JSON
```json
{
  "id": "123",
  "cliente": "João Silva",
  "valor": 150.00,
  "itens": ["item1", "item2"]
}
```

---

### 2. ✅ Script Automatizado

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka
./testar-kafka.sh
```

Este script:
- Faz login automaticamente
- Envia mensagens para todos os 4 tópicos
- Verifica mensagens recebidas
- Mostra resumo completo

---

### 3. ✅ Via API (curl)

#### Configuração
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt
```

#### Teste 1: Status do Kafka
```bash
curl http://$ROUTE/api/kafka/status -b cookies.txt | jq '.'
```

**Esperado**:
```json
{
  "success": true,
  "producer": {
    "connected": true
  },
  "consumers": [
    {
      "topic": "pedidos",
      "groupId": "apibolsa-consumer-group",
      "isRunning": true
    }
  ],
  "topics": ["pedidos", "pagamentos", "notificacoes", "logs"]
}
```

#### Teste 2: Enviar Pedido
```bash
curl -X POST http://$ROUTE/api/kafka/pedidos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "id": "PED-123",
    "cliente": "João Silva",
    "valor": 150.00,
    "itens": ["Item 1", "Item 2"],
    "status": "novo"
  }' | jq '.'
```

**Esperado**:
```json
{
  "success": true,
  "topic": "pedidos",
  "partition": 0,
  "offset": "123",
  "timestamp": 1234567890
}
```

#### Teste 3: Enviar Pagamento
```bash
curl -X POST http://$ROUTE/api/kafka/pagamentos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "id": "PAG-456",
    "pedidoId": "PED-123",
    "valor": 150.00,
    "metodo": "cartao",
    "status": "aprovado"
  }' | jq '.'
```

#### Teste 4: Enviar Notificação
```bash
curl -X POST http://$ROUTE/api/kafka/notificacoes \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "id": "NOT-789",
    "usuario": "teste",
    "titulo": "Pedido confirmado",
    "mensagem": "Seu pedido foi confirmado!"
  }' | jq '.'
```

#### Teste 5: Enviar Log
```bash
curl -X POST http://$ROUTE/api/kafka/logs \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "nivel": "info",
    "mensagem": "Teste de log",
    "contexto": {"servico": "apibolsa"}
  }' | jq '.'
```

#### Teste 6: Ver Mensagens Recebidas
```bash
# Todas as mensagens
curl http://$ROUTE/api/kafka/messages -b cookies.txt | jq '.'

# Mensagens de um tópico específico
curl http://$ROUTE/api/kafka/messages/pedidos -b cookies.txt | jq '.'
```

**Esperado**:
```json
{
  "success": true,
  "topic": "pedidos",
  "count": 5,
  "messages": [
    {
      "topic": "pedidos",
      "partition": 0,
      "offset": "123",
      "value": {
        "tipo": "pedido",
        "id": "PED-123",
        "cliente": "João Silva",
        ...
      },
      "receivedAt": "2025-12-20T..."
    }
  ]
}
```

#### Teste 7: Enviar Mensagem Genérica
```bash
curl -X POST http://$ROUTE/api/kafka/produce \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "topic": "pedidos",
    "message": {
      "id": "GEN-999",
      "teste": "mensagem genérica"
    },
    "key": "chave-opcional"
  }' | jq '.'
```

---

### 4. ✅ Teste Direto no Kafka (Console)

#### Usar Kafka Console Producer
```bash
# Port forward
oc port-forward svc/kafka-lab-kafka-bootstrap -n kafka 9092:9092 &

# Em outro terminal, usar kafka-console-producer
oc run kafka-producer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-producer.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --topic pedidos
```

#### Usar Kafka Console Consumer
```bash
oc run kafka-consumer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-consumer.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --topic pedidos \
  --from-beginning
```

---

### 5. ✅ Verificar Logs

#### Logs do Node.js
```bash
# Ver logs gerais
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs --tail=50

# Filtrar por Kafka
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "kafka\|consumer\|producer" | tail -20

# Ver mensagens recebidas
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep "📨 Mensagem recebida"
```

#### Logs do Kafka
```bash
# Logs do broker
oc logs kafka-lab-kafka-lab-pool-0 -n kafka --tail=50

# Logs do operator
oc logs -l name=strimzi-cluster-operator -n kafka --tail=50
```

---

## 📊 Checklist de Testes

### Producer
- [ ] Enviar mensagem para `pedidos`
- [ ] Enviar mensagem para `pagamentos`
- [ ] Enviar mensagem para `notificacoes`
- [ ] Enviar mensagem para `logs`
- [ ] Verificar resposta com `success: true`
- [ ] Verificar `partition` e `offset` na resposta

### Consumer
- [ ] Verificar status mostra consumers ativos
- [ ] Ver mensagens aparecendo em tempo real
- [ ] Verificar mensagens recebidas via API
- [ ] Verificar WebSocket funcionando (interface web)

### Integração
- [ ] Enviar mensagem → Ver chegar no consumer
- [ ] Verificar dados da mensagem estão corretos
- [ ] Testar múltiplas mensagens
- [ ] Testar diferentes tópicos

---

## 🎯 Exemplos Práticos

### Fluxo Completo: Pedido → Pagamento → Notificação

```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# 1. Criar pedido
PEDIDO_ID="PED-$(date +%s)"
curl -X POST http://$ROUTE/api/kafka/pedidos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"id\": \"$PEDIDO_ID\",
    \"cliente\": \"João Silva\",
    \"valor\": 150.00,
    \"itens\": [\"Item 1\", \"Item 2\"]
  }"

sleep 2

# 2. Processar pagamento
curl -X POST http://$ROUTE/api/kafka/pagamentos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"id\": \"PAG-$(date +%s)\",
    \"pedidoId\": \"$PEDIDO_ID\",
    \"valor\": 150.00,
    \"metodo\": \"cartao\",
    \"status\": \"aprovado\"
  }"

sleep 2

# 3. Enviar notificação
curl -X POST http://$ROUTE/api/kafka/notificacoes \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"id\": \"NOT-$(date +%s)\",
    \"usuario\": \"teste\",
    \"titulo\": \"Pedido confirmado\",
    \"mensagem\": \"Pedido $PEDIDO_ID foi confirmado!\"
  }"

sleep 2

# 4. Ver todas as mensagens
echo "=== Pedidos ==="
curl -s http://$ROUTE/api/kafka/messages/pedidos -b cookies.txt | jq '.count'

echo "=== Pagamentos ==="
curl -s http://$ROUTE/api/kafka/messages/pagamentos -b cookies.txt | jq '.count'

echo "=== Notificações ==="
curl -s http://$ROUTE/api/kafka/messages/notificacoes -b cookies.txt | jq '.count'
```

---

## 🔍 Troubleshooting

### Producer não envia

```bash
# Verificar status
curl http://$ROUTE/api/kafka/status -b cookies.txt | jq '.producer'

# Ver logs
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "producer\|kafka" | tail -10
```

### Consumer não recebe

```bash
# Verificar consumers ativos
curl http://$ROUTE/api/kafka/status -b cookies.txt | jq '.consumers'

# Ver logs
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "consumer" | tail -10

# Verificar tópicos
oc get kafkatopic -n kafka
```

### Mensagens não aparecem

```bash
# Verificar se foram enviadas
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep "📤 Mensagem enviada"

# Verificar se foram recebidas
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep "📨 Mensagem recebida"

# Verificar via API
curl http://$ROUTE/api/kafka/messages -b cookies.txt | jq '.messages'
```

---

## ✅ Resumo Rápido

### Teste Mais Rápido
```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka
./testar-kafka.sh
```

### Teste Manual
1. Acesse: `http://apibolsa.apps-crc.testing/kafka`
2. Login: `teste` / `teste`
3. Envie mensagem
4. Veja chegando em tempo real

### Verificar Status
```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -E "Consumer conectado|Kafka Producer"
```



